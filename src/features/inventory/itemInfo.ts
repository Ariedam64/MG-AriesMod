// Reading what the sort needs out of an inventory item: its name, quantity,
// rarity, Crop Size, mutations and coin value, and whether it matches a search.

import { decorCatalog, eggCatalog, petAbilities, petCatalog, plantCatalog, toolCatalog } from "../../data";
import { decorCatalogName, eggCatalogName, seedCatalogName, toolCatalogName } from "../../data/names";
import { readCropSize } from "../../data/rules/cropSize";

export const normalize = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase();

const stringOrEmpty = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export const itemTypeOf = (item: any): string => stringOrEmpty(item?.itemType);

/** A field read from the item itself, or from its nested `item` or `data`. */
function readNestedValue<T>(item: any, field: string, parse: (value: unknown) => T | null): T | null {
  if (!item || typeof item !== "object") return null;
  for (const source of [item, item.item, item.data]) {
    if (!source || typeof source !== "object") continue;
    const parsed = parse(source[field]);
    if (parsed != null) return parsed;
  }
  return null;
}

export const readNestedString = (item: any, field: string): string | null =>
  readNestedValue(item, field, (value) => stringOrEmpty(value) || null);

export const readNestedNumber = (item: any, field: string): number | null =>
  readNestedValue(item, field, (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  });

type Path = readonly string[];

/** The first non-empty string found along one of `paths`. */
function firstNestedString(source: any, paths: readonly Path[]): string {
  for (const path of paths) {
    let current = source;
    for (const key of path) current = current && typeof current === "object" ? current[key] : undefined;
    const value = stringOrEmpty(current);
    if (value) return value;
  }
  return "";
}

interface CatalogLookup {
  /** Field of the item holding its catalog id. */
  idField: string;
  catalog: unknown;
  /** Name from the catalog, or "" when it has none. */
  name(id: string, entry: any): string;
  rarityPaths: readonly Path[];
}

/** Plant items read the seed, plant and crop parts of one entry, in an order that depends on the item. */
function plantLookup(order: readonly string[]): CatalogLookup {
  const namePaths = order.map((part) => [part, "name"]);
  return {
    idField: "species",
    catalog: plantCatalog,
    name: (_id, entry) => firstNestedString(entry, namePaths),
    rarityPaths: order.map((part) => [part, "rarity"]),
  };
}

function flatLookup(idField: string, catalog: unknown, name: (id: string) => string | undefined): CatalogLookup {
  return { idField, catalog, name: (id) => name(id) ?? "", rarityPaths: [["rarity"]] };
}

const CROP_ORDER = ["crop", "plant", "seed"];

// The catalogs are live proxies: every read below sees the current data.
const CATALOG_LOOKUPS: Record<string, CatalogLookup> = {
  Seed: { ...plantLookup(["seed", "crop", "plant"]), name: (id) => seedCatalogName(id) ?? "" },
  Crop: plantLookup(CROP_ORDER),
  Produce: plantLookup(CROP_ORDER),
  Plant: plantLookup(["plant", "crop", "seed"]),
  Pet: { idField: "petSpecies", catalog: petCatalog, name: (_id, entry) => stringOrEmpty(entry?.name), rarityPaths: [["rarity"]] },
  Egg: flatLookup("eggId", eggCatalog, eggCatalogName),
  Tool: flatLookup("toolId", toolCatalog, toolCatalogName),
  Decor: flatLookup("decorId", decorCatalog, decorCatalogName),
};

function lookupOf(item: any): { lookup: CatalogLookup; id: string; entry: any } | null {
  const lookup = CATALOG_LOOKUPS[itemTypeOf(item)];
  if (!lookup) return null;
  const id = readNestedString(item, lookup.idField);
  if (!id) return null;
  return { lookup, id, entry: (lookup.catalog as Record<string, any>)?.[id] };
}

/** The catalog name, else the catalog id, else the item's own name or id, else its type. */
export function getInventoryItemName(item: any): string {
  if (!item || typeof item !== "object") return "";
  const found = lookupOf(item);
  if (found) return found.lookup.name(found.id, found.entry) || found.id;
  return stringOrEmpty(item.name) || stringOrEmpty(item.id) || itemTypeOf(item);
}

export function getInventoryItemRarity(item: any): string {
  if (!item || typeof item !== "object") return "";
  const found = lookupOf(item);
  return found ? firstNestedString(found.entry, found.lookup.rarityPaths) : "";
}

