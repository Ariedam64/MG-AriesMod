// The game grid as the companion sees it: index and {x, y} conversion, tile
// walkability, NPC spawns, buildings and garden plots.
//
// Pure: built from the raw value of `mapAtom` (read in `map.ts`) and checked
// outside the browser. Nothing is hardcoded: if the map changes, this follows.
//
// Format reminder: an NPC position in the room state is a tile INDEX, which
// the game turns back into {x: i % cols, y: floor(i / cols)}.

import { matchBuildingName } from "./buildings";
import type { XY } from "./movement";

/** Part of `mapAtom`'s shape: only the fields the companion needs. */
export type GameMap = {
  cols: number;
  rows: number;
  /** Tiles that are always blocked. */
  collisionTiles?: Iterable<number> | null;
  /** Regions blocked under a game condition (shop closed, and so on). */
  conditionalCollisionRegions?: Array<{ condition?: string; tiles?: Iterable<number> | null }> | null;
  /** Each NPC's native spawn point, keyed by layer name. */
  npcSpawns?: Record<string, number> | null;
  /** Each player's dirt tiles, by slot then local index. */
  userSlotIdxAndDirtTileIdxToGlobalTileIdx?: Array<number[] | undefined> | null;
  /** The same for the boardwalk around the plot. */
  userSlotIdxAndBoardwalkTileIdxToGlobalTileIdx?: Array<number[] | undefined> | null;
  /** Buildings: spawn tiles and activation tiles. */
  locations?: Record<string, { spawnTileIdx?: number[]; activationTilesIdxs?: number[] }> | null;
};

/** A usable view of the grid, rebuilt on every map change. */
export type CompanionMap = {
  cols: number;
  rows: number;
  toIndex(x: number, y: number): number;
  toXY(index: number): XY;
  isWalkable(x: number, y: number): boolean;
  /** The NPC spawn layer names, which are also the NPCs' names. */
  npcSpawnLayers: string[];
  /** An NPC's native spawn point, through its `spawnLayer`. */
  npcSpawnTile(spawnLayer: string): number | null;
  /** The map's building names (seedShop, silo, trainStation...). */
  buildingNames: string[];
  /** The tiles a building is activated from. */
  buildingActivationTiles(name: string): number[];
  /**
   * Finds a building by keywords among the names the map exposes (see
   * `matchBuildingName`). `null` rather than a guess.
   */
  findBuilding(required: string[], alternatives: string[]): string | null;
  /** A player's plot tiles: dirt and boardwalk. */
  gardenTilesForSlot(userSlotIdx: number): number[];
  /**
   * A dirt tile's global tile, from its index within the plot.
   *
   * That index is what the protocol calls `slot` in `HarvestCrop` and what
   * `garden.tileObjects` uses as key, hence the map field's name,
   * `userSlotIdxAndDirtTileIdxToGlobalTileIdx`. Without this conversion a crop
   * has no position on the map.
   */
  gardenTileToGlobal(userSlotIdx: number, dirtTileIdx: number): number | null;
  /**
   * A plot's dirt tile count, so the bound of the local indexes. Without it,
   * knowing which tiles exist would mean probing `gardenTileToGlobal` until a
   * hole, with an arbitrary bound.
   */
  dirtTileCount(userSlotIdx: number): number;
};

function toSet(source: Iterable<number> | null | undefined): Set<number> {
  if (!source) return new Set();
  if (source instanceof Set) return source as Set<number>;
  try {
    return new Set(source);
  } catch {
    return new Set();
  }
}

/**
 * Builds the companion's view from `mapAtom`'s raw value.
 *
 * Conditional collision regions are treated as always blocked. Deliberately
 * cautious: whether the condition holds is unknown here, and a companion
 * standing in the middle of a closed shop shows far more than one going
 * around a slightly wide area.
 */
export function buildCompanionMap(raw: GameMap | null | undefined): CompanionMap | null {
  if (!raw || !Number.isFinite(raw.cols) || !Number.isFinite(raw.rows)) return null;
  const cols = Number(raw.cols);
  const rows = Number(raw.rows);
  if (cols <= 0 || rows <= 0) return null;

  const blocked = toSet(raw.collisionTiles);
  for (const region of raw.conditionalCollisionRegions ?? []) {
    for (const tile of toSet(region?.tiles)) blocked.add(tile);
  }

  const npcSpawns = raw.npcSpawns ?? {};
  const locations = raw.locations ?? {};
  const dirtBySlot = raw.userSlotIdxAndDirtTileIdxToGlobalTileIdx ?? [];
  const boardwalkBySlot = raw.userSlotIdxAndBoardwalkTileIdxToGlobalTileIdx ?? [];

  return {
    cols,
    rows,
    toIndex: (x, y) => y * cols + x,
    toXY: (index) => ({ x: index % cols, y: Math.floor(index / cols) }),
    isWalkable(x, y) {
      if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
      if (x < 0 || y < 0 || x >= cols || y >= rows) return false;
      return !blocked.has(y * cols + x);
    },
    npcSpawnLayers: Object.keys(npcSpawns),
    npcSpawnTile(spawnLayer) {
      const tile = npcSpawns[spawnLayer];
      return Number.isFinite(tile) ? Number(tile) : null;
    },
    buildingNames: Object.keys(locations),
    buildingActivationTiles(name) {
      const tiles = locations[name]?.activationTilesIdxs;
      return Array.isArray(tiles) ? tiles.filter((t) => Number.isInteger(t)) : [];
    },
    findBuilding(required, alternatives) {
      return matchBuildingName(Object.keys(locations), required, alternatives);
    },
    gardenTilesForSlot(userSlotIdx) {
      if (!Number.isInteger(userSlotIdx) || userSlotIdx < 0) return [];
      // Dirt AND boardwalk: he must be able to walk along the beds, not only
      // stand on them.
      const dirt = dirtBySlot[userSlotIdx];
      const boardwalk = boardwalkBySlot[userSlotIdx];
      const tiles = new Set<number>();
      for (const tile of Array.isArray(dirt) ? dirt : []) tiles.add(tile);
      for (const tile of Array.isArray(boardwalk) ? boardwalk : []) tiles.add(tile);
      return [...tiles];
    },
    gardenTileToGlobal(userSlotIdx, dirtTileIdx) {
      if (!Number.isInteger(userSlotIdx) || userSlotIdx < 0) return null;
      if (!Number.isInteger(dirtTileIdx) || dirtTileIdx < 0) return null;
      const dirt = dirtBySlot[userSlotIdx];
      if (!Array.isArray(dirt)) return null;
      const global = dirt[dirtTileIdx];
      return Number.isInteger(global) ? Number(global) : null;
    },
    dirtTileCount(userSlotIdx) {
      if (!Number.isInteger(userSlotIdx) || userSlotIdx < 0) return 0;
      const dirt = dirtBySlot[userSlotIdx];
      return Array.isArray(dirt) ? dirt.length : 0;
    },
  };
}
