// Vérifie ce qui donne un but à ses flâneries, et quand il en parle.
//
// Tout est pur (src/services/companion/wanderInterest.ts et movement.ts) : la
// lecture du jardin et les poses vivent à part, dans wanderWatch.ts, et ne
// décident de rien.
//
// Aucune espèce, mutation ou œuf du jeu n'apparaît ici : les noms sont
// inventés exprès, pour prouver qu'ils viennent bien des fonctions injectées.

import {
  ALMOST_READY_MS,
  COMMENT_COOLDOWN_MS,
  COMMENT_MAX_DISTANCE,
  INTEREST_CHANCE,
  KIND_EMOTE,
  interestLine,
  listInterests,
  pickWanderInterest,
  shouldComment,
  type InterestKind,
  type WanderInterestInput,
} from "../src/services/companion/wanderInterest";
import {
  DEFAULT_MOVEMENT_CONFIG,
  drawWanderPause,
  initialMovementState,
  manhattan,
  stepMovement,
  type Anchor,
  type IsWalkable,
  type MovementState,
  type WanderArea,
  type XY,
} from "../src/services/companion/movement";
import { EmoteType } from "../src/services/companion/emoteTypes";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

const fixedRandom = (v: number) => () => v;
/** Suite de tirages imposée, puis 0 indéfiniment. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
};

const NOW = 1_800_000_000_000;
const chebyshev = (a: XY, b: XY) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Parcelle de 10 cases de large : la case de terre n s'y trouve en (n % 10, floor(n / 10)) + (10, 10). */
const tileXY = (idx: number): XY | null => (idx >= 0 && idx < 100 ? { x: 10 + (idx % 10), y: 10 + Math.floor(idx / 10) } : null);
const idxAt = (x: number, y: number) => (y - 10) * 10 + (x - 10);

const openMap: IsWalkable = (x, y) => x >= 0 && y >= 0 && x < 40 && y < 40;

/** Zone de flânerie telle que movement.ts la fournit : rayon, ni centre ni case courante. */
function areaAround(center: XY, radius: number, from: XY, walkable: IsWalkable = openMap): WanderArea {
  return {
    center,
    radius,
    from,
    isWalkable: (x, y) =>
      chebyshev({ x, y }, center) <= radius &&
      !(x === center.x && y === center.y) &&
      !(x === from.x && y === from.y) &&
      walkable(x, y),
  };
}

const RARE = new Set(["Glimmer", "Prism"]);

const baseInput = (tileObjects: unknown, over: Partial<WanderInterestInput> = {}): WanderInterestInput => ({
  tileObjects,
  tileXY,
  now: NOW,
  area: areaAround({ x: 15, y: 15 }, 3, { x: 15, y: 16 }),
  random: fixedRandom(0),
  rareMutations: RARE,
  cropName: (s) => `crop<${s}>`,
  mutationName: (m) => `mut<${m}>`,
  eggName: (e) => `egg<${e}>`,
  chance: 1,
  ...over,
});

const plant = (slots: Array<Record<string, unknown>>, species = "Zorblax") => ({ objectType: "plant", species, slots });
const ripeSlot = (over: Record<string, unknown> = {}) => ({
  species: "Zorblax",
  startTime: NOW - 600_000,
  endTime: NOW - 1_000,
  mutations: [],
  ...over,
});
const growingSlot = (over: Record<string, unknown> = {}) => ({
  species: "Zorblax",
  startTime: NOW - 60_000,
  endTime: NOW + 3_600_000,
  mutations: [],
  ...over,
});
const egg = (maturedAt: number, eggId = "Wobbly") => ({ objectType: "egg", eggId, plantedAt: NOW - 1_000_000, maturedAt });

/* ------------------------------------------------------------------ */

console.log("--- le tirage de chance ---");
{
  const garden = { [idxAt(16, 15)]: plant([ripeSlot()]) };
  check("chance par defaut : une flanerie sur deux", INTEREST_CHANCE, 0.5);
  check("tirage au-dessus de la chance -> balade au hasard", pickWanderInterest(baseInput(garden, { chance: 0.5, random: fixedRandom(0.6) })), "null");
  check("tirage sous la chance -> un but", pickWanderInterest(baseInput(garden, { chance: 0.5, random: fixedRandom(0.1) })) !== null, true);
  check("chance nulle -> jamais", pickWanderInterest(baseInput(garden, { chance: 0, random: fixedRandom(0) })), "null");
}

