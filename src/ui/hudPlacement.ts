// Where the HUD box and its windows sit: kept inside the viewport by their
// right and bottom offsets, dragged by a handle, and pulled back on screen as
// their content or the window changes size.

/** Closest a box may come to the viewport edge. */
const MARGIN = 8;

export type Pos = { r: number; b: number };

/** The box's distance from the right and bottom edges, as laid out now. */
export function currentPos(el: HTMLElement): Pos {
  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  let r = parseFloat(cs.right);
  let b = parseFloat(cs.bottom);
  if (Number.isNaN(r)) r = window.innerWidth - rect.right;
  if (Number.isNaN(b)) b = window.innerHeight - rect.bottom;
  return { r, b };
}

/** Places a box by its right/bottom offsets, kept inside the viewport. */
export function placeClamped(el: HTMLElement, r: number, b: number): void {
  const rect = el.getBoundingClientRect();
  const maxRight = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
  const maxBottom = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN);
  el.style.right = `${Math.min(Math.max(r, MARGIN), maxRight)}px`;
  el.style.bottom = `${Math.min(Math.max(b, MARGIN), maxBottom)}px`;
}

export function clampRect(el: HTMLElement): void {
  const { r, b } = currentPos(el);
  placeClamped(el, r, b);
}

/** Like `clampRect`, and also pulls a window's title bar and left edge back on screen. */
export function ensureOnScreen(el: HTMLElement): void {
  clampRect(el);
  const rect = el.getBoundingClientRect();
  const head = el.querySelector<HTMLElement>(".w-head")?.getBoundingClientRect() ?? rect;
  let { r, b } = currentPos(el);
  const maxRight = Math.max(MARGIN, window.innerWidth - rect.width - MARGIN);
  const maxBottom = Math.max(MARGIN, window.innerHeight - rect.height - MARGIN);
  if (head.top < MARGIN) b = Math.max(MARGIN, Math.min(maxBottom, b - (MARGIN - head.top)));
  if (rect.left < MARGIN) r = Math.max(MARGIN, Math.min(maxRight, r - (MARGIN - rect.left)));
  el.style.right = `${r}px`;
  el.style.bottom = `${b}px`;
}

/** Keeps a window on screen as its content grows or shrinks. */
export function attachAutoClamp(win: HTMLElement): void {
  if (typeof ResizeObserver === "undefined") return;
  let raf = 0;
  new ResizeObserver(() => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => ensureOnScreen(win));
  }).observe(win);
}

/** Runs a size change while keeping the box's top edge where it was. */
export function withTopLocked(el: HTMLElement, mutate: () => void): void {
  const before = el.getBoundingClientRect();
  const { b } = currentPos(el);
  mutate();
  requestAnimationFrame(() => {
    const after = el.getBoundingClientRect();
    const maxBottom = Math.max(MARGIN, window.innerHeight - after.height - MARGIN);
    el.style.bottom = `${Math.min(Math.max(MARGIN, b + after.top - before.top), maxBottom)}px`;
    ensureOnScreen(el);
  });
}

/** Drags `target` by `handle`, clamped to the viewport. */
export function makeDraggable(
  handle: HTMLElement,
  target: HTMLElement,
  opts: { ignore?: (t: HTMLElement) => boolean; onStart?: () => void; onEnd: () => void },
): void {
  let start: { x: number; y: number; pos: Pos } | null = null;
  handle.addEventListener("mousedown", (e) => {
    if (opts.ignore?.(e.target as HTMLElement)) return;
    start = { x: e.clientX, y: e.clientY, pos: currentPos(target) };
    document.body.style.userSelect = "none";
    opts.onStart?.();
  });
  window.addEventListener("mousemove", (e) => {
    if (!start) return;
    placeClamped(target, start.pos.r - (e.clientX - start.x), start.pos.b - (e.clientY - start.y));
  });
  window.addEventListener("mouseup", () => {
    if (!start) return;
    start = null;
    document.body.style.userSelect = "";
    opts.onEnd();
  });
}
