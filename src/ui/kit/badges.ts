import { clampFinite } from "../../lib/math";
import { h } from "./dom";

export type StatusTone = "ok" | "warn" | "bad";

/** Read-only value badge, e.g. a slider's value or a status. A tone tints it. */
export function pill(text: string, tone?: StatusTone): HTMLSpanElement {
  const el = h("span", "qmm-pill", text);
  setTone(el, tone);
  return el;
}

/** Recolours a pill (or anything styled by `is-ok`/`is-warn`/`is-bad`). */
export function setTone(el: Element, tone?: StatusTone): void {
  el.classList.remove("is-ok", "is-warn", "is-bad");
  if (tone) el.classList.add(`is-${tone}`);
}

/** Small borderless status label, e.g. Active / Waiting. */
export function badge(text: string, tone: "ok" | "warn"): HTMLSpanElement {
  return h("span", `qmm-badge is-${tone}`, text);
}

export interface Meter {
  root: HTMLElement;
  /** `ratio` is clamped to 0..1; `tone` colours the fill. */
  set(ratio: number, tone?: "accent" | "warn"): void;
}

/** Thin horizontal progress bar. */
export function meter(): Meter {
  const root = h("div", "qmm-meter");
  const fill = h("div", "qmm-meter__fill");
  root.appendChild(fill);
  return {
    root,
    set(ratio, tone = "accent") {
      fill.style.width = `${clampFinite(ratio, 0, 1, 0) * 100}%`;
      fill.classList.toggle("is-warn", tone === "warn");
    },
  };
}
