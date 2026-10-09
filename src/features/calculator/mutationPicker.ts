// A segmented row of equal-width options for the simulator, where each
// mutation shows its game icon instead of its name once the icon loads.

import { segmented, type SegmentedControl } from "../../ui/kit/segmented";
import { getSpriteObjectUrlByName } from "../../ui/kit/sprites/iconCache";

/** UI atlas name of each mutation's icon. */
const MUTATION_ICON_NAMES: Record<string, string> = {
  Gold: "MutationGold",
  Rainbow: "MutationRainbow",
  Wet: "MutationWet",
  Chilled: "MutationChilled",
  Frozen: "MutationFrozen",
  Thunderstruck: "MutationThunderstruck",
  Thundercharged: "MutationThundercharged",
  Dawnlit: "MutationDawnlit",
  Amberlit: "MutationAmberlit",
  Dawnbound: "MutationDawncharged",
  Amberbound: "MutationAmbercharged",
};

const ICON_PX = 20;

function showIcon(button: HTMLButtonElement, label: string): void {
  const iconName = MUTATION_ICON_NAMES[label];
  const labelSpan = button.querySelector<HTMLSpanElement>(".qmm-seg__btn-label");
  if (!iconName || !labelSpan) return;
  void getSpriteObjectUrlByName(["ui"], iconName).then((url) => {
    if (!url) return;
    const img = document.createElement("img");
    img.className = "qws-calc-seg__icon";
    img.src = url;
    img.alt = label;
    img.width = ICON_PX;
    img.height = ICON_PX;
    img.draggable = false;
    labelSpan.replaceChildren(img);
  });
}

export type OptionPicker<T extends string> = SegmentedControl<T> & {
  /** Greys the options out while there is no crop to apply them to. */
  setEnabled(enabled: boolean): void;
};

export function optionPicker<T extends string>(
  labels: readonly T[],
  selected: T,
  ariaLabel: string,
  onPick: (value: T) => void,
): OptionPicker<T> {
  const control = segmented<T>(
    labels.map((label) => ({ value: label, label })),
    selected,
    onPick,
    { ariaLabel, fullWidth: true },
  ) as OptionPicker<T>;
  control.classList.add("qws-calc-seg");
  const buttons = Array.from(control.querySelectorAll<HTMLButtonElement>(".qmm-seg__btn"));
  for (const button of buttons) {
    const label = button.dataset.value ?? "";
    button.title = label;
    showIcon(button, label);
  }
  control.setEnabled = (enabled) => {
    for (const button of buttons) button.disabled = !enabled;
  };
  return control;
}
