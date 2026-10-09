// The current-item panel's editor for a placed plant: how many slots it has,
// and the size and mutations of each, written straight to the plan.

import { h } from "../../../ui/kit/dom";
import { getMaxSlotsForSpecies } from "../brush";
import { DEFAULT_SIZE_PERCENT, makeGrowSlot } from "../brushSlots";
import type { TileObject } from "../gardenModel";
import { updateGardenObjectAtCurrentTile } from "../planEdits";
import { currentItemChanged } from "../session";
import {
  editSlotCustom,
  editSlotMode,
  editSlotPercent,
  initialSlotSize,
  type SlotScaleMode,
  type SlotSizeEdit,
  type SlotSizeState,
} from "../slotSize";
import { mutationPicker } from "./mutationPicker";
import { panelLabel } from "./panelChrome";
import { sizeControls, slotCard, slotTitle } from "./sizeControls";
import { editAllRow, slotCountRow } from "./slotOptions";

/** Each slot's size mode, by tile, so a redraw keeps custom slots in custom mode. */
const slotModesByTile: Record<string, Record<number, SlotScaleMode>> = {};

/** "Edit all slots together", kept across redraws and tiles. */
let editAllSlots = false;

type SlotBox = {
  root: HTMLElement;
  showSize(state: SlotSizeState): void;
  showMutations(mutations: string[]): void;
};

type SlotBoxHandlers = {
  onSlide(value: number): void;
  onCustom(raw: string): void;
  onMode(mode: SlotScaleMode): void;
  onToggleMutation(id: string): void;
};

/** Writes a patch to some slots of the plant on the current tile. */
function writeSlots(targets: number[], patchFor: (idx: number) => Record<string, unknown>): boolean {
  return updateGardenObjectAtCurrentTile((obj) => {
    if (obj?.objectType !== "plant") return obj;
    const slots = Array.isArray(obj.slots) ? obj.slots.slice() : [];
    for (const i of targets) slots[i] = { ...(slots[i] || {}), ...patchFor(i) };
    return { ...obj, slots };
  });
}

export function renderPlantSlotsEditor(content: HTMLElement, plant: TileObject, tileKey: string): void {
  const species = String(plant.species ?? "");
  const slots: unknown[] = Array.isArray(plant.slots) ? plant.slots : [];
  const maxSlots = getMaxSlotsForSpecies(species);
  const modes = (slotModesByTile[tileKey || "default"] ??= {});

  let sizes = slots.map((slot, i) => initialSlotSize(slot, modes[i]));
  const mutationLists = slots.map((slot) => {
    const list = (slot as { mutations?: unknown } | null)?.mutations;
    return Array.isArray(list) ? list.slice() : [];
  });
  const boxes: SlotBox[] = [];
  const allIndices = () => slots.map((_, i) => i);

  const applySize = (edit: SlotSizeEdit | null) => {
    if (!edit) return;
    sizes = edit.states;
    for (const i of edit.targets) modes[i] = sizes[i].mode;
    sizes.forEach((state, i) => boxes[i]?.showSize(state));
    writeSlots(edit.targets, () => ({ size: edit.size }));
  };

  const toggleMutation = (idx: number, id: string) => {
    const current = mutationLists[idx];
    const next = current.includes(id) ? current.filter((m) => m !== id) : [...current, id];
    const targets = editAllSlots ? allIndices() : [idx];
    for (const t of targets) mutationLists[t] = next.slice();
    writeSlots(targets, () => ({ mutations: next.slice() }));
    for (const t of targets) boxes[t]?.showMutations(mutationLists[t]);
  };

  const list = h("div", "qws-ed-slots");
  slots.forEach((_, idx) => {
    const box = plantSlotBox(slotTitle(idx, maxSlots), {
      onSlide: (value) => applySize(editSlotPercent(sizes, idx, value, editAllSlots)),
      onCustom: (raw) => applySize(editSlotCustom(sizes, idx, raw, editAllSlots)),
      onMode: (mode) => applySize(editSlotMode(sizes, idx, mode, editAllSlots)),
      onToggleMutation: (id) => toggleMutation(idx, id),
    });
    box.showSize(sizes[idx]);
    box.showMutations(mutationLists[idx]);
    boxes.push(box);
    list.appendChild(box.root);
  });

  const options = h("div", "qws-ed-opts");
  if (maxSlots > 1) {
    options.append(
      slotCountRow(slots.length, maxSlots, {
        onRemove: () => {
          if (slots.length > 1) editSlotList((current) => current.slice(0, Math.max(1, current.length - 1)));
        },
        onAdd: () => {
          if (slots.length >= maxSlots) return;
          editSlotList((current) =>
            current.length >= maxSlots ? current : [...current, makeGrowSlot(species, DEFAULT_SIZE_PERCENT)],
          );
        },
      }),
      editAllRow(editAllSlots, (on) => {
        editAllSlots = on;
      }),
    );
  }
  options.appendChild(list);
  content.appendChild(options);
}

/** Replaces the slot list of the plant on the current tile, then redraws the panel. */
function editSlotList(edit: (slots: unknown[]) => unknown[]): void {
  const changed = updateGardenObjectAtCurrentTile((obj) => {
    if (obj?.objectType !== "plant") return obj;
    return { ...obj, slots: edit(Array.isArray(obj.slots) ? obj.slots.slice() : []) };
  });
  if (changed) currentItemChanged.emit();
}

function plantSlotBox(title: string, handlers: SlotBoxHandlers): SlotBox {
  const size = sizeControls();

  size.slider.oninput = () => handlers.onSlide(Number(size.slider.value));
  // `change` fires on blur and on Enter. A keydown handler would never see
  // Enter: the game key block stops every key at the window while the field
  // has focus.
  size.customInput.onchange = () => handlers.onCustom(size.customInput.value);
  size.modeSwitch.onchange = () => handlers.onMode(size.modeSwitch.checked ? "custom" : "percent");

  const mutations = mutationPicker(handlers.onToggleMutation, panelLabel("Mutations"));
  const root = slotCard(title, size, [mutations.row, mutations.dropdown]);

  return {
    root,
    showSize: (state) => size.show({ pct: state.pct, mode: state.mode, customText: String(state.size) }),
    showMutations: (list) => mutations.render(list),
  };
}
