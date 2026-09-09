// src/services/companion/chat/plantRead.ts
// Lit ce qu'on peut planter, et où il reste de la place.
//
// Trois questions, trois sources, et aucune n'est devinée : quelles cases de
// terre ce joueur possède (la map), lesquelles sont déjà prises (le jardin), et
// ce qu'il a en réserve (les inventaires de graines et d'œufs).
//
// Contrairement à la récolte, le Locker n'a rien à dire ici : ses règles
// protègent ce qui pousse, pas les cases vides. Planter n'enlève rien.

import { Atoms } from "../../../store/atoms";
import { eggCatalog, plantCatalog } from "../../../data";
import { readMySlotIdx } from "../anchors";
import { readCompanionMap } from "../map";
import { GARDEN_TILE_COUNT, type PlantItem, type PlantScope } from "./plant";

/** Cases de terre de ma parcelle, dans l'ordre où la map les range. */
async function readOwnedTiles(): Promise<number[]> {
  let count = 0;
  try {
    const [map, slotIdx] = await Promise.all([readCompanionMap(), readMySlotIdx()]);
    if (map && slotIdx !== null) count = map.dirtTileCount(slotIdx);
  } catch {
    count = 0;
  }

  // Map pas encore prête, ou parcelle inconnue : on montre la grille entière
  // plutôt que rien. Une case en trop se solde par une commande refusée ; une
  // grille vide, elle, ferait croire que le jardin n'existe pas.
  const total = count > 0 ? count : GARDEN_TILE_COUNT;

  return Array.from({ length: total }, (_, index) => index);
}

/**
 * Cases déjà prises.
 *
 * Toute entrée de `tileObjects` compte, quel qu'en soit le contenu : une
 * plante, un œuf en couvaison, un décor, un animal posé. Le détail ne nous
 * intéresse pas, seulement le fait que la case n'est plus libre.
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

/** Nom affichable d'une graine : celui du catalogue, à défaut l'espèce brute. */
function seedName(species: string): string {
  const entry = (plantCatalog as Record<string, { seed?: { name?: unknown } } | undefined>)[species];
  const name = entry?.seed?.name;
  return typeof name === "string" && name ? name : species;
}

function eggName(eggId: string): string {
  const entry = (eggCatalog as Record<string, { name?: unknown } | undefined>)[eggId];
  const name = entry?.name;
  return typeof name === "string" && name ? name : eggId;
}

/** Somme les quantités par identifiant : l'inventaire peut lister deux piles. */
function accumulate(
  rows: unknown,
  kind: PlantItem["kind"],
  idOf: (row: Record<string, unknown>) => string,
  nameOf: (id: string) => string
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
 * Ce qu'on a en réserve : graines d'abord, œufs ensuite.
 *
 * L'espèce d'une graine est déjà la clé du catalogue de plantes, et c'est aussi
 * ce que `PlantSeed` attend : rien à convertir. Les œufs, eux, nomment leur
 * identifiant de plusieurs façons selon la version du jeu, d'où la cascade.
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

/** L'état complet dans lequel on dessine un plan, et contre lequel on le rejoue. */
export async function readPlantScope(): Promise<PlantScope> {
  const [tiles, occupied, items] = await Promise.all([readOwnedTiles(), readOccupied(), readItems()]);
  return { tiles, occupied, items };
}
