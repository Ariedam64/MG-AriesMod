// src/services/companion/index.ts
// Façade du companion : câble la boucle de déplacement à l'injection d'état.
//
// C'est le seul fichier du dossier qui tient des timers et des abonnements ;
// `movement.ts` est pur, `map.ts` et `injection.ts` sont sans état de boucle.
// Aucun effet de bord à l'import : rien ne démarre tant que `start()` n'est pas
// appelé, et `stop()` est idempotent et restaure tout.

import { Atoms } from "../../store/atoms";
import { makeAtom } from "../../store/hub";
import {
  ATTENTION_MOVEMENT_CONFIG,
  DEFAULT_MOVEMENT_CONFIG,
  STEP_INTERVAL_MS,
  TASK_MOVEMENT_CONFIG,
  findNearbyWalkable,
  hasGameCaughtUp,
  initialMovementState,
  manhattan,
  stepMovement,
  type Anchor,
  type IsWalkable,
  type MovementState,
  type XY,
} from "./movement";
import { onMapChange, readCompanionMap, type CompanionMap } from "./map";
import { resolveAnchor, type CompanionMode } from "./anchors";
import {
  disposeInjection,
  hideCompanion,
  installInjection,
  listNpcIdentities,
  setCompanionTile,
  type NpcIdentity,
} from "./injection";
import {
  loadCompanionSettings,
  patchCompanionSettings,
  sanitizeLines,
  type CompanionSettings,
} from "./state";
import { diagnoseCompanion } from "./diagnostics";
import { isTickAvailable } from "./tick";
import {
  DEFAULT_CONTEXTUAL_COOLDOWN_MS,
  initialDialogueState,
  pickDialogueLine,
  type ContextualLine,
  type DialogueState,
} from "./dialogue";
import { collectContextualLines } from "./dialogueContext";
import { AUTHORED_BY_MOD, installSpeechRewriter, uninstallSpeechRewriter } from "./speech";
import { playEmote, stopEmote } from "./emote";
import type { EmoteType } from "./emoteTypes";
import type { BubbleTag } from "./chat/bubbleTags";

/** Durée d'affichage d'une bulle côté jeu, pour ne pas la réécrire trop vite. */
/**
 * Écart minimum entre deux bulles.
 *
 * Le jeu, lui, n'en impose aucun : ses propres PNJ changent de réplique aussi
 * vite qu'on leur parle. Ce garde-fou est donc entièrement à nous, et il était
 * réglé bien trop haut — à 1200 ms il avalait les annonces d'un lot dont les
 * actions partent toutes les 500 ms.
 *
 * Il ne reste ici que pour absorber deux écritures au même instant. Tout ce qui
 * mérite d'être lu passe désormais, sans avoir à demander la priorité.
 */
const CHAT_BUBBLE_MIN_INTERVAL_MS = 250;

/**
 * Au-delà de ce délai d'attente du rendu, on avance quand même.
 * Le companion hors écran n'est plus redessiné : sans cette soupape, il resterait
 * figé et ne reviendrait jamais vers le joueur.
 */
const RENDER_WAIT_TIMEOUT_MS = 1500;

/** Fréquence de rafraîchissement des répliques contextuelles pré-calculées. */
const CONTEXTUAL_REFRESH_MS = 10_000;

const npcChatBubbles = makeAtom<Record<string, unknown>>("npcChatBubblesAtom");
/** Ce que la couche avatar consomme réellement : sert de accusé de rendu. */
const npcQuinoaUsers = makeAtom<Array<{ playerId: string; position?: XY | null }>>("npcQuinoaUsersAtom");

type Unsubscribe = () => void;

