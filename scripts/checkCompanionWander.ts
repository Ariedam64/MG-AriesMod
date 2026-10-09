// Checks what gives its wandering a purpose, and when it talks about it.
//
// Everything here is pure (src/features/companion/wander.ts and movement.ts):
// reading the garden and playing poses live apart, in wanderWatch.ts, and
// decide nothing.
//
// No species, mutation or egg from the game appears here: the names are made
// up on purpose, to prove they really come from the injected functions.

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
} from "../src/features/companion/wander";
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
} from "../src/features/companion/movement";
import { EmoteType } from "../src/features/companion/emoteTypes";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

const fixedRandom = (v: number) => () => v;
/** A fixed run of draws, then 0 forever. */
const sequence = (...values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
};

const NOW = 1_800_000_000_000;
const chebyshev = (a: XY, b: XY) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** A plot 10 tiles wide: dirt tile n sits at (n % 10, floor(n / 10)) + (10, 10). */
const tileXY = (idx: number): XY | null => (idx >= 0 && idx < 100 ? { x: 10 + (idx % 10), y: 10 + Math.floor(idx / 10) } : null);
const idxAt = (x: number, y: number) => (y - 10) * 10 + (x - 10);

const openMap: IsWalkable = (x, y) => x >= 0 && y >= 0 && x < 40 && y < 40;

/** The wander area as movement.ts provides it: a radius, excluding both the centre and the current tile. */
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

console.log("--- the chance draw ---");
{
  const garden = { [idxAt(16, 15)]: plant([ripeSlot()]) };
  check("default chance: one stroll in two", INTEREST_CHANCE, 0.5);
  check("draw above the chance -> random stroll", pickWanderInterest(baseInput(garden, { chance: 0.5, random: fixedRandom(0.6) })), "null");
  check("draw below the chance -> a purpose", pickWanderInterest(baseInput(garden, { chance: 0.5, random: fixedRandom(0.1) })) !== null, true);
  check("zero chance -> never", pickWanderInterest(baseInput(garden, { chance: 0, random: fixedRandom(0) })), "null");
}

