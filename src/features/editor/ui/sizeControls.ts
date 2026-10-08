// The size controls of one slot, shared by the brush and the placed-plant
// editors: a value, a "custom" switch, the slider, and the custom size field.

import { textInput } from "../../../ui/kit/fields";
import { slider } from "../../../ui/kit/sliders";
import { switchInput, type SwitchInput } from "../../../ui/kit/toggles";
import { CROP_SIZE_MAX, CROP_SIZE_MIN } from "../../../data/rules/cropSize";
import type { SlotScaleMode } from "../slotSize";
import { blockGameKeys, keepSizeCharacters } from "./inputGuards";

export type SizeControls = {
  /** The size shown next to the "Size" label. */
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

const smallRow = (): HTMLDivElement => {
  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" });
  return row;
};

export function sizeControls(modeText: string): SizeControls {
  const value = document.createElement("span");

  const modeSwitch = switchInput(false);
  const modeLabel = document.createElement("label");
  Object.assign(modeLabel.style, { display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" });
  modeLabel.append(modeSwitch, document.createTextNode(modeText));

  const range = slider(CROP_SIZE_MIN, CROP_SIZE_MAX, 1, CROP_SIZE_MAX, { fill: true });

  const customInput = textInput("", "", { small: true });
  customInput.inputMode = "numeric";
  customInput.autocomplete = "off";
  customInput.style.width = "90px";
  blockGameKeys(customInput);
  keepSizeCharacters(customInput);

  const customRow = smallRow();
  customRow.style.opacity = "0.9";
  customRow.append(document.createTextNode("Custom size"), customInput);

  const show: SizeControls["show"] = ({ pct, mode, customText }) => {
    const custom = mode === "custom";
    value.textContent = String(pct);
    modeSwitch.checked = custom;
    range.value = String(pct);
    range.disabled = custom;
    range.style.display = custom ? "none" : "";
    customInput.disabled = !custom;
    customRow.style.display = custom ? "flex" : "none";
    if (customText !== undefined) customInput.value = customText;
  };

  return { value, modeLabel, modeSwitch, slider: range, customRow, customInput, show };
}

/** "Size", then `beside` when given, and `value` at the far right. */
export function sizeHeader(value: HTMLElement, beside?: HTMLElement): HTMLDivElement {
  const row = smallRow();
  row.style.opacity = "0.85";
  const label = document.createElement("span");
  label.textContent = "Size";
  row.appendChild(label);
  if (beside) row.appendChild(beside);
  value.style.marginLeft = "auto";
  row.appendChild(value);
  return row;
}
