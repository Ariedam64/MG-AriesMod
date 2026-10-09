// The size controls of one slot, shared by the brush and the placed-plant
// editors: a value, a "custom" switch, the slider, and the custom size field.

import { pill } from "../../../ui/kit/badges";
import { h } from "../../../ui/kit/dom";
import { textInput } from "../../../ui/kit/fields";
import { slider } from "../../../ui/kit/sliders";
import { switchInput, type SwitchInput } from "../../../ui/kit/toggles";
import { CROP_SIZE_MAX, CROP_SIZE_MIN } from "../../../data/rules/cropSize";
import type { SlotScaleMode } from "../slotSize";
import { blockGameKeys, keepSizeCharacters } from "./inputGuards";
import { ensureEditorStyles } from "./styles";

export type SizeControls = {
  /** The size, shown at the end of the slot's header. */
  value: HTMLSpanElement;
  /** The custom switch with its text. */
  modeLabel: HTMLLabelElement;
  modeSwitch: SwitchInput;
  slider: HTMLInputElement;
  /** "Custom size" and its field, shown in custom mode instead of the slider. */
  customRow: HTMLDivElement;
  customInput: HTMLInputElement;
  /** Shows a state. `customText` replaces the field's text when given. */
  show(view: { pct: number; mode: SlotScaleMode; customText?: string }): void;
};

export function sizeControls(): SizeControls {
  ensureEditorStyles();
  const value = pill("");

  const modeSwitch = switchInput(false);
  const modeLabel = h("label", "qws-ed-slot__mode");
  modeLabel.append("Custom", modeSwitch);

  const range = slider(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, CROP_SIZE_MAX, { fill: true });
  range.setAttribute("aria-label", "Size");

  const customInput = textInput("", "", { small: true });
  customInput.inputMode = "numeric";
  customInput.autocomplete = "off";
  customInput.setAttribute("aria-label", "Custom size");
  blockGameKeys(customInput);
  keepSizeCharacters(customInput);

  const customRow = h("div", "qws-ed-custom");
  customRow.append("Custom size", customInput);

  const show: SizeControls["show"] = ({ pct, mode, customText }) => {
    const custom = mode === "custom";
    value.textContent = String(pct);
    modeSwitch.checked = custom;
    range.value = String(pct);
    range.disabled = custom;
    range.hidden = custom;
    customInput.disabled = !custom;
    customRow.hidden = !custom;
    if (customText !== undefined) customInput.value = customText;
  };

  return { value, modeLabel, modeSwitch, slider: range, customRow, customInput, show };
}

/** A slot's header: its title, the custom switch, and the size. */
function slotHeader(title: string, size: SizeControls): HTMLDivElement {
  const row = h("div", "qws-ed-slot__head");
  row.append(h("span", "qws-ed-slot__title", title), size.modeLabel, size.value);
  return row;
}

/** A slot's card: header, slider or custom field, then its mutations. */
export function slotCard(title: string, size: SizeControls, mutations: HTMLElement[]): HTMLDivElement {
  const card = h("div", "qws-ed-slot");
  card.append(slotHeader(title, size), size.slider, size.customRow, ...mutations);
  return card;
}

/** "Slot 2" when the plant has several, plain "Size" otherwise. */
export const slotTitle = (idx: number, maxSlots: number): string => (maxSlots > 1 ? `Slot ${idx + 1}` : "Size");
