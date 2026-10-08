import { clamp } from "../../lib/math";
import { h } from "./dom";

/** A range input. `fill` makes it take the full width instead of the menu's fixed 180px. */
export function slider(min = 0, max = 100, step = 1, value = 0, opts: { fill?: boolean } = {}): HTMLInputElement {
  // `qws-pnl-range` is the full-width name feature code already uses.
  const input = h("input", opts.fill ? "qws-pnl-range" : "qmm-range");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  return input;
}

export type RangeDualHandle = {
  root: HTMLDivElement;
  min: HTMLInputElement;
  max: HTMLInputElement;
  setValues(minValue: number, maxValue: number): void;
  refresh(): void;
};

/** Two thumbs on one track, for a min..max interval. */
export function rangeDual(min = 0, max = 100, step = 1, valueMin = min, valueMax = max): RangeDualHandle {
  const root = h("div", "qmm-range-dual");
  const track = h("div", "qmm-range-dual-track");
  const fill = h("div", "qmm-range-dual-fill");
  track.appendChild(fill);
  root.appendChild(track);

  const thumb = (value: number, side: "min" | "max") => {
    const input = slider(min, max, step, value);
    input.classList.add("qmm-range-dual-input", `qmm-range-dual-input--${side}`);
    root.appendChild(input);
    return input;
  };
  const minInput = thumb(valueMin, "min");
  const maxInput = thumb(valueMax, "max");

  const refresh = () => {
    const total = max - min;
    if (!Number.isFinite(total) || total <= 0) {
      fill.style.left = "0%";
      fill.style.right = "100%";
      return;
    }
    const a = Number(minInput.value);
    const b = Number(maxInput.value);
    const pct = (v: number) => clamp(v, 0, 100);
    fill.style.left = `${pct(((Math.min(a, b) - min) / total) * 100)}%`;
    fill.style.right = `${pct(100 - ((Math.max(a, b) - min) / total) * 100)}%`;
  };
  minInput.addEventListener("input", refresh);
  maxInput.addEventListener("input", refresh);
  refresh();

  return {
    root,
    min: minInput,
    max: maxInput,
    setValues(minValue, maxValue) {
      minInput.value = String(minValue);
      maxInput.value = String(maxValue);
      refresh();
    },
    refresh,
  };
}
