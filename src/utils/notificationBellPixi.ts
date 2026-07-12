// notificationBellPixi.ts
// Adds a Pixi-rendered "Notifications" bell as an extra slot on the game's
// own `RightSideRail` (the vertical icon rail — Chat, Leaderboard, Stats,
// etc.). That whole rail used to be a real DOM toolbar (buttons with
// aria-labels), which is what the old `startInjectGamePanelButton` cloned
// into. A recent game build moved it entirely to native Pixi rendering
// (same migration that moved the garden info card and action prompts to
// Pixi), so there's no DOM button left to anchor next to anymore — this
// button lives directly in the Pixi scene graph instead.
//
// The rest of the notifier UI (badge, panel, sounds) stays plain DOM; only
// the anchor point moves from `document.querySelector('button[...]')` to
// this controller's `getScreenRect()`.
import { getSpriteState, getStage, findAcrossBranches, findByLabel } from "./gardenInfoCardPixi";
import { pageWindow, shareGlobal } from "./page-context";

const RAIL_LABEL = "RightSideRail";
const RAIL_FIND_RETRY_MS = 1000;
const RAIL_FIND_LOG_EVERY = 30;
// Recovery from a renderer rebuild (e.g. WebGL context loss after the tab
// is backgrounded a while) normally relies on the rail's `"destroyed"`
// event to know to re-search — but that only fires if the game actually
// calls `.destroy()` on the old tree instead of just abandoning it for GC.
// If it doesn't, `rail` stays a stale-but-non-destroyed reference forever
// and the bell never comes back. This periodic check catches that case by
// verifying `rail` is still actually reachable from the *current* live
// stage, independent of whether `.destroy()` ever fired.
const RAIL_REACHABILITY_CHECK_MS = 2000;
const RAIL_REACHABILITY_MAX_HOPS = 64;
// The rail's icon slots aren't individually labeled, so there's no direct
// way to say "the Chat slot" by name — but only the Chat slot carries this
// unread-badge child, which makes it identifiable. Anchoring on it directly
// (rather than "whatever's currently the rail's last child") matters
// because the rail's other icons (friend bonus, weather status, ...) load
// in asynchronously and conditionally: anchoring on "last child" made the
// bell hop further down the rail every time a new icon streamed in after
// it, instead of staying put right under Chat.
const CHAT_SLOT_MARKER_LABEL = "RightSideRailChatBadge";

const DEFAULT_ICON_GLYPH = "\u{1F514}"; // 🔔
const DEFAULT_SLOT_SIZE = 45;
const DEFAULT_SLOT_SPACING = 52;
// A candidate slot counts as taken when an existing icon sits within half a
// slot of it — loose enough to absorb sub-pixel layout jitter, tight enough
// not to skip genuinely free slots.
const SLOT_OCCUPIED_TOLERANCE_RATIO = 0.5;
const MAX_SLOT_SEARCH_STEPS = 20;

// Classic "bell ring" motion, shared with the floating DOM bell
// (notificationBellFloating.ts): a burst of fast, decaying swings around
// the bell's mounting point over the first half of the cycle, then a rest
// until the next ring — reads as a bell actually ringing rather than a
// slow metronome sway. Offsets are fractions of one cycle.
export const BELL_RING_SEQUENCE: ReadonlyArray<{ offset: number; deg: number }> = [
  { offset: 0, deg: 0 },
  { offset: 0.05, deg: 15 },
  { offset: 0.1, deg: -13 },
  { offset: 0.15, deg: 11 },
  { offset: 0.2, deg: -9 },
  { offset: 0.25, deg: 7 },
  { offset: 0.3, deg: -5 },
  { offset: 0.35, deg: 3 },
  { offset: 0.4, deg: -2 },
  { offset: 0.45, deg: 1 },
  { offset: 0.5, deg: 0 },
  { offset: 1, deg: 0 },
];
export const BELL_RING_DURATION_MS = 1600;

const DEG_TO_RAD = Math.PI / 180;

/** Ring angle (radians) at a given position in the cycle (0..1), linearly
 * interpolated between the sequence's keyframes. */
