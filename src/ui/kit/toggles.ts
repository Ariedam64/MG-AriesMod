import { h, iconNode } from "./dom";

/** An on/off switch. It is the checkbox itself, so `.checked` and `change` work as usual. */
export type SwitchInput = HTMLInputElement & { setChecked(value: boolean): void };

export function switchInput(checked = false, onChange?: (on: boolean) => void): SwitchInput {
  const input = h("input", "qmm-switch") as SwitchInput;
  input.type = "checkbox";
  input.checked = checked;
  input.setChecked = (value) => {
    input.checked = value;
  };
  if (onChange) input.addEventListener("change", () => onChange(input.checked));
  return input;
}

export type ToggleChipOptions = {
  checked?: boolean;
  description?: string;
  icon?: string | HTMLElement;
  name?: string;
  value?: string;
  type?: "checkbox" | "radio";
  badge?: string;
  tooltip?: string;
};

/** A pill that toggles, backed by a hidden checkbox or radio. */
export function toggleChip(
  labelText: string,
  opts: ToggleChipOptions = {},
): { root: HTMLLabelElement; input: HTMLInputElement; label: HTMLSpanElement } {
  const root = h("label", "qmm-chip-toggle");
  if (opts.tooltip) root.title = opts.tooltip;

  const input = h("input");
  input.type = opts.type || "checkbox";
  if (opts.name) input.name = opts.name;
  if (opts.value) input.value = opts.value;
  input.checked = !!opts.checked;

  const face = h("div", "qmm-chip-toggle__face");
  if (opts.icon) face.appendChild(iconNode(opts.icon, "qmm-chip-toggle__icon"));
  const label = h("span", "qmm-chip-toggle__label", labelText);
  face.appendChild(label);
  if (opts.description) face.appendChild(h("span", "qmm-chip-toggle__desc", opts.description));
  if (opts.badge) face.appendChild(h("span", "qmm-chip-toggle__badge", opts.badge));

  root.append(input, face);
  return { root, input, label };
}
