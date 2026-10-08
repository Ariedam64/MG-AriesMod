// The lower half of the item picker: the selected entry, and how the next one
// placed is configured (slots, size and mutations for a plant, rotation for a
// decor).

import { plainCard, sectionLabel } from "../../../ui/kit/card";
import { switchInput } from "../../../ui/kit/toggles";
import { createDecorRotationControl } from "../decorRotation";
import {
  addBrushSlot,
  brushSlotSize,
  patchBrushSlot,
  removeBrushSlot,
  toggleBrushMutation,
  type BrushSlotConfig,
  type BrushSlots,
} from "../brushSlots";
import { brushSlotsFor, editBrushSlots, entryLabel, getMaxSlotsForSpecies, getSelectedId, picker } from "../brush";
import { clampSizePercent, parseSizeText, type SlotScaleMode } from "../slotSize";
import { entryIcon } from "./entryIcon";
import { mutationPicker } from "./mutationPicker";
import { hint, roundButton } from "./panelChrome";
import { sizeControls, sizeHeader } from "./sizeControls";

export function renderBrushDetails(wrap: HTMLElement): void {
  const content = document.createElement("div");
  Object.assign(content.style, {
    display: "grid",
    gap: "10px",
    minHeight: "0",
    overflow: "auto",
    alignContent: "flex-start",
    justifyItems: "center",
  });
  wrap.replaceChildren(content);

  const id = getSelectedId();
  if (!id) {
    content.appendChild(hint("Select an item on the left."));
    return;
  }

  content.appendChild(selectedEntryRow(id));

  if (picker.mode === "plants") {
    content.appendChild(brushSlotsPanel(id, () => renderBrushDetails(wrap)));
  } else {
    // The control repaints its own preview, so the panel is not redrawn here:
    // that would recreate the slider and lose the drag.
    const rotation = createDecorRotationControl(id, picker.decorRotation, (angle) => {
      picker.decorRotation = angle;
    });
    rotation.style.marginTop = "6px";
    content.appendChild(rotation);
  }
}

