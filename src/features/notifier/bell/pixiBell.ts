// The notification bell drawn as an extra slot on the game's own
// `RightSideRail`, the vertical icon rail (Chat, Leaderboard, Stats...). The
// rail used to be a DOM toolbar the bell was cloned into; the game moved it to
// native Pixi rendering, so the bell now lives in the Pixi scene graph. The
// badge, panel and sounds stay plain DOM and anchor on `getScreenRect()`.
import { getStage, findByLabel, watchStageNode } from "../../../game/pixi/stageSearch";
import { getReadySpriteState } from "../../../game/sprites/context";
import { pageWindow, shareGlobal } from "../../../platform/pageContext";
import { BELL_GLYPH, BELL_RING_DURATION_MS, bellRingAngleAt, type BellController, type ScreenRect } from "./ring";

const RAIL_LABEL = "RightSideRail";
// After a renderer rebuild (a WebGL context lost while the tab sat in the
// background) the rail's "destroyed" event tells the bell to search again,
// but only if the game calls `.destroy()` on the old tree rather than leaving
// it to the garbage collector. When it does not, `rail` stays a stale
// reference and the bell never comes back, so this periodic check verifies
// the rail is still reachable from the live stage.
const RAIL_REACHABILITY_CHECK_MS = 2000;
const RAIL_REACHABILITY_MAX_HOPS = 64;
// The rail's slots carry no label of their own, but only the Chat slot has
// this unread-badge child, which identifies it. The bell anchors right under
// Chat: anchoring on the rail's last child made it hop down every time one of
// the conditional icons (friend bonus, weather status...) streamed in.
const CHAT_SLOT_MARKER_LABEL = "RightSideRailChatBadge";

const DEFAULT_SLOT_SIZE = 45;
const DEFAULT_SLOT_SPACING = 52;
// A candidate slot counts as taken when an existing icon sits within half a
// slot of it: loose enough to absorb sub-pixel jitter, tight enough not to
// skip a free slot.
const SLOT_OCCUPIED_TOLERANCE_RATIO = 0.5;
const MAX_SLOT_SEARCH_STEPS = 20;

export interface PixiBellOptions {
  onClick: () => void;
}

interface PixiBellDebugState {
  attached: boolean;
  findAttempts: number;
  hasButton: boolean;
  lastError: string | null;
  /** Rail-local Y the bell was last placed at. */
  slotY: number | null;
  /** CSS px per stage unit: 1 unless the canvas is CSS-scaled (zoom, DPR). */
  screenScaleX: number | null;
  screenScaleY: number | null;
}