console.log("\n--- entrees invalides ---");
{
  for (const [label, value] of [
    ["null", null],
    ["undefined", undefined],
    ["chaine", "garden"],
    ["nombre", 42],
    ["objet vide", {}],
  ] as Array<[string, unknown]>) {
    let crashed = false;
    let result: unknown = "x";
    try {
      result = pickWanderInterest(baseInput(value));
    } catch {
      crashed = true;
    }
    check(`jardin ${label} -> null sans crash`, !crashed && result === null, true);
  }
  const junk = {
    "0": null,
    "1": { objectType: "plant" },
    "2": { objectType: "plant", slots: [null, 3, "x", {}] },
    "3": { objectType: "egg" },
    "4": { objectType: "decor", slots: [ripeSlot()] },
    abc: plant([ripeSlot()]),
    "-1": plant([ripeSlot()]),
  };
  check("tuiles malformees ou etrangeres ignorees", listInterests(baseInput(junk)).length, 0);
}

console.log("\n--- crops ---");
{
  const garden = { [idxAt(16, 15)]: plant([ripeSlot()]) };
  const got = pickWanderInterest(baseInput(garden));
  check("crop mur -> interet", got?.kind, "ripe");
  check("crop mur -> pose Clapping", got?.emote, EmoteType.Clapping);
  check("le nom vient du catalogue injecte", got?.label, "crop<Zorblax>");
  check("la cible est le crop", got && `${got.target.x},${got.target.y}`, "16,15");
  check("la cle de tuile est gardee pour verifier a l'arrivee", got?.dirtTileIdx, idxAt(16, 15));
  check("il se poste a cote, pas dessus", got && chebyshev(got.tile, got.target), 1);
  check("et sur une case que la flanerie accepte", got && baseInput(garden).area.isWalkable(got.tile.x, got.tile.y), true);
  check("orthogonale de preference", got && manhattan(got.tile, got.target), 1);
}
{
  const garden = { [idxAt(16, 15)]: plant([ripeSlot({ preserved: true })]) };
  check("crop preserve : rien a remarquer", listInterests(baseInput(garden)).length, 0);
}
{
  const garden = { [idxAt(16, 15)]: plant([growingSlot()]) };
  check("crop loin d'etre mur : ignore", listInterests(baseInput(garden)).length, 0);
}
{
  const soon = { [idxAt(16, 15)]: plant([growingSlot({ endTime: NOW + ALMOST_READY_MS - 1_000 })]) };
  const got = pickWanderInterest(baseInput(soon));
  check("crop a moins de 2 min -> presque pret", got?.kind, "almostRipe");
  check("presque pret -> pose Questioning", got?.emote, EmoteType.Questioning);
  const longCrop = { [idxAt(16, 15)]: plant([growingSlot({ startTime: NOW - 95 * 3_600_000, endTime: NOW + 5 * 3_600_000 })]) };
  check("crop long a 95 % -> presque pret aussi", pickWanderInterest(baseInput(longCrop))?.kind, "almostRipe");
}
{
  const garden = { [idxAt(16, 15)]: plant([growingSlot({ mutations: ["Glimmer"] })]) };
  const got = pickWanderInterest(baseInput(garden));
  check("mutation rare -> interet, meme pas mur", got?.kind, "rare");
  check("mutation rare -> pose Love", got?.emote, EmoteType.Love);
  check("label : mutation puis crop, tous deux du catalogue", got?.label, "mut<Glimmer> crop<Zorblax>");
  const common = { [idxAt(16, 15)]: plant([growingSlot({ mutations: ["Soggy"] })]) };
  check("mutation sans baseChance (hors liste) : pas rare", listInterests(baseInput(common)).length, 0);
  const noRare = pickWanderInterest(baseInput(garden, { rareMutations: new Set() }));
  check("liste rare vide (catalogue illisible) : rien d'invente", noRare, "null");
}
{
  // Une plante a plusieurs sous-slots : le plus remarquable l'emporte.
  const garden = { [idxAt(16, 15)]: plant([ripeSlot(), growingSlot({ mutations: ["Prism"] }), growingSlot()]) };
  const all = listInterests(baseInput(garden));
  check("une seule entree par plante", all.length, 1);
  check("le rare passe devant le mur", all[0]?.kind, "rare");
}
{
  // L'espece du sous-slot prime ; a defaut, celle de la plante.
  const garden = { [idxAt(16, 15)]: plant([{ startTime: NOW - 10, endTime: NOW - 1, mutations: [] }], "Quibble") };
  check("espece de la plante en repli", pickWanderInterest(baseInput(garden))?.label, "crop<Quibble>");
}
{
  // Horodatages en secondes : normalises comme ailleurs dans le mod.
  const garden = { [idxAt(16, 15)]: plant([ripeSlot({ startTime: (NOW - 600_000) / 1000, endTime: (NOW - 1_000) / 1000 })]) };
  check("endTime en secondes compris", pickWanderInterest(baseInput(garden))?.kind, "ripe");
}

