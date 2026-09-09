import {
  DEFAULT_MOVEMENT_CONFIG,
  TASK_MOVEMENT_CONFIG,
  findNearbyWalkable,
  hasGameCaughtUp,
  initialMovementState,
  manhattan,
  stepMovement,
  ticksFromMs,
  type Anchor,
  type IsWalkable,
  type MovementConfig,
  type MovementState,
  type XY,
} from "../src/services/companion/movement";
import { findFirstStep } from "../src/services/companion/pathfinding";
import { matchBuildingName } from "../src/services/companion/buildings";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

/** Map ouverte de 40x40, sans obstacle. */
const openMap: IsWalkable = (x, y) => x >= 0 && y >= 0 && x < 40 && y < 40;

/** Même map, mais la colonne x=5 est un mur (sauf une porte en y=0). */
const wallMap: IsWalkable = (x, y) => openMap(x, y) && !(x === 5 && y !== 0);

const cfg = (over: Partial<MovementConfig> = {}): MovementConfig => ({
  ...DEFAULT_MOVEMENT_CONFIG,
  ...over,
});

/** random() déterministe : toujours le même tirage. */
const fixedRandom = (v: number) => () => v;

/** Ancre par défaut des tests : le joueur, comme en mode Follow. */
const playerAnchor = (tile: XY): Anchor => ({ tile, onArrival: "wander", tracksPlayer: true });

/** Voisinage à 8 : c'est la notion d'adjacence du jeu (zone d'interaction 3x3). */
const chebyshev = (a: XY, b: XY) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function run(
  state: MovementState,
  player: XY,
  ticks: number,
  isWalkable: IsWalkable = openMap,
  config: MovementConfig = cfg(),
  random: () => number = fixedRandom(0)
) {
  let s = state;
  const path: (XY | null)[] = [];
  const frames: { preTile: XY | null; tile: XY | null; activity: string }[] = [];
  let teleports = 0;
  let illegalSteps = 0;
  for (let i = 0; i < ticks; i++) {
    const prev = s.tile;
    const d = stepMovement({ anchor: playerAnchor(player), state: s, isWalkable, random, config });
    s = d.state;
    if (d.teleported) teleports++;
    // Invariant central : hors téléport, un tick ne déplace que d'une case.
    if (!d.teleported && prev && d.tile && manhattan(prev, d.tile) > 1) illegalSteps++;
    path.push(d.tile);
    frames.push({ preTile: prev, tile: d.tile, activity: d.state.activity });
  }
  return { state: s, path, frames, teleports, illegalSteps };
}

console.log("--- apparition ---");
{
  const player = { x: 10, y: 10 };
  const d = stepMovement({
    anchor: playerAnchor(player),
    state: initialMovementState(),
    isWalkable: openMap,
    random: fixedRandom(0),
    config: cfg(),
  });
  check("spawn adjacent au joueur", d.tile && chebyshev(d.tile, player), 1);
  check("spawn marqué comme saut", d.teleported, true);
  check("spawn jamais sur la tuile du joueur", d.tile && (d.tile.x === player.x && d.tile.y === player.y), false);
}
{
  // Joueur enfermé : aucune tuile marchable autour.
  const closed: IsWalkable = () => false;
  const d = stepMovement({
    anchor: playerAnchor({ x: 10, y: 10 }),
    state: initialMovementState(),
    isWalkable: closed,
    random: fixedRandom(0),
    config: cfg(),
  });
  check("aucune tuile marchable -> pas de position, pas de crash", d.tile, "null");
  check("findNearbyWalkable rend null si tout est bloqué", findNearbyWalkable({ x: 1, y: 1 }, closed, true), "null");
}

