// The right panel: the object on the tile last clicked, with its editor and a
// Remove button. With no object there, it shows the picker's brush instead.

import { button } from "../../../ui/kit/button";
import { cropName, decorLabel } from "../../../data/names";
import type { Unsubscribe } from "../../../lib/emitter";
import { brushSlotsFor, entryLabel, getSelectedId, picker } from "../brush";
import { createDecorRotationControl } from "../decorRotation";
import type { TileObject } from "../gardenModel";
import { readTileObjectAt, removeGardenObjectAtCurrentTile, updateGardenObjectAtCurrentTile } from "../planEdits";
import { currentItemChanged, getCurrentEditorTile } from "../session";
import { entryIcon } from "./entryIcon";
import { mutationTag, sortMutationIds } from "./mutationPicker";
import { floatingPanel, hint, iconWithName } from "./panelChrome";
import { renderPlantSlotsEditor } from "./plantSlotsEditor";

let root: HTMLDivElement | null = null;
let content: HTMLDivElement | null = null;
let stopFollowing: Unsubscribe | null = null;

export function showCurrentItemPanel(): void {
  if (root && document.contains(root)) return;

  const panel = floatingPanel({
    id: "qws-editor-current-item",
    side: "right",
    title: "✨ Current item",
    style: { minHeight: "200px" },
  });

  content = document.createElement("div");
  content.id = "qws-editor-current-item-content";
  Object.assign(content.style, { display: "grid", gap: "10px", minHeight: "0", overflow: "auto" });
  panel.root.appendChild(content);
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
  into.appendChild(hint("Click on a plant or item to edit it."));

  const id = getSelectedId();
  if (!id) return;
  const isDecor = picker.mode === "decor";
  const label = entryLabel(picker.mode, id);
  into.appendChild(iconWithName(entryIcon(isDecor ? "decor" : "plant", id, label, 40), label, 14));
  if (isDecor) return;

  const active = new Set<string>();
  for (const cfg of brushSlotsFor(id).slots) {
    if (cfg.enabled) cfg.mutations.forEach((m) => active.add(m));
  }

  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", flexWrap: "wrap", gap: "6px", justifyContent: "center" });
  if (active.size) {
    for (const mutationId of sortMutationIds([...active])) row.appendChild(mutationTag(mutationId));
  } else {
    const none = document.createElement("div");
    none.textContent = "No mutations";
    Object.assign(none.style, { opacity: "0.7", fontSize: "11px" });
    row.appendChild(none);
  }
  into.appendChild(row);
}
