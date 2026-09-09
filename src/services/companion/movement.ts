// src/services/companion/movement.ts
// Moteur de déplacement du companion.
//
// Modèle : ancre + zone
// ---------------------
// Le companion ne « suit le joueur » que dans un cas particulier. En général il
// rejoint une ANCRE puis, une fois arrivé, flâne autour ou reste en place. La
// zone praticable lui est fournie via `isWalkable`, déjà restreinte au mode
// (tuiles du jardin, map entière…).
//
// Deux axes qu'il ne faut pas confondre :
//  - le MODE, choisi par l'utilisateur (suivre / jardin / bâtiment) : il vit
//    dans `anchors.ts` et se résume ici à une ancre + une zone ;
//  - l'ACTIVITÉ interne (`pursue` / `wander`), gérée ci-dessous.
//
// Ce module est PUR : aucun store, aucun timer, hasard injecté. C'est la seule
// partie du déplacement testable hors navigateur
// (scripts/checkCompanionMovement.ts).
//
// Contrainte de rendu qui dicte tout le reste : la couche avatar du jeu anime la
// marche uniquement si la tuile change d'exactement une case (distance de
// Manhattan 1). Au-delà, elle coupe. Chaque tick ne produit donc qu'un seul pas
// orthogonal — ou un saut assumé.

import { findFirstStep, type IsGoal } from "./pathfinding";

export type XY = { x: number; y: number };

/** Activité interne : rejoindre l'ancre, ou flâner autour d'elle. */
export type MovementActivity = "pursue" | "wander";

/**
 * Ce que le companion vise, et comment se comporter une fois arrivé.
 * Produit par `anchors.ts` à partir du mode choisi.
 */
export type Anchor = {
  tile: XY;
  /** Une fois l'ancre rejointe : flâner autour, ou ne plus bouger. */
  onArrival: "wander" | "hold";
  /**
   * L'ancre est-elle le joueur ? Deux conséquences : on attend qu'il soit
   * inactif avant de flâner, et on ne marche jamais sur sa tuile.
   */
  tracksPlayer: boolean;
  /**
   * Territoire du mode, distinct de la marchabilité.
   *
   * Une fois DANS sa zone, le companion n'en sort plus. Tant qu'il est DEHORS,
   * il circule librement pour y revenir : sans cette asymétrie, basculer en
   * mode jardin alors qu'il est ailleurs lui interdirait toute case autour de
   * lui et le figerait sur place.
   */
  zone?: IsWalkable;
  /** Rayon de flânerie propre au mode. Défaut : config. */
  wanderRadius?: number;
};

export type MovementConfig = {
  /** Distance à laquelle le companion s'arrête de l'ancre. */
  followDistance: number;
  /** Ticks d'immobilité de l'ancre avant de flâner (ancres qui suivent le joueur). */
  idleTicksBeforeWander: number;
  wanderRadius: number;
  /** Ticks d'attente entre deux déplacements de flânerie. */
  wanderPauseTicks: number;
};

/**
 * Cadence de la boucle : un pas par tick, donc la vitesse de marche.
 *
 * Calée juste au-dessus des 130 ms d'interpolation d'un pas côté jeu. En
 * dessous les pas se chevauchent ; nettement au-dessus la marche redevient un
 * sautillement. À cette cadence, deux pas consécutifs dans la même direction
 * déclenchent en plus le cycle de course du jeu.
 */
export const STEP_INTERVAL_MS = 150;

/**
 * Réglages de déplacement. Volontairement des CONSTANTES et non des options :
 * ce sont des valeurs calées sur le moteur de rendu du jeu, pas des préférences.
 * Les exposer inviterait à casser la marche sans comprendre pourquoi.
 */
export const DEFAULT_MOVEMENT_CONFIG: MovementConfig = {
  followDistance: 2,
  // 15 s d'immobilité avant de flâner, 30 s d'arrêt entre deux balades.
  idleTicksBeforeWander: Math.round(15_000 / STEP_INTERVAL_MS),
  wanderRadius: 3,
  wanderPauseTicks: Math.round(30_000 / STEP_INTERVAL_MS),
};

/**
 * Réglages d'un déplacement sur ordre.
 *
 * `followDistance: 0` est la seule différence, et elle est essentielle : en
 * suivi, s'arrêter à deux cases de l'ancre est le comportement voulu — coller
 * au joueur serait pénible. Sur ordre, l'ancre EST la destination, et une
 * arrivée « à deux cases près » ne serait jamais reconnue comme une arrivée.
 */
export const TASK_MOVEMENT_CONFIG: MovementConfig = {
  ...DEFAULT_MOVEMENT_CONFIG,
  followDistance: 0,
};