export function bellRingAngleAt(cycleOffset: number): number {
  for (let i = 1; i < BELL_RING_SEQUENCE.length; i++) {
    const next = BELL_RING_SEQUENCE[i];
    if (cycleOffset > next.offset) continue;
    const prev = BELL_RING_SEQUENCE[i - 1];
    const span = next.offset - prev.offset;
    const ratio = span > 0 ? (cycleOffset - prev.offset) / span : 0;
    return (prev.deg + (next.deg - prev.deg) * ratio) * DEG_TO_RAD;
  }
  return 0;
}

export interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface NotificationBellPixiOptions {
  onClick: () => void;
  /** Glyph drawn as the icon. Defaults to a bell emoji. */
  iconGlyph?: string;
}

export interface NotificationBellPixiController {
  stop(): void;
  /** Current on-screen bounding box of the bell, in page (client) coordinates. */
  getScreenRect(): ScreenRect | null;
  setWiggle(active: boolean): void;
}

interface NotificationBellPixiDebugState {
  attached: boolean;
  findAttempts: number;
  hasButton: boolean;
  lastError: string | null;
  /** Rail-local Y the bell was last placed at. */
  slotY: number | null;
  /** CSS px per stage unit — 1 unless the canvas is CSS-scaled (zoom/DPR). */
  screenScaleX: number | null;
  screenScaleY: number | null;
}

