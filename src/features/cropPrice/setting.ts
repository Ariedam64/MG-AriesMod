// Whether the mod shows a crop's coin value on the garden card. Both displays
// (the Pixi badge and the old DOM tooltip line) read it and follow its
// changes, so the Misc menu toggle takes effect without a reload.

import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { Emitter } from "../../lib/emitter";

const PATH_SHOW_CROP_PRICE = "misc.showCropPrice";

const changes = new Emitter<boolean>();

/** Shown until the player switches it off. */
export function readShowCropPrice(): boolean {
  try {
    return readAriesPath<unknown>(PATH_SHOW_CROP_PRICE) !== false;
  } catch {
    return true;
  }
}

export function writeShowCropPrice(on: boolean): void {
  const next = !!on;
  if (readShowCropPrice() === next) return;
  try {
    writeAriesPath(PATH_SHOW_CROP_PRICE, next);
  } catch {}
  changes.emit(next);
}

export function onShowCropPriceChange(cb: (on: boolean) => void): () => void {
  return changes.on(cb);
}
