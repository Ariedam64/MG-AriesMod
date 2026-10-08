// The saved-garden list as data: how a stored list is read back, how names are
// kept unique, and how a new save joins the list. Storage itself lives in
// `savedGardens.ts`.

import type { GardenState } from "../../game/store/atoms";
import { sanitizeGarden } from "./gardenModel";

export type SavedGarden = {
  id: string;
  name: string;
  createdAt: number;
  garden: GardenState;
};

/** Oldest saves fall off past this many. */
export const MAX_SAVED_GARDENS = 50;

const UNTITLED = "Untitled";

/** A stored list as saved gardens; entries without an id are dropped. */
export function parseSavedGardens(raw: unknown, now = Date.now()): SavedGarden[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      const g = (entry ?? {}) as Record<string, unknown>;
      return {
        id: String(g.id || ""),
        name: String(g.name || UNTITLED),
        createdAt: Number(g.createdAt) || now,
        garden: sanitizeGarden(g.garden || {}),
      };
    })
    .filter((g) => !!g.id);
}

/** `base`, or `base (1)`, `base (2)`... whichever is not taken yet. */
export function uniqueGardenName(base: string, existing: string[]): string {
  const taken = new Set(existing);
  let candidate = base;
  for (let i = 1; taken.has(candidate); i++) candidate = `${base} (${i})`;
  return candidate;
}

export const newSavedGardenId = (now: number): string => `${now}-${Math.random().toString(16).slice(2)}`;

/** The name a save goes under: trimmed, or `fallback` when blank. */
export const gardenSaveName = (name: string | null | undefined, fallback = UNTITLED): string =>
  name?.trim() || fallback;

/** Puts a new save first and drops the oldest past the cap. */
export const prependSaved = (list: SavedGarden[], saved: SavedGarden): SavedGarden[] =>
  [saved, ...list].slice(0, MAX_SAVED_GARDENS);

/** Replaces the save with the same id, in place. */
export const replaceSaved = (list: SavedGarden[], saved: SavedGarden): SavedGarden[] =>
  list.map((g) => (g.id === saved.id ? saved : g));

/** A garden as the JSON file the menu exports. */
export const serializeGarden = (garden: GardenState): string => JSON.stringify(garden, null, 2);

/** An imported file's text as a garden, or null when it is not JSON. */
export function parseGardenJson(raw: string): GardenState | null {
  if (!raw) return null;
  try {
    return sanitizeGarden(JSON.parse(raw));
  } catch {
    return null;
  }
}
