// Turns the mode the player chose into an anchor and an area, the only two
// things `movement.ts` needs to know.
//
// The differences between modes live here; the movement engine is the same
// for all of them. Adding a mode means adding a case here, without touching
// the checked core. Nothing is hardcoded: the garden tiles come from `mapAtom`.

import { makeAtom } from "../../game/store/hub";
import type { CompanionMap } from "./mapView";
import type { Anchor, IsWalkable, XY } from "./movement";
import type { CompanionMode } from "./settingsShape";

// The mode is a setting, so it lives in `settingsShape.ts`, which is pure. It
// is re-exported here because the rest of the code takes it from this module.
export { type CompanionMode } from "./settingsShape";

/** The local player's slot in the room: it indexes their garden tiles. */
const myUserSlotIdx = makeAtom<number | null>("myUserSlotIdxAtom");

type ResolvedAnchor = {
  anchor: Anchor;
  /** The map's raw walkability. The mode's area lives in `anchor.zone`. */
  isWalkable: IsWalkable;
  /** The mode really applied: may differ from the one asked for when it falls back. */
  effectiveMode: CompanionMode;
};

type AnchorRequest = {
  mode: CompanionMode;
  map: CompanionMap;
  player: XY;
};

/**
 * Resolves the current mode.
 *
 * A mode whose data is missing (no garden found) falls back on following
 * rather than leaving the companion still with no explanation.
 * `effectiveMode` says what was really applied, so the menu can show it.
 */
export async function resolveAnchor(request: AnchorRequest): Promise<ResolvedAnchor> {
  const { mode, map, player } = request;

  if (mode === "garden") {
    const resolved = await resolveGardenAnchor(map);
    if (resolved) return resolved;
  }
  return followAnchor(map, player);
}

function followAnchor(map: CompanionMap, player: XY): ResolvedAnchor {
  return {
    anchor: { tile: player, onArrival: "wander", tracksPlayer: true },
    isWalkable: map.isWalkable,
    effectiveMode: "follow",
  };
}

/**
 * Garden: the area is the player's plot, the anchor its centre.
 *
 * The wander radius covers the whole plot: otherwise the companion would stay
 * bunched in the middle of a garden larger than the default radius.
 */
async function resolveGardenAnchor(map: CompanionMap): Promise<ResolvedAnchor | null> {
  const slot = await readMySlotIdx();
  if (slot === null) return null;

  const tiles = map.gardenTilesForSlot(slot);
  if (tiles.length === 0) return null;

  const allowed = new Set(tiles);
  // An area, NOT walkability: outside his garden he must be able to cross the
  // rest of the map to walk back.
  const zone: IsWalkable = (x, y) => allowed.has(map.toIndex(x, y));

  const positions = tiles.map((tile) => map.toXY(tile));
  const center = nearestTo(centroid(positions), positions);
  const radius = positions.reduce(
    (max, tile) => Math.max(max, Math.abs(tile.x - center.x), Math.abs(tile.y - center.y)),
    1,
  );

  return {
    anchor: { tile: center, onArrival: "wander", tracksPlayer: false, zone, wanderRadius: radius },
    isWalkable: map.isWalkable,
    effectiveMode: "garden",
  };
}

/** The player's slot in the room: it indexes their garden tiles. */
export async function readMySlotIdx(): Promise<number | null> {
  try {
    const slot = Number(await myUserSlotIdx.get());
    return Number.isInteger(slot) && slot >= 0 ? slot : null;
  } catch {
    return null;
  }
}

function centroid(tiles: XY[]): XY {
  let sumX = 0;
  let sumY = 0;
  for (const tile of tiles) {
    sumX += tile.x;
    sumY += tile.y;
  }
  return { x: Math.round(sumX / tiles.length), y: Math.round(sumY / tiles.length) };
}

/** The geometric centre may fall outside the area: the nearest real tile is taken. */
function nearestTo(target: XY, tiles: XY[]): XY {
  let best = tiles[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const tile of tiles) {
    const distance = Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tile;
    }
  }
  return { ...best };
}
