// The item picker's state: plants or decor, the search text, the selected
// entry and how it is configured. Together they make the "brush" the next
// click places.

import { decorCatalog, plantCatalog } from "../../data";
import { cropName, decorLabel } from "../../data/names";
import type { TileObject } from "./gardenModel";
import {
  brushPlantObject,
  emptyBrushSlots,
  maxSlotsForPlant,
  syncBrushSlots,
  type BrushSlots,
} from "./brushSlots";

export type PickerMode = "plants" | "decor";

export type PickerEntry = { id: string; label: string };

/** What the item picker shows and has selected. The panels read and write it directly. */
export const picker = {
  mode: "plants" as PickerMode,
  query: "",
  selectedPlantId: null as string | null,
  selectedDecorId: null as string | null,
  /** Rotation for the next decor, chosen in the picker rather than on a real inventory item. */
  decorRotation: 0,
};

let brushSlots: BrushSlots = emptyBrushSlots();

export const getSelectedId = (): string | null =>
  picker.mode === "decor" ? picker.selectedDecorId : picker.selectedPlantId;

export function setSelectedId(id: string | null): void {
  if (picker.mode === "decor") picker.selectedDecorId = id;
  else picker.selectedPlantId = id;
}

export const getMaxSlotsForSpecies = (species: string): number =>
  maxSlotsForPlant((plantCatalog as Record<string, unknown>)[species]);

/** The brush slots for `species`, reset or trimmed to fit it first. */
export function brushSlotsFor(species: string): BrushSlots {
  brushSlots = syncBrushSlots(brushSlots, species, getMaxSlotsForSpecies(species));
  return brushSlots;
}

/** Applies an edit to the brush slots of `species`. */
export function editBrushSlots(species: string, edit: (state: BrushSlots) => BrushSlots): BrushSlots {
  brushSlots = edit(brushSlotsFor(species));
  return brushSlots;
}

/** Display name of a picker entry. */
export const entryLabel = (mode: PickerMode, id: string): string =>
  mode === "decor" ? decorLabel(id) : cropName(id);

/** The picker's entries for its mode, filtered by the search text. */
export function pickerEntries(): PickerEntry[] {
  const catalog = picker.mode === "decor" ? decorCatalog : plantCatalog;
  const all = Object.keys(catalog || {}).map((id) => ({ id, label: entryLabel(picker.mode, id) }));
  const query = picker.query.trim().toLowerCase();
  return query ? all.filter((entry) => entry.label.toLowerCase().includes(query)) : all;
}

/** The tile object the brush places, or null when nothing is selected. */
export function buildBrushTileObject(): TileObject | null {
  const id = getSelectedId();
  if (!id) return null;
  if (picker.mode === "decor") return { objectType: "decor", decorId: id, rotation: picker.decorRotation };
  return brushPlantObject(id, brushSlotsFor(id).slots, getMaxSlotsForSpecies(id));
}
