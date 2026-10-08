import { createSpriteContext } from "./state";
import type { PixiHandles } from "./pixi/hooks";
import type { SpriteState } from "./types";

/**
 * The sprite catalog's state, shared by everything that draws with the game's
 * Pixi: renderer, constructors, textures. Free of side effects, so any module
 * (and the node checks) can import it without starting the catalog; the
 * catalog itself boots from `sprites/index.ts`.
 */

export const spriteContext = createSpriteContext();

let pixiHooks: PixiHandles | null = null;

/** Called once by the catalog boot with the hooks it installed. */
export function setPixiHooks(hooks: PixiHandles): void {
  pixiHooks = hooks;
}

/** The live catalog state (renderer, ctors, texture map, atlas base textures), ready or not. */
export function getSpriteState(): SpriteState {
  return spriteContext.state;
}

/** The catalog state once the renderer and the Pixi constructors are known, else null. */
export function getReadySpriteState(): SpriteState | null {
  const state = spriteContext.state;
  return state.renderer && state.ctors?.Text ? state : null;
}

/**
 * The real Pixi Application, as captured by `__PIXI_APP_INIT__`.
 *
 * Deliberately not `state.app` first: Pixi v8 builds the renderer before calling
 * `__PIXI_APP_INIT__`, so `__PIXI_RENDERER_INIT__` fires first and the hooks
 * resolve the app with a synthetic stand-in `{ renderer, stage, ticker }`. That
 * stand-in is what `state.app` holds, and it carries none of the game's own
 * Application extensions (`renderTextureCache`, ...). The hooks keep tracking
 * the latest value and do end up holding the genuine Application.
 */
export function getPixiApp(): any {
  return pixiHooks?.app ?? spriteContext.state.app;
}