console.log("\n--- oeufs ---");
{
  const ready = { [idxAt(16, 15)]: egg(NOW - 5_000) };
  const got = pickWanderInterest(baseInput(ready));
  check("oeuf mur -> interet", got?.kind, "eggReady");
  check("oeuf mur -> pose Clapping", got?.emote, EmoteType.Clapping);
  check("nom de l'oeuf injecte", got?.label, "egg<Wobbly>");
  const inSeconds = { [idxAt(16, 15)]: egg((NOW - 5_000) / 1000) };
  check("maturedAt en secondes compris", pickWanderInterest(baseInput(inSeconds))?.kind, "eggReady");
  const soon = { [idxAt(16, 15)]: egg(NOW + 60_000) };
  check("oeuf a 1 min -> sur le point d'eclore", pickWanderInterest(baseInput(soon))?.kind, "eggSoon");
  check("sur le point -> pose Questioning", pickWanderInterest(baseInput(soon))?.emote, EmoteType.Questioning);
  const far = { [idxAt(16, 15)]: egg(NOW + 3_600_000) };
  check("oeuf a 1 h : ignore", listInterests(baseInput(far)).length, 0);
  const noDate = { [idxAt(16, 15)]: { objectType: "egg", eggId: "Wobbly" } };
  check("oeuf sans echeance : on ne devine pas", listInterests(baseInput(noDate)).length, 0);
}

console.log("\n--- portee ---");
{
  // Zone : rayon 3 autour de (15,15). Un crop en (19,15) a une voisine (18,15) dans le rayon.
  const edge = { [idxAt(19, 15)]: plant([ripeSlot()]) };
  const got = pickWanderInterest(baseInput(edge));
  check("crop juste au bord : poste depuis l'interieur", got && `${got.tile.x},${got.tile.y}`, "18,15");
  const far = { [idxAt(19, 10)]: plant([ripeSlot()]), [idxAt(10, 10)]: plant([ripeSlot()]) };
  check("crops hors de portee ignores", listInterests(baseInput(far)).length, 0);
  // En coin, a rayon + 1 : la voisine diagonale (18,18) est dans le rayon.
  const corner = { [idxAt(19, 19)]: plant([ripeSlot()]) };
  const viaCorner = pickWanderInterest(baseInput(corner));
  check("crop en coin a rayon + 1 : atteint par la diagonale", viaCorner && `${viaCorner.tile.x},${viaCorner.tile.y}`, "18,18");
  const lost = { [idxAt(16, 15)]: plant([ripeSlot()]) };
  check("tuile sans position connue ignoree", listInterests(baseInput(lost, { tileXY: () => null })).length, 0);
}
{
  // Crop cerne : aucune voisine praticable, il n'y a nulle part ou se poster.
  const target = { x: 16, y: 15 };
  const walled: IsWalkable = (x, y) => openMap(x, y) && chebyshev({ x, y }, target) !== 1;
  const garden = { [idxAt(16, 15)]: plant([ripeSlot()]) };
  check(
    "crop cerne : ignore",
    listInterests(baseInput(garden, { area: areaAround({ x: 15, y: 15 }, 3, { x: 13, y: 13 }, walled) })).length,
    0
  );
  // Seules les diagonales sont libres : on s'en contente.
  const diagOnly: IsWalkable = (x, y) => openMap(x, y) && !(manhattan({ x, y }, target) === 1);
  const got = pickWanderInterest(baseInput(garden, { area: areaAround({ x: 15, y: 15 }, 3, { x: 13, y: 13 }, diagOnly) }));
  check("diagonales seules : il se poste en diagonale", got && chebyshev(got.tile, target) === 1 && manhattan(got.tile, target) === 2, true);
}
{
  // Fuzz : quoi qu'il arrive, la case rendue est acceptee par la zone.
  const garden: Record<string, unknown> = {};
  for (let i = 0; i < 100; i += 3) garden[i] = i % 2 ? plant([ripeSlot()]) : egg(NOW - 1);
  let bad = 0;
  let found = 0;
  for (let i = 0; i < 500; i++) {
    const from = { x: 12 + Math.floor(Math.random() * 7), y: 12 + Math.floor(Math.random() * 7) };
    const area = areaAround({ x: 15, y: 15 }, 3, from);
    const got = pickWanderInterest(baseInput(garden, { area, random: Math.random }));
    if (!got) continue;
    found++;
    if (!area.isWalkable(got.tile.x, got.tile.y) || chebyshev(got.tile, got.target) !== 1) bad++;
  }
  check("500 tirages : toujours une case acceptee, voisine de l'objet", bad, 0);
  check("et il en trouve bien", found > 400, true);
}