console.log("\n--- invalid inputs ---");
{
  for (const [label, value] of [
    ["null", null],
    ["undefined", undefined],
    ["string", "garden"],
    ["number", 42],
    ["empty object", {}],
  ] as Array<[string, unknown]>) {
    let crashed = false;
    let result: unknown = "x";
    try {
      result = pickWanderInterest(baseInput(value));
    } catch {
      crashed = true;
    }
    check(`garden ${label} -> null without a crash`, !crashed && result === null, true);
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
  check("malformed or foreign tiles are ignored", listInterests(baseInput(junk)).length, 0);
}

console.log("\n--- crops ---");
{
  const garden = { [idxAt(16, 15)]: plant([ripeSlot()]) };
  const got = pickWanderInterest(baseInput(garden));
  check("ripe crop -> interest", got?.kind, "ripe");
  check("ripe crop -> Clapping pose", got?.emote, EmoteType.Clapping);
  check("the name comes from the injected catalog", got?.label, "crop<Zorblax>");
  check("the target is the crop", got && `${got.target.x},${got.target.y}`, "16,15");
  check("the tile key is kept to check on arrival", got?.dirtTileIdx, idxAt(16, 15));
  check("it stands next to it, not on it", got && chebyshev(got.tile, got.target), 1);
  check("and on a tile wandering accepts", got && baseInput(garden).area.isWalkable(got.tile.x, got.tile.y), true);
  check("orthogonal by preference", got && manhattan(got.tile, got.target), 1);
}
{
  const garden = { [idxAt(16, 15)]: plant([ripeSlot({ preserved: true })]) };
  check("preserved crop: nothing to notice", listInterests(baseInput(garden)).length, 0);
}
{
  const garden = { [idxAt(16, 15)]: plant([growingSlot()]) };
  check("a crop far from ripe: ignored", listInterests(baseInput(garden)).length, 0);
}
{
  const soon = { [idxAt(16, 15)]: plant([growingSlot({ endTime: NOW + ALMOST_READY_MS - 1_000 })]) };
  const got = pickWanderInterest(baseInput(soon));
  check("crop under 2 min away -> almost ready", got?.kind, "almostRipe");
  check("almost ready -> Questioning pose", got?.emote, EmoteType.Questioning);
  const longCrop = { [idxAt(16, 15)]: plant([growingSlot({ startTime: NOW - 95 * 3_600_000, endTime: NOW + 5 * 3_600_000 })]) };
  check("a long crop at 95% -> almost ready too", pickWanderInterest(baseInput(longCrop))?.kind, "almostRipe");
}
{
  const garden = { [idxAt(16, 15)]: plant([growingSlot({ mutations: ["Glimmer"] })]) };
  const got = pickWanderInterest(baseInput(garden));
  check("rare mutation -> interest, even unripe", got?.kind, "rare");
  check("rare mutation -> Love pose", got?.emote, EmoteType.Love);
  check("label: mutation then crop, both from the catalog", got?.label, "mut<Glimmer> crop<Zorblax>");
  const common = { [idxAt(16, 15)]: plant([growingSlot({ mutations: ["Soggy"] })]) };
  check("a mutation with no baseChance (not listed): not rare", listInterests(baseInput(common)).length, 0);
  const noRare = pickWanderInterest(baseInput(garden, { rareMutations: new Set() }));
  check("empty rare list (unreadable catalog): nothing made up", noRare, "null");
}
{
  // A plant with several sub-slots: the most remarkable one wins.
  const garden = { [idxAt(16, 15)]: plant([ripeSlot(), growingSlot({ mutations: ["Prism"] }), growingSlot()]) };
  const all = listInterests(baseInput(garden));
  check("a single entry per plant", all.length, 1);
  check("rare comes before ripe", all[0]?.kind, "rare");
}
{
  // The sub-slot's species comes first; failing that, the plant's.
  const garden = { [idxAt(16, 15)]: plant([{ startTime: NOW - 10, endTime: NOW - 1, mutations: [] }], "Quibble") };
  check("the plant's species as a fallback", pickWanderInterest(baseInput(garden))?.label, "crop<Quibble>");
}
{
  // Timestamps in seconds: normalised as elsewhere in the mod.
  const garden = { [idxAt(16, 15)]: plant([ripeSlot({ startTime: (NOW - 600_000) / 1000, endTime: (NOW - 1_000) / 1000 })]) };
  check("endTime in seconds is understood", pickWanderInterest(baseInput(garden))?.kind, "ripe");
}

console.log("\n--- eggs ---");
{
  const ready = { [idxAt(16, 15)]: egg(NOW - 5_000) };
  const got = pickWanderInterest(baseInput(ready));
  check("ripe egg -> interest", got?.kind, "eggReady");
  check("ripe egg -> Clapping pose", got?.emote, EmoteType.Clapping);
  check("the egg's name is injected", got?.label, "egg<Wobbly>");
  const inSeconds = { [idxAt(16, 15)]: egg((NOW - 5_000) / 1000) };
  check("maturedAt in seconds is understood", pickWanderInterest(baseInput(inSeconds))?.kind, "eggReady");
  const soon = { [idxAt(16, 15)]: egg(NOW + 60_000) };
  check("egg 1 min away -> about to hatch", pickWanderInterest(baseInput(soon))?.kind, "eggSoon");
  check("about to hatch -> Questioning pose", pickWanderInterest(baseInput(soon))?.emote, EmoteType.Questioning);
  const far = { [idxAt(16, 15)]: egg(NOW + 3_600_000) };
  check("egg 1 h away: ignored", listInterests(baseInput(far)).length, 0);
  const noDate = { [idxAt(16, 15)]: { objectType: "egg", eggId: "Wobbly" } };
  check("egg with no due time: no guessing", listInterests(baseInput(noDate)).length, 0);
}

console.log("\n--- reach ---");
{
  // Area: radius 3 around (15,15). A crop at (19,15) has a neighbour (18,15) within the radius.
  const edge = { [idxAt(19, 15)]: plant([ripeSlot()]) };
  const got = pickWanderInterest(baseInput(edge));
  check("crop right at the edge: stands on the inside", got && `${got.tile.x},${got.tile.y}`, "18,15");
  const far = { [idxAt(19, 10)]: plant([ripeSlot()]), [idxAt(10, 10)]: plant([ripeSlot()]) };
  check("crops out of reach are ignored", listInterests(baseInput(far)).length, 0);
  // In a corner, at radius + 1: the diagonal neighbour (18,18) is within the radius.
  const corner = { [idxAt(19, 19)]: plant([ripeSlot()]) };
  const viaCorner = pickWanderInterest(baseInput(corner));
  check("corner crop at radius + 1: reached by the diagonal", viaCorner && `${viaCorner.tile.x},${viaCorner.tile.y}`, "18,18");
  const lost = { [idxAt(16, 15)]: plant([ripeSlot()]) };
  check("a tile with no known position is ignored", listInterests(baseInput(lost, { tileXY: () => null })).length, 0);
}
{
  // A surrounded crop: no usable neighbour, nowhere to stand.
  const target = { x: 16, y: 15 };
  const walled: IsWalkable = (x, y) => openMap(x, y) && chebyshev({ x, y }, target) !== 1;
  const garden = { [idxAt(16, 15)]: plant([ripeSlot()]) };
  check(
    "surrounded crop: ignored",
    listInterests(baseInput(garden, { area: areaAround({ x: 15, y: 15 }, 3, { x: 13, y: 13 }, walled) })).length,
    0
  );
  // Only the diagonals are free: it makes do with them.
  const diagOnly: IsWalkable = (x, y) => openMap(x, y) && !(manhattan({ x, y }, target) === 1);
  const got = pickWanderInterest(baseInput(garden, { area: areaAround({ x: 15, y: 15 }, 3, { x: 13, y: 13 }, diagOnly) }));
  check("diagonals only: it stands on a diagonal", got && chebyshev(got.tile, target) === 1 && manhattan(got.tile, target) === 2, true);
}
{
  // Fuzz: whatever happens, the tile returned is accepted by the area.
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
  check("500 draws: always an accepted tile next to the object", bad, 0);
  check("and it does find some", found > 400, true);
}

console.log("\n--- choosing among several ---");
{
  // A single Gold lost among ripe crops: drawing by kind brings it out.
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
  check("the rare one comes up often despite 5 ripe crops (~71%)", rareShare > 0.6 && rareShare < 0.82, true);
  check("the ripe ones do not vanish for all that", (counts.ripe ?? 0) > 600, true);
}

console.log("\n--- lines ---");
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
  check("no empty line", empty, 0);
  check("no em or en dash", dashes, 0);
  check("no hole in a template", undef, 0);
  check("each kind has 2 to 4 variants", kinds.every((k) => (variety.get(k)?.size ?? 0) >= 2 && (variety.get(k)?.size ?? 0) <= 4), true);
  check("article before a vowel", interestLine("rare", "Opal Fig", fixedRandom(0)), "Ooh, an Opal Fig.");
  check("article before a consonant", interestLine("rare", "Glimmer Fig", fixedRandom(0)), "Ooh, a Glimmer Fig.");
  check("capital at the start of a sentence", interestLine("rare", "Opal Fig", fixedRandom(0.5)), "An Opal Fig. Pretty, isn't it?");
  check("every kind has a pose", kinds.every((k) => typeof KIND_EMOTE[k] === "number"), true);
  const got = pickWanderInterest(baseInput({ [idxAt(16, 15)]: plant([ripeSlot()]) }));
  check("the returned line is ready to say", got?.line, "This crop<Zorblax> looks ready.");
}