function selectedEntryRow(id: string): HTMLElement {
  const label = entryLabel(picker.mode, id);
  const row = document.createElement("div");
  Object.assign(row.style, { display: "grid", gridTemplateColumns: "auto 1fr", alignItems: "center", gap: "10px" });
  const name = document.createElement("div");
  name.textContent = label;
  Object.assign(name.style, { fontWeight: "700", fontSize: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" });
  row.append(entryIcon(picker.mode === "decor" ? "decor" : "plant", id, label, 48), name);
  return row;
}

function brushSlotsPanel(species: string, rerender: () => void): HTMLElement {
  const maxSlots = getMaxSlotsForSpecies(species);
  const state = brushSlotsFor(species);

  const panel = document.createElement("div");
  Object.assign(panel.style, { display: "grid", gap: "6px", marginTop: "6px", width: "100%" });

  if (maxSlots > 1) panel.append(...slotCountRows(species, state, maxSlots, rerender));

  const list = document.createElement("div");
  Object.assign(list.style, { display: "grid", gap: "6px" });

  const boxes: Array<(cfg: BrushSlotConfig) => void> = [];
  /** After an edit with "edit all", every other box shows its new config. */
  const syncOthers = (next: BrushSlots, from: number) => {
    if (!next.applyAll) return;
    next.slots.forEach((cfg, i) => {
      if (i !== from) boxes[i]?.(cfg);
    });
  };

  state.slots.forEach((cfg, idx) => {
    const { root, show } = brushSlotBox(species, idx, cfg, syncOthers, rerender);
    boxes.push(show);
    list.appendChild(root);
  });

  panel.appendChild(list);
  return panel;
}

/** "Slots n/max" with its +/- buttons, then the "edit all slots together" switch. */
function slotCountRows(species: string, state: BrushSlots, maxSlots: number, rerender: () => void): HTMLElement[] {
  const header = document.createElement("div");
  Object.assign(header.style, { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", opacity: "0.9" });

  const right = document.createElement("div");
  Object.assign(right.style, { display: "flex", gap: "6px", alignItems: "center" });
  const count = document.createElement("span");
  count.textContent = `${state.slots.length}/${maxSlots}`;
  right.append(
    count,
    roundButton("-", () => {
      editBrushSlots(species, removeBrushSlot);
      rerender();
    }, "danger"),
    roundButton("+", () => {
      editBrushSlots(species, (s) => addBrushSlot(s, maxSlots));
      rerender();
    }),
  );
  const title = document.createElement("span");
  title.textContent = "Slots";
  header.append(title, right);

  const applyAllRow = document.createElement("label");
  Object.assign(applyAllRow.style, { display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", opacity: "0.9", cursor: "pointer" });
  const applyAll = switchInput(state.applyAll, (on) => {
    editBrushSlots(species, (s) => ({ ...s, applyAll: on }));
    rerender();
  });
  applyAllRow.append(applyAll, document.createTextNode("Edit all slots together"));

  return [header, applyAllRow];
}

/** The size and mutations of one brush slot. `show` redraws it for a config changed elsewhere. */
function brushSlotBox(
  species: string,
  idx: number,
  initial: BrushSlotConfig,
  syncOthers: (next: BrushSlots, from: number) => void,
  rerender: () => void,
): { root: HTMLElement; show: (cfg: BrushSlotConfig) => void } {
  let cfg = initial;
  const size = sizeControls("Custom");
  size.modeLabel.style.fontSize = "10px";
  size.modeLabel.style.opacity = "0.75";

  /** Shows a config. The custom field keeps what the player is typing unless `rewriteField`. */
  const show = (next: BrushSlotConfig, rewriteField: boolean) => {
    cfg = next;
    const pct = brushSlotSize(next);
    size.show({ pct, mode: next.sizeMode, customText: rewriteField ? String(pct) : undefined });
  };

  const edit = (mode: SlotScaleMode, patch: Partial<BrushSlotConfig>, typing = false) => {
    const next = editBrushSlots(species, (s) => patchBrushSlot(s, idx, mode, patch));
    show(next.slots[idx], !typing);
    syncOthers(next, idx);
  };

  // The last size this box set, and the slider's value. Switching modes
  // brings each back: while custom, the stored percent follows the typed size.
  let lastSize = brushSlotSize(initial);
  let percentMemory = clampSizePercent(initial.sizePercent);

  size.slider.oninput = () => {
    const pct = clampSizePercent(Number(size.slider.value));
    lastSize = percentMemory = pct;
    edit("percent", { sizePercent: pct, customScale: pct });
  };
  size.customInput.oninput = () => {
    const typed = parseSizeText(size.customInput.value);
    if (typed == null) return;
    lastSize = clampSizePercent(typed);
    edit("custom", { customScale: lastSize }, true);
  };
  size.modeSwitch.onchange = () => {
    if (size.modeSwitch.checked) {
      percentMemory = clampSizePercent(cfg.sizePercent);
      edit("custom", { customScale: lastSize });
    } else {
      edit("percent", { sizePercent: percentMemory });
    }
  };

  const prefix = sectionLabel("Mutations:");
  prefix.style.flexShrink = "0";
  const mutations = mutationPicker((mutationId) => {
    editBrushSlots(species, (s) => toggleBrushMutation(s, idx, mutationId));
    rerender();
  }, prefix);
  mutations.render(Array.isArray(initial.mutations) ? initial.mutations : []);

  const mutationsWrap = document.createElement("div");
  Object.assign(mutationsWrap.style, { display: "grid", gap: "4px" });
  mutationsWrap.append(mutations.row, mutations.dropdown);

  const root = plainCard();
  root.style.gap = "8px";
  root.append(sizeHeader(size.value, size.modeLabel), size.slider, size.customRow, mutationsWrap);
  show(initial, true);
  return { root, show: (next) => show(next, true) };
}
