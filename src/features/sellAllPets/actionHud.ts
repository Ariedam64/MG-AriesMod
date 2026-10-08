// Finds the game's `ActionHud` Pixi container, the one contextual action
// prompt under `UI`, and finds it again whenever the game rebuilds its tree.

import { getStage, findAcrossBranches } from "../../game/pixi/gardenInfoCard";
import { getReadySpriteState } from "../../game/sprites/context";
import { pageWindow } from "../../platform/pageContext";

const ACTION_HUD_LABEL = "ActionHud";
const RETRY_MS = 1000;
const LOG_EVERY = 30;

export type ActionHudWatch = {
  /** Called with the container once found, and again after each rebuild. */
  attach(hud: any): void;
  /** Called when the game destroys the container. */
  detach(): void;
  /** Search attempts so far, for the debug status. */
  onSearch?(attempts: number): void;
};

export function watchActionHud(watch: ActionHudWatch): { stop(): void } {
  // Driven by requestAnimationFrame, not setInterval, which the browser can
  // throttle until the target is never found (see game/pixi/gardenInfoCard.ts).
  // The page's own one: the userscript sandbox's is not tied to its rendering.
  const raf: (cb: (t: number) => void) => number = (pageWindow as any).requestAnimationFrame.bind(pageWindow);
  const cancelRaf: (id: number) => void = (pageWindow as any).cancelAnimationFrame.bind(pageWindow);

  let running = true;
  let hud: any = null;
  let attempts = 0;
  let rafId: number | null = null;
  let lastCheckAt = 0;

  const attach = (found: any) => {
    hud = found;
    found.once("destroyed", () => {
      if (hud !== found) return;
      hud = null;
      watch.detach();
      // The game can rebuild its whole Pixi tree (a WebGL context lost while
      // the tab sat in the background), so the search starts over.
      search();
    });
    console.info(`[sellAllPets] attached to ${ACTION_HUD_LABEL} after ${attempts} attempt(s)`);
    watch.attach(found);
  };

  // No attempt cap: the sprite catalog can take any time to be ready, and
  // searching stops costing anything once found.
  const tryFind = () => {
    if (!running || hud) return;
    const state = getReadySpriteState();
    if (!state) return;
    const found = findAcrossBranches(getStage(state), (node: any) => node?.label === ACTION_HUD_LABEL);
    if (found) {
      attach(found);
      return;
    }
    attempts += 1;
    watch.onSearch?.(attempts);
    if (attempts % LOG_EVERY === 0) {
      console.info(`[sellAllPets] still searching for ${ACTION_HUD_LABEL} (${attempts} attempts so far)`);
    }
  };

  const tick = (now: number) => {
    rafId = null;
    if (!running || hud) return;
    if (now - lastCheckAt >= RETRY_MS) {
      lastCheckAt = now;
      tryFind();
    }
    if (running && !hud) rafId = raf(tick);
  };

  const search = () => {
    tryFind();
    if (running && !hud && rafId == null) rafId = raf(tick);
  };
  search();

  return {
    stop() {
      running = false;
      if (rafId != null) cancelRaf(rafId);
      rafId = null;
    },
  };
}
