// Which pets the locker's Sell All Pets protections catch: a protected colour
// mutation, a max STR at or above the threshold, or a protected rarity.

import { petCatalog } from "../../data";
import { getPetInfo } from "../../data/rules/petValue";
import { clampFinite } from "../../lib/math";
import { lockerRestrictionsService } from "../locker/restrictions";

export type InventoryPet = {
  id: string;
  itemType: "Pet";
  petSpecies?: string;
  name?: string | null;
  mutations?: string[];
  [key: string]: unknown;
};

export type FlaggedPet = {
  pet: InventoryPet;
  /** Why the pet is protected, e.g. "Mutation: Gold", "Max STR: 97". */
  reasons: string[];
  mutations: string[];
};

/** The pets the current rules protect, each with its reasons. Empty when the rules are off. */
export function flagProtectedPets(pets: InventoryPet[]): FlaggedPet[] {
  const rules = lockerRestrictionsService.getSellAllPetsRules();
  if (!rules.enabled) return [];

  const protectedColors = new Map<string, string>();
  if (rules.protectGold) protectedColors.set("gold", "Gold");
  if (rules.protectRainbow) protectedColors.set("rainbow", "Rainbow");
  const maxStrThreshold = Math.round(clampFinite(rules.maxStrThreshold, 0, 100, 0));
  const protectedRarities = new Set(rules.protectedRarities);

  const flagged: FlaggedPet[] = [];
  for (const pet of pets) {
    const mutations = (Array.isArray(pet.mutations) ? pet.mutations : []).filter((m): m is string => typeof m === "string");
    const colors = new Set(mutations.map((m) => protectedColors.get(m.toLowerCase())).filter((c): c is string => !!c));

    const maxStrength = getPetInfo(pet as any)?.maxStrength;
    const strong = rules.protectMaxStr && typeof maxStrength === "number" && Number.isFinite(maxStrength) && maxStrength >= maxStrThreshold;

    const species = String(pet.petSpecies || "").trim();
    const rarity = species ? ((petCatalog as Record<string, { rarity?: string } | undefined>)[species]?.rarity ?? "") : "";
    const rare = rarity !== "" && protectedRarities.has(rarity);

    const reasons = [
      ...Array.from(colors, (color) => `Mutation: ${color}`),
      ...(strong ? [`Max STR: ${Math.floor(maxStrength ?? 0)}`] : []),
      ...(rare ? [`Rarity: ${rarity}`] : []),
    ];
    if (reasons.length) flagged.push({ pet, reasons, mutations });
  }
  return flagged;
}
