// src/data/index.ts
// Unified data access layer: dynamic capture first, hardcoded fallback.

import { MGData } from "./dynamic";
import * as hardcoded from "./hardcoded-data.clean.js";

export { MGData } from "./dynamic";
export type { CapturedDataKey, DataKey, DataBag, AbilityColor } from "./dynamic";
export type { ActivityLogEntry, PetAbilityAction } from "./dynamic";
export { formatAbilityLog, filterPetAbilityLogs, isPetAbilityAction, PET_ABILITY_ACTIONS } from "./dynamic";

/* ------------------------------------------------------------------ */
/*  Helper: create a proxy that reads dynamic data first, then static */
/* ------------------------------------------------------------------ */

type AnyRecord = Record<string, unknown>;

function makeCatalogProxy(dynamicKey: string, staticObj: AnyRecord): AnyRecord {
  return new Proxy(Object.create(null) as AnyRecord, {
    get(_target, prop, receiver) {
      if (typeof prop === "symbol") return undefined;
      const dynamic = MGData.get(dynamicKey as "plants") as AnyRecord | null;
      if (dynamic && prop in dynamic) return dynamic[prop];
      if (prop in staticObj) return (staticObj as AnyRecord)[prop];
      return undefined;
    },
    has(_target, prop) {
      if (typeof prop === "symbol") return false;
      const dynamic = MGData.get(dynamicKey as "plants") as AnyRecord | null;
      if (dynamic && prop in dynamic) return true;
      return prop in staticObj;
    },
    ownKeys() {
      const dynamic = MGData.get(dynamicKey as "plants") as AnyRecord | null;
      const staticKeys = Object.keys(staticObj);
      if (!dynamic) return staticKeys;
      const merged = new Set([...Object.keys(dynamic), ...staticKeys]);
      return Array.from(merged);
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      const dynamic = MGData.get(dynamicKey as "plants") as AnyRecord | null;
      if (dynamic && prop in dynamic) {
        return { configurable: true, enumerable: true, value: dynamic[prop] };
      }
      if (prop in staticObj) {
        return { configurable: true, enumerable: true, value: (staticObj as AnyRecord)[prop] };
      }
      return undefined;
    },
  });
}

/* ------------------------------------------------------------------ */
/*  Proxied catalogs (dynamic-first, hardcoded fallback)               */
/* ------------------------------------------------------------------ */

export const plantCatalog = makeCatalogProxy("plants", hardcoded.plantCatalog as AnyRecord);
export const petCatalog = makeCatalogProxy("pets", hardcoded.petCatalog as AnyRecord);
export const petAbilities = makeCatalogProxy("abilities", hardcoded.petAbilities as AnyRecord);
export const mutationCatalog = makeCatalogProxy("mutations", hardcoded.mutationCatalog as AnyRecord);
export const eggCatalog = makeCatalogProxy("eggs", hardcoded.eggCatalog as AnyRecord);
export const toolCatalog = makeCatalogProxy("items", hardcoded.toolCatalog as AnyRecord);
export const decorCatalog = makeCatalogProxy("decor", hardcoded.decorCatalog as AnyRecord);
export const weatherCatalog = makeCatalogProxy("weather", hardcoded.weatherCatalog as AnyRecord);

/* ------------------------------------------------------------------ */
/*  Static-only re-exports (no dynamic equivalent)                     */
/* ------------------------------------------------------------------ */

export const rarity = hardcoded.rarity;
export const harvestType = hardcoded.harvestType;
export const coin = hardcoded.coin;

/**
 * Rarities from least to most rare, as the game orders them.
 *
 * Comes from MGData's `enums`, so a new tier added to the game slots in on its
 * own; the hardcoded constants order it until that data lands.
 */
export function rarityOrder(): string[] {
  const list = MGData.get("enums")?.rarity;
  if (Array.isArray(list)) {
    const values = list.filter((value): value is string => typeof value === "string" && !!value);
    if (values.length) return values;
  }
  return Object.values(hardcoded.rarity);
}

/**
 * The game's frame name for a rarity differs from its value in exactly one
 * place: `Mythical` is drawn by `RarityMythic`.
 */
const RARITY_SPRITE_NAMES: Record<string, string> = { Mythical: "Mythic" };

/** Atlas frame key for a rarity's badge, or null when it isn't a known one. */
export function raritySprite(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  // The game bundle says "Mythic" where the catalogs say "Mythical".
  const normalized = value === "Mythic" ? hardcoded.rarity.Mythic : value;
  if (!rarityOrder().includes(normalized)) return null;
  return `sprite/ui/Rarity${RARITY_SPRITE_NAMES[normalized] ?? normalized}`;
}

/** Position of a rarity in `rarityOrder`, with unknown values sorted last. */
export function rarityRank(value: unknown): number {
  if (typeof value !== "string") return Number.MAX_SAFE_INTEGER;
  // The game bundle says "Mythic" where the catalogs say "Mythical".
  const normalized = value === "Mythic" ? hardcoded.rarity.Mythic : value;
  const index = rarityOrder().indexOf(normalized);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

// Hunger depletion minutes per species. Static-only on purpose — the game
// bundle and MGData both lack it, and it must NOT be folded into petCatalog:
// makeCatalogProxy resolves per species, so a hardcoded field would be
// shadowed by MGData's entry. See hardcoded-data.clean.js for details.
export const petHungerDepletionMinutes = hardcoded.petHungerDepletionMinutes as Record<string, number | undefined>;

// Tile refs (sprite references, no dynamic equivalent)
export const tileRefsMap = hardcoded.tileRefsMap;
export const tileRefsPlants = hardcoded.tileRefsPlants;
export const tileRefsTallPlants = hardcoded.tileRefsTallPlants;
export const tileRefsSeeds = hardcoded.tileRefsSeeds;
export const tileRefsItems = hardcoded.tileRefsItems;
export const tileRefsAnimations = hardcoded.tileRefsAnimations;
export const tileRefsPets = hardcoded.tileRefsPets;
export const tileRefsMutations = hardcoded.tileRefsMutations;
export const tileRefsMutationLabels = hardcoded.tileRefsMutationLabels;
export const tileRefsDecor = hardcoded.tileRefsDecor;
