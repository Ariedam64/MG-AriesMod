// Floating, draggable DOM variant of the notification bell.
// The default bell lives inside the game's Pixi RightSideRail
// (notificationBellPixi.ts), which keeps breaking for a subset of players
// (rail layout variants, short screens, scaled canvases). This widget is the
// opt-in escape hatch: a plain fixed-position DOM button, same pattern as
// instantFeedWidget.ts, that cannot be affected by the game's Pixi tree at
// all — so it always shows up.
//
// It implements the same controller surface as the Pixi bell
// (stop / getScreenRect / setWiggle), so notificationOverlay.ts can swap
// between the two implementations without caring which one is active.
import {
  BELL_RING_DURATION_MS,
  BELL_RING_SEQUENCE,
  type ScreenRect,
} from "./notificationBellPixi";
import { readAriesPath, writeAriesPath } from "./localStorage";

// Stored under the `notifier` section: it's one of the top-level sections
// coerceLegacyAggregate (localStorage.ts) preserves when reloading the
// aries_mod blob — an unknown top-level key would be silently dropped on
// the next session, losing the toggle and the saved position.
const ENABLED_PATH = "notifier.floatingBell.enabled";
const POS_PATH = "notifier.floatingBell.pos";

/** Fired on `window` whenever the floating-bell setting is toggled. */
export const BELL_MODE_EVENT = "qws:alerts-bell-mode-changed";

const BELL_GLYPH = "\u{1F514}"; // 🔔
const BUTTON_SIZE = 44;
const ICON_FONT_SIZE = 24;
// Exported so the overlay can stack the DOM badge/panel above the widget
// when floating mode is active (they live in a separate fixed-position
// stacking context).
export const BELL_WIDGET_Z_INDEX = 1_999_900; // above game UI, below HUD windows (2_000_000+)
const SCREEN_MARGIN = 8;
// Default spot: right edge, roughly a third down — near where the game's
// own icon rail sits, without assuming anything about it.
const DEFAULT_RIGHT_GAP = 16;
const DEFAULT_TOP_RATIO = 0.35;
// Pointer travel below this stays a click; beyond it the gesture is a drag
// and releasing does not open the panel.
const DRAG_THRESHOLD_PX = 4;

// Same "bell ring" motion as the Pixi bell — the sequence lives in
// notificationBellPixi.ts and is rendered here through the Web Animations
// API instead of a rAF loop.
const RING_KEYFRAMES: Keyframe[] = BELL_RING_SEQUENCE.map(({ offset, deg }) => ({
  transform: `rotate(${deg}deg)`,
  offset,
}));

type WidgetPosition = { left: number; top: number };

export interface NotificationBellFloatingOptions {
  onClick: () => void;
  /** Called whenever the widget moves (drag, viewport clamp). */
  onMoved?: () => void;
}

export interface NotificationBellFloatingController {
  stop(): void;
  getScreenRect(): ScreenRect | null;
  setWiggle(active: boolean): void;
}

export function isFloatingBellEnabled(): boolean {
  return readAriesPath<boolean>(ENABLED_PATH, false) === true;
}

export function setFloatingBellEnabled(value: boolean): void {
  writeAriesPath(ENABLED_PATH, value);
  try {
    window.dispatchEvent(new CustomEvent(BELL_MODE_EVENT, { detail: { floating: value } }));
  } catch {}
}

function readSavedPosition(): WidgetPosition | null {
  const raw = readAriesPath<unknown>(POS_PATH);
  if (!raw || typeof raw !== "object") return null;
  const left = Number((raw as Record<string, unknown>).left);
  const top = Number((raw as Record<string, unknown>).top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left, top };
}

function persistPosition(pos: WidgetPosition): void {
  writeAriesPath(POS_PATH, { left: Math.round(pos.left), top: Math.round(pos.top) });
}

