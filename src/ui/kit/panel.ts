// Compatibility layer for menus written against the old panel atoms. Every
// export here forwards to a kit component or token; the replacement is named
// on each. Delete an export once no feature imports it.

import { badge, meter as kitMeter, pill as kitPill } from "./badges";
import { button as kitButton, setButtonEnabled as kitSetButtonEnabled } from "./button";
import { plainCard, sectionLabel as kitSectionLabel } from "./card";
import { h } from "./dom";
import { select, textInput } from "./fields";
import { slider } from "./sliders";
import { ensureKitStyles } from "./styles";
import { color } from "./theme";
import { switchInput } from "./toggles";

export { iconBox } from "./icons";

/** Compat: use `color.accent` from ./theme. */
export const TEAL = color.accent;
/** Compat: use `color.accentSoft` from ./theme. */
export const TEAL_DIM = color.accentSoft;
/** Compat: use `color.accentBorder` from ./theme. */
export const TEAL_BORDER = color.accentBorder;
/** Compat: use `color.border` from ./theme. */
export const BORDER = color.border;
/** Compat: use `color.cardBg` from ./theme. */
export const CARD_BG = color.cardBg;
/** Compat: use `color.text` from ./theme. */
export const TEXT = color.text;
/** Compat: use `color.textDim` from ./theme. */
export const TEXT_DIM = color.textDim;
/** Compat: use `color.danger` from ./theme. */
export const DANGER = color.danger;
/** Compat: use `color.warn` from ./theme. */
export const WARN = color.warn;
/** Compat: use `color.gold` from ./theme. */
export const GOLD = color.gold;
/** Compat: use `color.rainbow` from ./theme. */
export const RAINBOW = color.rainbow;

/** Compat: inline styling. Prefer kit components and their classes. */
export const css = (el: HTMLElement, style: Partial<CSSStyleDeclaration>) => Object.assign(el.style, style);

/** Compat: components inject the stylesheet themselves; `ensureKitStyles()` from ./styles. */
export const ensurePanelStyles = ensureKitStyles;

/** Compat: use `sectionLabel()` from ./card. */
export const sectionLabel = kitSectionLabel;

/** Compat: use `plainCard()` from ./card. */
export const card = plainCard;

/** Compat: use `pill()` from ./badges. */
export const pill = (text: string) => kitPill(text);

/** Compat: use `badge()` from ./badges. */
export const chip = badge;

/** Compat: use `meter()` from ./badges. */
export const meter = kitMeter;

/** Compat: use `setButtonEnabled()` from ./button. */
export const setButtonEnabled = kitSetButtonEnabled;

const VARIANT = { accent: "primary", neutral: "default", danger: "danger" } as const;

/** Compat: use `button(label, { variant, size: "sm", block: true, lockWhilePending: true, onClick })` from ./button. */
export function button(
  label: string,
  tone: keyof typeof VARIANT,
  onClick: () => void | Promise<void>,
): HTMLButtonElement {
  return kitButton(label, { variant: VARIANT[tone], size: "sm", block: true, lockWhilePending: true, onClick });
}

/** Compat: use `switchInput(checked, onChange)` from ./toggles. */
export function toggle(checked: boolean, onChange: (on: boolean) => void): HTMLElement {
  return switchInput(checked, onChange);
}

/** Compat: use `slider(min, max, step, value, { fill: true })` from ./sliders. */
export function range(min: number, max: number, step: number, value: number): HTMLInputElement {
  return slider(min, max, step, value, { fill: true });
}

/** Compat: use `textInput(placeholder, value, { small: true })` from ./fields. */
export function textField(placeholder: string, value = ""): HTMLInputElement {
  return textInput(placeholder, value, { small: true });
}

/** Compat: use `select({ small: true })` from ./fields and add the options. */
export function selectField(options: Array<[value: string, label: string]>): HTMLSelectElement {
  const el = select({ small: true });
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    el.appendChild(option);
  }
  return el;
}

/** Compat: a bare number field, 78px wide and right aligned. Prefer `numberInput()` from ./fields. */
export function numberField(min: number, max: number, step: number, value: number): HTMLInputElement {
  const el = h("input", "qws-pnl-input");
  el.type = "number";
  el.min = String(min);
  el.max = String(max);
  el.step = String(step);
  el.value = String(value);
  el.style.width = "78px";
  el.style.textAlign = "right";
  return el;
}
