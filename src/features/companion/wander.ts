// What deserves a look when he wanders.
//
// Pure: no store, no catalog, no clock. Display names, rare mutations and tile
// positions come from the caller (`wanderWatch.ts`) and chance is passed in.
// Everything is checked outside the browser (scripts/checkCompanionWander.ts).
//
// The idea: about one wander in two, if something interesting is in reach, he
// goes to stand next to it rather than on a random tile. Once there he poses,
// and only says something now and then: a companion commenting on every crop
// soon becomes noise.

import { pickOne, type Random } from "../../lib/random";
import { EmoteType } from "./emoteTypes";
import type { WanderArea, XY } from "./movement";

export type InterestKind = "rare" | "ripe" | "almostRipe" | "eggReady" | "eggSoon";

export type WanderInterest = {
  /** The walkable tile he stands on, next to the object. */
  tile: XY;
  /** The object itself: a crop, an egg. */
  target: XY;
  /** Its key in `tileObjects`, to check on arrival that it is still there. */
  dirtTileIdx: number;
  kind: InterestKind;
  /** What he looks at, already readable: "Gold Carrot", "Common Egg". */
  label: string;
  emote: EmoteType;
  /** What he would say about it. Rarely said: `shouldComment` decides. */
  line: string;
};

export type WanderInterestInput = {
  /** The game's `garden.tileObjects`, keyed by dirt tile. */
  tileObjects: unknown;
  /** A dirt tile's position on the map (a `tileObjects` key). */
  tileXY: (dirtTileIdx: number) => XY | null;
  now: number;
  area: WanderArea;
  random: Random;
  /** Mutations rolled at random (those with a `baseChance`). */
  rareMutations: ReadonlySet<string>;
  cropName: (species: string) => string;
  mutationName: (mutation: string) => string;
  eggName: (eggId: string) => string;
  /** The share of wanders that head for an interest. Default: `INTEREST_CHANCE`. */
  chance?: number;
};

/** About one wander in two has a purpose, when there is one. */
export const INTEREST_CHANCE = 0.5;

/** Below this, a crop or an egg is "almost ready". */
export const ALMOST_READY_MS = 2 * 60_000;

/** Past this share of growth, a long crop is almost ready too. */
const ALMOST_READY_GROWTH = 0.9;

/**
 * Each kind's weight in the draw.
 *
 * The kind is drawn first, then the object: otherwise a garden full of ripe
 * crops would drown the one Gold under twenty plain carrots.
 */
const KIND_WEIGHT: Record<InterestKind, number> = {
  rare: 5,
  eggReady: 3,
  ripe: 2,
  almostRipe: 2,
  eggSoon: 2,
};

/** The pose played on arrival. */
export const KIND_EMOTE: Record<InterestKind, EmoteType> = {
  rare: EmoteType.Love,
  ripe: EmoteType.Clapping,
  eggReady: EmoteType.Clapping,
  almostRipe: EmoteType.Questioning,
  eggSoon: EmoteType.Questioning,
};

/** Preference order when one plant ticks several boxes. */
const KIND_RANK: Record<InterestKind, number> = {
  rare: 4,
  eggReady: 3,
  ripe: 2,
  almostRipe: 1,
  eggSoon: 0,
};

/** The game's timestamps come in seconds or milliseconds depending on the field. */
function normalizeTs(value: unknown): number | null {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw < 100_000_000_000 ? raw * 1000 : raw;
}

/** "a Gold Carrot", "an Amber Apple": the names come from the catalog. */
const withArticle = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;

const LINES: Record<InterestKind, ReadonlyArray<(label: string) => string>> = {
  rare: [
    (l) => `Ooh, ${withArticle(l)}.`,
    (l) => `Look at this ${l}!`,
    (l) => `${withArticle(l).replace(/^a/, "A")}. Pretty, isn't it?`,
    (l) => `I could stare at this ${l} all day.`,
  ],
  ripe: [(l) => `This ${l} looks ready.`, (l) => `Mm, this ${l} is ripe.`, () => `This one's ready to pick.`],
  almostRipe: [() => `This one's almost ready.`, (l) => `Just a little longer, ${l}.`, (l) => `Almost there, little ${l}.`],
  eggReady: [() => `This egg is ready to hatch!`, (l) => `Something's wiggling in this ${l}.`, () => `I think this one wants out.`],
  eggSoon: [(l) => `This ${l} is about to hatch.`, () => `Any minute now...`, () => `I can hear something in there.`],
};