console.log("\n--- le choix entre plusieurs ---");
{
  // Un seul Gold perdu parmi des crops murs : le tirage par sorte le fait ressortir.
  const garden: Record<string, unknown> = {
    [idxAt(14, 14)]: plant([ripeSlot()]),
    [idxAt(15, 14)]: plant([ripeSlot()]),
    [idxAt(16, 14)]: plant([ripeSlot()]),
    [idxAt(14, 16)]: plant([ripeSlot()]),
    [idxAt(16, 16)]: plant([ripeSlot()]),
    [idxAt(17, 17)]: plant([growingSlot({ mutations: ["Prism"] })]),
  };
  const counts: Record<string, number> = {};
  for (let i = 0; i < 4000; i++) {
    const got = pickWanderInterest(baseInput(garden, { random: Math.random }));
    if (got) counts[got.kind] = (counts[got.kind] ?? 0) + 1;
  }
  const rareShare = (counts.rare ?? 0) / 4000;
  check("le rare ressort souvent malgre 5 crops murs (~71 %)", rareShare > 0.6 && rareShare < 0.82, true);
  check("les murs ne disparaissent pas pour autant", (counts.ripe ?? 0) > 600, true);
}

console.log("\n--- repliques ---");
{
  const kinds: InterestKind[] = ["rare", "ripe", "almostRipe", "eggReady", "eggSoon"];
  let empty = 0;
  let dashes = 0;
  let undef = 0;
  const variety = new Map<InterestKind, Set<string>>();
  for (const kind of kinds) {
    const lines = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const line = interestLine(kind, "Label", fixedRandom(i / 40));
      lines.add(line);
      if (!line.trim()) empty++;
      if (/[\u2014\u2013]/.test(line)) dashes++;
      if (line.includes("undefined")) undef++;
    }
    variety.set(kind, lines);
  }
  check("aucune replique vide", empty, 0);
  check("aucun tiret long ou moyen", dashes, 0);
  check("aucun trou dans un gabarit", undef, 0);
  check("chaque sorte a de 2 a 4 variantes", kinds.every((k) => (variety.get(k)?.size ?? 0) >= 2 && (variety.get(k)?.size ?? 0) <= 4), true);
  check("article devant une voyelle", interestLine("rare", "Opal Fig", fixedRandom(0)), "Ooh, an Opal Fig.");
  check("article devant une consonne", interestLine("rare", "Glimmer Fig", fixedRandom(0)), "Ooh, a Glimmer Fig.");
  check("majuscule en debut de phrase", interestLine("rare", "Opal Fig", fixedRandom(0.5)), "An Opal Fig. Pretty, isn't it?");
  check("pose de chaque sorte definie", kinds.every((k) => typeof KIND_EMOTE[k] === "number"), true);
  const got = pickWanderInterest(baseInput({ [idxAt(16, 15)]: plant([ripeSlot()]) }));
  check("la replique rendue est deja prete a dire", got?.line, "This crop<Zorblax> looks ready.");
}

console.log("\n--- parler, ou seulement poser ---");
{
  const base = { now: NOW, lastCommentAt: 0, distanceToPlayer: 3, busy: false, random: fixedRandom(0.1) };
  check("pres, libre, tirage favorable -> parle", shouldComment(base), true);
  check("tirage defavorable -> pose seulement", shouldComment({ ...base, random: fixedRandom(0.3) }), false);
  check("occupe -> jamais", shouldComment({ ...base, busy: true }), false);
  check("joueur trop loin -> jamais", shouldComment({ ...base, distanceToPlayer: COMMENT_MAX_DISTANCE + 1 }), false);
  check("joueur juste a portee -> possible", shouldComment({ ...base, distanceToPlayer: COMMENT_MAX_DISTANCE }), true);
  check("distance inconnue -> jamais", shouldComment({ ...base, distanceToPlayer: null }), false);
  check("tout juste parle -> se tait", shouldComment({ ...base, lastCommentAt: NOW - 60_000 }), false);
  check("pause ecoulee -> peut reparler", shouldComment({ ...base, lastCommentAt: NOW - COMMENT_COOLDOWN_MS }), true);
  // Pas de hasard consomme pour une replique deja interdite.
  let draws = 0;
  shouldComment({ ...base, busy: true, random: () => (draws++, 0) });
  check("aucun tirage quand c'est deja non", draws, 0);
  // Environ une fois sur quatre.
  let spoke = 0;
  for (let i = 0; i < 4000; i++) if (shouldComment({ ...base, random: Math.random })) spoke++;
  check("environ une arrivee sur quatre", spoke > 800 && spoke < 1200, true);
}

