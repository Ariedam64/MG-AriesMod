import { mutationCatalog } from "../../data";

/**
 * Mutations rolled at random (Gold, Rainbow...): those with a base chance.
 *
 * Every other mutation has a zero chance because it is put on a crop by its
 * surroundings, never rolled. Reading the catalog keeps this right the day the
 * game adds a third one. Read on each call: at document-start the live catalog
 * has not answered yet.
 */
export function rolledMutations(): string[] {
  try {
    return Object.entries(mutationCatalog as Record<string, { baseChance?: unknown }>)
      .filter(([, def]) => Number(def?.baseChance) > 0)
      .map(([name]) => name);
  } catch {
    return [];
  }
}
