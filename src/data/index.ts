import { MGData } from "./live";
import type { DataKey } from "./live/types";
import * as bundled from "./bundledCatalogs.js";

/**
 * The game's catalogs. Each one serves the live API data first and the copy
 * bundled with the mod as a fallback, entry by entry.
 *
 * The live data lands a moment after boot, so a catalog read at import time
 * sees only the bundled copy. Read catalogs inside functions, or derive from
 * them through `memoOnCatalogs`.
 */

export { formatAbilityLog, isPetAbilityAction } from "./live";

type AnyRecord = Record<string, unknown>;

function makeCatalogProxy(liveKey: DataKey, fallback: AnyRecord): AnyRecord {
  const live = () => MGData.get(liveKey) as AnyRecord | null;
  return new Proxy(Object.create(null) as AnyRecord, {
    get(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      const data = live();
      if (data && prop in data) return data[prop];
      return prop in fallback ? fallback[prop] : undefined;
    },
    has(_target, prop) {
      if (typeof prop === "symbol") return false;
      const data = live();
      return (!!data && prop in data) || prop in fallback;
    },
    ownKeys() {
      const data = live();
      const fallbackKeys = Object.keys(fallback);
      return data ? Array.from(new Set([...Object.keys(data), ...fallbackKeys])) : fallbackKeys;
    },
    getOwnPropertyDescriptor(_target, prop) {
      if (typeof prop === "symbol") return undefined;
      const data = live();
      if (data && prop in data) return { configurable: true, enumerable: true, value: data[prop] };
      if (prop in fallback) return { configurable: true, enumerable: true, value: fallback[prop] };
      return undefined;
    },
  });
}

export const plantCatalog = makeCatalogProxy("plants", bundled.plantCatalog as AnyRecord);
export const petCatalog = makeCatalogProxy("pets", bundled.petCatalog as AnyRecord);
export const petAbilities = makeCatalogProxy("abilities", bundled.petAbilities as AnyRecord);
export const mutationCatalog = makeCatalogProxy("mutations", bundled.mutationCatalog as AnyRecord);
export const eggCatalog = makeCatalogProxy("eggs", bundled.eggCatalog as AnyRecord);
export const toolCatalog = makeCatalogProxy("items", bundled.toolCatalog as AnyRecord);
export const decorCatalog = makeCatalogProxy("decor", bundled.decorCatalog as AnyRecord);
export const weatherCatalog = makeCatalogProxy("weather", bundled.weatherCatalog as AnyRecord);

const LIVE_KEYS: DataKey[] = ["plants", "pets", "abilities", "mutations", "eggs", "items", "decor", "weather", "enums"];

/**
 * Wraps a value derived from the catalogs: it is computed on first use, and
 * again whenever live data has landed since. The way to build a lookup table
 * from a catalog without pinning it to the bundled copy.
 */
export function memoOnCatalogs<T>(derive: () => T): () => T {
  let seen: unknown[] | null = null;
  let value: T;
  return () => {
    let stale = seen === null;
    for (let i = 0; !stale && i < LIVE_KEYS.length; i++) {
      stale = MGData.get(LIVE_KEYS[i]) !== seen![i];
    }
    if (stale) {
      seen = LIVE_KEYS.map((key) => MGData.get(key));
      value = derive();
    }
    return value!;
  };
}

// Bundled only: the live API has no equivalent.
export const rarity = bundled.rarity;
export const coin = bundled.coin;

// Hunger depletion minutes per species. Bundled only on purpose: neither the
// game bundle nor the live API has it, and it must not be folded into
// petCatalog, whose proxy resolves per species, so a bundled field would be
// shadowed by the live entry.
export const petHungerDepletionMinutes = bundled.petHungerDepletionMinutes as Record<string, number | undefined>;

// Sprite references for mutations, with no live equivalent.
export const tileRefsMutations = bundled.tileRefsMutations;
export const tileRefsMutationLabels = bundled.tileRefsMutationLabels;

/** Rarities from least to most rare, from the live enums so a new tier slots in on its own. */
function rarityOrder(): string[] {
  const list = MGData.get("enums")?.rarity;
  if (Array.isArray(list)) {
    const values = list.filter((value): value is string => typeof value === "string" && !!value);
    if (values.length) return values;
  }
  return Object.values(bundled.rarity);
}

// The game bundle says "Mythic" where the catalogs say "Mythical".
const normalizeRarity = (value: string) => (value === "Mythic" ? bundled.rarity.Mythic : value);

// A rarity's badge frame matches its value except in one place:
// `Mythical` is drawn by `RarityMythic`.
const RARITY_SPRITE_NAMES: Record<string, string> = { Mythical: "Mythic" };

/** Atlas frame key for a rarity's badge, or null when it isn't a known one. */
export function raritySprite(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const normalized = normalizeRarity(value);
  if (!rarityOrder().includes(normalized)) return null;
  return `sprite/ui/Rarity${RARITY_SPRITE_NAMES[normalized] ?? normalized}`;
}

/** Position of a rarity in `rarityOrder`, with unknown values sorted last. */
export function rarityRank(value: unknown): number {
  if (typeof value !== "string") return Number.MAX_SAFE_INTEGER;
  const index = rarityOrder().indexOf(normalizeRarity(value));
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
