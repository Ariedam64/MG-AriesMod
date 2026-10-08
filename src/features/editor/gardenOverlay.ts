// Shows a garden that is not the server's (the editor's plan, or a friend's
// garden) over the player's own, without writing it into the room state.
//
// An earlier version wrote the other garden into the player's user slot. In
// game the server pushes the full state about every 730 ms and the game
// repaints from it, so that preview lasted about a second, and rewriting it on
// every push only turned the problem into flicker with both sides fighting
// over the same data.
//
// So this holds the two layers the game actually reads instead:
//   - the painting, by taking over `tileView.onDataChanged` on our tiles;
//   - the info panel of the current tile, through a read patch on
//     `myDataAtom` (which `myOwnCurrentGardenObjectAtom` derives from).
//
// Never writing the state also means another player's garden can never be
// uploaded under our account, and restoring is trivial: the state still holds
// the server's truth, up to date.

import { Atoms, type GardenState } from "../../game/store/atoms";
import { tos } from "../../game/pixi/tileObjects";
import { fakeHide, fakeShow, type FakeConfig } from "../../game/fakeAtoms";
import { sanitizeGarden, tileObjectAt, type TileObject } from "./gardenModel";
import { readMapData } from "./liveGarden";
import { slotTiles } from "./tileMap";
import { cloneTileObject, pushToTileView, renderContext, tileViewAt } from "./tilePaint";

/** Who holds the overlay. One at a time: two takeovers stacked on one tile would not restore cleanly. */
export type OverlayOwner = "friend" | "editor";

/** A tile whose `onDataChanged` was taken over, with what it takes to restore it. */
type TileHold = {
  tileView: any;
  hadOwnProperty: boolean;
  original: (obj: unknown) => void;
  resolve: () => TileObject | null;
};

let owner: OverlayOwner | null = null;
const holds = new Map<number, TileHold>();

export const overlayOwner = (): OverlayOwner | null => owner;

/**
 * The current tile's info panel reads `myOwnCurrentGardenObjectAtom`, derived
 * from `myDataAtom.garden`, so patching how myData reads is enough for it to
 * describe the shown garden.
 *
 * No gate: myData is recomputed on every server push, which applies our value
 * again by itself. The fakeAtoms registry entry is shared with the modals
 * (same label), but a `{ garden }` payload passes through either merge.
 */
const MYDATA_PATCH: FakeConfig<any> = {
  label: Atoms.data.myData.label,
  merge: (real: any, fake: any) => ({ ...(real || {}), ...(fake || {}) }),
};

/**
 * Takes over `onDataChanged`: whatever the game sends this tile, it shows what
 * `resolve` says. The resolver is asked on every call, so a plan that keeps
 * changing needs no reinstall.
 */
function holdTile(tileView: any, resolve: () => TileObject | null): TileHold | null {
  if (!tileView || typeof tileView.onDataChanged !== "function") return null;
  const hadOwnProperty = Object.prototype.hasOwnProperty.call(tileView, "onDataChanged");
  const original = tileView.onDataChanged as (obj: unknown) => void;
  tileView.onDataChanged = function (this: unknown) {
    return original.call(this, cloneTileObject(resolve()));
  };
  return { tileView, hadOwnProperty, original, resolve };
}

function releaseTile(hold: TileHold): void {
  try {
    if (hold.hadOwnProperty) hold.tileView.onDataChanged = hold.original;
    else delete hold.tileView.onDataChanged;
  } catch {
    try {
      hold.tileView.onDataChanged = hold.original;
    } catch {}
  }
}

/**
 * Holds every tile of user slot `userSlotIdx` on `getGarden()`, read live.
 * An overlay already in place is released first.
 */
export async function installGardenOverlay(
  nextOwner: OverlayOwner,
  userSlotIdx: number,
  getGarden: () => GardenState,
): Promise<boolean> {
  releaseGardenOverlay();
  if (!tos.isReady()) return false;

  const tiles = slotTiles(await readMapData(), userSlotIdx);
  if (!tiles.length) return false;

  const ctx = renderContext();
  for (const tile of tiles) {
    const tileView = tileViewAt(tile.tx, tile.ty);
    if (!tileView) continue;
    const resolve = () => tileObjectAt(getGarden(), tile.tileType, tile.localIdx);
    const hold = holdTile(tileView, resolve);
    if (hold) holds.set(tile.gidx, hold);
    pushToTileView(tileView, resolve(), ctx);
  }

  if (holds.size === 0) return false;
  owner = nextOwner;
  return true;
}

export function releaseGardenOverlay(): void {
  for (const hold of holds.values()) releaseTile(hold);
  holds.clear();
  owner = null;
}

/** Repaints every held tile from its resolver. */
export function repaintOverlay(): void {
  const ctx = renderContext();
  for (const hold of holds.values()) pushToTileView(hold.tileView, hold.resolve(), ctx);
}

/** Makes the current tile's info panel describe `garden`. */
export async function showGardenInTileInfo(garden: GardenState): Promise<void> {
  try {
    await fakeShow(MYDATA_PATCH, { garden: sanitizeGarden(garden) });
  } catch (error) {
    console.warn("[EditorService] tile info patch unavailable", error);
  }
}

export async function clearGardenInTileInfo(): Promise<void> {
  try {
    await fakeHide(MYDATA_PATCH.label);
  } catch {}
}