function clampCoord(value: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function startNotificationBellFloating(
  opts: NotificationBellFloatingOptions,
): NotificationBellFloatingController {
  let running = true;
  let wiggleAnimation: Animation | null = null;

  const button = document.createElement("button");
  button.type = "button";
  button.setAttribute("data-notification-bell-widget", "1");
  button.title = "Notifications";
  button.setAttribute("aria-label", "Notifications");
  Object.assign(button.style, {
    position: "fixed",
    left: "-9999px",
    top: "-9999px",
    width: `${BUTTON_SIZE}px`,
    height: `${BUTTON_SIZE}px`,
    zIndex: String(BELL_WIDGET_Z_INDEX),
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "0",
    borderRadius: "50%",
    border: "1px solid #32404e",
    background: "linear-gradient(180deg, #111923, #0b131c)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
    cursor: "grab",
    userSelect: "none",
    touchAction: "none",
  } as CSSStyleDeclaration);

  const icon = document.createElement("span");
  icon.textContent = BELL_GLYPH;
  Object.assign(icon.style, {
    fontSize: `${ICON_FONT_SIZE}px`,
    lineHeight: "1",
    pointerEvents: "none",
    display: "inline-block",
    // Swing around the bell's mounting point (top center), not its middle.
    transformOrigin: "50% 0%",
  } as CSSStyleDeclaration);
  button.appendChild(icon);

  const applyPosition = (left: number, top: number): WidgetPosition => {
    const boundedLeft = clampCoord(left, SCREEN_MARGIN, window.innerWidth - BUTTON_SIZE - SCREEN_MARGIN);
    const boundedTop = clampCoord(top, SCREEN_MARGIN, window.innerHeight - BUTTON_SIZE - SCREEN_MARGIN);
    button.style.left = `${Math.round(boundedLeft)}px`;
    button.style.top = `${Math.round(boundedTop)}px`;
    try { opts.onMoved?.(); } catch {}
    return { left: boundedLeft, top: boundedTop };
  };

  const applyInitialPosition = () => {
    const saved = readSavedPosition();
    if (saved) {
      applyPosition(saved.left, saved.top);
      return;
    }
    applyPosition(
      window.innerWidth - BUTTON_SIZE - DEFAULT_RIGHT_GAP,
      window.innerHeight * DEFAULT_TOP_RATIO,
    );
  };

  const clampIntoViewport = () => {
    const rect = button.getBoundingClientRect();
    applyPosition(rect.left, rect.top);
  };

  const onWindowResize = () => {
    if (!running) return;
    clampIntoViewport();
  };

  // Drag to move; a press that never travels past the threshold is a click.
  let dragState: {
    pointerId: number;
    startX: number;
    startY: number;
    baseLeft: number;
    baseTop: number;
    lastPos: WidgetPosition;
    dragged: boolean;
  } | null = null;

  const onDragMove = (ev: PointerEvent) => {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    const dx = ev.clientX - dragState.startX;
    const dy = ev.clientY - dragState.startY;
    if (!dragState.dragged && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragState.dragged = true;
    dragState.lastPos = applyPosition(dragState.baseLeft + dx, dragState.baseTop + dy);
  };

  const stopDrag = (ev?: PointerEvent) => {
    if (!dragState) return;
    if (ev && ev.pointerId !== dragState.pointerId) return;
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", stopDrag);
    document.removeEventListener("pointercancel", stopDrag);
    try { button.releasePointerCapture(dragState.pointerId); } catch {}
    const wasDrag = dragState.dragged;
    if (wasDrag) persistPosition(dragState.lastPos);
    dragState = null;
    button.style.cursor = "grab";
    if (!wasDrag && ev?.type === "pointerup") {
      try { opts.onClick(); } catch (error) {
        console.error("[notificationBellFloating] onClick error:", error);
      }
    }
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    if (dragState) stopDrag();
    const rect = button.getBoundingClientRect();
    dragState = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      baseLeft: rect.left,
      baseTop: rect.top,
      lastPos: { left: rect.left, top: rect.top },
      dragged: false,
    };
    try { button.setPointerCapture(ev.pointerId); } catch {}
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", stopDrag);
    document.addEventListener("pointercancel", stopDrag);
    button.style.cursor = "grabbing";
    ev.preventDefault();
    ev.stopPropagation();
  };

  button.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("resize", onWindowResize);
  document.body.appendChild(button);
  applyInitialPosition();

  const stopWiggle = () => {
    if (wiggleAnimation) {
      try { wiggleAnimation.cancel(); } catch {}
      wiggleAnimation = null;
    }
  };

  return {
    stop() {
      if (!running) return;
      running = false;
      stopDrag();
      stopWiggle();
      window.removeEventListener("resize", onWindowResize);
      button.removeEventListener("pointerdown", onPointerDown);
      try { button.remove(); } catch {}
    },

    getScreenRect(): ScreenRect | null {
      if (!running || !button.isConnected) return null;
      const rect = button.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    },

    setWiggle(active: boolean) {
      if (!running) return;
      if (!active) {
        stopWiggle();
        return;
      }
      if (wiggleAnimation) return;
      if (typeof icon.animate !== "function") return;
      wiggleAnimation = icon.animate(RING_KEYFRAMES, {
        duration: BELL_RING_DURATION_MS,
        iterations: Infinity,
      });
    },
  };
}
