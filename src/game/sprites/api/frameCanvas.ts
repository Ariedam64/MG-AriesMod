// Renders a single atlas frame to a canvas, by frame key.
//
// Goes through the renderer's extract rather than reading the atlas image:
// every atlas ships as KTX2 (GPU-compressed) and cannot be decoded in the
// browser, but the catalog already holds a Texture per frame built on the
// game's own source.

import { getSpriteState } from '../index';

const canvasCache = new Map<string, HTMLCanvasElement>();
const CACHE_MAX = 600;

/**
 * Renders `frameKey` to a canvas, or null while the catalog is still loading.
 *
 * Results are cached: extraction is a GPU round-trip, and callers such as the
 * sprite grid re-request the same frames on every re-render.
 */
export function renderFrameToCanvas(frameKey: string): HTMLCanvasElement | null {
  const cached = canvasCache.get(frameKey);
  if (cached) return cached;

  const state = getSpriteState();
  const texture = state.tex.get(frameKey);
  const ctors = state.ctors;
  if (!texture || !ctors?.Sprite || !state.renderer?.extract) return null;

  let sprite: any = null;
  try {
    sprite = new ctors.Sprite(texture);
    const canvas = state.renderer.extract.canvas(sprite, { resolution: 1 });
    if (!canvas) return null;
    if (canvasCache.size >= CACHE_MAX) {
      canvasCache.delete(canvasCache.keys().next().value as string);
    }
    canvasCache.set(frameKey, canvas);
    return canvas;
  } catch {
    return null;
  } finally {
    try {
      sprite?.destroy?.({ children: true, texture: false, baseTexture: false });
    } catch {
      /* ignore */
    }
  }
}
