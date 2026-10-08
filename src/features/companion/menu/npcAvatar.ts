// Composes the NPC's portrait from its cosmetics, framed on the head.
//
// The game stacks PNGs to draw a character; the same is done here in a
// canvas. Images go through `setImageSafe`, which routes them through GM in the
// Discord Activity, where direct loading is blocked.

import { readNpcOutfit, cosmeticUrl } from "../avatar";
import { setImageSafe } from "../../../platform/discordCsp";

/** The layers are square; this size is the canvas, not the display. */
const CANVAS_PX = 128;
/** The cropped portrait's side. Big enough to stay sharp at 32 px. */
const PORTRAIT_PX = 64;

/**
 * The margin around the head, as a share of its width.
 *
 * A frame tight on the character gives a cramped portrait; a little air
 * around it and it looks like a profile picture.
 */
const HEAD_PADDING = 0.22;

/**
 * The fallback frame, as shares of the canvas.
 *
 * Used when measuring is impossible: a canvas tainted by a cross-origin image
 * refuses to give its pixels back. A standing character has its head at the
 * top and in the middle, and that is all this fallback assumes.
 */
const FALLBACK_CROP = { x: 0.28, y: 0.04, size: 0.44 };

const pending = new Map<string, Promise<HTMLCanvasElement | null>>();

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // Without it, an image from another origin taints the canvas and forbids
    // reading its pixels, so measuring where the head is.
    img.crossOrigin = "anonymous";
    img.addEventListener("load", () => resolve(img));
    img.addEventListener("error", () => resolve(null));
    setImageSafe(img, url);
  });
}

type Box = { x: number; y: number; width: number; height: number };

/**
 * The bounding box of the visible pixels.
 *
 * Cosmetic layers are mostly transparent: their opaque part is the character.
 * `null` when measuring is refused or nothing is visible.
 */
function opaqueBounds(canvas: HTMLCanvasElement): Box | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return null;
  }

  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      // A leftover alpha is not drawing: near-transparent pixels are skipped.
      if (pixels[(y * canvas.width + x) * 4 + 3] < 16) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * The square to cut out for a portrait.
 *
 * A standing character's head fills the top of its outline, and its shoulder
 * width gives the scale: a square of that side, set on the top and centred
 * horizontally, frames the head and shoulders. Nothing is measured by hand:
 * the frame follows the drawing, whatever it is.
 */
function headCrop(canvas: HTMLCanvasElement): Box {
  const bounds = opaqueBounds(canvas);
  if (!bounds) {
    return {
      x: canvas.width * FALLBACK_CROP.x,
      y: canvas.height * FALLBACK_CROP.y,
      width: canvas.width * FALLBACK_CROP.size,
      height: canvas.height * FALLBACK_CROP.size,
    };
  }

  const side = Math.min(bounds.width * (1 + HEAD_PADDING * 2), bounds.height, canvas.height);
  const centreX = bounds.x + bounds.width / 2;
  // Anchored on the character's top, raised a touch for some air above.
  const top = Math.max(0, bounds.y - side * (HEAD_PADDING / 2));

  return {
    x: Math.max(0, Math.min(centreX - side / 2, canvas.width - side)),
    y: Math.min(top, Math.max(0, canvas.height - side)),
    width: side,
    height: side,
  };
}

async function compose(npcId: string): Promise<HTMLCanvasElement | null> {
  const outfit = await readNpcOutfit(npcId).catch(() => []);
  if (outfit.length === 0) return null;

  const urls = outfit.map(cosmeticUrl).filter((url): url is string => url !== null);
  if (urls.length === 0) return null;

  const layers = await Promise.all(urls.map(loadImage));
  const drawable = layers.filter((img): img is HTMLImageElement => img !== null);
  // Nothing loaded: back to the fallback rather than an empty square.
  if (drawable.length === 0) return null;

  const full = document.createElement("canvas");
  full.width = CANVAS_PX;
  full.height = CANVAS_PX;
  const ctx = full.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  for (const layer of drawable) ctx.drawImage(layer, 0, 0, CANVAS_PX, CANVAS_PX);

  const crop = headCrop(full);

  const portrait = document.createElement("canvas");
  portrait.width = PORTRAIT_PX;
  portrait.height = PORTRAIT_PX;
  const out = portrait.getContext("2d");
  if (!out) return null;
  // The drawing is small and scaled up: smoothed, it would blur.
  out.imageSmoothingEnabled = false;
  out.drawImage(full, crop.x, crop.y, crop.width, crop.height, 0, 0, PORTRAIT_PX, PORTRAIT_PX);
  return portrait;
}

/**
 * An NPC's portrait, composed once per identity.
 *
 * The result is kept: the thread redraws its bubbles on every message, and
 * composing four PNGs each time would be waste. `null` when the outfit is not
 * known, and the caller keeps its fallback.
 */
function npcPortrait(npcId: string): Promise<HTMLCanvasElement | null> {
  let known = pending.get(npcId);
  if (!known) {
    known = compose(npcId).catch(() => null);
    pending.set(npcId, known);
  }
  return known;
}

/** Puts the portrait in a box, keeping what it holds when there is none. */
export function fillWithPortrait(box: HTMLElement, npcId: string | null): void {
  if (!npcId) return;
  void npcPortrait(npcId).then((source) => {
    if (!source || !box.isConnected) return;

    // A canvas can only be in one place: every bubble needs its own.
    const view = document.createElement("canvas");
    view.width = source.width;
    view.height = source.height;
    view.getContext("2d")?.drawImage(source, 0, 0);
    view.style.width = "100%";
    view.style.height = "100%";
    view.style.imageRendering = "pixelated";
    box.replaceChildren(view);
  });
}