export function interestLine(kind: InterestKind, label: string, random: Random): string {
  return pickOne(LINES[kind], random)(label);
}

type Found = { dirtIdx: number; kind: InterestKind; label: string };

/** What it takes to find the interests, without the chance of the pick. */
type InterestSource = Omit<WanderInterestInput, "chance" | "random">;

/** The most interesting thing about a plant, or `null`. */
function plantInterest(plant: Record<string, unknown>, dirtIdx: number, input: InterestSource): Found | null {
  const slots = Array.isArray(plant.slots) ? plant.slots : [];
  let best: Found | null = null;
  const consider = (found: Found) => {
    if (!best || KIND_RANK[found.kind] > KIND_RANK[best.kind]) best = found;
  };

  for (const raw of slots) {
    const slot = raw as Record<string, unknown> | null;
    if (!slot || typeof slot !== "object") continue;
    const speciesId =
      typeof slot.species === "string" && slot.species
        ? slot.species
        : typeof plant.species === "string" && plant.species
          ? plant.species
          : null;
    if (!speciesId) continue;
    const crop = input.cropName(speciesId);

    const mutations = Array.isArray(slot.mutations) ? slot.mutations.filter((m): m is string => typeof m === "string") : [];
    const rare = mutations.find((m) => input.rareMutations.has(m));
    if (rare) {
      consider({ dirtIdx, kind: "rare", label: `${input.mutationName(rare)} ${crop}` });
      continue;
    }

    // A preserved crop is ripe forever: the player froze it on purpose, there
    // is nothing to notice (see `ripeCropCount`).
    if (slot.preserved === true) continue;
    const end = normalizeTs(slot.endTime);
    if (end === null) continue;
    if (end <= input.now) {
      consider({ dirtIdx, kind: "ripe", label: crop });
      continue;
    }
    const start = normalizeTs(slot.startTime);
    const growth = start !== null && end > start ? (input.now - start) / (end - start) : 0;
    if (end - input.now <= ALMOST_READY_MS || growth >= ALMOST_READY_GROWTH) {
      consider({ dirtIdx, kind: "almostRipe", label: crop });
    }
  }
  return best;
}

function eggInterest(egg: Record<string, unknown>, dirtIdx: number, input: InterestSource): Found | null {
  const matured = normalizeTs(egg.maturedAt);
  if (matured === null) return null;
  const eggId = typeof egg.eggId === "string" && egg.eggId ? egg.eggId : null;
  const label = eggId ? input.eggName(eggId) : "egg";
  if (matured <= input.now) return { dirtIdx, kind: "eggReady", label };
  if (matured - input.now <= ALMOST_READY_MS) return { dirtIdx, kind: "eggSoon", label };
  return null;
}