console.log("\n--- suivi ---");
{
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 10, y: 20 }, lastAnchorTile: player };
  const r = run(start, player, 20, openMap, cfg({ idleTicksBeforeWander: 999 }));
  check("aucun pas illégal (>1 case) en suivi", r.illegalSteps, 0);
  check("aucun téléport à distance 10", r.teleports, 0);
  check("finit à followDistance du joueur", manhattan(r.state.tile!, player), DEFAULT_MOVEMENT_CONFIG.followDistance);
  check("reste en poursuite tant qu'il rattrape", r.state.activity, "pursue");
}
{
  // Garde anti-décrochage : le joueur immobile ne doit pas envoyer flâner un
  // companion encore loin derrière, sinon il ne le rejoint jamais.
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 10, y: 20 }, lastAnchorTile: player };
  const r = run(start, player, DEFAULT_MOVEMENT_CONFIG.idleTicksBeforeWander + 4);
  // La bascule en flânerie ne doit se produire qu'une fois le joueur rejoint.
  // (Flâner ensuite jusqu'au rayon de flânerie est normal, on ne teste que la transition.)
  // On regarde la position AVANT le pas du tick de bascule : c'est l'état sur
  // lequel la décision a été prise.
  const firstWander = r.frames.find((f) => f.activity === "wander");
  check(
    "bascule en flânerie seulement après avoir rattrapé",
    firstWander && firstWander.preTile && manhattan(firstWander.preTile, player) <= DEFAULT_MOVEMENT_CONFIG.followDistance,
    true
  );
  check("finit tout de même par flâner une fois arrivé", r.state.activity, "wander");
}
{
  // Déjà à bonne distance : il ne doit pas se coller au joueur.
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 21, y: 20 }, lastAnchorTile: player };
  const r = run(start, player, 5, openMap, cfg({ idleTicksBeforeWander: 999 }));
  check("ne bouge pas quand il est déjà assez près", `${r.state.tile!.x},${r.state.tile!.y}`, "21,20");
}
{
  // Un mur entre le companion et le joueur : il doit longer, jamais traverser.
  const player = { x: 10, y: 5 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 1, y: 5 }, lastAnchorTile: player };
  const r = run(start, player, 40, wallMap);
  const crossedWall = r.path.some((p) => p && p.x === 5 && p.y !== 0);
  check("ne traverse jamais une tuile bloquée", crossedWall, false);
  check("aucun pas illégal en longeant le mur", r.illegalSteps, 0);
}

console.log("\n--- bascule follow / wander ---");
{
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 21, y: 20 }, lastAnchorTile: player };
  const idle = DEFAULT_MOVEMENT_CONFIG.idleTicksBeforeWander;
  const before = run(start, player, idle - 1);
  check("reste en poursuite avant le seuil d'inactivité", before.state.activity, "pursue");
  const after = run(start, player, idle);
  check("passe en wander au seuil", after.state.activity, "wander");
  check("aucun pas illégal en flânerie", after.illegalSteps, 0);

  // Le joueur rebouge : retour immédiat en suivi.
  const resumed = stepMovement({
    anchor: playerAnchor({ x: 21, y: 21 }),
    state: after.state,
    isWalkable: openMap,
    random: fixedRandom(0),
    config: cfg(),
  });
  check("retour en poursuite dès que le joueur bouge", resumed.state.activity, "pursue");
  check("cible de flânerie relâchée au retour en follow", resumed.state.wanderTarget, "null");
}
{
  // La flânerie doit rester dans le rayon autour du joueur.
  const player = { x: 20, y: 20 };
  const start: MovementState = {
    ...initialMovementState(),
    activity: "wander",
    tile: { x: 20, y: 21 },
    lastAnchorTile: player,
  };
  const radius = DEFAULT_MOVEMENT_CONFIG.wanderRadius;
  const r = run(start, player, 60, openMap, cfg(), Math.random);
  const strayed = r.path.some((p) => p && manhattan(p, player) > radius * 2);
  check("ne s'éloigne jamais franchement du joueur en flânerie", strayed, false);
  check("aucun pas illégal sur 60 ticks aléatoires", r.illegalSteps, 0);
  check("aucun téléport intempestif en flânerie", r.teleports, 0);
}

