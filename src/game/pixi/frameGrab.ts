// A picture of the game as the player sees it, for a bug report.
//
// The game's WebGL canvas does not keep its drawing buffer, so reading it at
// a random moment gives a blank image. Rendering the stage and copying the
// canvas in the same task gets a real frame without asking the browser for
// anything. When that still comes out blank (another backend, a lost
// context), the renderer's extract draws the stage into a texture instead,
// which costs a GPU round trip but does not depend on the buffer.
//
// Only the canvas is captured: the game's HTML menus and the mod's windows are
// not in it.

import { getPixiApp, getSpriteState } from "../sprites/context";
import { getStage } from "./stageSearch";

function canvasOf(renderer: any, app: any): HTMLCanvasElement | null {
  // Pixi v8 names it `canvas`; `view` is the v7 name, sometimes a wrapper.
  const canvas = renderer?.canvas || renderer?.view?.canvas || renderer?.view || app?.canvas || app?.view || null;
  return canvas && canvas.width > 0 && canvas.height > 0 ? canvas : null;
}

/** A copy of `source` at most `maxSide` pixels on its longest side. */
function scaledCopy(source: CanvasImageSource & { width: number; height: number }, maxSide: number): HTMLCanvasElement | null {
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(source.width * scale));
  out.height = Math.max(1, Math.round(source.height * scale));
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

/** True when every pixel of a small sample is fully transparent: the buffer was already cleared. */
function looksBlank(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement("canvas");
  probe.width = 16;
  probe.height = 16;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(canvas, 0, 0, 16, 16);
  const data = ctx.getImageData(0, 0, 16, 16).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return false;
  return true;
}

function extractFrame(renderer: any, stage: any, maxSide: number): HTMLCanvasElement | null {
  const extract = renderer?.extract;
  if (typeof extract?.canvas !== "function") return null;
  // Without a frame, extract takes the stage's whole bounds, the off-screen
  // world included. The screen rectangle keeps it to what the player sees.
  const frame = renderer.screen;
  const source = frame ? extract.canvas({ target: stage, frame }) : extract.canvas(stage);
  return source && source.width > 0 ? scaledCopy(source, maxSide) : null;
}

/**
 * The game's current frame on a canvas, at most `maxSide` pixels on its
 * longest side, or null when the renderer is not there yet or cannot be
 * read. Never throws.
 */
export function grabGameFrame(maxSide = 1920): HTMLCanvasElement | null {
  try {
    const state = getSpriteState();
    const renderer = state.renderer;
    if (!renderer || typeof renderer.render !== "function") return null;
    const app = getPixiApp();
    const stage = getStage(state) ?? app?.stage;
    const canvas = canvasOf(renderer, app);
    if (!stage || !canvas) return null;

    renderer.render(stage);
    const copy = scaledCopy(canvas, maxSide);
    if (copy && !looksBlank(copy)) return copy;
    return extractFrame(renderer, stage, maxSide);
  } catch {
    return null;
  }
}
