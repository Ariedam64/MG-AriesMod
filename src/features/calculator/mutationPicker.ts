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
    img.src = url;
    img.alt = label;
    img.title = label;
    img.width = ICON_PX;
    img.height = ICON_PX;
    Object.assign(img.style, { width: `${ICON_PX}px`, height: `${ICON_PX}px`, objectFit: "contain", display: "block" });
    img.draggable = false;
    labelSpan.replaceChildren(img);
  });
}

/** `onPick` is left out while there is no crop to apply the choice to. */
export function optionPicker<T extends string>(
  labels: readonly T[],
  selected: T,
  ariaLabel: string,
  onPick?: (value: T) => void,
): SegmentedControl<T> {
  const control = segmented<T>(
    labels.map((label) => ({ value: label, label, disabled: !onPick })),
    selected,
    onPick,
    { ariaLabel, fullWidth: true },
  );
  control.style.setProperty("--seg-pad", "6px");
  for (const button of control.querySelectorAll<HTMLButtonElement>(".qmm-seg__btn")) {
    Object.assign(button.style, {
      flex: "1 1 0",
      minWidth: "0",
      display: "flex",
      justifyContent: "center",
      fontSize: "11px",
      fontWeight: "600",
    });
    showIcon(button, button.dataset.value ?? "");
  }
  return control;
}