type Runtime = {
  settings: CompanionSettings;
  npcId: string;
  map: CompanionMap | null;
  movement: MovementState;
  player: XY | null;
  timer: number | null;
  unsubs: Unsubscribe[];
  lastBubbleAt: number;
  /** Dernière position que le jeu a réellement lue pour notre PNJ. */
  observedTile: XY | null;
  /** Depuis quand on attend l'accusé de rendu. `null` = on n'attend pas. */
  waitingSinceMs: number | null;
  /** Mode réellement appliqué : diffère du réglage en cas de repli. */
  effectiveMode: CompanionMode;
  dialogue: DialogueState;
  /**
   * Répliques contextuelles pré-calculées. L'interception du dialogue est
   * synchrone alors que la lecture de l'état du jeu est asynchrone : on collecte
   * donc en avance, et la sélection reste instantanée au moment du Talk.
   */
  contextualCache: ContextualLine[];
  contextualTimer: number | null;
  /**
   * Tuile imposée par une tâche en cours, qui court-circuite le mode.
   *
   * Le companion s'y rend et y reste tant que la tâche n'est pas relâchée : une
   * récolte l'envoie sur chaque crop avant d'envoyer la commande.
   */
  task: XY | null;
  /**
   * Le companion attend une réponse : il reste auprès du joueur.
   *
   * Il a posé une question de vive voix ; repartir au jardin avant qu'on ait
   * répondu donnerait l'impression qu'il s'en désintéresse. Prime sur le mode,
   * mais cède à une tâche : un ordre précis reste plus fort qu'une attente.
   */
  attention: boolean;
};

let runtime: Runtime | null = null;
let starting: Promise<boolean> | null = null;

function roundTile(pos: { x?: unknown; y?: unknown } | null | undefined): XY | null {
  const x = Number(pos?.x);
  const y = Number(pos?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: Math.round(x), y: Math.round(y) };
}

/**
 * Choisit le NPC à détourner.
 *
 * On préfère un NPC absent (marchand météo hors saison) : le companion ne
 * chevauche alors personne. Faute de mieux, on prend le premier du roster —
 * l'injection étant prioritaire, ça reste fonctionnel.
 */
async function resolveNpcId(preferred: string | null): Promise<string | null> {
  const roster = await listNpcIdentities();
  if (roster.length === 0) return preferred;
  if (preferred && roster.some((n) => n.playerId === preferred)) return preferred;
  return (roster.find((n) => !n.present) ?? roster[0]).playerId;
}

/** Un tick : décide du prochain pas et l'injecte. */
async function tick(): Promise<void> {
  const rt = runtime;
  if (!rt || !rt.map || !rt.player) return;

  // Verrou anti-saut : on n'avance que si le jeu a rendu la position courante.
  // Le tick force ce rendu en quelques millisecondes ; l'attente n'est donc
  // sensible que si le forçage est indisponible.
  if (!hasGameCaughtUp(rt.movement.tile, rt.observedTile)) {
    const now = Date.now();
    if (rt.waitingSinceMs === null) rt.waitingSinceMs = now;
    if (now - rt.waitingSinceMs < RENDER_WAIT_TIMEOUT_MS) return;
  }
  rt.waitingSinceMs = null;

  // Une tâche prime sur le mode : tant qu'elle dure, le companion ne suit plus
  // le joueur et ne flâne plus, il va où on l'envoie. On saute donc la
  // résolution d'ancre, qui n'aurait servi qu'à être écrasée.
  let anchor: Anchor;
  let isWalkable: IsWalkable;
  if (rt.task) {
    anchor = { tile: rt.task, onArrival: "hold", tracksPlayer: false };
    isWalkable = rt.map.isWalkable;
  } else {
    // L'ancre est résolue à chaque tick : le joueur bouge, et un changement de
    // mode ou de salle doit être pris en compte sans redémarrage.
    const resolved = await resolveAnchor({
      mode: rt.attention ? "follow" : rt.settings.mode,
      map: rt.map,
      player: rt.player,
    });
    if (resolved.effectiveMode !== rt.effectiveMode) {
      // Changer de zone invalide la cible de flânerie courante, qui peut être
      // hors de la nouvelle zone.
      rt.effectiveMode = resolved.effectiveMode;
      rt.movement.wanderTarget = null;
    }
    anchor = resolved.anchor;
    isWalkable = resolved.isWalkable;
  }

  const decision = stepMovement({
    anchor,
    state: rt.movement,
    isWalkable,
    random: Math.random,
    config: rt.task
      ? TASK_MOVEMENT_CONFIG
      : rt.attention
        ? ATTENTION_MOVEMENT_CONFIG
        : DEFAULT_MOVEMENT_CONFIG,
  });
  rt.movement = decision.state;

  if (!decision.tile) return;
  await setCompanionTile(rt.npcId, rt.map.toIndex(decision.tile.x, decision.tile.y));
}

