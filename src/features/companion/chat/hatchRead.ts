// Reads the hatch: the ready eggs, the pets already there, and the room left.
//
// Nothing is hardcoded. The species the PLANTED eggs can give come from their
// `faunaSpawnWeights`, their abilities from `innateAbilityWeights`, and the
// mutations from the catalog (see `rolledMutations`), since they do not depend
// on the kind of egg.

import { Atoms } from "../../../game/store/atoms";
import { eggCatalog, petAbilities, petCatalog } from "../../../data";
import { getPetInfo } from "../../../data/rules/petValue";
import { PetsService } from "../../pets/pets";
import { rolledMutations } from "../catalogs";
import type { PetRow } from "./hatch";

/**
 * The bag's cap, past which a hatch gives nothing.
 *
 * Taken from `eggAutomation.ts`, which found it in practice: the game refuses
 * silently, and nothing in its state says so.
 */
export const INVENTORY_CAPACITY = 98;

type AbilityChoice = { id: string; name: string };

export type HatchScope = {
  /** Egg tiles ready to hatch. */
  readySlots: number[];
  /** Eggs in the ground, ripe or not: to say what is still waiting. */
  totalEggs: number;
  /** Kinds of egg in the ground: to put the right icon on a bubble. */
  eggIds: string[];
  /** Species the eggs in the ground can give. Feeds the filters. */
  possibleSpecies: string[];
  possibleAbilities: AbilityChoice[];
  /** Mutations a pet can carry: the rolled ones, plus those seen in the bag. */
  presentMutations: string[];
  pets: PetRow[];
  inventoryCount: number;
  capacity: number;
};

export const EMPTY_HATCH_SCOPE: HatchScope = {
  readySlots: [],
  totalEggs: 0,
  eggIds: [],
  possibleSpecies: [],
  possibleAbilities: [],
  presentMutations: [],
  pets: [],
  inventoryCount: 0,
  capacity: INVENTORY_CAPACITY,
};

/** The game's timestamps come in seconds or milliseconds depending on the field. */
function normalizeTs(value: unknown): number | null {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw < 100_000_000_000 ? raw * 1000 : raw;
}

/** An egg with no known due time counts as ready: the game will decide. */
function isEggReady(tile: Record<string, unknown>, now: number): boolean {
  const readyAt =
    normalizeTs(tile.maturedAt) ??
    normalizeTs(tile.endTime) ??
    normalizeTs(tile.readyAt) ??
    normalizeTs(tile.hatchTime) ??
    null;
  return readyAt === null || readyAt <= now;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function inventoryItems(raw: unknown): Array<Record<string, unknown>> {
  const source = raw as Record<string, unknown> | null;
  const list = Array.isArray(raw) ? raw : Array.isArray(source?.items) ? (source.items as unknown[]) : [];
  return list.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === "object");
}

/* -------------------------------- garden --------------------------------- */

type EggScan = { readySlots: number[]; totalEggs: number; eggIds: Set<string> };

async function scanEggs(): Promise<EggScan> {
  const scan: EggScan = { readySlots: [], totalEggs: 0, eggIds: new Set() };

  let tileObjects: Record<string, unknown> | null = null;
  try {
    tileObjects = (await Atoms.data.gardenTileObjects.get()) as Record<string, unknown> | null;
  } catch {
    return scan;
  }
  if (!tileObjects || typeof tileObjects !== "object") return scan;

  const now = Date.now();
  for (const [key, raw] of Object.entries(tileObjects)) {
    if (!raw || typeof raw !== "object") continue;
    const tile = raw as Record<string, unknown>;
    const objectType = String(tile.objectType ?? tile.type ?? "").toLowerCase();
    if (objectType !== "egg") continue;

    const slot = Number(key);
    if (!Number.isInteger(slot)) continue;

    scan.totalEggs++;
    const eggId = String(tile.eggId ?? tile.id ?? tile.species ?? "");
    if (eggId) scan.eggIds.add(eggId);
    if (isEggReady(tile, now)) scan.readySlots.push(slot);
  }

  scan.readySlots.sort((a, b) => a - b);
  return scan;
}