export type MovementState = {
  activity: MovementActivity;
  /** Position courante du companion. `null` tant qu'il n'est pas apparu. */
  tile: XY | null;
  /** Dernière position connue de l'ancre, pour détecter qu'elle a bougé. */
  lastAnchorTile: XY | null;
  idleTicks: number;
  wanderCooldown: number;
  wanderTarget: XY | null;
};

export type MovementDecision = {
  state: MovementState;
  /** Position à injecter. `null` = aucune position exploitable. */
  tile: XY | null;
  /** true quand le déplacement dépasse une case : le jeu coupera au lieu de marcher. */
  teleported: boolean;
};

export type IsWalkable = (x: number, y: number) => boolean;

export type MovementInput = {
  anchor: Anchor;
  state: MovementState;
  /** Déjà restreint à la zone du mode par `anchors.ts`. */
  isWalkable: IsWalkable;
  /** Injecté pour rendre la flânerie déterministe sous test. */
  random: () => number;
  config: MovementConfig;
};

/** Rayon max exploré pour trouver une tuile d'apparition autour de l'ancre. */
const SPAWN_SEARCH_RADIUS = 8;

export function initialMovementState(): MovementState {
  return {
    activity: "pursue",
    tile: null,
    lastAnchorTile: null,
    idleTicks: 0,
    wanderCooldown: 0,
    wanderTarget: null,
  };
}

export function manhattan(a: XY, b: XY): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function sameTile(a: XY | null, b: XY | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y;
}

/**
 * Convertit une durée en nombre de ticks de boucle.
 *
 * Les temporisations sont réglées en millisecondes (une durée garde son sens
 * quand on change la vitesse de marche), alors que la machine à états raisonne
 * en ticks. C'est ici que les deux se rejoignent.
 */
export function ticksFromMs(durationMs: number, stepIntervalMs: number, minTicks: number): number {
  if (!Number.isFinite(durationMs) || !Number.isFinite(stepIntervalMs) || stepIntervalMs <= 0) {
    return minTicks;
  }
  return Math.max(minTicks, Math.round(durationMs / stepIntervalMs));
}

/**
 * Le companion ne doit avancer que lorsque le jeu a effectivement rendu sa
 * position courante.
 *
 * Sans ce verrou, la boucle prend de l'avance sur le recalcul de Jotai et la
 * couche avatar reçoit un saut de plusieurs tuiles : elle coupe au lieu
 * d'animer la marche (elle n'interpole qu'à distance de Manhattan 1).
 *
 * Tant que rien n'a été observé, on n'entrave pas : il faut pouvoir apparaître.
 */
export function hasGameCaughtUp(ourTile: XY | null, observedTile: XY | null): boolean {
  if (!ourTile || !observedTile) return true;
  return observedTile.x === ourTile.x && observedTile.y === ourTile.y;
}

/**
 * Cherche la tuile praticable la plus proche d'un centre, en anneaux croissants.
 * Sert à l'apparition et au rattrapage.
 *
 * `excludeCenter` vaut pour une ancre-joueur : deux avatars sur la même case se
 * chevauchent. Pour une ancre inerte (tuile d'activation d'un bâtiment), au
 * contraire, on veut pouvoir s'y poser.
 */
export function findNearbyWalkable(
  center: XY,
  isWalkable: IsWalkable,
  excludeCenter: boolean,
  maxRadius = SPAWN_SEARCH_RADIUS
): XY | null {
  if (!excludeCenter && isWalkable(center.x, center.y)) return { ...center };

  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        // Anneau seulement : on garde le bord du carré courant.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = center.x + dx;
        const y = center.y + dy;
        if (isWalkable(x, y)) return { x, y };
      }
    }
  }
  return null;
}


/** Tuile de flânerie tirée au hasard dans le rayon autour de l'ancre. */
function pickWanderTarget(
  center: XY,
  radius: number,
  isWalkable: IsWalkable,
  random: () => number
): XY | null {
  const candidates: XY[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      if (dx === 0 && dy === 0) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (isWalkable(x, y)) candidates.push({ x, y });
    }
  }
  if (candidates.length === 0) return null;
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length));
  return candidates[index];
}

const wanderRadiusOf = (anchor: Anchor, config: MovementConfig): number =>
  anchor.wanderRadius ?? config.wanderRadius;

/**
 * Avance le companion d'un tick.
 *
 * L'ordre compte : on met d'abord à jour le suivi de l'ancre (qui décide de
 * l'activité), puis le rattrapage, puis seulement le déplacement. Un rattrapage
 * doit primer sur la flânerie, sinon le companion peut flâner tranquillement
 * loin de son ancre.
 */