console.log("\n--- temporisations en millisecondes ---");
{
  check("30 s à 150 ms/pas = 200 ticks", ticksFromMs(30_000, 150, 0), 200);
  check("15 s à 150 ms/pas = 100 ticks", ticksFromMs(15_000, 150, 1), 100);
  // Le réglage doit garder son sens quand la vitesse de marche change.
  check("30 s à 300 ms/pas = 100 ticks", ticksFromMs(30_000, 300, 0), 100);
  check("0 ms respecte le minimum demandé", ticksFromMs(0, 150, 0), 0);
  check("une durée courte ne descend pas sous le minimum", ticksFromMs(10, 150, 1), 1);
  check("cadence invalide -> minimum, pas de division par zéro", ticksFromMs(30_000, 0, 1), 1);
}
{
  // Le bug rapporté : le companion repartait toutes les ~600 ms en flânerie.
  // Avec une pause de 30 s à 150 ms/pas, il doit rester immobile ~200 ticks.
  const player = { x: 20, y: 20 };
  const pauseTicks = ticksFromMs(30_000, 150, 0);
  const config = cfg({ wanderPauseTicks: pauseTicks, idleTicksBeforeWander: 1 });
  let state: MovementState = {
    ...initialMovementState(),
    activity: "wander",
    tile: { x: 20, y: 21 },
    lastAnchorTile: player,
    wanderCooldown: pauseTicks,
  };
  let moves = 0;
  // Le cooldown se décrémente d'un tick par appel : il en consomme `pauseTicks`
  // avant que la cible suivante soit choisie.
  for (let i = 0; i < pauseTicks; i++) {
    const prev = state.tile!;
    const d = stepMovement({ anchor: playerAnchor(player), state, isWalkable: openMap, random: fixedRandom(0), config });
    state = d.state;
    if (d.tile && manhattan(prev, d.tile) > 0) moves++;
  }
  check("immobile pendant toute la pause de 30 s", moves, 0);
  const after = stepMovement({ anchor: playerAnchor(player), state, isWalkable: openMap, random: fixedRandom(0), config });
  check("repart une fois la pause écoulée", manhattan(state.tile!, after.tile!), 1);
}

console.log("\n--- verrou anti-saut (accusé de rendu) ---");
{
  const tile = { x: 5, y: 5 };
  check("avance quand le jeu a rendu la position courante", hasGameCaughtUp(tile, { x: 5, y: 5 }), true);
  check("attend quand le jeu est resté en arrière", hasGameCaughtUp(tile, { x: 4, y: 5 }), false);
  check("attend même pour un retard d'une seule tuile", hasGameCaughtUp(tile, { x: 5, y: 4 }), false);
  check("n'entrave pas tant que rien n'a été observé", hasGameCaughtUp(tile, null), true);
  check("n'entrave pas avant l'apparition", hasGameCaughtUp(null, { x: 1, y: 1 }), true);
}
{
  // Le scénario qui produisait le bug : la boucle tourne plus vite que le rendu.
  // Avec le verrou, l'écart entre la position injectée et celle rendue ne peut
  // jamais dépasser une tuile, donc la couche avatar n'a jamais à couper.
  const player = { x: 15, y: 5 };
  let state: MovementState = { ...initialMovementState(), tile: { x: 5, y: 5 }, lastAnchorTile: player };
  let observed: XY | null = null;
  let maxGap = 0;
  // Le rendu ne "consomme" qu'un tick sur trois.
  for (let i = 0; i < 60; i++) {
    if (hasGameCaughtUp(state.tile, observed)) {
      const d = stepMovement({ anchor: playerAnchor(player), state, isWalkable: openMap, random: fixedRandom(0), config: cfg() });
      state = d.state;
    }
    if (i % 3 === 0 && state.tile) observed = { ...state.tile };
    if (state.tile && observed) maxGap = Math.max(maxGap, manhattan(state.tile, observed));
  }
  check("écart injecté/rendu plafonné à 1 tuile", maxGap, 1);
  check("le companion progresse malgré le verrou", state.tile!.x > 5, true);
}