/** Items that never stack count as one. */
const SINGLE_ITEM_TYPES = new Set(["Produce", "Crop", "Plant", "Pet"]);

export function getInventoryItemQuantity(item: any): number {
  if (!item || typeof item !== "object") return 0;
  if (SINGLE_ITEM_TYPES.has(itemTypeOf(item))) return 1;
  const quantity = Number(item.quantity);
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
}

/** Fields an item may carry its species under, for pre-rework Size recovery. */
const SPECIES_FIELDS = ["species", "seedSpecies", "plantSpecies", "cropSpecies", "baseSpecies", "seedKey"];

function collectSpeciesCandidates(source: any, out: Set<string>): void {
  if (!source || typeof source !== "object") return;
  for (const field of SPECIES_FIELDS) {
    const value = stringOrEmpty(source[field]);
    if (value) out.add(value);
  }
}

/**
 * Crop Size of a produce item, in [50, 100]. The species candidates only
 * matter for the pre-rework fallback, where the Size had to be recovered from
 * a fractional scale and the catalog's max multiplier.
 */
export function getInventoryItemSize(item: any): number | null {
  if (!item || typeof item !== "object") return null;
  const type = itemTypeOf(item);
  if (type !== "Crop" && type !== "Produce") return null;

  const direct = readCropSize(item);
  if (direct != null) return direct;

  const candidates = new Set<string>();
  collectSpeciesCandidates(item, candidates);
  collectSpeciesCandidates(item.item, candidates);
  collectSpeciesCandidates(item.data, candidates);
  for (const species of candidates) {
    const size = readCropSize({ ...item, species });
    if (size != null) return size;
  }
  return null;
}

function collectMutations(source: unknown, out: string[]): void {
  if (!source || typeof source !== "object") return;
  const record = source as Record<string, unknown>;
  if (Array.isArray(record.mutations)) {
    for (const mutation of record.mutations) {
      if (typeof mutation === "string" && mutation.trim()) out.push(mutation.trim());
    }
  }
  if (Array.isArray(record.slots)) {
    for (const slot of record.slots) collectMutations(slot, out);
  }
}

/** Every mutation on the item, its nested parts and its plant slots. */
export function getInventoryItemMutations(item: any): string[] {
  if (!item || typeof item !== "object") return [];
  const mutations: string[] = [];
  collectMutations(item, mutations);
  collectMutations(item.item, mutations);
  collectMutations(item.data, mutations);
  return mutations;
}

/** The coin value attached to the item by the filter pass. */
export function getInventoryItemValue(item: any): number | null {
  if (!item || typeof item !== "object") return null;
  const raw = item.value;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function petAbilityName(abilityId: unknown): string | null {
  if (typeof abilityId !== "string" || !abilityId.trim()) return null;
  const name = (petAbilities as Record<string, { name?: string }>)[abilityId.trim()]?.name;
  return stringOrEmpty(name) || null;
}

/**
 * Whether any text on the item contains the search: its name, ids, ability
 * names, or any nested value. Ability ids are matched by their display name.
 */
export function itemMatchesSearch(item: any, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const visited = new Set<any>();

  const matches = (value: any): boolean => {
    if (value == null) return false;
    if (typeof value === "string") return normalize(value).includes(normalizedQuery);
    if (typeof value === "number" || typeof value === "boolean") return normalize(String(value)).includes(normalizedQuery);
    if (Array.isArray(value)) return value.some(matches);
    if (typeof value === "object") {
      if (visited.has(value)) return false;
      visited.add(value);
      for (const [key, entry] of Object.entries(value)) {
        if (key === "itemType") continue;
        if (key === "abilities") {
          if (Array.isArray(entry) && entry.some((id) => matches(petAbilityName(id)))) return true;
          continue;
        }
        if (matches(entry)) return true;
      }
    }
    return false;
  };

  const abilityNames = Array.isArray(item?.abilities) ? item.abilities.map(petAbilityName).filter(Boolean) : [];
  const ownString = (field: string) => (typeof item?.[field] === "string" ? item[field] : null);
  const candidates = [
    getInventoryItemName(item),
    ...["species", "seedSpecies", "plantSpecies", "petSpecies", "eggId", "decorId", "toolId", "id"].map(ownString),
    ...abilityNames,
  ];
  return candidates.some(matches) || matches(item);
}
