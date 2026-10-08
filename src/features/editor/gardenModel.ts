// The editor's garden as plain data: the two tile maps, the plant slot ids the
// game requires, and the lookups that find a player's slot in the room state.
// Nothing here touches the game, so it can be checked in node.

import type { GardenState } from "../../game/store/atoms";

/** The two kinds of garden tile, spelled the way the editor's tile targets carry them. */
export type TileType = "Dirt" | "Boardwalk";

export type TileObject = Record<string, any>;

export const makeEmptyGarden = (): GardenState => ({ tileObjects: {}, boardwalkTileObjects: {} });

/** Which of the two maps holds a tile of this type. */
const tileMapKey = (tileType: TileType): keyof GardenState =>
  tileType === "Dirt" ? "tileObjects" : "boardwalkTileObjects";

/** The object on one tile, or null. */
export function tileObjectAt(garden: GardenState, tileType: TileType, localIdx: number): TileObject | null {
  return garden[tileMapKey(tileType)]?.[String(localIdx)] ?? null;
}

/** A copy of `garden` with `obj` on one tile, or with that tile emptied when `obj` is null. */
export function withTileObject(
  garden: GardenState,
  tileType: TileType,
  localIdx: number,
  obj: TileObject | null,
): GardenState {
  const key = tileMapKey(tileType);
  const map = { ...garden[key] };
  if (obj) map[String(localIdx)] = obj;
  else delete map[String(localIdx)];
  return { ...garden, [key]: map };
}

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Gives every plant slot a numeric `slotId`, keeping the ones already there.
 *
 * The game requires `slotId` on every slot since the multi-harvest update and
 * its renderer skips a slot without one, so the crop silently disappears.
 */
export function ensureSlotIds(slots: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(slots)) return [];

  const used = new Set<number>();
  for (const slot of slots) {
    const id = (slot as Record<string, unknown> | null)?.slotId;
    if (isFiniteNumber(id)) used.add(id);
  }

  let nextId = 0;
  return slots.map((raw) => {
    const slot: Record<string, unknown> = raw && typeof raw === "object" ? { ...raw } : {};
    if (isFiniteNumber(slot.slotId)) return slot;
    while (used.has(nextId)) nextId++;
    used.add(nextId);
    slot.slotId = nextId;
    return slot;
  });
}

function withPlantSlotIds(map: Record<string, any>): Record<string, any> {
  const next: Record<string, any> = {};
  for (const [key, value] of Object.entries(map || {})) {
    next[key] =
      value && typeof value === "object" && value.objectType === "plant"
        ? { ...value, slots: ensureSlotIds(value.slots) }
        : value;
  }
  return next;
}

/** Any value read back from storage, an import or the room state, as a well formed garden. */
export function sanitizeGarden(value: unknown): GardenState {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const tileObjects = typeof record.tileObjects === "object" && record.tileObjects ? record.tileObjects : {};
  const boardwalk =
    typeof record.boardwalkTileObjects === "object" && record.boardwalkTileObjects ? record.boardwalkTileObjects : {};
  return {
    tileObjects: withPlantSlotIds({ ...tileObjects }),
    boardwalkTileObjects: withPlantSlotIds({ ...boardwalk }),
  };
}

/** Where a player's user slot sits in the room's `userSlots`, which is an array or a keyed object. */
export type PlayerSlotMatch = { slot: any; index: number };

/**
 * Finds the user slot belonging to `playerId`. For a keyed object the index is
 * the numeric key (0 when it is not a number), visited in key order.
 */
export function findPlayerSlot(slots: unknown, playerId: string): PlayerSlotMatch | null {
  if (!slots || typeof slots !== "object") return null;
  const isMatch = (slot: any) => !!slot && String(slot.userId || slot.playerId || slot.id || "") === String(playerId);

  if (Array.isArray(slots)) {
    const index = slots.findIndex(isMatch);
    return index >= 0 ? { slot: slots[index], index } : null;
  }

  const entries = Object.entries(slots as Record<string, unknown>).sort(([a], [b]) => compareSlotKeys(a, b));
  for (const [key, slot] of entries) {
    if (!isMatch(slot)) continue;
    const index = Number(key);
    return { slot, index: Number.isFinite(index) ? index : 0 };
  }
  return null;
}

function compareSlotKeys(a: string, b: string): number {
  const ai = Number(a);
  const bi = Number(b);
  if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
  return a.localeCompare(b);
}