export function stepMovement(input: MovementInput): MovementDecision {
  const { anchor, isWalkable, random, config } = input;
  const state: MovementState = { ...input.state };
  const excludeCenter = anchor.tracksPlayer;
  const blocked = anchor.tracksPlayer ? anchor.tile : null;

  const zone = anchor.zone;
  const zoneWalkable: IsWalkable = (x, y) => isWalkable(x, y) && (!zone || zone(x, y));
  // Dans sa zone il y reste ; dehors il circule librement pour y revenir.
  const insideZone = !zone || !state.tile || zone(state.tile.x, state.tile.y);
  const stepWalkable = insideZone ? zoneWalkable : isWalkable;

  // 1. L'ancre a-t-elle bougé, et depuis combien de temps est-elle immobile ?
  const anchorMoved = !sameTile(state.lastAnchorTile, anchor.tile);
  state.lastAnchorTile = { ...anchor.tile };
  if (anchorMoved) {
    state.idleTicks = 0;
    if (state.activity === "wander") {
      state.activity = "pursue";
      state.wanderTarget = null;
      state.wanderCooldown = 0;
    }
  } else {
    state.idleTicks++;
  }

  // 2. Apparition. Seul moment où le companion « surgit » : il n'a pas encore
  // de position d'où marcher. Tout le reste du temps il se déplace pas à pas.
  if (!state.tile) {
    const spawn =
      findNearbyWalkable(anchor.tile, zoneWalkable, excludeCenter) ??
      findNearbyWalkable(anchor.tile, isWalkable, excludeCenter);
    state.tile = spawn;
    return { state, tile: spawn, teleported: spawn !== null };
  }

  // 3. Bascule vers la flânerie, une fois l'ancre rejointe.
  const arrived = manhattan(state.tile, anchor.tile) <= config.followDistance;
  if (state.activity === "pursue" && arrived && anchor.onArrival === "wander") {
    // Une ancre qui suit le joueur attend qu'il soit inactif ; une ancre inerte
    // (jardin) n'a personne à attendre et peut flâner tout de suite.
    const mayWander = !anchor.tracksPlayer || state.idleTicks >= config.idleTicksBeforeWander;
    if (mayWander) {
      state.activity = "wander";
      state.wanderTarget = null;
      state.wanderCooldown = 0;
    }
  }

  // 4. Déplacement d'un pas, le long du plus court chemin.
  //
  // L'arrivée est un prédicat, pas une tuile : en suivi on accepte n'importe
  // quelle case à `followDistance` du joueur, dont la sienne est exclue. Viser
  // sa tuile exacte n'aboutirait jamais.
  const passable: IsWalkable = (x, y) =>
    stepWalkable(x, y) && !(blocked !== null && x === blocked.x && y === blocked.y);

  let isGoal: IsGoal | null = null;
  if (state.activity === "pursue") {
    if (!arrived) {
      isGoal = (x, y) => manhattan({ x, y }, anchor.tile) <= config.followDistance;
    }
  } else {
    const target = resolveWanderTarget(state, anchor, config, zoneWalkable, random);
    if (target) isGoal = (x, y) => x === target.x && y === target.y;
  }

  if (!isGoal) return { state, tile: state.tile, teleported: false };

  const next = findFirstStep(state.tile, isGoal, passable);
  if (!next) {
    // Aucun chemin : rester sur place est la bonne réponse. En flânerie, la
    // cible est inatteignable, on la relâche pour en tirer une autre.
    if (state.activity === "wander") state.wanderTarget = null;
    return { state, tile: state.tile, teleported: false };
  }

  state.tile = next;
  return { state, tile: next, teleported: false };
}

/**
 * En flânerie : on temporise entre deux déplacements, et on retire une cible
 * dès que la précédente est atteinte.
 */
function resolveWanderTarget(
  state: MovementState,
  anchor: Anchor,
  config: MovementConfig,
  isWalkable: IsWalkable,
  random: () => number
): XY | null {
  if (state.wanderCooldown > 0) {
    state.wanderCooldown--;
    return null;
  }
  if (state.wanderTarget && sameTile(state.wanderTarget, state.tile)) {
    state.wanderTarget = null;
    state.wanderCooldown = config.wanderPauseTicks;
    return null;
  }
  if (!state.wanderTarget) {
    state.wanderTarget = pickWanderTarget(
      anchor.tile,
      wanderRadiusOf(anchor, config),
      isWalkable,
      random
    );
    if (!state.wanderTarget) {
      state.wanderCooldown = config.wanderPauseTicks;
      return null;
    }
  }
  return state.wanderTarget;
}
