// The notification bell as one more icon of the game's `RightSideRail`, the
// column of round icons at the top right. It takes the next cell of the
// rail's grid (`railSlot.ts`) and looks like the game's own icons
// (`railBellView.ts`). The panel and the sounds stay DOM and anchor on
// `getScreenRect()`.
import { getStage, watchStageNode } from "../../../game/pixi/stageSearch";
import { getReadySpriteState } from "../../../game/sprites/context";
import { pageWindow, shareGlobal } from "../../../platform/pageContext";
import { createRailBellView, type RailBellView } from "./railBellView";
import { computeRailSlot, isShownOnStage, type RailSlot } from "./railSlot";
import type { BellController, ScreenRect } from "./ring";

const RAIL_LABEL = "RightSideRail";
// After a renderer rebuild (a WebGL context lost while the tab sat in the
// background) the rail's "destroyed" event tells the bell to search again,
// but only if the game calls `.destroy()` on the old tree rather than leaving
// it to the garbage collector. When it does not, `rail` stays a stale
// reference and the bell never comes back, so this periodic check verifies
// the rail is still reachable from the live stage. It also retries what can
// be missing at first (the art, the Text constructor).
const MAINTENANCE_MS = 2000;
const RAIL_REACHABILITY_MAX_HOPS = 64;
/** Longest frame gap the animations step over, so a tab coming back does not jump. */
const MAX_FRAME_DT_MS = 100;

export interface PixiBellOptions {
  onClick: () => void;
}

interface PixiBellDebugState {
  attached: boolean;
  findAttempts: number;
  hasButton: boolean;
  lastError: string | null;
  /** The bell's cell on the rail, null while the game has stripped the rail. */
  slot: RailSlot | null;
  usesGameArt: boolean;
  hasGameBadge: boolean;
  /** CSS px per stage unit: 1 unless the canvas is CSS-scaled (zoom, DPR). */
  screenScaleX: number | null;
  screenScaleY: number | null;
}