console.log("\n--- speaking, or only posing ---");
{
  const base = { now: NOW, lastCommentAt: 0, distanceToPlayer: 3, busy: false, random: fixedRandom(0.1) };
  check("near, free, lucky draw -> speaks", shouldComment(base), true);
  check("unlucky draw -> pose only", shouldComment({ ...base, random: fixedRandom(0.3) }), false);
  check("busy -> never", shouldComment({ ...base, busy: true }), false);
  check("player too far -> never", shouldComment({ ...base, distanceToPlayer: COMMENT_MAX_DISTANCE + 1 }), false);
  check("player just in range -> possible", shouldComment({ ...base, distanceToPlayer: COMMENT_MAX_DISTANCE }), true);
  check("unknown distance -> never", shouldComment({ ...base, distanceToPlayer: null }), false);
  check("just spoke -> stays quiet", shouldComment({ ...base, lastCommentAt: NOW - 60_000 }), false);
  check("pause over -> may speak again", shouldComment({ ...base, lastCommentAt: NOW - COMMENT_COOLDOWN_MS }), true);
  // No randomness is used up for a line that is already ruled out.
  let draws = 0;
  shouldComment({ ...base, busy: true, random: () => (draws++, 0) });
  check("no draw when the answer is already no", draws, 0);
  // About one time in four.
  let spoke = 0;
  for (let i = 0; i < 4000; i++) if (shouldComment({ ...base, random: Math.random })) spoke++;
  check("about one arrival in four", spoke > 800 && spoke < 1200, true);
}

console.log("\n--- end to end with the movement loop ---");
{
  // Garden mode: it wanders, goes to look at the ripe egg, and the arrival is reported.
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
  check("it picks a tile next to the egg", pickedTile && chebyshev(pickedTile, { x: 18, y: 12 }), 1);
  check("it gets there, and the arrival is reported", reached && pickedTile && reached.x === pickedTile.x && reached.y === pickedTile.y, true);
  check("on foot, with no illegal step", illegal, 0);
  check("then it takes a pause drawn within the range", state.wanderCooldown >= DEFAULT_MOVEMENT_CONFIG.wanderPauseTicks, true);
}

console.log("\n--- random pauses, over time ---");
{
  // It wanders for a simulated hour: the stops between two strolls must vary
  // and stay within the 8 to 45 s range.
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
  // A stop also counts the arrival tick and the tick that picks the next target.
  const outside = pauses.filter((p) => p < min || p > max + 2);
  check("an hour of wandering makes dozens of stops", pauses.length > 60, true);
  check("every stop stays within the 8 to 45 s range", outside.length, 0);
  check("the stops vary (more than 20 different lengths)", new Set(pauses).size > 20, true);
  const spread = Math.max(...pauses) - Math.min(...pauses);
  check("and cover most of the range", spread > (max - min) * 0.7, true);
  check("drawWanderPause and the default config agree", drawWanderPause(DEFAULT_MOVEMENT_CONFIG, fixedRandom(0)), min);
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