console.log("\n--- robustesse ---");
{
  // Le companion se retrouve sur une tuile devenue bloquée : il doit pouvoir
  // repartir sans boucler indéfiniment.
  const player = { x: 10, y: 10 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 5, y: 3 }, lastAnchorTile: player };
  const r = run(start, player, 30, wallMap);
  check("repart d'une tuile bloquée sans pas illégal", r.illegalSteps, 0);
}
{
  // La position du companion ne doit jamais atterrir sur celle du joueur.
  const player = { x: 20, y: 20 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 26, y: 20 }, lastAnchorTile: player };
  const r = run(start, player, 30, openMap, cfg({ followDistance: 0 }));
  const overlapped = r.path.some((p) => p && p.x === player.x && p.y === player.y);
  check("ne marche jamais sur la tuile du joueur", overlapped, false);
}

console.log("\n--- mode jardin (ancre inerte + zone) ---");
{
  // Zone = un carré 6x6 ; l'ancre est son centre et ne suit pas le joueur.
  const inGarden: IsWalkable = (x, y) => x >= 10 && x < 16 && y >= 10 && y < 16;
  const gardenAnchor: Anchor = {
    tile: { x: 12, y: 12 },
    onArrival: "wander",
    tracksPlayer: false,
    wanderRadius: 3,
  };
  let state: MovementState = { ...initialMovementState(), tile: { x: 12, y: 12 } };
  let escaped = false;
  let illegal = 0;
  for (let i = 0; i < 200; i++) {
    const prev = state.tile;
    const d = stepMovement({
      anchor: gardenAnchor,
      state,
      isWalkable: inGarden,
      random: Math.random,
      config: cfg({ wanderPauseTicks: 0 }),
    });
    state = d.state;
    if (d.tile && !inGarden(d.tile.x, d.tile.y)) escaped = true;
    if (!d.teleported && prev && d.tile && manhattan(prev, d.tile) > 1) illegal++;
  }
  check("ne sort jamais de la zone du jardin", escaped, false);
  check("aucun pas illégal en flânerie de jardin", illegal, 0);
  // Ancre inerte : personne à attendre, il flâne dès qu'il est arrivé.
  check("flâne sans attendre l'inactivité du joueur", state.activity, "wander");
}
{
  // Le piège que le modèle ancre+zone doit supprimer : le joueur s'éloigne, et
  // le rattrapage ne doit PAS arracher le companion hors de son jardin.
  const inGarden: IsWalkable = (x, y) => x >= 10 && x < 16 && y >= 10 && y < 16;
  const gardenAnchor: Anchor = { tile: { x: 12, y: 12 }, onArrival: "wander", tracksPlayer: false };
  let state: MovementState = { ...initialMovementState(), tile: { x: 12, y: 12 } };
  let escaped = false;
  for (let i = 0; i < 50; i++) {
    const d = stepMovement({
      anchor: gardenAnchor,
      state,
      isWalkable: inGarden,
      random: Math.random,
      config: cfg(),
    });
    state = d.state;
    if (d.tile && !inGarden(d.tile.x, d.tile.y)) escaped = true;
  }
  check("un joueur lointain n'arrache pas le companion du jardin", escaped, false);
}

