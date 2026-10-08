// The lock look the DOM indicators put on a game element: a few inline styles
// and a lock glyph in its corner, undone exactly when the lock lifts. The
// element's own inline values are saved on it first, under a key per owner, so
// two indicators marking the same element never restore each other's styles.
//
// These predate the Pixi garden card (see indicator.ts), and the elements they
// look for come from the game's old DOM tooltips and buttons.

import { Subscriptions } from "../../lib/emitter";

export type LockLook = {
  /** Names the marks: the dataset key and the glyph's `tm-<owner>-lock` class. */
  owner: string;
  /** Inline styles set while locked, as CSS property names. */
  style: Record<string, string>;
  /** Inline styles of the lock glyph, usually `cornerGlyph(...)`. */
  glyph: Record<string, string>;
};

const LOCK_GLYPH = "🔒";

/** A 16px lock glyph sitting `offsetPx` outside the element's top-right corner. */
export const cornerGlyph = (offsetPx: number): Record<string, string> => ({
  position: "absolute",
  top: `-${offsetPx}px`,
  right: `-${offsetPx}px`,
  "font-size": "16px",
  "pointer-events": "none",
  "user-select": "none",
  "z-index": "2",
});

const datasetKey = (owner: string) => `tm${owner.replace(/(^|-)(\w)/g, (_, _dash, c: string) => c.toUpperCase())}LockStyles`;
const glyphClass = (owner: string) => `tm-${owner}-lock`;
const datasetAttr = (owner: string) => `tm-${owner}-lock-styles`;

export function markLocked(el: HTMLElement, look: LockLook): void {
  const key = datasetKey(look.owner);
  if (el.dataset[key] === undefined) {
    const saved: Record<string, string> = {};
    for (const prop of [...Object.keys(look.style), "position"]) saved[prop] = el.style.getPropertyValue(prop);
    el.dataset[key] = JSON.stringify(saved);
  }
  for (const [prop, value] of Object.entries(look.style)) el.style.setProperty(prop, value);
  // The glyph is positioned against the element.
  if (getComputedStyle(el).position === "static") el.style.setProperty("position", "relative");

  const cls = glyphClass(look.owner);
  if (el.querySelector(`span.${cls}`)) return;
  const glyph = document.createElement("span");
  glyph.className = cls;
  glyph.textContent = LOCK_GLYPH;
  for (const [prop, value] of Object.entries(look.glyph)) glyph.style.setProperty(prop, value);
  el.appendChild(glyph);
}

export function unmarkLocked(el: HTMLElement, owner: string): void {
  const key = datasetKey(owner);
  const raw = el.dataset[key];
  if (raw !== undefined) {
    let saved: Record<string, string> = {};
    try {
      saved = JSON.parse(raw);
    } catch {}
    for (const [prop, value] of Object.entries(saved)) {
      if (value) el.style.setProperty(prop, value);
      else el.style.removeProperty(prop);
    }
    delete el.dataset[key];
  }
  el.querySelectorAll(`span.${glyphClass(owner)}`).forEach((node) => node.remove());
}

/** Every element `owner` has marked, wherever it now sits. */
export const markedElements = (owner: string): HTMLElement[] =>
  Array.from(document.querySelectorAll<HTMLElement>(`[data-${datasetAttr(owner)}]`));

export type DomLockIndicator = {
  /** Marks or unmarks every matching element against the current lock state. */
  refresh(): void;
  /** Ties another subscription to the indicator, undone by `stop`. */
  add(unsubscribe: (() => void) | Promise<(() => void) | void>): void;
  stop(): void;
};

/**
 * Keeps every element matching `selector` marked while `isTarget` accepts it
 * and `isLocked` holds, re-checking on every DOM change.
 */
export function startDomLockIndicator(opts: {
  look: LockLook;
  selector: string;
  isTarget(el: HTMLElement): boolean;
  isLocked(): boolean;
}): DomLockIndicator {
  const subs = new Subscriptions();
  let running = true;

  const elements = () => Array.from(document.querySelectorAll<HTMLElement>(opts.selector));
  const refresh = () => {
    if (!running) return;
    const locked = opts.isLocked();
    for (const el of elements()) {
      if (locked && opts.isTarget(el)) markLocked(el, opts.look);
      else unmarkLocked(el, opts.look.owner);
    }
  };

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  subs.add(() => observer.disconnect());
  refresh();

  return {
    refresh,
    add: (unsubscribe) => subs.add(unsubscribe),
    stop() {
      running = false;
      subs.dispose();
      for (const el of elements()) unmarkLocked(el, opts.look.owner);
    },
  };
}
