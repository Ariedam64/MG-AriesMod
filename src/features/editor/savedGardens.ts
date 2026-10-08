// Saved gardens: kept in the mod's storage under `editor.savedGardens`, newest
// first. Saving reads the plan while editing, else the real garden.

import { Emitter } from "../../lib/emitter";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { getPlayerId } from "./liveGarden";
import { getGardenForPlayer, setCurrentGarden } from "./plannedGarden";
import {
  gardenSaveName,
  newSavedGardenId,
  parseGardenJson,
  parseSavedGardens,
  prependSaved,
  replaceSaved,
  serializeGarden,
  uniqueGardenName,
  type SavedGarden,
} from "./savedGardenList";

export type { SavedGarden };

const SAVED_GARDENS_PATH = "editor.savedGardens";

/** Fired after the saved list changed. */
export const savedGardensChanged = new Emitter<void>();

export function listSavedGardens(): SavedGarden[] {
  try {
    return parseSavedGardens(readAriesPath<unknown>(SAVED_GARDENS_PATH));
  } catch {
    return [];
  }
}

function writeSavedGardens(list: SavedGarden[]): void {
  try {
    writeAriesPath(SAVED_GARDENS_PATH, list);
  } catch {
    return;
  }
  savedGardensChanged.emit();
}

const confirmOverwrite = (name: string): boolean =>
  typeof window !== "undefined" &&
  typeof window.confirm === "function" &&
  window.confirm(`A garden named "${name}" already exists. Overwrite it?`);

/**
 * Saves a player's garden (the local player by default). A name already in
 * use asks whether to overwrite; declining saves under a numbered name.
 */
export async function saveCurrentGarden(name: string, playerId?: string | null): Promise<SavedGarden | null> {
  const pid = playerId || (await getPlayerId());
  if (!pid) return null;
  const garden = await getGardenForPlayer(pid);
  if (!garden) return null;

  const now = Date.now();
  const all = listSavedGardens();
  const baseName = gardenSaveName(name);
  const existing = all.find((g) => g.name === baseName);
  const overwrite = !!existing && confirmOverwrite(baseName);

  const saved: SavedGarden = {
    id: overwrite ? existing!.id : newSavedGardenId(now),
    name: overwrite ? baseName : uniqueGardenName(baseName, all.map((g) => g.name)),
    createdAt: now,
    garden,
  };
  writeSavedGardens(overwrite ? replaceSaved(all, saved) : prependSaved(all, saved));
  return saved;
}

export async function loadSavedGarden(id: string): Promise<boolean> {
  const found = id ? listSavedGardens().find((g) => g.id === id) : undefined;
  return found ? setCurrentGarden(found.garden) : false;
}

export function deleteSavedGarden(id: string): boolean {
  if (!id) return false;
  const all = listSavedGardens();
  const next = all.filter((g) => g.id !== id);
  if (next.length === all.length) return false;
  writeSavedGardens(next);
  return true;
}

/** A saved garden as JSON text, or null when there is no such save. */
export function exportSavedGarden(id: string): string | null {
  const found = id ? listSavedGardens().find((g) => g.id === id) : undefined;
  return found ? serializeGarden(found.garden) : null;
}

/** Saves a garden from JSON text. Null when the text is not JSON. */
export async function importGarden(name: string, raw: string): Promise<SavedGarden | null> {
  const garden = parseGardenJson(raw);
  if (!garden) return null;
  const now = Date.now();
  const saved: SavedGarden = {
    id: newSavedGardenId(now),
    name: gardenSaveName(name, "Imported garden"),
    createdAt: now,
    garden,
  };
  writeSavedGardens(prependSaved(listSavedGardens(), saved));
  return saved;
}
