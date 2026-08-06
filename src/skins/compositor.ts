// Turns a user-imported image into the canvas that will back a frame's texture,
// and renders previews for the menu.
//
// Nothing here reads the game's atlas. Since v834 every atlas ships as KTX2
// (GPU-compressed), so its pixels cannot be decoded in the browser — the skin
// system replaces a frame's texture outright instead of patching the atlas.

import { renderFrameToCanvas } from '../sprite/api/frameCanvas';
import type { SkinTarget } from './types';

/**
 * Scales `source` to fit entirely inside `boxW`×`boxH`, preserving aspect
 * ratio and centring the result. Never crops and never distorts.
 */
function drawContained(
  ctx: CanvasRenderingContext2D,
  source: ImageBitmap,
  boxW: number,
  boxH: number,
): void {
  const scale = Math.min(boxW / source.width, boxH / source.height);
  const drawW = Math.max(1, Math.round(source.width * scale));
  const drawH = Math.max(1, Math.round(source.height * scale));
  const offsetX = Math.round((boxW - drawW) / 2);
  const offsetY = Math.round((boxH - drawH) / 2);
  // Smooth when shrinking (a large import would otherwise alias badly),
  // nearest-neighbour when growing so pixel art stays crisp.
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(source, 0, 0, source.width, source.height, offsetX, offsetY, drawW, drawH);
}

/**
 * Renders a skin at exactly the frame's own (unrotated) size.
 *
 * Matching that size is what lets the applier keep the game's `orig`, `trim`
 * and anchor untouched: the canvas stands in for the same region the original
 * occupied, so the sprite lands in the identical spot in the world.
 */
export async function buildSkinCanvas(
  target: SkinTarget,
  blob: Blob,
): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, target.logicalSize.w);
    canvas.height = Math.max(1, target.logicalSize.h);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    drawContained(ctx, bitmap, canvas.width, canvas.height);
    return canvas;
  } finally {
    bitmap.close?.();
  }
}

/** Renders what a frame looks like: the user's skin if any, else the original. */
export async function renderFramePreview(
  target: SkinTarget,
  blob: Blob | null,
): Promise<HTMLCanvasElement | null> {
  if (blob) return buildSkinCanvas(target, blob);
  return renderFrameToCanvas(target.frameKey);
}
