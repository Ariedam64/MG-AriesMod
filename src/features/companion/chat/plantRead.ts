// Reads what can be planted, and where there is room.
//
// Three questions, three sources, none guessed: which dirt tiles this player
// owns (the map), which are taken (the garden), and what is in stock (the seed
// and egg inventories).
//
// Unlike harvesting, the Locker has nothing to say here: its rules protect
// what grows, not empty tiles. Planting takes nothing away.

import { Atoms } from "../../../game/store/atoms";
import { eggCatalogName, seedCatalogName } from "../../../data/names";
import { readMySlotIdx } from "../anchors";
import { readCompanionMap } from "../map";
import { GARDEN_TILE_COUNT, type PlantItem, type PlantScope } from "./plant";

/** The dirt tiles of my plot, in the order the map lists them. */
export async function readOwnedTiles(): Promise<number[]> {
  let count = 0;
  try {
    const [map, slotIdx] = await Promise.all([readCompanionMap(), readMySlotIdx()]);
    if (map && slotIdx !== null) count = map.dirtTileCount(slotIdx);
  } catch {
    count = 0;
  }

  // Map not ready, or plot unknown: the whole grid rather than nothing. One
  // tile too many ends in a refused command; an empty grid would make it look
  // like the garden does not exist.
  const total = count > 0 ? count : GARDEN_TILE_COUNT;

  return Array.from({ length: total }, (_, index) => index);
}

/**
 * The tiles already taken.
 *
 * Any entry of `tileObjects` counts, whatever it holds: a plant, an egg
 * incubating, a decoration, a pet. Only that the tile is no longer free matters.
 */
async function readOccupied(): Promise<Set<number>> {
  const occupied = new Set<number>();
  let tileObjects: Record<string, unknown> | null = null;
  try {
    tileObjects = (await Atoms.data.gardenTileObjects.get()) as Record<string, unknown> | null;
  } catch {
    return occupied;
  }
  if (!tileObjects || typeof tileObjects !== "object") return occupied;

  for (const [key, value] of Object.entries(tileObjects)) {
    if (!value) continue;
    const index = Number(key);
    if (Number.isInteger(index)) occupied.add(index);
  }
  return occupied;
}

/** Display names: the catalog's, or the raw id when it has none. */
const seedName = (species: string) => seedCatalogName(species) ?? species;
const eggName = (eggId: string) => eggCatalogName(eggId) ?? eggId;

/** Adds quantities up per id: the inventory may list two stacks. */
function accumulate(
  rows: unknown,
  kind: PlantItem["kind"],
  idOf: (row: Record<string, unknown>) => string,
  nameOf: (id: string) => string,
): PlantItem[] {
  const totals = new Map<string, number>();
  for (const raw of Array.isArray(rows) ? rows : []) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const id = idOf(row).trim();
    if (!id) continue;
    const quantity = Math.floor(Number(row.quantity ?? 0));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    totals.set(id, (totals.get(id) ?? 0) + quantity);
  }

  return [...totals.entries()]
    .map(([id, stock]) => ({ kind, id, name: nameOf(id), stock }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What is in stock: seeds first, then eggs.
 *
 * A seed's species is already the plant catalog key, and what `PlantSeed`
 * expects: nothing to convert. Eggs name their id several ways depending on
 * the game version, hence the cascade.
 */
async function readItems(): Promise<PlantItem[]> {
  const [seeds, eggs] = await Promise.all([
    Atoms.inventory.mySeedInventory.get().catch(() => null),
    Atoms.inventory.myEggInventory.get().catch(() => null),
  ]);

  return [
    ...accumulate(seeds, "seed", (row) => String(row.species ?? ""), seedName),
    ...accumulate(eggs, "egg", (row) => String(row.eggId ?? row.id ?? row.species ?? ""), eggName),
  ];
}

/** The whole state a plan is drawn in, and replayed against. */
export async function readPlantScope(): Promise<PlantScope> {
  const [tiles, occupied, items] = await Promise.all([readOwnedTiles(), readOccupied(), readItems()]);
  return { tiles, occupied, items };
}