console.log("\n--- bout a bout avec la boucle de deplacement ---");
{
  // Mode jardin : il flane, va voir l'oeuf mur, et l'arrivee est signalee.
  const inGarden: IsWalkable = (x, y) => x >= 10 && x < 20 && y >= 10 && y < 20;
  const anchor: Anchor = { tile: { x: 15, y: 15 }, onArrival: "wander", tracksPlayer: false, zone: inGarden, wanderRadius: 4 };
  const garden = { [idxAt(18, 12)]: egg(NOW - 1) };
  let state: MovementState = { ...initialMovementState(), activity: "wander", tile: { x: 15, y: 15 }, lastAnchorTile: { x: 15, y: 15 } };
  let picked: XY | null = null;
  let reachedAt: XY | null = null;
  let illegal = 0;
  for (let i = 0; i < 60 && !reachedAt; i++) {
    const prev = state.tile!;
    const d = stepMovement({
      anchor,
      state,
      isWalkable: openMap,
      random: fixedRandom(0),
      config: DEFAULT_MOVEMENT_CONFIG,
      pickInterest: (area) => {
        const got = pickWanderInterest(baseInput(garden, { area, random: fixedRandom(0) }));
        picked = got?.tile ?? null;
        return picked;
      },
    });
    state = d.state;
    if (d.tile && manhattan(prev, d.tile) > 1) illegal++;
    if (d.interestReached) reachedAt = d.interestReached;
  }
  const pickedTile = picked as XY | null;
  const reached = reachedAt as XY | null;
  check("il choisit une case a cote de l'oeuf", pickedTile && chebyshev(pickedTile, { x: 18, y: 12 }), 1);
  check("il y arrive, et l'arrivee est signalee", reached && pickedTile && reached.x === pickedTile.x && reached.y === pickedTile.y, true);
  check("a pied, sans pas illegal", illegal, 0);
  check("puis il marque une pause tiree dans la plage", state.wanderCooldown >= DEFAULT_MOVEMENT_CONFIG.wanderPauseTicks, true);
}

console.log("\n--- pauses tirees au hasard, sur la duree ---");
{
  // Il flane une heure simulee : les arrets entre deux balades doivent varier
  // et rester dans la plage 8 a 45 s.
  const anchor: Anchor = { tile: { x: 20, y: 20 }, onArrival: "wander", tracksPlayer: false, wanderRadius: 3 };
  let state: MovementState = { ...initialMovementState(), activity: "wander", tile: { x: 20, y: 21 }, lastAnchorTile: { x: 20, y: 20 } };
  const pauses: number[] = [];
  let still = 0;
  const ticks = Math.round(3_600_000 / 150);
  for (let i = 0; i < ticks; i++) {
    const before = state.tile!;
    const d = stepMovement({ anchor, state, isWalkable: openMap, random: Math.random, config: DEFAULT_MOVEMENT_CONFIG });
    state = d.state;
    const moved = d.tile !== null && manhattan(before, d.tile) > 0;
    if (moved) {
      if (still > 0) pauses.push(still);
      still = 0;
    } else {
      still++;
    }
  }
  const min = DEFAULT_MOVEMENT_CONFIG.wanderPauseTicks;
  const max = DEFAULT_MOVEMENT_CONFIG.wanderPauseMaxTicks!;
  // Un arret compte aussi le tick d'arrivee et celui du choix de la cible suivante.
  const outside = pauses.filter((p) => p < min || p > max + 2);
  check("une heure de flanerie produit des dizaines d'arrets", pauses.length > 60, true);
  check("chaque arret reste dans la plage 8 a 45 s", outside.length, 0);
  check("les arrets varient (plus de 20 durees differentes)", new Set(pauses).size > 20, true);
  const spread = Math.max(...pauses) - Math.min(...pauses);
  check("et couvrent l'essentiel de la plage", spread > (max - min) * 0.7, true);
  check("drawWanderPause et la config par defaut s'accordent", drawWanderPause(DEFAULT_MOVEMENT_CONFIG, fixedRandom(0)), min);
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