console.log("--- jamais de teleport apres l'apparition ---");
{
  // Le joueur part a l'autre bout de la map : le companion doit MARCHER,
  // jamais surgir a cote de lui.
  const player = { x: 38, y: 38 };
  const start: MovementState = { ...initialMovementState(), tile: { x: 1, y: 1 }, lastAnchorTile: player };
  const r = run(start, player, 120, openMap, cfg({ idleTicksBeforeWander: 999 }));
  check("aucun saut, meme a tres longue distance", r.teleports, 0);
  check("aucun pas illegal", r.illegalSteps, 0);
  check("il a bien progresse a pied", r.state.tile!.x > 1 && r.state.tile!.y > 1, true);
}
{
  // Changement de mode jardin -> suivi : l'ancre saute d'un bout a l'autre,
  // le companion non.
  const state: MovementState = {
    ...initialMovementState(),
    tile: { x: 12, y: 12 },
    lastAnchorTile: { x: 12, y: 12 },
  };
  const far = { x: 35, y: 35 };
  const d = stepMovement({
    anchor: playerAnchor(far),
    state,
    isWalkable: openMap,
    random: fixedRandom(0),
    config: cfg(),
  });
  check("bascule de mode : pas de saut", d.teleported, false);
  check("bascule de mode : un seul pas", manhattan(state.tile!, d.tile!), 1);
}
{
  // Le piege que la separation zone/marchabilite doit supprimer : bascule en
  // mode jardin alors que le companion est DEHORS. Sans elle, aucune case
  // autour de lui n'est autorisee et il reste fige a vie.
  const inGarden: IsWalkable = (x, y) => x >= 10 && x < 16 && y >= 10 && y < 16;
  const gardenAnchor: Anchor = {
    tile: { x: 12, y: 12 },
    onArrival: "wander",
    tracksPlayer: false,
    zone: inGarden,
  };
  let state: MovementState = { ...initialMovementState(), tile: { x: 2, y: 2 }, lastAnchorTile: { x: 12, y: 12 } };
  let teleports = 0;
  for (let i = 0; i < 60; i++) {
    const d = stepMovement({
      anchor: gardenAnchor,
      state,
      isWalkable: openMap,
      random: fixedRandom(0),
      config: cfg(),
    });
    if (d.teleported) teleports++;
    state = d.state;
  }
  check("rentre au jardin a pied depuis l'exterieur", inGarden(state.tile!.x, state.tile!.y), true);
  check("sans aucun saut", teleports, 0);
}

console.log("\n--- pathfinding : contournement ---");
{
  // LE cas qui figeait le companion : aligné sur un axe (dy === 0) avec un mur
  // en face. Le pas glouton n'avait alors aucun candidat vertical à tenter.
  const wallAtX5: IsWalkable = (x, y) => openMap(x, y) && !(x === 5 && y !== 0);
  const step = findFirstStep({ x: 3, y: 5 }, (x, y) => x === 8 && y === 5, wallAtX5);
  check("aligné face à un mur : il trouve quand même un pas", step !== null, true);
  check("et ce pas contourne au lieu de foncer dedans", step && step.x === 5, false);
}
{
  // Il doit ATTEINDRE la cible, pas seulement éviter le mur.
  const wallAtX5: IsWalkable = (x, y) => openMap(x, y) && !(x === 5 && y !== 0);
  let tile: XY = { x: 3, y: 5 };
  const target = { x: 8, y: 5 };
  for (let i = 0; i < 60; i++) {
    const step = findFirstStep(tile, (x, y) => x === target.x && y === target.y, wallAtX5);
    if (!step) break;
    if (manhattan(tile, step) !== 1) { check("pas toujours adjacent", false, true); break; }
    tile = step;
  }
  check("traverse la porte et atteint la cible", `${tile.x},${tile.y}`, "8,5");
}
{
  // Obstacle concave : le cas où une heuristique de contournement échouerait.
  const pocket: IsWalkable = (x, y) => {
    if (!openMap(x, y)) return false;
    if (y === 8 && x >= 4 && x <= 10) return false;
    if (x === 4 && y >= 4 && y <= 8) return false;
    if (x === 10 && y >= 4 && y <= 8) return false;
    return true;
  };
  let tile: XY = { x: 7, y: 6 };
  const target = { x: 7, y: 20 };
  let stuck = false;
  for (let i = 0; i < 120; i++) {
    const step = findFirstStep(tile, (x, y) => x === target.x && y === target.y, pocket);
    if (!step) { stuck = true; break; }
    tile = step;
    if (tile.x === target.x && tile.y === target.y) break;
  }
  check("sort d'une poche en U", stuck, false);
  check("et arrive à destination", `${tile.x},${tile.y}`, "7,20");
}