/**
 * What the eggs in the ground can give: species, then innate abilities.
 *
 * The planted eggs only. The filter decides what to keep from THIS hatch:
 * listing the catalog's twenty-nine species would drown the five these eggs
 * can really give, and the abilities follow from the species.
 */
function whatCouldHatch(eggIds: Set<string>): { species: string[]; abilities: AbilityChoice[] } {
  const species = new Set<string>();
  for (const eggId of eggIds) {
    const egg = (eggCatalog as Record<string, { faunaSpawnWeights?: Record<string, number> } | undefined>)[eggId];
    for (const name of Object.keys(egg?.faunaSpawnWeights ?? {})) species.add(name);
  }

  const abilityIds = new Set<string>();
  for (const name of species) {
    const pet = (petCatalog as Record<string, { innateAbilityWeights?: Record<string, number> } | undefined>)[name];
    for (const id of Object.keys(pet?.innateAbilityWeights ?? {})) abilityIds.add(id);
  }

  const abilities = [...abilityIds]
    .map((id) => ({
      id,
      name: (petAbilities as Record<string, { name?: unknown } | undefined>)[id]?.name,
    }))
    .map((entry) => ({ id: entry.id, name: typeof entry.name === "string" && entry.name ? entry.name : entry.id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { species: [...species].sort((a, b) => a.localeCompare(b)), abilities };
}

/* ---------------------------------- bag ---------------------------------- */

async function readPets(): Promise<{ pets: PetRow[]; inventoryCount: number }> {
  const [inventory, favoriteIds, activeIds] = await Promise.all([
    Atoms.inventory.myInventory.get().catch(() => null),
    Atoms.inventory.favoriteIds.get().catch(() => null),
    PetsService.getActivePetIds().catch(() => [] as string[]),
  ]);

  const items = inventoryItems(inventory);
  const favorites = new Set(asStringArray(favoriteIds));
  const onTeam = new Set(activeIds);

  const pets: PetRow[] = [];
  for (const item of items) {
    if (item.itemType !== "Pet" || typeof item.id !== "string") continue;
    const species = String(item.petSpecies ?? "");
    const info = getPetInfo(item as Parameters<typeof getPetInfo>[0]);
    const maxStrength = typeof info?.maxStrength === "number" && info.maxStrength > 0 ? info.maxStrength : null;

    pets.push({
      petId: item.id,
      name: typeof item.nickname === "string" && item.nickname ? item.nickname : species || item.id,
      species,
      mutations: asStringArray(item.mutations),
      abilities: asStringArray(item.abilities),
      maxStrength,
      favorited: favorites.has(item.id),
      onTeam: onTeam.has(item.id),
      item,
    });
  }

  return { pets, inventoryCount: items.length };
}

/**
 * The pets in the bag, without reading the garden.
 *
 * `readHatchScope` also scans the tiles, the favourites and the active team:
 * far too much for "who just appeared?", asked after every egg.
 */
export async function readPetRows(): Promise<PetRow[]> {
  try {
    return (await readPets()).pets;
  } catch {
    return [];
  }
}

/** How many items fill the bag, without reading anything else. */
export async function readInventoryCount(): Promise<number> {
  try {
    return inventoryItems(await Atoms.inventory.myInventory.get()).length;
  } catch {
    return 0;
  }
}

export async function readHatchScope(): Promise<HatchScope> {
  const [eggs, bag] = await Promise.all([scanEggs(), readPets()]);
  const { species, abilities } = whatCouldHatch(eggs.eggIds);

  // The rolled mutations first: without them "keep the Rainbows" could only be
  // ticked after already having one, which is too late. Without a readable
  // catalog the filter falls back on what the bag shows: less handy, never wrong.
  const mutations = new Set<string>(rolledMutations());
  for (const pet of bag.pets) for (const mutation of pet.mutations) mutations.add(mutation);

  return {
    readySlots: eggs.readySlots,
    totalEggs: eggs.totalEggs,
    eggIds: [...eggs.eggIds].sort((a, b) => a.localeCompare(b)),
    possibleSpecies: species,
    possibleAbilities: abilities,
    presentMutations: [...mutations].sort((a, b) => a.localeCompare(b)),
    pets: bag.pets,
    inventoryCount: bag.inventoryCount,
    capacity: INVENTORY_CAPACITY,
  };
}
