// The current-item panel's editor for a placed plant: how many slots it has,
// and the size and mutations of each, written straight to the plan.

import { plainCard, sectionLabel } from "../../../ui/kit/card";
import { switchInput } from "../../../ui/kit/toggles";
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
import { roundButton } from "./panelChrome";
import { sizeControls, sizeHeader } from "./sizeControls";

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

  const list = document.createElement("div");
  Object.assign(list.style, { display: "grid", gap: "8px" });
  slots.forEach((_, idx) => {
    const box = plantSlotBox({
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

  if (maxSlots > 1) content.append(slotCountRow(species, slots.length, maxSlots), editAllRow());
  content.appendChild(list);
}

/** "Slots n/max" with buttons that add or remove the last slot. */
function slotCountRow(species: string, count: number, maxSlots: number): HTMLElement {
  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    fontSize: "12px",
    opacity: "0.9",
  });

  const label = document.createElement("span");
  label.textContent = `Slots ${count}/${maxSlots}`;

  const editSlots = (edit: (slots: unknown[]) => unknown[]) => {
    const changed = updateGardenObjectAtCurrentTile((obj) => {
      if (obj?.objectType !== "plant") return obj;
      return { ...obj, slots: edit(Array.isArray(obj.slots) ? obj.slots.slice() : []) };
    });
    if (changed) currentItemChanged.emit();
  };
  const remove = roundButton("-", () => {
    if (count > 1) editSlots((slots) => slots.slice(0, Math.max(1, slots.length - 1)));
  });
  const add = roundButton("+", () => {
    if (count >= maxSlots) return;
    editSlots((slots) => (slots.length >= maxSlots ? slots : [...slots, makeGrowSlot(species, DEFAULT_SIZE_PERCENT)]));
  });
  remove.setEnabled(count > 1);
  add.setEnabled(count < maxSlots);

  const buttons = document.createElement("div");
  Object.assign(buttons.style, { display: "flex", gap: "6px", alignItems: "center" });
  buttons.append(remove, add);
  row.append(label, buttons);
  return row;
}

function editAllRow(): HTMLElement {
  const row = document.createElement("label");
  Object.assign(row.style, { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", opacity: "0.9", cursor: "pointer" });
  row.append(
    switchInput(editAllSlots, (on) => {
      editAllSlots = on;
    }),
    document.createTextNode("Edit all slots together"),
  );
  return row;
}

function plantSlotBox(handlers: SlotBoxHandlers): SlotBox {
  const size = sizeControls("Use custom size");
  Object.assign(size.modeLabel.style, { fontSize: "11px", opacity: "0.9" });

  size.slider.oninput = () => handlers.onSlide(Number(size.slider.value));
  // `change` fires on blur and on Enter. A keydown handler would never see
  // Enter: the game key block stops every key at the window while the field
  // has focus.
  size.customInput.onchange = () => handlers.onCustom(size.customInput.value);
  size.modeSwitch.onchange = () => handlers.onMode(size.modeSwitch.checked ? "custom" : "percent");

  const mutations = mutationPicker(handlers.onToggleMutation);
  const mutationsWrap = document.createElement("div");
  Object.assign(mutationsWrap.style, { display: "grid", gap: "6px" });
  mutationsWrap.append(sectionLabel("Mutations"), mutations.row, mutations.dropdown);

  const root = plainCard();
  root.style.gap = "8px";
  root.append(sizeHeader(size.value), size.modeLabel, size.slider, size.customRow, mutationsWrap);

  return {
    root,
    showSize: (state) => size.show({ pct: state.pct, mode: state.mode, customText: String(state.size) }),
    showMutations: (list) => mutations.render(list),
  };
}
