// Drawing garden objects onto the game's tile views. Every write here is
// visual only: the room state is never touched, so the game puts the real
// garden back the next time it repaints a tile, unless `gardenOverlay.ts`
// holds that tile.

import type { GardenState } from "../../game/store/atoms";
import { tos } from "../../game/pixi/tileObjects";
import { tileObjectAt, type TileObject } from "./gardenModel";
import { readMapData } from "./liveGarden";
import { slotTiles } from "./tileMap";

const FORCE = { ensureView: true, forceUpdate: true } as const;

/** A deep copy, so the game never holds a reference into the editor's plan. */
export function cloneTileObject<T>(obj: T): T {
  if (!obj) return obj;
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

/** The game's view object for the tile at (tx, ty), created if need be. */
export function tileViewAt(tx: number, ty: number): any | null {
  try {
    return (tos.getTileObject(tx, ty, { ensureView: true }) as any)?.tileView ?? null;
  } catch {
    return null;
  }
}

export function renderContext(): any {
  try {
    return tos.getRenderContext();
  } catch {
    return null;
  }
}

/** Hands `obj` to a tile view the way the game does, then redraws it. */
export function pushToTileView(tileView: any, obj: unknown, ctx: any): void {
  if (!tileView || typeof tileView.onDataChanged !== "function") return;
  try {
    tileView.onDataChanged(cloneTileObject(obj));
  } catch {
    return;
  }
  if (ctx && typeof tileView.update === "function") {
    try {
      tileView.update(ctx);
    } catch {}
  }
}

/**
 * Draws `obj` on the tile at (x, y), or empties the tile for null. The object
 * goes to the tile view first, then through the matching tile object setter.
 */
export function paintTileObject(x: number, y: number, obj: TileObject | null): void {
  if (!obj) {
    tos.setTileEmpty(x, y, FORCE);
    return;
  }
  pushToTileView(tileViewAt(x, y), obj, renderContext());
  switch (obj.objectType) {
    case "plant":
      tos.setTilePlant(
        x,
        y,
        { species: obj.species, plantedAt: obj.plantedAt, maturedAt: obj.maturedAt, slots: obj.slots },
        FORCE,
      );
      break;
    case "decor":
      tos.setTileDecor(x, y, { rotation: obj.rotation }, FORCE);
      break;
    case "egg":
      tos.setTileEgg(x, y, { plantedAt: obj.plantedAt, maturedAt: obj.maturedAt }, FORCE);
      break;
    default:
      tos.setTileEmpty(x, y, FORCE);
  }
}

/** Draws a whole garden over user slot `userSlotIdx`, through the tile object setters. */
export async function paintGarden(garden: GardenState, userSlotIdx: number): Promise<void> {
  if (!tos.isReady()) return;
  for (const tile of slotTiles(await readMapData(), userSlotIdx)) {
    paintTileObject(tile.tx, tile.ty, tileObjectAt(garden, tile.tileType, tile.localIdx));
  }
}

/** Hands a whole garden to the tile views of user slot `userSlotIdx`. */
export async function pushGardenToTileViews(garden: GardenState, userSlotIdx: number): Promise<void> {
  const tiles = slotTiles(await readMapData(), userSlotIdx);
  const ctx = renderContext();
  for (const tile of tiles) {
    const tileView = tileViewAt(tile.tx, tile.ty);
    if (tileView) pushToTileView(tileView, tileObjectAt(garden, tile.tileType, tile.localIdx), ctx);
  }
}
