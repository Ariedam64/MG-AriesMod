import { clamp } from "../../lib/math";
import { h } from "./dom";

export function textInput(placeholder = "", value = "", opts: { small?: boolean } = {}): HTMLInputElement {
  const input = h("input", opts.small ? "qmm-input qmm-input--sm" : "qmm-input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value;
  return input;
}

/** A number field with a stepper on its right. The wrapper is `input.wrap`. */
export type NumberInput = HTMLInputElement & { wrap: HTMLDivElement };

export function numberInput(min = 0, max = 9999, step = 1, value = 0): NumberInput {
  const wrap = h("div", "qmm-input-number");
  const input = h("input", "qmm-input qmm-input-number-input") as NumberInput;
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.inputMode = "numeric";

  const clampValue = () => {
    const n = Number(input.value);
    if (!Number.isFinite(n)) return;
    const clamped = clamp(n, Number(input.min), Number(input.max));
    if (clamped !== n) input.value = String(clamped);
  };
  const bump = (dir: 1 | -1) => {
    if (dir < 0) input.stepDown();
    else input.stepUp();
    clampValue();
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const spin = h("div", "qmm-spin");
  spin.append(stepButton("▲", () => bump(1)), stepButton("▼", () => bump(-1)));
  input.addEventListener("change", clampValue);
  wrap.append(input, spin);
  input.wrap = wrap;
  return input;
}

/** A tap steps once; holding repeats until release. */
function stepButton(glyph: string, bump: () => void): HTMLButtonElement {
  const btn = h("button", "qmm-step", glyph);
  btn.type = "button";
  let pressTimer: number | null = null;
  let repeatTimer: number | null = null;
  let repeated = false;

  const stop = () => {
    if (pressTimer != null) clearTimeout(pressTimer);
    if (repeatTimer != null) clearInterval(repeatTimer);
    pressTimer = repeatTimer = null;
  };
  btn.addEventListener("pointerdown", (ev) => {
    repeated = false;
    pressTimer = window.setTimeout(() => {
      repeated = true;
      bump();
      repeatTimer = window.setInterval(bump, 60);
    }, 300);
    btn.setPointerCapture?.(ev.pointerId);
  });
  for (const type of ["pointerup", "pointercancel", "pointerleave", "blur"]) btn.addEventListener(type, stop);
  btn.addEventListener("click", (e) => {
    if (repeated) {
      e.preventDefault();
      e.stopPropagation();
      repeated = false;
      return;
    }
    bump();
  });
  return btn;
}

export function select(opts: { id?: string; width?: string; placeholder?: string; small?: boolean } = {}): HTMLSelectElement {
  const sel = h("select", opts.small ? "qmm-input qmm-input--sm qmm-select" : "qmm-input qmm-select");
  if (opts.id) sel.id = opts.id;
  if (opts.width) sel.style.minWidth = opts.width;
  if (opts.placeholder) {
    const opt = h("option", undefined, opts.placeholder);
    opt.value = "";
    opt.disabled = true;
    opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

function radio(name: string, value: string, checked = false): HTMLInputElement {
  const input = h("input", "qmm-radio");
  input.type = "radio";
  input.name = name;
  input.value = value;
  input.checked = checked;
  return input;
}

/** Labelled radio buttons sharing one name. */
export function radioGroup<T extends string>(
  name: string,
  options: Array<{ value: T; label: string }>,
  selected: T | null,
  onChange: (value: T) => void,
): HTMLDivElement {
  const wrap = h("div", "qmm-radio-group");
  for (const { value, label } of options) {
    const input = radio(name, value, selected === value);
    input.onchange = () => {
      if (input.checked) onChange(value);
    };
    const row = h("label", "qmm-radio-label");
    row.append(input, label);
    wrap.appendChild(row);
  }
  return wrap;
}
