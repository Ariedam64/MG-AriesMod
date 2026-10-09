// The right panel: the object on the tile last clicked, with its editor and a
// Remove button. With no object there, it shows the picker's brush instead.

import { button } from "../../../ui/kit/button";
import { h } from "../../../ui/kit/dom";
import { cropName, decorLabel } from "../../../data/names";
import type { Unsubscribe } from "../../../lib/emitter";
import { brushSlotsFor, entryLabel, getSelectedId, picker } from "../brush";
import { createDecorRotationControl } from "../decorRotation";
import type { TileObject } from "../gardenModel";
import { readTileObjectAt, removeGardenObjectAtCurrentTile, updateGardenObjectAtCurrentTile } from "../planEdits";
import { currentItemChanged, getCurrentEditorTile } from "../session";
import { entryIcon } from "./entryIcon";
import { mutationTag, sortMutationIds } from "./mutationPicker";
import { floatingPanel, hint, iconWithName, panelLabel } from "./panelChrome";
import { renderPlantSlotsEditor } from "./plantSlotsEditor";

let root: HTMLDivElement | null = null;
let content: HTMLDivElement | null = null;
let stopFollowing: Unsubscribe | null = null;

export function showCurrentItemPanel(): void {
  if (root && document.contains(root)) return;

  const panel = floatingPanel({ id: "qws-editor-current-item", side: "right", title: "Current item" });
  content = panel.body;
  content.id = "qws-editor-current-item-content";
  content.classList.add("qws-ed-scroll", "qmm-scroll");
  root = panel.root;

  stopFollowing = currentItemChanged.on(renderCurrentItem);
  renderCurrentItem();
}

export function hideCurrentItemPanel(): void {
  stopFollowing?.();
  stopFollowing = null;
  root?.remove();
  root = content = null;
}

function objectLabel(obj: TileObject): string {
  if (obj.objectType === "plant") return obj.species ? cropName(obj.species) : "Plant";
  if (obj.objectType === "decor") return decorLabel(obj.decorId);
  return String(obj.objectType || "Item");
}

function renderCurrentItem(): void {
  if (!content) return;
  content.replaceChildren();

  const target = getCurrentEditorTile();
  const obj = target ? readTileObjectAt(target) : null;
  if (!target || !obj) {
    renderBrushSummary(content);
    return;
  }

  const name = objectLabel(obj);
  const isDecor = obj.objectType === "decor";
  const iconId = String((isDecor ? obj.decorId : obj.species) || name);
  content.appendChild(iconWithName(entryIcon(isDecor ? "decor" : "plant", iconId, name, 48), name, 15));

  if (obj.objectType === "plant") {
    renderPlantSlotsEditor(content, obj, String(target.localTileIndex));
  } else if (isDecor) {
    // No redraw on select: the control owns its preview, and rebuilding the
    // panel mid-drag would recreate the slider.
    content.appendChild(
      createDecorRotationControl(String(obj.decorId || ""), Number(obj.rotation) || 0, (angle) => {
        updateGardenObjectAtCurrentTile((o) => ({ ...o, rotation: angle }));
      }),
    );
  }

  content.appendChild(
    button("Remove", { variant: "danger", fullWidth: true, onClick: () => void removeGardenObjectAtCurrentTile() }),
  );
}

/** No object on the tile: the hint, then what the next click would place. */
function renderBrushSummary(into: HTMLElement): void {
  const empty = hint("Click a plant or decor to edit it.");
  empty.style.padding = "var(--qmm-space-md) 0";
  into.appendChild(empty);

  const id = getSelectedId();
  if (!id) return;
  const isDecor = picker.mode === "decor";
  const label = entryLabel(picker.mode, id);

  const brush = h("div", "qws-ed-section qws-ed-brush");
  brush.style.justifyItems = "center";
  brush.append(panelLabel("Next placement"), iconWithName(entryIcon(isDecor ? "decor" : "plant", id, label, 40), label, 14));
  into.appendChild(brush);
  if (isDecor) return;

  const active = new Set<string>();
  for (const cfg of brushSlotsFor(id).slots) {
    if (cfg.enabled) cfg.mutations.forEach((m) => active.add(m));
  }

  const tags = h("div", "qws-ed-tags");
  if (active.size) {
    for (const mutationId of sortMutationIds([...active])) tags.appendChild(mutationTag(mutationId));
  } else {
    tags.appendChild(h("div", "qws-ed-note", "No mutations"));
  }
  brush.appendChild(tags);
}
