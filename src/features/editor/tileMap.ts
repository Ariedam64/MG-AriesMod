// How the game's map addresses garden tiles, as pure functions over `mapAtom`.
//
// The map numbers every tile of the world with a global index (`gidx`, row
// major over `cols`). Garden tiles additionally carry the user slot they belong
// to and their index inside that garden, in `globalTileIdxToDirtTile` and
// `globalTileIdxToBoardwalk`. The editor speaks in that local index, the tile
// object system in world coordinates, and these functions translate.

import type { TileType } from "./gardenModel";

/** The part of the game's `mapAtom` value the editor reads. */
export type GardenMapData = {
  cols?: unknown;
  globalTileIdxToDirtTile?: Record<string, { userSlotIdx?: unknown; dirtTileIdx?: unknown } | null>;
  globalTileIdxToBoardwalk?: Record<string, { userSlotIdx?: unknown; boardwalkTileIdx?: unknown } | null>;
};

/** A tile of the player's own garden, the way the editor addresses it. */
export type EditorTileTarget = {
  tileType: TileType;
  localTileIndex: number;
  userSlotIdx: number;
};

/** One garden tile with both its world position and its index inside the garden. */
export type SlotTile = {
  gidx: number;
  tx: number;
  ty: number;
  localIdx: number;
  tileType: TileType;
};

/** The world's width in tiles, or null when the map is not loaded. */
export function mapColumns(mapData: GardenMapData | null | undefined): number | null {
  const cols = Number(mapData?.cols);
  return mapData && Number.isFinite(cols) && cols > 0 ? cols : null;
}

const SOURCES = [
  { tileType: "Dirt", record: "globalTileIdxToDirtTile", localKey: "dirtTileIdx" },
  { tileType: "Boardwalk", record: "globalTileIdxToBoardwalk", localKey: "boardwalkTileIdx" },
] as const;

/** Every tile of user slot `userSlotIdx`, dirt first. */
export function slotTiles(mapData: GardenMapData | null | undefined, userSlotIdx: number): SlotTile[] {
  const cols = mapColumns(mapData);
  if (cols == null) return [];

  const out: SlotTile[] = [];
  for (const { tileType, record, localKey } of SOURCES) {
    for (const [gidxText, meta] of Object.entries(mapData?.[record] || {})) {
      if ((meta as Record<string, unknown> | null)?.userSlotIdx !== userSlotIdx) continue;
      const gidx = Number(gidxText);
      if (!Number.isFinite(gidx)) continue;
      out.push({
        gidx,
        tx: gidx % cols,
        ty: Math.floor(gidx / cols),
        localIdx: Number((meta as Record<string, unknown>)[localKey] ?? -1),
        tileType,
      });
    }
  }
  return out;
}

/** The garden tile at world position (tx, ty), when it belongs to user slot `ownSlotIdx`. */
export function ownTileAt(
  mapData: GardenMapData | null | undefined,
  tx: number,
  ty: number,
  ownSlotIdx: number,
): EditorTileTarget | null {
  const cols = mapColumns(mapData);
  if (cols == null || tx < 0 || ty < 0 || tx >= cols) return null;
  const gidx = ty * cols + tx;

  for (const { tileType, record, localKey } of SOURCES) {
    const meta = mapData?.[record]?.[gidx] as Record<string, unknown> | null | undefined;
    if (meta && typeof meta === "object" && Number(meta.userSlotIdx) === ownSlotIdx) {
      return { tileType, localTileIndex: Number(meta[localKey]), userSlotIdx: ownSlotIdx };
    }
  }
  return null;
}

/** World position of a garden tile given by its local index, or null when the map has no such tile. */
export function tileCoordsOf(
  mapData: GardenMapData | null | undefined,
  target: EditorTileTarget,
): { x: number; y: number } | null {
  const cols = mapColumns(mapData);
  if (cols == null) return null;
  const source = SOURCES.find((s) => s.tileType === target.tileType) ?? SOURCES[1];

  for (const [gidxText, meta] of Object.entries(mapData?.[source.record] || {})) {
    if (!meta || typeof meta !== "object") continue;
    const record = meta as Record<string, unknown>;
    if (Number(record.userSlotIdx) !== target.userSlotIdx) continue;
    if (Number(record[source.localKey]) !== target.localTileIndex) continue;
    const gidx = Number(gidxText);
    if (!Number.isFinite(gidx)) continue;
    return { x: gidx % cols, y: Math.floor(gidx / cols) };
  }
  return null;
}