export function startNotificationBellPixi(opts: NotificationBellPixiOptions): NotificationBellPixiController {
  const iconGlyph = opts.iconGlyph ?? DEFAULT_ICON_GLYPH;

  let running = true;
  let rail: any = null;
  let bellContainer: any = null;
  let bellText: any = null;
  let lastSize = DEFAULT_SLOT_SIZE;

  let findAttempts = 0;
  let findRafId: number | null = null;
  let lastFindCheckAt = 0;

  let wiggleActive = false;
  let wiggleRafId: number | null = null;
  let wiggleT = 0;
  let wiggleLastFrameAt: number | null = null;

  // Pixi's own EventSystem never dispatches real clicks to anything we add
  // to this game's tree (confirmed the same way sellAllPetsPixi.ts did:
  // even `stage.on('pointerdown', ...)` never fires despite native canvas
  // pointerdown firing) — so clicks are hit-tested directly from a native
  // DOM listener on the canvas instead of relying on `eventMode`.
  let canvasEl: any = null;
  let canvasListenersAttached = false;
  let weSetPointerCursor = false;

  const debugState: NotificationBellPixiDebugState = {
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
      console.error("[notificationBellPixi] onClick error:", error);
    }
  };

  // Computes the bell's current on-screen box in page (client) coordinates.
  // Shared by the public `getScreenRect()` (used by notificationOverlay.ts
  // to place the badge/panel) and the native hit-test below.
  //
  // `toGlobal` yields stage/screen units, which only equal CSS pixels when
  // the canvas is displayed at exactly `renderer.screen` size. That doesn't
  // hold under Windows display scaling, browser zoom, or Discord's Activity
  // iframe, where the canvas gets CSS-scaled — without the ratio below the
  // DOM badge/panel and the click hit-test drift proportionally (the same
  // mismatch pointerToTile in tileObjectSystemApi.ts corrects, in the other
  // direction).
  const computeScreenRect = (): ScreenRect | null => {
    if (!bellContainer || bellContainer.destroyed) return null;
    const state = getSpriteState();
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

  // Capture-phase, on `window` rather than a bubble listener on the canvas:
  // the game's own pointerdown handler (movement) is already attached
  // directly on the canvas by the time we get here, so a bubble listener on
  // that same element runs too late to stop it — same-element listeners
  // fire in registration order regardless of the capture flag. A capturing
  // listener higher up the tree runs before the event ever reaches the
  // canvas, so `stopPropagation` here actually prevents the game from
  // seeing the click (which was moving the character under the bell).
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
    const state = getSpriteState();
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

    // Chat hasn't loaded into the rail yet — anchor after whatever exists so
    // far; the next resync (rail's childAdded/childRemoved) re-anchors on
    // Chat as soon as it appears.
    const chatSlot = findChatSlot();
    const anchorY = chatSlot
      ? (Number(chatSlot.y) || 0)
      : (ys.length ? ys[ys.length - 1] : -spacing);

    // The game parks its own conditional icons (friend bonus, weather
    // status, ...) right below Chat too, so `chat.y + spacing` is already
    // taken for some players — walk down to the first genuinely free slot
    // instead of stacking the bell on top of whatever loaded there.
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
    const state = getSpriteState();
    if (!state?.ctors?.Text) return;

    if (!bellContainer) {
      const ContainerCtor = state.ctors.Container ?? rail.constructor;
      bellContainer = new ContainerCtor();
      bellContainer.label = "GeminiNotificationBell";
      const thisContainer = bellContainer;
      // Mirrors sellAllPetsPixi.ts: the game can destroy/rebuild the rail's
      // whole subtree without telling us — drop our stale reference instead
      // of crashing the next time we touch it.
      thisContainer.once("destroyed", () => {
        if (bellContainer === thisContainer) forgetButtonRefs();
      });
      rail.addChild(bellContainer);
    }

    if (!bellText) {
      bellText = new state.ctors.Text({ text: iconGlyph, style: { fontSize: DEFAULT_SLOT_SIZE } });
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
      console.warn("[notificationBellPixi] sync failed, clearing button", error);
      try { removeButton(); } catch {}
    }
  };

  const onRailChildrenChanged = () => sync();

  const restartSearchIfNeeded = () => {
    if (!running || rail) return;
    tryFindRail();
    if (!rail && findRafId == null) findRafId = raf(scheduleFind);
  };

  const attachToRail = (node: any) => {
    rail = node;
    rail.on("childAdded", onRailChildrenChanged);
    rail.on("childRemoved", onRailChildrenChanged);
    rail.once("destroyed", () => {
      if (rail === node) {
        rail = null;
        debugState.attached = false;
        removeButton();
        restartSearchIfNeeded();
      }
    });
    debugState.attached = true;
    console.info(`[notificationBellPixi] attached to ${RAIL_LABEL} after ${findAttempts} attempt(s)`);
    sync();
  };

  const tryFindRail = () => {
    if (!running || rail) return;
    const state = getSpriteState();
    if (!state) return;
    const stage = getStage(state);
    const found = findAcrossBranches(stage, (node: any) => node?.label === RAIL_LABEL);
    if (found) {
      attachToRail(found);
      return;
    }
    findAttempts += 1;
    debugState.findAttempts = findAttempts;
    if (findAttempts % RAIL_FIND_LOG_EVERY === 0) {
      console.info(`[notificationBellPixi] still searching for ${RAIL_LABEL} (${findAttempts} attempts so far)`);
    }
  };

  const scheduleFind = (now: number) => {
    findRafId = null;
    if (!running || rail) return;
    if (now - lastFindCheckAt >= RAIL_FIND_RETRY_MS) {
      lastFindCheckAt = now;
      tryFindRail();
    }
    if (!running || rail) return;
    findRafId = raf(scheduleFind);
  };

  const isReachableFromLiveStage = (node: any): boolean => {
    const state = getSpriteState();
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
      console.warn("[notificationBellPixi] rail orphaned from the live stage (no destroyed event fired), resetting");
      rail = null;
      debugState.attached = false;
      removeButton();
      restartSearchIfNeeded();
      return;
    }
    // Re-sync even when the rail looks healthy: the button can be
    // legitimately missing here (sync bailed because the Text ctor wasn't
    // captured yet at attach time, or a transient sync error removed it),
    // and `childAdded`/`childRemoved` never refire on an already-complete
    // rail — without this retry the bell would stay absent forever. It also
    // re-runs the slot geometry, so the bell follows the rail's layout
    // after window resizes or late-loading conditional icons.
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

  tryFindRail();
  if (!rail) findRafId = raf(scheduleFind);

  return {
    stop() {
      if (!running) return;
      running = false;
      if (findRafId != null) { cancelRaf(findRafId); findRafId = null; }
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