/**
 * Résolveur appelé par l'interception, au moment exact où le jeu écrit la bulle.
 * Synchrone par construction : il ne fait que choisir parmi des candidats déjà
 * collectés. Rendre `null` laisse passer la réplique d'origine du jeu.
 */
function resolveSpeech(): string | null {
  const rt = runtime;
  if (!rt) return null;
  const picked = pickDialogueLine({
    contextual: rt.settings.contextualEnabled ? rt.contextualCache : [],
    customLines: rt.settings.lines,
    state: rt.dialogue,
    nowMs: Date.now(),
    random: Math.random,
    cooldownMs: DEFAULT_CONTEXTUAL_COOLDOWN_MS,
  });
  rt.dialogue = picked.state;
  return picked.message;
}

async function refreshContextual(): Promise<void> {
  const rt = runtime;
  if (!rt) return;
  rt.contextualCache = rt.settings.contextualEnabled ? await collectContextualLines() : [];
}

function clearContextualTimer(rt: Runtime): void {
  if (rt.contextualTimer !== null) {
    clearInterval(rt.contextualTimer);
    rt.contextualTimer = null;
  }
}

function clearTimer(rt: Runtime): void {
  if (rt.timer !== null) {
    clearInterval(rt.timer);
    rt.timer = null;
  }
}

function startTimer(rt: Runtime): void {
  clearTimer(rt);
  rt.timer = window.setInterval(() => {
    void tick().catch(() => {});
  }, STEP_INTERVAL_MS);
}

async function startInternal(): Promise<boolean> {
  if (runtime) return true;

  const settings = loadCompanionSettings();
  const npcId = await resolveNpcId(settings.npcId);
  if (!npcId) return false;

  const map = await readCompanionMap();
  const player = roundTile(await Atoms.player.position.get().catch(() => null));

  const rt: Runtime = {
    settings,
    npcId,
    map,
    movement: initialMovementState(),
    player,
    timer: null,
    unsubs: [],
    lastBubbleAt: 0,
    observedTile: null,
    waitingSinceMs: null,
    effectiveMode: settings.mode,
    dialogue: initialDialogueState(),
    contextualCache: [],
    contextualTimer: null,
    task: null,
    attention: false,
  };
  runtime = rt;

  await installInjection();
  installSpeechRewriter(npcId, resolveSpeech);
  void refreshContextual().catch(() => {});
  rt.contextualTimer = window.setInterval(() => {
    void refreshContextual().catch(() => {});
  }, CONTEXTUAL_REFRESH_MS);

  // La position du joueur pilote le suivi ; la map change à chaque salle.
  try {
    rt.unsubs.push(
      await Atoms.player.position.onChangeNow((next) => {
        const tile = roundTile(next);
        if (tile) rt.player = tile;
      })
    );
  } catch {}
  // Accusé de rendu : cet atom est celui que lit la couche avatar, donc le voir
  // changer prouve que la position injectée est bien arrivée jusqu'au rendu.
  try {
    rt.unsubs.push(
      await npcQuinoaUsers.onChangeNow((entries) => {
        const entry = Array.isArray(entries) ? entries.find((e) => e?.playerId === rt.npcId) : null;
        const tile = roundTile(entry?.position ?? null);
        if (tile) rt.observedTile = tile;
      })
    );
  } catch {}
  try {
    rt.unsubs.push(
      await onMapChange((next) => {
        rt.map = next;
        // Nouvelle map : l'ancienne position n'a plus de sens, on refait apparaître.
        rt.movement = initialMovementState();
        rt.observedTile = null;
        rt.waitingSinceMs = null;
      })
    );
  } catch {}

  startTimer(rt);
  return true;
}

/**
 * Au-delà, on renonce à l'aller : une tuile peut être inatteignable.
 *
 * Généreux au regard de la marche — 5 s font une trentaine de pas, bien plus
 * qu'il n'en faut pour traverser une parcelle — mais c'est du temps mort quand
 * l'aller échoue, d'où l'abandon rapide côté appelant.
 */
