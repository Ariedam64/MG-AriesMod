// The floating, draggable notification bell. The default bell lives in the
// game's Pixi RightSideRail, which breaks for some players (rail layout
// variants, short screens, scaled canvases). This opt-in widget is a plain
// fixed-position DOM button the game's Pixi tree cannot affect, so it always
// shows up. It offers the same controller as the Pixi bell, so the overlay
// swaps between the two without caring which one is active.
import { BELL_GLYPH, BELL_RING_DURATION_MS, BELL_RING_SEQUENCE, type BellController, type ScreenRect } from "./ring";
import { readAriesPath, writeAriesPath } from "../../../platform/storage";
import { h } from "../../../ui/kit/dom";
import { makeDraggable, placeInViewport, readStoredPosition, storePosition, type ScreenPosition } from "../../../ui/kit/floating";

// Stored under the `notifier` section, one of the top-level sections the
// storage keeps when it reloads the aries_mod blob: an unknown top-level key
// would be dropped on the next session, losing the toggle and the position.
const ENABLED_PATH = "notifier.floatingBell.enabled";
const POS_PATH = "notifier.floatingBell.pos";

/** Fired on `window` whenever the floating-bell setting is toggled. */
export const BELL_MODE_EVENT = "qws:alerts-bell-mode-changed";

const BUTTON_SIZE = 44;
const ICON_FONT_SIZE = 24;
/** Above the game's UI, below the HUD windows. The overlay stacks its badge just above it. */
export const BELL_WIDGET_Z_INDEX = 1_999_900;
const SCREEN_MARGIN = 8;
// Default spot: right edge, a third of the way down, near where the game's
// own icon rail sits, without assuming anything about it.
const DEFAULT_RIGHT_GAP = 16;
const DEFAULT_TOP_RATIO = 0.35;
// When (ms after mounting) the wanted position is applied again, while the
// window reaches its final size.
const SETTLE_REAPPLY_DELAYS_MS = [0, 250, 1000];
// Pointer travel below this stays a click; beyond it the gesture is a drag
// and releasing does not open the panel.
const DRAG_THRESHOLD_PX = 4;

// The same ring as the Pixi bell, played through the Web Animations API.
const RING_KEYFRAMES: Keyframe[] = BELL_RING_SEQUENCE.map(({ offset, deg }) => ({
  transform: `rotate(${deg}deg)`,
  offset,
}));

export interface FloatingBellOptions {
  onClick: () => void;
  /** Called whenever the widget moves (drag, viewport clamp). */
  onMoved?: () => void;
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

export function startFloatingBell(opts: FloatingBellOptions): BellController {
  let running = true;
  let wiggleAnimation: Animation | null = null;

  const button = h("button");
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
    border: "1px solid var(--qmm-border-strong)",
    background: "var(--qmm-gradient-panel)",
    boxShadow: "var(--qmm-shadow-window)",
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

  const applyPosition = (pos: ScreenPosition): ScreenPosition => {
    const placed = placeInViewport(button, pos, { width: BUTTON_SIZE, height: BUTTON_SIZE }, SCREEN_MARGIN);
    try { opts.onMoved?.(); } catch {}
    return placed;
  };

  const defaultPosition = (): ScreenPosition => ({
    left: window.innerWidth - BUTTON_SIZE - DEFAULT_RIGHT_GAP,
    top: window.innerHeight * DEFAULT_TOP_RATIO,
  });

  // The position the player chose, kept unclamped: clamping is for display
  // only. Otherwise a provisional viewport (a Discord iframe not resized yet,
  // the game canvas still settling) would overwrite the restored position
  // with its shrunk version, and nothing would find it again.
  let desiredPosition: ScreenPosition | null = null;
  // Until the player moves the bell, the default is recomputed on every
  // viewport change, since it depends on the window size too.
  let usingDefaultPosition = true;

  const applyDesiredPosition = () => {
    const target = usingDefaultPosition || !desiredPosition ? defaultPosition() : desiredPosition;
    applyPosition(target);
  };

  const applyInitialPosition = () => {
    const saved = readStoredPosition(POS_PATH);
    desiredPosition = saved;
    usingDefaultPosition = !saved;
    applyDesiredPosition();
  };

  const onWindowResize = () => {
    if (!running) return;
    applyDesiredPosition();
  };

  // Drag to move; a press that never travels past the threshold is a click.
  const detachDrag = makeDraggable(button, {
    thresholdPx: DRAG_THRESHOLD_PX,
    stopPropagation: true,
    moveTo: (pos) => {
      desiredPosition = applyPosition(pos);
      usingDefaultPosition = false;
      return desiredPosition;
    },
    onDrop: (pos) => storePosition(POS_PATH, pos),
    onClick: () => opts.onClick(),
  });

  window.addEventListener("resize", onWindowResize);
  document.body.appendChild(button);
  applyInitialPosition();

  // The widget mounts early, before the window has its final size, and a
  // growing viewport does not always fire `resize` (Discord's iframe), so the
  // wanted position is applied again a few times while the layout settles.
  const settleTimers = SETTLE_REAPPLY_DELAYS_MS.map((delay) =>
    window.setTimeout(() => { if (running) applyDesiredPosition(); }, delay),
  );
  const clearSettleTimers = () => {
    for (const id of settleTimers) {
      try { window.clearTimeout(id); } catch {}
    }
  };

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
      detachDrag();
      stopWiggle();
      clearSettleTimers();
      window.removeEventListener("resize", onWindowResize);
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