/** Neighbouring tiles (orthogonal first) where he can stand, in order. */
const NEIGHBOURS: ReadonlyArray<[number, number]> = [
  [0, 1],
  [1, 0],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * The tiles to stand on to look at an object: the neighbours the wandering
 * accepts, orthogonal ones by preference. He never stands ON the crop, it
 * would hide it.
 */
function standingTiles(target: XY, area: WanderArea): XY[] {
  const orthogonal: XY[] = [];
  const diagonal: XY[] = [];
  NEIGHBOURS.forEach(([dx, dy], i) => {
    const x = target.x + dx;
    const y = target.y + dy;
    if (!area.isWalkable(x, y)) return;
    (i < 4 ? orthogonal : diagonal).push({ x, y });
  });
  return orthogonal.length > 0 ? orthogonal : diagonal;
}

/** An interest before the tile and the line are picked. */
type InterestCandidate = {
  target: XY;
  dirtTileIdx: number;
  kind: InterestKind;
  label: string;
  /** The tiles to look at it from, never empty. */
  spots: XY[];
};

/**
 * Everything in the garden worth a visit and in reach.
 *
 * "In reach": a tile next to the object that the wandering accepts. The
 * object itself may sit one tile outside the area.
 */
export function listInterests(input: InterestSource): InterestCandidate[] {
  const tiles = input.tileObjects;
  if (!tiles || typeof tiles !== "object") return [];
  const { area } = input;
  const out: InterestCandidate[] = [];

  for (const [key, raw] of Object.entries(tiles as Record<string, unknown>)) {
    const obj = raw as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object") continue;
    const dirtIdx = Number(key);
    if (!Number.isInteger(dirtIdx) || dirtIdx < 0) continue;

    const found =
      obj.objectType === "plant"
        ? plantInterest(obj, dirtIdx, input)
        : obj.objectType === "egg"
          ? eggInterest(obj, dirtIdx, input)
          : null;
    if (!found) continue;

    const target = input.tileXY(dirtIdx);
    if (!target) continue;
    // A rough cut before looking for a tile: past the radius plus one, no
    // neighbour can be accepted.
    if (Math.max(Math.abs(target.x - area.center.x), Math.abs(target.y - area.center.y)) > area.radius + 1) continue;

    const spots = standingTiles(target, area);
    if (spots.length === 0) continue;
    out.push({ target: { ...target }, dirtTileIdx: dirtIdx, kind: found.kind, label: found.label, spots });
  }
  return out;
}

/**
 * This wander's interest, or `null` for a random stroll.
 *
 * The `chance` draw comes first: half the wanders do not even read the garden.
 */
export function pickWanderInterest(input: WanderInterestInput): WanderInterest | null {
  const chance = input.chance ?? INTEREST_CHANCE;
  if (!(input.random() < chance)) return null;

  const all = listInterests(input);
  if (all.length === 0) return null;

  const kinds = [...new Set(all.map((i) => i.kind))];
  const total = kinds.reduce((sum, k) => sum + KIND_WEIGHT[k], 0);
  let roll = input.random() * total;
  let kind = kinds[kinds.length - 1];
  for (const k of kinds) {
    roll -= KIND_WEIGHT[k];
    if (roll < 0) {
      kind = k;
      break;
    }
  }
  const chosen = pickOne(
    all.filter((i) => i.kind === kind),
    input.random,
  );
  return {
    tile: { ...pickOne(chosen.spots, input.random) },
    target: chosen.target,
    dirtTileIdx: chosen.dirtTileIdx,
    kind: chosen.kind,
    label: chosen.label,
    emote: KIND_EMOTE[chosen.kind],
    line: interestLine(chosen.kind, chosen.label, input.random),
  };
}

/* ------------------------------------------------------------------ */
/*  Speaking, or just posing                                           */
/* ------------------------------------------------------------------ */

/** About one arrival in four comes with a line. */
const COMMENT_CHANCE = 0.25;
/** At most one wander line every three minutes. */
export const COMMENT_COOLDOWN_MS = 3 * 60_000;
/** Past this, the bubble would be off the player's screen. */
export const COMMENT_MAX_DISTANCE = 8;

type CommentInput = {
  now: number;
  /** The last wander line. `0`: never. */
  lastCommentAt: number;
  /** Tiles to the player, `null` when unknown. */
  distanceToPlayer: number | null;
  /** A task, a question, a batch in progress. */
  busy: boolean;
  random: Random;
};

/**
 * Does he say something on arrival?
 *
 * The draw comes last: no chance is spent on a line the other conditions
 * already rule out.
 */
export function shouldComment(input: CommentInput): boolean {
  if (input.busy) return false;
  if (input.distanceToPlayer === null || input.distanceToPlayer > COMMENT_MAX_DISTANCE) return false;
  if (input.lastCommentAt > 0 && input.now - input.lastCommentAt < COMMENT_COOLDOWN_MS) return false;
  return input.random() < COMMENT_CHANCE;
}
