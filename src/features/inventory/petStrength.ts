// A pet's strength and its maximum, worked out the way the game does from its
// XP, its scale and its species' catalog entry.

import { memoOnCatalogs, petCatalog } from "../../data";
import { clamp } from "../../lib/math";
import { itemTypeOf, readNestedNumber, readNestedString } from "./itemInfo";

type PetStats = { maxScale: number; hoursToMature: number };

/** "Golden Bee", "goldenbee" and "GoldenBeeBaby" all key to "goldenbee". */
const speciesKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/(seed|plant|baby|fruit|crop)$/i, "");

/** Pets keep `maxScale`: the Crop Size rework renamed it for crops only. */
const petStatsBySpecies = memoOnCatalogs(() => {
  const map = new Map<string, PetStats>();
  const register = (key: unknown, stats: PetStats) => {
    if (typeof key !== "string") return;
    const normalized = speciesKey(key);
    if (normalized && !map.has(normalized)) map.set(normalized, stats);
  };
  for (const [species, entry] of Object.entries(petCatalog as Record<string, any>)) {
    const maxScale = Number(entry?.maxScale);
    const hoursToMature = Number(entry?.hoursToMature);
    if (!Number.isFinite(maxScale) || maxScale <= 1) continue;
    if (!Number.isFinite(hoursToMature) || hoursToMature <= 0) continue;
    register(species, { maxScale, hoursToMature });
    register(entry?.name, { maxScale, hoursToMature });
  }
  return map;
});

function statsFor(item: any): PetStats | null {
  for (const field of ["petSpecies", "species", "name"]) {
    const candidate = readNestedString(item, field);
    if (!candidate) continue;
    const key = speciesKey(candidate);
    const stats = key ? petStatsBySpecies().get(key) : undefined;
    if (stats) return stats;
  }
  return null;
}

/**
 * Strength out of `maxStrength`. The maximum runs from 80 to 100 with the
 * pet's scale, and XP adds up to 30 over the species' time to mature.
 */
export function getPetStrengthInfo(item: any): { strength: number; maxStrength: number } | null {
  if (!item || typeof item !== "object" || itemTypeOf(item) !== "Pet") return null;
  const stats = statsFor(item);
  if (!stats) return null;
  const { maxScale, hoursToMature } = stats;

  const xp = Math.max(0, readNestedNumber(item, "xp") ?? 0);
  const xpComponent = Math.min(Math.floor((xp / (hoursToMature * 3600)) * 30), 30);

  const scale = clamp(readNestedNumber(item, "targetScale") ?? 1, 1, maxScale);
  const maxStrength = clamp(Math.floor(((scale - 1) / (maxScale - 1)) * 20 + 80), 0, 100);
  const strength = clamp(xpComponent + maxStrength - 30, 0, maxStrength);
  return { strength, maxStrength };
}

export const getPetStrength = (item: any): number | null => getPetStrengthInfo(item)?.strength ?? null;