console.log("\n--- pathfinding : cas limites ---");
{
  const closed: IsWalkable = (x, y) => openMap(x, y) && x < 5;
  const step = findFirstStep({ x: 1, y: 1 }, (x, y) => x === 20 && y === 1, closed);
  check("cible vraiment inatteignable -> null (il reste sur place)", step, "null");
}
{
  const step = findFirstStep({ x: 4, y: 4 }, (x, y) => x === 4 && y === 4, openMap);
  check("déjà arrivé -> null, aucun pas parasite", step, "null");
}
{
  const step = findFirstStep({ x: 4, y: 4 }, (x, y) => x === 9 && y === 12, openMap);
  check("le pas rendu est toujours adjacent", step && manhattan({ x: 4, y: 4 }, step), 1);
}
{
  // Une arrivée sur une case non marchable ne doit jamais être proposée.
  const holeAt: IsWalkable = (x, y) => openMap(x, y) && !(x === 9 && y === 4);
  const step = findFirstStep({ x: 4, y: 4 }, (x, y) => x === 9 && y === 4, holeAt);
  check("arrivée non marchable -> refusée", step, "null");
}
{
  // Budget d'exploration : une map immense ne doit pas transformer un pas en
  // balayage sans fin.
  const infinite: IsWalkable = () => true;
  const step = findFirstStep({ x: 0, y: 0 }, () => false, infinite, 500);
  check("budget de noeuds respecté, pas de boucle infinie", step, "null");
}

console.log("\n--- deplacement sur ordre ---");
{
  const target = { x: 12, y: 10 };
  const taskAnchor: Anchor = { tile: target, onArrival: "hold", tracksPlayer: false };
  const startedAt = (): MovementState => ({ ...initialMovementState(), tile: { x: 4, y: 10 } });

  const walk = (config: MovementConfig): MovementState => {
    let s = startedAt();
    for (let i = 0; i < 60; i++) {
      s = stepMovement({ anchor: taskAnchor, state: s, isWalkable: openMap, random: fixedRandom(0), config }).state;
      if (s.tile && manhattan(s.tile, target) === 0) break;
    }
    return s;
  };

  const done = walk(TASK_MOVEMENT_CONFIG);
  check("ordre : la cible est atteinte exactement", done.tile && manhattan(done.tile, target), 0);

  // Le bug qui a motive ce test : avec la config de suivi, le companion
  // s'arretait a followDistance de la cible. L'appelant, lui, attendait une
  // arrivee exacte — donc son delai d'expiration entier, a chaque crop.
  const short = walk(cfg());
  check("config de suivi : s'arrete avant la cible", short.tile && manhattan(short.tile, target), 2);

  // Deja sur place : pas de pas parasite, l'appelant repart tout de suite.
  const onSpot: MovementState = { ...initialMovementState(), tile: { ...target }, lastAnchorTile: { ...target } };
  const still = stepMovement({
    anchor: taskAnchor,
    state: onSpot,
    isWalkable: openMap,
    random: fixedRandom(0),
    config: TASK_MOVEMENT_CONFIG,
  });
  check("deja sur la cible : reste immobile", still.tile && manhattan(still.tile, target), 0);
}

console.log("\n--- reperage des batiments ---");
{
  // Aucun nom de batiment n'est ecrit en dur : on cherche dans les cles que la
  // map expose, et les casses comme les separateurs y varient.
  const names = ["Pet_Shop", "PetHutch", "SeedShop"];

  check("la boutique d'animaux est trouvee", matchBuildingName(names, ["pet"], ["sell", "shop", "store"]), "Pet_Shop");
  // « pet » seul designerait aussi la niche : c'est tout l'interet du second groupe.
  check("la niche se distingue de la boutique", matchBuildingName(names, ["pet"], ["hutch"]), "PetHutch");
  check("les separateurs sont ignores", matchBuildingName(["pet shop"], ["petshop"], []), "pet shop");
  check("la casse est ignoree", matchBuildingName(["PETSHOP"], ["pet"], ["shop"]), "PETSHOP");
  check("sans second groupe, rien n'est exige", matchBuildingName(names, ["seed"], []), "SeedShop");
  // Deviner serait pire que rendre null : l'appelant sait quoi faire d'une absence.
  check("rien ne correspond : on n'invente pas", matchBuildingName(names, ["barn"], []), null);
  check("le second groupe peut tout ecarter", matchBuildingName(names, ["pet"], ["barn"]), null);
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
