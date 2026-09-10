// src/services/companion/chat/hatchRead.ts
// Lit la couvée : les œufs prêts, les animaux déjà là, et la place qui reste.
//
// Rien n'est écrit en dur. Les espèces que les œufs POSÉS peuvent donner
// viennent de leur `faunaSpawnWeights`, leurs capacités de
// `innateAbilityWeights`, et les mutations se déduisent du catalogue (cf.
// `rolledMutations`) parce qu'elles ne dépendent pas de la sorte d'œuf.

import { Atoms } from "../../../store/atoms";
import { eggCatalog, mutationCatalog, petAbilities, petCatalog } from "../../../data";
import { getPetInfo } from "../../../utils/petCalcul";
import { PetsService } from "../../pets";
import type { PetRow } from "./hatch";

/**
 * Plafond du sac, au-delà duquel une éclosion ne donne plus rien.
 *
 * Repris de `eggAutomation.ts`, qui l'a établi à l'usage : le jeu refuse en
 * silence, et rien dans son état ne l'annonce.
 */
export const INVENTORY_CAPACITY = 98;

export type AbilityChoice = { id: string; name: string };

export type HatchScope = {
  /** Cases d'œufs prêtes à éclore. */
  readySlots: number[];
  /** Œufs en terre, mûrs ou non : de quoi dire ce qui attend encore. */
  totalEggs: number;
  /** Sortes d'œufs en terre : de quoi mettre la bonne icône sur une bulle. */
  eggIds: string[];
  /** Espèces que les œufs en terre peuvent donner. Alimente les filtres. */
  possibleSpecies: string[];
  possibleAbilities: AbilityChoice[];
  /** Mutations qu'un animal peut porter : celles qui se tirent, plus celles vues dans le sac. */
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

/** Les horodatages du jeu arrivent en secondes ou en millisecondes selon le champ. */
function normalizeTs(value: unknown): number | null {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw < 100_000_000_000 ? raw * 1000 : raw;
}

/** Un œuf sans échéance connue est considéré prêt : c'est le jeu qui tranchera. */
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

/* ------------------------------- Le jardin ------------------------------- */

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
 * Ce que les œufs en terre peuvent donner : espèces, puis capacités innées.
 *
 * Les œufs posés dans le jardin, et eux seuls. Le filtre décide de ce qu'on
 * garde de CETTE couvée : y faire figurer les vingt-neuf espèces du catalogue
 * noierait les cinq que ces œufs-là peuvent réellement sortir, et les capacités
 * suivent puisqu'elles se déduisent des espèces.
 *
 * Les mutations, elles, ne dépendent pas de la sorte d'œuf : n'importe quel
 * animal peut naître Gold ou Rainbow, d'où leur présence permanente (cf.
 * `rolledMutations`).
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

/* -------------------------------- Le sac --------------------------------- */

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
 * Les animaux du sac, sans relire le jardin.
 *
 * `readHatchScope` scanne aussi les tuiles, les favoris et l'équipe active :
 * beaucoup trop pour la seule question « qui vient d'apparaître ? », posée
 * après chaque œuf.
 */
export async function readPetRows(): Promise<PetRow[]> {
  try {
    return (await readPets()).pets;
  } catch {
    return [];
  }
}

/** Combien d'objets occupent le sac, sans relire tout le reste. */
export async function readInventoryCount(): Promise<number> {
  try {
    return inventoryItems(await Atoms.inventory.myInventory.get()).length;
  } catch {
    return 0;
  }
}

/**
 * Les mutations qu'un animal peut tirer en naissant.
 *
 * Le catalogue ne les étiquette pas « animal » ou « plante », mais il les
 * sépare quand même : `baseChance` est la probabilité d'être tiré à la
 * naissance, et seules Gold et Rainbow en ont une. Tout le reste — Wet,
 * Frozen, Dawnlit… — vaut zéro parce que ce sont des effets que
 * l'environnement pose sur une plante, jamais sur un animal.
 *
 * Se déduire du catalogue plutôt que de lister deux noms garde le filtre juste
 * le jour où le jeu en ajoute une troisième, et la source dynamique porte bien
 * ce champ.
 */
export function rolledMutations(): string[] {
  try {
    return Object.entries(mutationCatalog as Record<string, { baseChance?: unknown }>)
      .filter(([, def]) => Number(def?.baseChance) > 0)
      .map(([name]) => name);
  } catch {
    // Sans catalogue lisible, le filtre retombe sur ce qu'on observe dans le
    // sac : moins pratique, mais jamais faux.
    return [];
  }
}

export async function readHatchScope(): Promise<HatchScope> {
  const [eggs, bag] = await Promise.all([scanEggs(), readPets()]);
  const { species, abilities } = whatCouldHatch(eggs.eggIds);

  // Les tirables d'abord : sans elles, on ne pourrait cocher « garder les
  // Rainbow » qu'après en avoir déjà eu un, c'est-à-dire trop tard.
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

/** Le nom affichable d'une capacité, pour les résumés qui n'ont que son id. */
export function abilityNames(scope: HatchScope): Map<string, string> {
  return new Map(scope.possibleAbilities.map((entry) => [entry.id, entry.name]));
}
