// A planting plan: what goes where, and what of it can still be done.
//
// No game reads and no commands here. The player draws the plan on the grid;
// this only describes it, holds it against the garden, and identifies it for
// the confirmation.
//
// A seed and an egg go on the same tile and only differ on the wire by the
// command's name (`PlantSeed` against `GrowEgg`), so they share one type here
// and `kind` tells them apart when sending.

import { listWords } from "./harvest";

/**
 * The plot's shape: two squares of ten tiles, side by side.
 *
 * The map decides (`dirtTileCount` says how many tiles a player really owns);
 * these constants are only a fallback while it is not loaded yet. It is the
 * grid the Auto Plant tab already draws, and changing it here without the map
 * following would only make ghost tiles.
 */
export const GARDEN_COLS = 20;
export const GARDEN_ROWS = 10;
export const GARDEN_TILE_COUNT = GARDEN_COLS * GARDEN_ROWS;

export type PlantKind = "seed" | "egg";

/** Something that can be planted, as it is held in stock. */
export type PlantItem = {
  kind: PlantKind;
  /**
   * What the command expects: the species for a seed, the `eggId` for an egg.
   * Never the display name, which only matters to the eye.
   */
  id: string;
  name: string;
  /** Copies in the inventory. The plan's ceiling. */
  stock: number;
};

/** One tile of the plan, and what should go on it. */
export type PlantAssignment = {
  /** Key in `garden.tileObjects`, like `HarvestRow.tileIndex`. */
  tileIndex: number;
  kind: PlantKind;
  id: string;
  name: string;
};

/** The garden and the stock, as they are when looked at. */
export type PlantScope = {
  /** The dirt tiles this player owns, in plot order. */
  tiles: number[];
  /** Tiles already taken: a plant, an egg incubating, a decoration, a pet. */
  occupied: Set<number>;
  items: PlantItem[];
};

export const EMPTY_SCOPE: PlantScope = { tiles: [], occupied: new Set(), items: [] };

/**
 * A plantable's identity.
 *
 * `kind` is part of it: nothing stops an egg and a seed from sharing an id,
 * and mixing them up would draw from the wrong stock.
 */
export function itemKey(item: { kind: PlantKind; id: string }): string {
  return `${item.kind}:${item.id}`;
}

/** A plan tile's id: the tile and what should grow there. */
function assignmentKey(assignment: PlantAssignment): string {
  return `${assignment.tileIndex}:${assignment.kind}:${assignment.id}`;
}

/**
 * The proposed plan's signature.
 *
 * Notices that it changed between the proposal and the confirmation: a tile
 * taken meanwhile, a seed spent elsewhere, and it is no longer the plan shown.
 * Sorted, so independent of drawing order.
 */
export function plantSignature(plan: PlantAssignment[]): string {
  return plan.map(assignmentKey).sort().join("|");
}

type PlantTally = { kind: PlantKind; id: string; name: string; count: number };

/** How often each plantable comes up in the plan, most first. */
export function countByItem(plan: PlantAssignment[]): PlantTally[] {
  const counts = new Map<string, PlantTally>();
  for (const assignment of plan) {
    const key = itemKey(assignment);
    const known = counts.get(key);
    if (known) known.count++;
    else counts.set(key, { kind: assignment.kind, id: assignment.id, name: assignment.name, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** What is left in stock once the plan is served, per plantable. */
export function stockLeft(plan: PlantAssignment[], items: PlantItem[]): Map<string, number> {
  const left = new Map(items.map((item) => [itemKey(item), item.stock]));
  for (const assignment of plan) {
    const key = itemKey(assignment);
    left.set(key, (left.get(key) ?? 0) - 1);
  }
  return left;
}

/**
 * What of the plan can still be done, here and now.
 *
 * The garden moves while the plan is drawn and while the answer is awaited: a
 * tile fills up, a seed goes elsewhere. Rather than refusing the whole plan,
 * what still stands is kept, and comparing signatures at confirmation decides
 * whether to ask again.
 *
 * Drawing order decides when the stock runs short: the first tile drawn is
 * served first. Arbitrary but stable, so it gives the same answer from one
 * call to the next; a rule that changed its mind would look like a change of
 * scope on every reading.
 */
export function viablePlan(plan: PlantAssignment[], scope: PlantScope): PlantAssignment[] {
  const owned = new Set(scope.tiles);
  const left = new Map(scope.items.map((item) => [itemKey(item), item.stock]));
  const kept: PlantAssignment[] = [];

  for (const assignment of plan) {
    if (!owned.has(assignment.tileIndex)) continue;
    if (scope.occupied.has(assignment.tileIndex)) continue;

    const key = itemKey(assignment);
    const remaining = left.get(key) ?? 0;
    if (remaining <= 0) continue;

    left.set(key, remaining - 1);
    kept.push(assignment);
  }

  return kept;
}

/** "12 Carrot and 3 Aloe", or "... and 2 other kinds" past three. */
export function listPlantItems(plan: PlantAssignment[]): string {
  const parts = countByItem(plan).map((entry) => `${entry.count} ${entry.name}`);
  if (parts.length === 0) return "nothing";
  const head = parts.slice(0, 3);
  const rest = parts.length > head.length ? ` and ${parts.length - head.length} other kinds` : "";
  return `${listWords(head)}${rest}`;
}

/** The player's request, as it shows on their side of the thread. */
export function describePlan(plan: PlantAssignment[]): string {
  if (plan.length === 0) return "Plant nothing";
  return `Plant ${listPlantItems(plan)} for me`;
}

/**
 * What the companion is about to plant, as he announces it before asking.
 *
 * No full stop: the sentence goes on with the question.
 */
export function summarizePlan(plan: PlantAssignment[]): string {
  if (plan.length === 0) return "nothing";
  const tiles = `${plan.length} tile${plan.length === 1 ? "" : "s"}`;
  const parts = countByItem(plan);
  // One kind: "12 Carrot" says it all, the tile count would be the same number.
  if (parts.length === 1) return `${parts[0].count} ${parts[0].name} to plant`;
  return `${listPlantItems(plan)} to plant, over ${tiles}`;
}
