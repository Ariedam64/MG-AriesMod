import { pageWindow } from "../../../platform/pageContext";
import { getCtors } from "../utils/pixi";
import type { PixiHandles } from "./hooks";
import type { SpriteState } from "../types";

/**
 * The browser can tear down and recreate the game's WebGL renderer and canvas
 * after the tab has been in the background a while (a GPU context reclaimed
 * during an alt-tab). The catalog resolves the renderer once at boot, so every
 * feature reading it would keep pointing at a dead, detached canvas until a
 * full reload. This checks every second whether the canvas is still in the
 * document and, if not, picks up whatever the Pixi hooks captured last: they
 * keep tracking every `__PIXI_APP_INIT__`/`__PIXI_RENDERER_INIT__`, not only
 * the first, precisely so a recreated renderer can be found here. The raw
 * `__PIXI_APP__`-style globals are not a reliable fallback on their own.
 *
 * The constructors have to be re-derived after a swap, as a real crash showed:
 * `Text`, unlike Sprite, Container or Rectangle, keeps a renderer-specific
 * glyph metrics cache, so text built with the old renderer's class throws
 * (`Cannot read properties of undefined (reading 'advance')`) once used
 * against the new one.
 */

interface RendererHealthDebugState {
  checks: number;
  staleStreak: number;
  swaps: Array<{ at: number; fromCanvasInDoc: boolean }>;
  ctorsRederiveAttempts: number;
  lastCtorsRederiveError: string | null;
}

const RENDERER_HEALTH_CHECK_MS = 1_000;
// The same staleness has to show on several checks in a row before anything is
// swapped: one check can land on a passing state (very early boot, the canvas
// being attached) that looks stale for a moment without the renderer being dead.
const REQUIRED_STALE_STREAK = 3;

function canvasOf(renderer: any): any {
  return renderer?.canvas || renderer?.view?.canvas || renderer?.view || null;
}

export function watchRendererHealth(state: SpriteState, hooks: PixiHandles): void {
  const pageWin: any = pageWindow;
  let staleStreak = 0;
  // Set right after a swap and retried every tick until getCtors() succeeds on
  // the new renderer's stage, which may still be empty at the moment of the swap.
  let needsCtorsRederive = false;

  const debugState: RendererHealthDebugState = {
    checks: 0,
    staleStreak: 0,
    swaps: [],
    ctorsRederiveAttempts: 0,
    lastCtorsRederiveError: null,
  };
  pageWin.__MG_RENDERER_HEALTH_DEBUG__ = debugState;

  pageWin.setInterval(() => {
    try {
      debugState.checks += 1;

      if (needsCtorsRederive) {
        debugState.ctorsRederiveAttempts += 1;
        try {
          state.ctors = getCtors(state.app ?? state.renderer);
          needsCtorsRederive = false;
          debugState.lastCtorsRederiveError = null;
          console.info("[MG SpriteCatalog] re-derived ctors from the new renderer");
        } catch (error) {
          // The stage probably has no content yet: next tick.
          debugState.lastCtorsRederiveError = String((error as Error)?.message ?? error);
        }
      }

      const canvas = canvasOf(state.renderer);
      const canvasHealthy = !!canvas && typeof document !== "undefined" && document.contains(canvas);
      if (canvasHealthy) {
        staleStreak = 0;
        debugState.staleStreak = 0;
        return;
      }
      staleStreak += 1;
      debugState.staleStreak = staleStreak;
      if (staleStreak < REQUIRED_STALE_STREAK) return;

      const freshRenderer = hooks.renderer;
      if (!freshRenderer || freshRenderer === state.renderer) return;
      const freshCanvas = canvasOf(freshRenderer);
      if (!freshCanvas || typeof document === "undefined" || !document.contains(freshCanvas)) return;

      console.info("[MG SpriteCatalog] renderer canvas went stale, re-resolved a fresh one");
      debugState.swaps.push({ at: Date.now(), fromCanvasInDoc: canvasHealthy });
      state.renderer = freshRenderer;
      if (hooks.app) state.app = hooks.app;
      needsCtorsRederive = true;
      staleStreak = 0;
      debugState.staleStreak = 0;
    } catch (error) {
      console.warn("[MG SpriteCatalog] renderer health check failed", error);
    }
  }, RENDERER_HEALTH_CHECK_MS);
}
