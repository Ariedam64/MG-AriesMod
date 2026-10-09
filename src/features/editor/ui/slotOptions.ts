// The two rows above a plant's slots, shared by the brush and the placed-plant
// editors: how many slots it grows, and whether one edit moves them all.

import { h } from "../../../ui/kit/dom";
import { switchInput } from "../../../ui/kit/toggles";
import { roundButton } from "./panelChrome";

/** "Slots" with a - n/max + stepper. Each button is off at its end of the range. */
export function slotCountRow(
  count: number,
  maxSlots: number,
  actions: { onRemove(): void; onAdd(): void },
): HTMLElement {
  const remove = roundButton("-", actions.onRemove, "Remove a slot");
  const add = roundButton("+", actions.onAdd, "Add a slot");
  remove.setEnabled(count > 1);
  add.setEnabled(count < maxSlots);

  const stepper = h("div", "qws-ed-stepper");
  stepper.append(remove, h("span", "qws-ed-stepper__count", `${count}/${maxSlots}`), add);

  const row = h("div", "qws-ed-opt");
  row.append(h("span", undefined, "Slots"), stepper);
  return row;
}

/** "Edit all slots together" and its switch. */
export function editAllRow(on: boolean, onChange: (on: boolean) => void): HTMLElement {
  const row = h("label", "qws-ed-opt");
  row.append(h("span", undefined, "Edit all slots together"), switchInput(on, onChange));
  return row;
}