export function startPixiBell(opts: PixiBellOptions): BellController {
  let running = true;
  let rail: any = null;
  let bellContainer: any = null;
  let bellText: any = null;
  let lastSize = DEFAULT_SLOT_SIZE;

  let wiggleActive = false;
  let wiggleRafId: number | null = null;
  let wiggleT = 0;
  let wiggleLastFrameAt: number | null = null;

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
    slotY: null,
    screenScaleX: null,
    screenScaleY: null,
  };
  shareGlobal("__MG_NOTIFICATION_BELL_PIXI_DEBUG__", debugState);

  const raf: (cb: (t: number) => void) => number = (pageWindow as any).requestAnimationFrame.bind(pageWindow);
  const cancelRaf: (id: number) => void = (pageWindow as any).cancelAnimationFrame.bind(pageWindow);

  const forgetButtonRefs = () => {
    bellContainer = null;
    bellText = null;
    debugState.hasButton = false;
  };

  const removeButton = () => {
    if (bellContainer) {
      try { bellContainer.destroy({ children: true }); } catch {}
    }
    forgetButtonRefs();
  };

  const onClick = () => {
    try { opts.onClick(); } catch (error) {
      console.error("[PixiBell] onClick error:", error);
    }
  };

  // The bell's on-screen box in page (client) coordinates, for the overlay's
  // badge and panel and for the hit-test below.
  //
  // `toGlobal` yields stage units, which equal CSS pixels only when the
  // canvas is displayed at exactly `renderer.screen` size. Windows display
  // scaling, browser zoom and Discord's Activity iframe all CSS-scale the
  // canvas, and without the ratio below the badge, the panel and the
  // hit-test drift proportionally.
  const computeScreenRect = (): ScreenRect | null => {
    if (!bellContainer || bellContainer.destroyed) return null;
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
      const topLeft = bellContainer.toGlobal({ x: 0, y: 0 });
      const bottomRight = bellContainer.toGlobal({ x: lastSize, y: lastSize });
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

  const hitTestButton = (clientX: number, clientY: number): boolean => {
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
    if (!hitTestButton(ev.clientX, ev.clientY)) return;
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    ev.preventDefault();
    onClick();
  };

  const onCanvasPointerMove = (ev: PointerEvent) => {
    if (!canvasEl) return;
    const isHovering = hitTestButton(ev.clientX, ev.clientY);
    if (isHovering && !weSetPointerCursor) {
      canvasEl.style.cursor = "pointer";
      weSetPointerCursor = true;
    } else if (!isHovering && weSetPointerCursor) {
      canvasEl.style.cursor = "";
      weSetPointerCursor = false;
    }
  };

  const onCanvasPointerLeave = () => {
    if (weSetPointerCursor && canvasEl) {
      canvasEl.style.cursor = "";
      weSetPointerCursor = false;
    }
  };

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

  const findChatSlot = (): any | null => {
    if (!Array.isArray(rail?.children)) return null;
    for (const child of rail.children) {
      if (child === bellContainer) continue;
      if (findByLabel(child, CHAT_SLOT_MARKER_LABEL)) return child;
    }
    return null;
  };

  // Converts the visible screen's vertical extent into the rail's local
  // coordinate space, so a candidate slot can be checked against the actual
  // viewport. Null when the renderer's screen size isn't readable.
  const railLocalScreenBounds = (): { top: number; bottom: number } | null => {
    const state = getReadySpriteState();
    const screenHeight = Number(state?.renderer?.screen?.height);
    if (!Number.isFinite(screenHeight) || screenHeight <= 0) return null;
    try {
      const top = rail.toLocal({ x: 0, y: 0 }).y;
      const bottom = rail.toLocal({ x: 0, y: screenHeight }).y;
      return { top, bottom };
    } catch {
      return null;
    }
  };

  // Reads the real spacing/size of the rail's existing icons instead of
  // hardcoding them, so this keeps working if the game changes the rail's
  // slot size in a future build.
  const computeSlot = (): { size: number; nextY: number } => {
    const siblings: any[] = Array.isArray(rail?.children)
      ? rail.children.filter((c: any) => c !== bellContainer)
      : [];
    let size = DEFAULT_SLOT_SIZE;
    const railWidth = Number(rail?.width);
    if (Number.isFinite(railWidth) && railWidth > 0) size = railWidth;

    const ys = siblings.map((c: any) => Number(c?.y) || 0).sort((a, b) => a - b);
    let spacing = DEFAULT_SLOT_SPACING;
    if (ys.length >= 2) {
      const diffs: number[] = [];
      for (let i = 1; i < ys.length; i++) diffs.push(ys[i] - ys[i - 1]);
      diffs.sort((a, b) => a - b);
      const median = diffs[Math.floor(diffs.length / 2)];
      if (Number.isFinite(median) && median > 0) spacing = median;
    }

    const isSlotOccupied = (y: number): boolean =>
      ys.some((siblingY) => Math.abs(siblingY - y) < spacing * SLOT_OCCUPIED_TOLERANCE_RATIO);

    // Before Chat loads into the rail, anchor after whatever is there; the
    // next resync (childAdded, childRemoved) re-anchors on Chat.
    const chatSlot = findChatSlot();
    const anchorY = chatSlot
      ? (Number(chatSlot.y) || 0)
      : (ys.length ? ys[ys.length - 1] : -spacing);

    // The game parks its conditional icons (friend bonus, weather status...)
    // right below Chat too, so walk down to the first free slot rather than
    // stack the bell on one of them.
    let nextY = anchorY + spacing;
    for (let step = 0; step < MAX_SLOT_SEARCH_STEPS && isSlotOccupied(nextY); step++) {
      nextY += spacing;
    }

    // On short screens (small laptop windows, browser zoom, Discord
    // Activity) the first free slot below the rail can land outside the
    // viewport, which reads as "the bell just isn't there". Fall back to
    // the free space above the rail's topmost icon, and as a last resort
    // clamp inside the screen even if that overlaps an existing icon.
    const bounds = railLocalScreenBounds();
    if (bounds && nextY + size > bounds.bottom) {
      const aboveTopmost = (ys.length ? ys[0] : nextY) - spacing;
      nextY = aboveTopmost >= bounds.top
        ? aboveTopmost
        : Math.max(bounds.top, bounds.bottom - size);
    }

    return { size, nextY };
  };

  const syncGeometry = () => {
    const { size, nextY } = computeSlot();
    lastSize = size;
    debugState.slotY = nextY;
    bellContainer.position.set(0, nextY);
    if (bellText) {
      bellText.style.fontSize = Math.round(size * 0.6);
      // Anchor at top center so the ring animation swings the bell around
      // its mounting point, matching the floating DOM bell.
      if (typeof bellText.anchor?.set === "function") bellText.anchor.set(0.5, 0);
      const textHeight = Number(bellText.height) || size * 0.6;
      bellText.position.set(size / 2, Math.max(0, (size - textHeight) / 2));
    }
  };

  const syncUnsafe = () => {
    if (!running || !rail || rail.destroyed) {
      removeButton();
      return;
    }
    const state = getReadySpriteState();
    if (!state?.ctors?.Text) return;

    if (!bellContainer) {
      const ContainerCtor = state.ctors.Container ?? rail.constructor;
      bellContainer = new ContainerCtor();
      bellContainer.label = "GeminiNotificationBell";
      const thisContainer = bellContainer;
      // The game can rebuild the rail's subtree without notice: drop the
      // stale reference rather than crash on it later.
      thisContainer.once("destroyed", () => {
        if (bellContainer === thisContainer) forgetButtonRefs();
      });
      rail.addChild(bellContainer);
    }

    if (!bellText) {
      bellText = new state.ctors.Text({ text: BELL_GLYPH, style: { fontSize: DEFAULT_SLOT_SIZE } });
      bellContainer.addChild(bellText);
    }

    ensureCanvasListeners(state);
    syncGeometry();
    debugState.hasButton = true;
  };

  const sync = () => {
    try {
      syncUnsafe();
      debugState.lastError = null;
    } catch (error) {
      debugState.lastError = String((error as Error)?.message ?? error);
      console.warn("[PixiBell] sync failed, clearing button", error);
      try { removeButton(); } catch {}
    }
  };

  const onRailChildrenChanged = () => sync();

  const railSearch = watchStageNode({
    label: RAIL_LABEL,
    logTag: "[PixiBell]",
    onFound(node) {
      rail = node;
      rail.on("childAdded", onRailChildrenChanged);
      rail.on("childRemoved", onRailChildrenChanged);
      debugState.attached = true;
      sync();
    },
    onLost() {
      rail = null;
      debugState.attached = false;
      removeButton();
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

  const periodicRailMaintenance = () => {
    if (!running || !rail || rail.destroyed) return;
    if (!isReachableFromLiveStage(rail)) {
      console.warn("[PixiBell] rail orphaned from the live stage (no destroyed event fired), resetting");
      railSearch.reset();
      return;
    }
    // Re-sync even when the rail looks healthy. The button can be missing
    // (the Text constructor was not captured yet at attach time, or a sync
    // error removed it), and childAdded/childRemoved never fire again on a
    // complete rail, so without this the bell would stay away for good. It
    // also re-runs the slot geometry after resizes and late icons.
    sync();
  };
  const maintenanceIntervalId = (pageWindow as any).setInterval(periodicRailMaintenance, RAIL_REACHABILITY_CHECK_MS);

  const onWindowResize = () => {
    if (!running || !rail || rail.destroyed) return;
    sync();
  };
  (pageWindow as any).addEventListener("resize", onWindowResize);

  const stopWiggleAnimation = () => {
    if (wiggleRafId != null) { cancelRaf(wiggleRafId); wiggleRafId = null; }
    wiggleLastFrameAt = null;
    if (bellText && !bellText.destroyed) bellText.rotation = 0;
  };

  const wiggleTick = (time: number) => {
    wiggleRafId = null;
    if (!wiggleActive || !bellText || bellText.destroyed) {
      stopWiggleAnimation();
      return;
    }
    if (wiggleLastFrameAt == null) wiggleLastFrameAt = time;
    const dt = time - wiggleLastFrameAt;
    wiggleLastFrameAt = time;
    wiggleT += dt;
    const cycleOffset = (wiggleT % BELL_RING_DURATION_MS) / BELL_RING_DURATION_MS;
    bellText.rotation = bellRingAngleAt(cycleOffset);
    wiggleRafId = raf(wiggleTick);
  };

  return {
    stop() {
      if (!running) return;
      running = false;
      railSearch.stop();
      (pageWindow as any).clearInterval(maintenanceIntervalId);
      (pageWindow as any).removeEventListener("resize", onWindowResize);
      stopWiggleAnimation();
      if (rail) {
        try {
          rail.off("childAdded", onRailChildrenChanged);
          rail.off("childRemoved", onRailChildrenChanged);
        } catch {}
      }
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
      removeButton();
      rail = null;
    },

    getScreenRect(): ScreenRect | null {
      return computeScreenRect();
    },

    setWiggle(active: boolean) {
      if (wiggleActive === active) return;
      wiggleActive = active;
      if (active) {
        wiggleT = 0;
        wiggleLastFrameAt = null;
        if (wiggleRafId == null) wiggleRafId = raf(wiggleTick);
      } else {
        stopWiggleAnimation();
      }
    },
  };
}