const WALK_TIMEOUT_MS = 5000;
/**
 * Cadence à laquelle on vérifie l'arrivée.
 *
 * Sous les 150 ms d'un pas : c'est du temps mort pur, entre l'instant où le
 * companion pose le pied sur sa case et celui où l'action part. À 100 ms on en
 * perdait jusqu'à 100 par crop, pour rien.
 */
const ARRIVAL_POLL_MS = 50;
/** À cette distance du joueur, la bulle est déjà à l'écran : inutile de marcher. */
const NEARBY_DISTANCE = 3;

/** Cadence à laquelle on vérifie qu'il s'est posé, avant d'emoter. */
const STILL_POLL_MS = 150;

/**
 * Au-delà, on renonce à l'emote d'arrivée.
 *
 * Large exprès : un trajet d'un bout à l'autre du jardin prend quelques
 * secondes, et rater l'emote parce qu'on comptait trop court serait dommage.
 * Ce n'est qu'une soupape contre un companion qui ne s'arrête jamais.
 */
const STILL_TIMEOUT_MS = 10_000;

/** Jeton de l'attente en cours : une question plus récente annule la précédente. */
let stillToken = 0;

export const CompanionService = {
  isRunning(): boolean {
    return runtime !== null;
  },

  /**
   * Position de la tuile de terre d'un crop, dans la parcelle du joueur.
   *
   * `dirtTileIdx` est le `slot` du protocole de récolte. Rend `null` quand la
   * map n'est pas encore lue ou que l'index ne correspond à aucune tuile.
   */
  gardenTileXY(userSlotIdx: number, dirtTileIdx: number): XY | null {
    const map = runtime?.map;
    if (!map) return null;
    const global = map.gardenTileToGlobal(userSlotIdx, dirtTileIdx);
    return global === null ? null : map.toXY(global);
  },

  /**
   * Envoie le companion sur une tuile et attend qu'il y soit.
   *
   * Rend `false` s'il n'y arrive pas dans le temps imparti — l'appelant décide
   * alors s'il poursuit sans lui. La tâche reste posée : c'est `releaseTask`
   * qui rend le companion à son mode, une fois toute la série terminée, sinon
   * il repartirait vers le joueur entre deux crops.
   *
   * Une tuile occupée par une plante peut être infranchissable : on vise alors
   * la case marchable la plus proche, ce qui suffit à « être devant ».
   */
  async walkTo(target: XY): Promise<boolean> {
    const rt = runtime;
    if (!rt || !rt.map) return false;

    const reachable = rt.map.isWalkable(target.x, target.y)
      ? target
      : findNearbyWalkable(target, rt.map.isWalkable, true, 2);
    if (!reachable) return false;

    rt.task = reachable;
    // Une tâche posée sur la tuile où l'ancre se trouvait déjà ne serait pas vue
    // comme un changement d'ancre : sans cette remise à zéro, le companion
    // resterait en flânerie au lieu de rejoindre sa cible.
    rt.movement = { ...rt.movement, activity: "pursue", wanderTarget: null, wanderCooldown: 0 };

    const deadline = Date.now() + WALK_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const here = runtime?.movement.tile;
      if (!runtime || runtime.task !== reachable) return false;
      if (here && manhattan(here, reachable) === 0) return true;
      await new Promise((resolve) => setTimeout(resolve, ARRIVAL_POLL_MS));
    }
    return false;
  },

  /**
   * Fait venir le companion auprès du joueur, pour lui parler en face.
   *
   * Une bulle apparaît au-dessus du PNJ : lancée depuis l'autre bout de la
   * carte, elle s'afficherait hors écran et personne ne la verrait. Il faut
   * donc être là avant d'ouvrir la bouche.
   *
   * On vise une case *voisine* : la tuile du joueur est occupée, et se planter
   * dessus n'aurait aucun sens. Déjà à portée de vue, on ne bouge pas.
   *
   * Comme `walkTo`, la tâche reste posée jusqu'à `releaseTask`.
   */
  async comeToPlayer(): Promise<boolean> {
    const rt = runtime;
    if (!rt || !rt.map || !rt.player) return false;

    const here = rt.movement.tile;
    if (here && manhattan(here, rt.player) <= NEARBY_DISTANCE) return true;

    const spot = findNearbyWalkable(rt.player, rt.map.isWalkable, true, 3);
    return spot ? CompanionService.walkTo(spot) : false;
  },

  /** Rend le companion à son mode après une série de déplacements. */
  releaseTask(): void {
    if (runtime) runtime.task = null;
  },

  /** Le fait rester auprès du joueur, quel que soit son mode. */
  holdAttention(): void {
    if (runtime) runtime.attention = true;
  },

  /** Le rend à son mode : suivi ou jardin, selon ce qui était réglé. */
  releaseAttention(): void {
    if (runtime) runtime.attention = false;
  },

  /** Vrai tant qu'il attend une réponse auprès du joueur. */
  isHoldingAttention(): boolean {
    return runtime?.attention === true;
  },

  getNpcId(): string | null {
    return runtime?.npcId ?? null;
  },

  /**
   * Fait jouer une emote au PNJ, le temps que le jeu s'accorde lui-même.
   *
   * Sans effet quand le companion n'est pas incarné : il n'y a alors aucune vue
   * à animer. C'est du décor local — rien ne part sur le réseau, et l'appelant
   * n'a donc pas à demander de confirmation pour ça.
   *
   * `holdMs` prolonge la pose au-delà de la durée par défaut, pour un moment
   * qui mérite qu'on s'y arrête.
   */
  async emote(emote: EmoteType, holdMs?: number): Promise<void> {
    const rt = runtime;
    if (!rt) return;
    await playEmote(rt.npcId, emote, holdMs);
  },

  /**
   * Emote une fois qu'il est arrivé et qu'il ne bouge plus.
   *
   * Une pose jouée en pleine marche passe inaperçue : elle se déroule pendant
   * qu'il glisse d'une case à l'autre, et le joueur ne voit qu'un avatar qui
   * traverse. On attend donc qu'il soit posé.
   *
   * Deux conditions, et il faut les deux. Plus aucune tâche en cours, ce qui
   * couvre le trajet qu'on vient de lui donner — une question posée juste avant
   * qu'il parte rejoindre le joueur attend ainsi son arrivée. Et la même tuile
   * sur deux relevés consécutifs, parce que l'avatar interpole entre deux cases
   * et qu'il glisse encore un instant après avoir atteint la dernière.
   *
   * Le premier relevé ne peut donc jamais déclencher : c'est voulu, ce délai de
   * grâce laisse le temps à un ordre de déplacement imminent d'être enregistré.
   *
   * Abandonne en silence s'il ne se pose jamais. Un joueur qui marche sans
   * s'arrêter entraîne le companion avec lui, et la question reste de toute
   * façon lisible dans la bulle comme dans le fil.
   */
  async emoteWhenStill(emote: EmoteType, timeoutMs = STILL_TIMEOUT_MS): Promise<void> {
    const rt = runtime;
    if (!rt) return;

    const token = ++stillToken;
    const deadline = Date.now() + timeoutMs;
    let previous: XY | null = null;

    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, STILL_POLL_MS));
      // Une attente plus récente a pris la main, ou le companion s'est arrêté
      // entre-temps : dans les deux cas celle-ci n'a plus lieu d'être.
      if (token !== stillToken || runtime !== rt) return;

      const here = rt.movement.tile;
      const still = rt.task === null && here !== null && previous !== null && manhattan(here, previous) === 0;
      previous = here;
      if (still) {
        await playEmote(rt.npcId, emote);
        return;
      }
    }
  },

  getSettings(): CompanionSettings {
    return runtime?.settings ?? loadCompanionSettings();
  },

  listNpcs(): Promise<NpcIdentity[]> {
    return listNpcIdentities();
  },

  /** Mode réellement appliqué : diffère du réglage quand un repli a joué. */
  getEffectiveMode(): CompanionMode | null {
    return runtime?.effectiveMode ?? null;
  },

  /** Redémarre le companion au boot s'il était actif à la session précédente. */
  autoStart(): void {
    try {
      if (!loadCompanionSettings().enabled) return;
      void CompanionService.start().catch(() => {});
    } catch {}
  },

  /** Démarre le companion. Idempotent, y compris sur appels concurrents. */
  async start(): Promise<boolean> {
    if (runtime) return true;
    if (!starting) {
      starting = startInternal().finally(() => {
        starting = null;
      });
    }
    return starting;
  },

  /** Arrête tout et restaure l'atom du jeu. Sûr à appeler plusieurs fois. */
  async stop(): Promise<void> {
    const rt = runtime;
    runtime = null;
    uninstallSpeechRewriter();
    // Avant tout le reste : une pose en cours survivrait au retrait du
    // companion et figerait le PNJ qu'on lui empruntait.
    await stopEmote();
    if (!rt) {
      await disposeInjection();
      return;
    }
    clearTimer(rt);
    clearContextualTimer(rt);
    for (const unsub of rt.unsubs) {
      try {
        unsub();
      } catch {}
    }
    rt.unsubs.length = 0;
    await hideCompanion();
    await disposeInjection();
  },

  /** Applique une modification de config, en redémarrant si nécessaire. */
  async applySettings(patch: Partial<CompanionSettings>): Promise<CompanionSettings> {
    const next = patchCompanionSettings(patch);
    const rt = runtime;
    if (!rt) {
      if (next.enabled) await CompanionService.start();
      return next;
    }
    if (!next.enabled) {
      await CompanionService.stop();
      return next;
    }
    const npcChanged = patch.npcId !== undefined && patch.npcId !== rt.npcId;
    if (npcChanged) {
      // Changer d'identité impose de repartir de zéro : l'ancienne entrée doit
      // disparaître de l'injection avant que la nouvelle apparaisse.
      await CompanionService.stop();
      await CompanionService.start();
      return next;
    }
    rt.settings = next;
    startTimer(rt);
    // Le cache contextuel doit suivre le réglage, sinon désactiver l'option
    // laisserait les dernières alertes utilisables jusqu'au prochain rafraîchi.
    void refreshContextual().catch(() => {});
    return next;
  },

  /** Remplace la liste de répliques perso. Utilisable depuis la console. */
  async setLines(lines: string[]): Promise<CompanionSettings> {
    return CompanionService.applySettings({ lines: sanitizeLines(lines) });
  },

  /**
   * Mesure ce que le jeu observe réellement comme positions, pour distinguer un
   * snap dû à la cadence de recalcul d'un snap dû à autre chose.
   * À lancer pendant que le companion marche.
   */
  async diagnose(sampleMs?: number) {
    const npcId = runtime?.npcId;
    if (!npcId) return { error: "Companion inactif : lance d'abord window.Companion.start()." };
    // `tickAvailable: false` signifie que le recalcul forcé n'a pas pu être
    // branché : le verrou évite alors le saut, mais la marche reste lente.
    return { tickAvailable: isTickAvailable(), ...(await diagnoseCompanion(npcId, sampleMs)) };
  },

  /**
   * Fait parler le companion. Point d'entrée du dialogue (phase 3) : le jeu lit
   * les bulles NPC dans un atom local, aucun envoi réseau n'est impliqué.
   *
   * L'anti-rafale protège des séries de messages de progression. `force` est
   * pour la réplique qu'on tient absolument à faire entendre : sans lui, une
   * annonce venant juste après le message qui l'a déclenchée se faisait jeter,
   * et le companion restait muet au moment précis où il avait à parler.
   */
  async say(
    message: string,
    opts: { force?: boolean; tags?: Record<number, BubbleTag> } = {}
  ): Promise<void> {
    const rt = runtime;
    if (!rt || !message.trim()) return;
    const now = Date.now();
    if (!opts.force && now - rt.lastBubbleAt < CHAT_BUBBLE_MIN_INTERVAL_MS) return;
    rt.lastBubbleAt = now;

    // Le jeu bascule sur son rendu balisé dès que `tags` est présent, et un
    // objet vide y suffit : on ne le joint que s'il porte vraiment une icône.
    const tagged = opts.tags && Object.keys(opts.tags).length > 0 ? { tags: opts.tags } : {};

    try {
      await npcChatBubbles.set({
        // Marqué comme écrit par le mod : sans ça, l'interception réécrirait
        // notre propre message avec une réplique tirée au hasard.
        [rt.npcId]: { seq: 0, playerId: rt.npcId, message, timestamp: now, ...tagged, [AUTHORED_BY_MOD]: true },
      });
    } catch {}
  },
};

export type CompanionServiceType = typeof CompanionService;
export type { NpcIdentity } from "./injection";
export type { CompanionSettings } from "./state";
