// The lower half of the item picker: the selected entry, and how the next one
// placed is configured (slots, size and mutations for a plant, rotation for a
// decor).

import { h } from "../../../ui/kit/dom";
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
import { hint, panelLabel } from "./panelChrome";
import { sizeControls, slotCard, slotTitle } from "./sizeControls";
import { editAllRow, slotCountRow } from "./slotOptions";
import { ensureEditorStyles } from "./styles";

export function renderBrushDetails(wrap: HTMLElement): void {
  ensureEditorStyles();
  const content = h("div", "qws-ed-brush");
  wrap.replaceChildren(content);

  const id = getSelectedId();
  if (!id) {
    const empty = hint("Pick a plant or decor above to place it.");
    empty.style.padding = "var(--qmm-space-lg) 0";
    content.appendChild(empty);
    return;
  }

  content.appendChild(selectedEntryRow(id));

  if (picker.mode === "plants") {
    content.appendChild(brushSlotsPanel(id, () => renderBrushDetails(wrap)));
  } else {
    // The control repaints its own preview, so the panel is not redrawn here:
    // that would recreate the slider and lose the drag.
    content.appendChild(
      createDecorRotationControl(id, picker.decorRotation, (angle) => {
        picker.decorRotation = angle;
      }),
    );
  }
}

function selectedEntryRow(id: string): HTMLElement {
  const label = entryLabel(picker.mode, id);
  const row = h("div", "qws-ed-selected");
  row.append(entryIcon(picker.mode === "decor" ? "decor" : "plant", id, label, 44), h("div", "qws-ed-selected__name", label));
  return row;
}

function brushSlotsPanel(species: string, rerender: () => void): HTMLElement {
  const maxSlots = getMaxSlotsForSpecies(species);
  const state = brushSlotsFor(species);

  const panel = h("div", "qws-ed-opts");

  if (maxSlots > 1) {
    panel.append(
      slotCountRow(state.slots.length, maxSlots, {
        onRemove: () => {
          editBrushSlots(species, removeBrushSlot);
          rerender();
        },
        onAdd: () => {
          editBrushSlots(species, (s) => addBrushSlot(s, maxSlots));
          rerender();
        },
      }),
      editAllRow(state.applyAll, (on) => {
        editBrushSlots(species, (s) => ({ ...s, applyAll: on }));
        rerender();
      }),
    );
  }

  const list = h("div", "qws-ed-slots");

  const boxes: Array<(cfg: BrushSlotConfig) => void> = [];
  /** After an edit with "edit all", every other box shows its new config. */
  const syncOthers = (next: BrushSlots, from: number) => {
    if (!next.applyAll) return;
    next.slots.forEach((cfg, i) => {
      if (i !== from) boxes[i]?.(cfg);
    });
  };

  state.slots.forEach((cfg, idx) => {
    const { root, show } = brushSlotBox(species, idx, slotTitle(idx, maxSlots), cfg, syncOthers, rerender);
    boxes.push(show);
    list.appendChild(root);
  });

  panel.appendChild(list);
  return panel;
}

/** The size and mutations of one brush slot. `show` redraws it for a config changed elsewhere. */
function brushSlotBox(
  species: string,
  idx: number,
  title: string,
  initial: BrushSlotConfig,
  syncOthers: (next: BrushSlots, from: number) => void,
  rerender: () => void,
): { root: HTMLElement; show: (cfg: BrushSlotConfig) => void } {
  let cfg = initial;
  const size = sizeControls();

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

  const mutations = mutationPicker((mutationId) => {
    editBrushSlots(species, (s) => toggleBrushMutation(s, idx, mutationId));
    rerender();
  }, panelLabel("Mutations"));
  mutations.render(Array.isArray(initial.mutations) ? initial.mutations : []);

  const root = slotCard(title, size, [mutations.row, mutations.dropdown]);
  show(initial, true);
  return { root, show: (next) => show(next, true) };
}