export function startPixiBell(opts: PixiBellOptions): BellController {
  let running = true;
  let rail: any = null;
  let view: RailBellView | null = null;
  let slotSize = 0;
  let layoutKey = "";
  let count = 0;
  let ringing = false;
  let lastFrameAt: number | null = null;

  // Pixi's EventSystem never dispatches clicks to anything the mod adds to
  // the game's tree (even `stage.on("pointerdown")` stays silent while the
  // canvas gets native pointerdowns), so clicks are hit-tested from a native
  // DOM listener instead of relying on `eventMode`.
  let canvasEl: any = null;
  let canvasListenersAttached = false;
  let weSetPointerCursor = false;

  const debugState: PixiBellDebugState = {
    attached: false,
    findAttempts: 0,
    hasButton: false,
    lastError: null,
    slot: null,
    usesGameArt: false,
    hasGameBadge: false,
    screenScaleX: null,
    screenScaleY: null,
  };
  shareGlobal("__MG_NOTIFICATION_BELL_PIXI_DEBUG__", debugState);

  const now = (): number => (pageWindow as any).performance?.now?.() ?? Date.now();

  const forgetView = () => {
    view = null;
    slotSize = 0;
    layoutKey = "";
    debugState.hasButton = false;
    debugState.usesGameArt = false;
    debugState.hasGameBadge = false;
  };

  const removeView = () => {
    if (view) {
      try { view.root.onRender = null; } catch {}
      try { view.root.destroy({ children: true }); } catch {}
    }
    forgetView();
  };

  // The bell's on-screen box in page (client) coordinates, for the panel and
  // the hit-test below. Null while it is not drawn: the rail stripped, or
  // faded out under a game modal, where it must not take clicks.
  //
  // `toGlobal` yields stage units, which equal CSS pixels only when the
  // canvas is displayed at exactly `renderer.screen` size. Windows display
  // scaling, browser zoom and Discord's Activity iframe all CSS-scale the
  // canvas, and without the ratio below the panel and the hit-test drift.
  const computeScreenRect = (): ScreenRect | null => {
    const root = view?.root;
    if (!view || !root || root.destroyed || !view.shown || slotSize <= 0 || !isShownOnStage(root)) return null;
    const state = getReadySpriteState();
    const canvas = state?.renderer?.canvas || state?.renderer?.view?.canvas || state?.renderer?.view;
    if (!canvas) return null;
    try {
      const rect = canvas.getBoundingClientRect();
      const renderResolution = Number(state?.renderer?.resolution) || 1;
      const stageWidth = Number(state?.renderer?.screen?.width) || (Number(canvas.width) || 0) / renderResolution;
      const stageHeight = Number(state?.renderer?.screen?.height) || (Number(canvas.height) || 0) / renderResolution;
      const scaleX = stageWidth > 0 ? rect.width / stageWidth : 1;
      const scaleY = stageHeight > 0 ? rect.height / stageHeight : 1;
      debugState.screenScaleX = scaleX;
      debugState.screenScaleY = scaleY;
      const topLeft = root.toGlobal({ x: 0, y: 0 });
      const bottomRight = root.toGlobal({ x: slotSize, y: slotSize });
      return {
        left: rect.left + topLeft.x * scaleX,
        top: rect.top + topLeft.y * scaleY,
        right: rect.left + bottomRight.x * scaleX,
        bottom: rect.top + bottomRight.y * scaleY,
        width: (bottomRight.x - topLeft.x) * scaleX,
        height: (bottomRight.y - topLeft.y) * scaleY,
      };
    } catch {
      return null;
    }
  };

  const hitTestBell = (clientX: number, clientY: number): boolean => {
    const rect = computeScreenRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  };

  // Capture phase on `window`, not a listener on the canvas: the game's own
  // pointerdown handler (movement) is already on the canvas, and listeners
  // on one element fire in registration order whatever their capture flag.
  // A capturing listener higher up runs before the event reaches the canvas,
  // so `stopPropagation` keeps the click from also walking the character
  // under the bell.
  const onWindowPointerDownCapture = (ev: PointerEvent) => {
    if (!hitTestBell(ev.clientX, ev.clientY)) return;
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    ev.preventDefault();
    view?.press();
    try { opts.onClick(); } catch (error) {
      console.error("[PixiBell] onClick error:", error);
    }
  };

  const setHovered = (hovered: boolean) => {
    view?.setHovered(hovered);
    if (!canvasEl || hovered === weSetPointerCursor) return;
    canvasEl.style.cursor = hovered ? "pointer" : "";
    weSetPointerCursor = hovered;
  };
  const onCanvasPointerMove = (ev: PointerEvent) => setHovered(hitTestBell(ev.clientX, ev.clientY));
  const onCanvasPointerLeave = () => setHovered(false);

  const ensureCanvasListeners = (state: any) => {
    if (canvasListenersAttached) return;
    const canvas = state.renderer?.canvas || state.renderer?.view?.canvas || state.renderer?.view;
    if (!canvas) return;
    canvasEl = canvas;
    (pageWindow as any).addEventListener("pointerdown", onWindowPointerDownCapture, true);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerleave", onCanvasPointerLeave);
    canvasListenersAttached = true;
  };

  // The bottom of the screen in the rail's coordinates, for the slot to stay
  // on screen. The game slides the rail away by moving its pivot: taking the
  // pivot back out keeps the slot still while it does.
  const screenBottomInRail = (): number | null => {
    const screenHeight = Number(getReadySpriteState()?.renderer?.screen?.height);
    if (!Number.isFinite(screenHeight) || screenHeight <= 0) return null;
    try {
      return rail.toLocal({ x: 0, y: screenHeight }).y - (Number(rail.pivot?.y) || 0);
    } catch {
      return null;
    }
  };

  // Follows the game's own layout. Cheap enough for every frame: it only
  // reads the rail's few icons, and recomputes when one of them moved,
  // appeared or disappeared, or the screen changed height.
  const relayout = () => {
    if (!rail || !view) return;
    const bottom = screenBottomInRail();
    let key = bottom === null ? "|" : `${Math.round(bottom)}|`;
    for (const child of rail.children) {
      if (child === view.root) continue;
      key += child.visible === false ? "-;" : `${child.x},${child.y};`;
    }
    if (key === layoutKey) return;
    layoutKey = key;

    const slot = computeRailSlot(rail, view.root, bottom);
    debugState.slot = slot;
    view.setShown(slot !== null);
    if (!slot) return;
    view.root.position.set(slot.x, slot.y);
    slotSize = slot.size;
    view.setSize(slot.size);
  };

  const onFrame = () => {
    if (!running || !view) return;
    try {
      relayout();
      const t = now();
      view.animate(lastFrameAt === null ? 0 : Math.min(t - lastFrameAt, MAX_FRAME_DT_MS));
      lastFrameAt = t;
    } catch (error) {
      debugState.lastError = String((error as Error)?.message ?? error);
    }
  };

  const syncUnsafe = () => {
    if (!running || !rail || rail.destroyed) {
      removeView();
      return;
    }
    const state = getReadySpriteState();
    if (!state?.ctors?.Text) return;

    if (!view) {
      const made = createRailBellView(state, rail, count);
      made.setRinging(ringing);
      // The game can rebuild the rail's subtree without notice: drop the
      // stale reference rather than crash on it later.
      made.root.once("destroyed", () => {
        if (view === made) forgetView();
      });
      view = made;
    }
    if (view.root.parent !== rail) {
      // First in the rail, so the game's icons and their tooltips draw over it.
      rail.addChildAt(view.root, 0);
      // Registered on the render group the bell now belongs to: cleared
      // first, since the setter only registers a callback it did not hold.
      view.root.onRender = null;
      view.root.onRender = onFrame;
      layoutKey = "";
    }

    view.refreshArt(state);
    ensureCanvasListeners(state);
    relayout();
    debugState.hasButton = true;
    debugState.usesGameArt = view.usesGameArt;
    debugState.hasGameBadge = view.hasGameBadge;
  };

  const sync = () => {
    try {
      syncUnsafe();
      debugState.lastError = null;
    } catch (error) {
      debugState.lastError = String((error as Error)?.message ?? error);
      console.warn("[PixiBell] sync failed, clearing button", error);
      try { removeView(); } catch {}
    }
  };

  const railSearch = watchStageNode({
    label: RAIL_LABEL,
    logTag: "[PixiBell]",
    onFound(node) {
      rail = node;
      debugState.attached = true;
      sync();
    },
    onLost() {
      rail = null;
      debugState.attached = false;
      removeView();
    },
    onSearch(attempts) {
      debugState.findAttempts = attempts;
    },
  });

  const isReachableFromLiveStage = (node: any): boolean => {
    const state = getReadySpriteState();
    if (!state) return false;
    const stage = getStage(state);
    if (!stage) return false;
    let cur: any = node;
    let hops = 0;
    while (cur && hops++ < RAIL_REACHABILITY_MAX_HOPS) {
      if (cur === stage) return true;
      cur = cur.parent;
    }
    return false;
  };

  const periodicMaintenance = () => {
    if (!running || !rail || rail.destroyed) return;
    if (!isReachableFromLiveStage(rail)) {
      console.warn("[PixiBell] rail orphaned from the live stage (no destroyed event fired), resetting");
      railSearch.reset();
      return;
    }
    // Re-sync even when the rail looks healthy: the bell can be missing (the
    // Text constructor was not captured yet, or a sync error removed it) and
    // the art can have loaded since.
    sync();
  };
  const maintenanceIntervalId = (pageWindow as any).setInterval(periodicMaintenance, MAINTENANCE_MS);

  const onWindowResize = () => {
    if (!running || !rail || rail.destroyed) return;
    sync();
  };
  (pageWindow as any).addEventListener("resize", onWindowResize);

  return {
    stop() {
      if (!running) return;
      running = false;
      railSearch.stop();
      (pageWindow as any).clearInterval(maintenanceIntervalId);
      (pageWindow as any).removeEventListener("resize", onWindowResize);
      if (canvasListenersAttached) {
        try {
          (pageWindow as any).removeEventListener("pointerdown", onWindowPointerDownCapture, true);
          if (canvasEl) {
            canvasEl.removeEventListener("pointermove", onCanvasPointerMove);
            canvasEl.removeEventListener("pointerleave", onCanvasPointerLeave);
            if (weSetPointerCursor) canvasEl.style.cursor = "";
          }
        } catch {}
      }
      removeView();
      rail = null;
    },

    getScreenRect(): ScreenRect | null {
      return computeScreenRect();
    },

    setWiggle(active: boolean) {
      ringing = active;
      view?.setRinging(active);
    },

    setCount(value: number) {
      count = value;
      view?.setCount(value);
    },

    drawsOwnBadge(): boolean {
      return !!view?.hasGameBadge;
    },
  };
}
