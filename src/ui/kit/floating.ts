// Floating widgets the player can drag around the screen: where they sit, how
// that position is saved, and the drag gesture itself.

import { readAriesPath, writeAriesPath } from "../../platform/storage";

export type ScreenPosition = { left: number; top: number };

/** A saved position, or null when none was saved or it is unreadable. */
export function readStoredPosition(path: string): ScreenPosition | null {
  const raw = readAriesPath<unknown>(path);
  if (!raw || typeof raw !== "object") return null;
  const left = Number((raw as Record<string, unknown>).left);
  const top = Number((raw as Record<string, unknown>).top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left, top };
}

export function storePosition(path: string, pos: ScreenPosition): void {
  writeAriesPath(path, { left: Math.round(pos.left), top: Math.round(pos.top) });
}

function clampCoord(value: number, min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
  // A window narrower than the widget pins it to the margin.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/** Where a `width` by `height` box at (left, top) lands when kept `margin` inside the viewport. */
export function clampToViewport(
  pos: ScreenPosition,
  size: { width: number; height: number },
  margin: number,
  viewport: { width: number; height: number } = { width: window.innerWidth, height: window.innerHeight },
): ScreenPosition {
  return {
    left: clampCoord(pos.left, margin, viewport.width - size.width - margin),
    top: clampCoord(pos.top, margin, viewport.height - size.height - margin),
  };
}

/** Moves a fixed-position element, kept inside the viewport, and returns where it went. */
export function placeInViewport(
  el: HTMLElement,
  pos: ScreenPosition,
  size: { width: number; height: number },
  margin: number,
): ScreenPosition {
  const placed = clampToViewport(pos, size, margin);
  el.style.left = `${Math.round(placed.left)}px`;
  el.style.top = `${Math.round(placed.top)}px`;
  return placed;
}

export interface DragOptions {
  /** Where the press starts, when only part of the widget is a handle. Defaults to the widget. */
  handle?: HTMLElement;
  /** Pointer travel below which a press stays a click. 0 makes every press a drag. */
  thresholdPx?: number;
  /** Presses that start on such a target do not drag (for example a button inside the widget). */
  ignore?: (target: HTMLElement) => boolean;
  /** Keep the press from reaching the page under the widget. */
  stopPropagation?: boolean;
  /** Moves the widget to (left, top) and returns where it actually went. */
  moveTo: (pos: ScreenPosition) => ScreenPosition;
  /** A drag ended at `pos`. */
  onDrop: (pos: ScreenPosition) => void;
  /** A press ended without becoming a drag. */
  onClick?: () => void;
}

/** Lets the player drag `el`. Returns a function that ends any drag and detaches it. */
export function makeDraggable(el: HTMLElement, opts: DragOptions): () => void {
  const threshold = opts.thresholdPx ?? 0;
  const handle = opts.handle ?? el;
  let drag: {
    pointerId: number;
    startX: number;
    startY: number;
    base: ScreenPosition;
    last: ScreenPosition;
    moved: boolean;
  } | null = null;

  const onMove = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const dx = ev.clientX - drag.startX;
    const dy = ev.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < threshold) return;
    drag.moved = true;
    drag.last = opts.moveTo({ left: drag.base.left + dx, top: drag.base.top + dy });
  };

  const stop = (ev?: PointerEvent) => {
    if (!drag) return;
    if (ev && ev.pointerId !== drag.pointerId) return;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", stop);
    document.removeEventListener("pointercancel", stop);
    try { handle.releasePointerCapture(drag.pointerId); } catch {}
    const { moved, last } = drag;
    drag = null;
    handle.style.cursor = "grab";
    if (moved) opts.onDrop(last);
    else if (ev?.type === "pointerup") {
      try { opts.onClick?.(); } catch (error) {
        console.error("[Aries] floating widget click failed:", error);
      }
    }
  };

  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement | null;
    if (target && opts.ignore?.(target)) return;
    if (drag) stop();
    const rect = el.getBoundingClientRect();
    const base = { left: rect.left, top: rect.top };
    drag = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      base,
      last: base,
      moved: threshold <= 0,
    };
    try { handle.setPointerCapture(ev.pointerId); } catch {}
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
    handle.style.cursor = "grabbing";
    ev.preventDefault();
    if (opts.stopPropagation) ev.stopPropagation();
  };

  handle.addEventListener("pointerdown", onDown);
  return () => {
    stop();
    handle.removeEventListener("pointerdown", onDown);
  };
}
