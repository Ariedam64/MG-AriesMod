// Every pet the player owns, wherever it sits: inventory, Pet Hutch, or
// equipped. Kept as one cache fed by three watchers, so the Pets menu and the
// team tools never have to read three atoms and merge them on each call.

import { petCatalog, memoOnCatalogs } from "../../data";
import { PlayerService } from "../../game/player";
import { Atoms, myPetHutchPetItems } from "../../game/store/atoms";
import { Subscriptions } from "../../lib/emitter";

export type InventoryPet = {
  id: string;
  itemType: "Pet";
  petSpecies: string;
  name: string | null;
  xp: number;
  hunger: number;
  mutations: string[];
  /** Pets still carry the pre-rework scale field; it is not a crop size. */
  targetScale?: number;
  abilities: string[];
};

const lower = (v?: string | null) => (v ?? "").toLowerCase();
const stringOrNull = (v: unknown) => (typeof v === "string" ? v : null);
const finiteOrZero = (v: unknown) => (Number.isFinite(v as number) ? (v as number) : 0);
const stringList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

const catalogKeyByLowercase = memoOnCatalogs(
  () => new Map<string, string>(Object.keys(petCatalog).map((k) => [k.toLowerCase(), k])),
);

/** The catalog key for a species however it was written ("goat", "Goat"), or the input. */
export function canonicalSpecies(species: string): string {
  if (!species) return species;
  if ((petCatalog as Record<string, unknown>)[species]) return species;
  const found = catalogKeyByLowercase().get(species.toLowerCase());
  if (found) return found;
  const capitalized = species.charAt(0).toUpperCase() + species.slice(1).toLowerCase();
  return (petCatalog as Record<string, unknown>)[capitalized] ? capitalized : species;
}

/** A pet item from the inventory or the hutch. Fields sit at the top or under `data`. */
export function inventoryItemToPet(x: any): InventoryPet | null {
  if (!x || x.itemType !== "Pet") return null;
  const id = lower(x.id);
  if (!id) return null;
  const scale = x.targetScale ?? x.data?.targetScale;
  return {
    id,
    itemType: "Pet",
    petSpecies: canonicalSpecies(String(x.petSpecies ?? x.data?.petSpecies ?? "").trim()),
    name: stringOrNull(x.name ?? x.data?.name ?? null),
    xp: finiteOrZero(x.xp ?? x.data?.xp),
    hunger: finiteOrZero(x.hunger ?? x.data?.hunger),
    mutations: stringList(x.mutations ?? x.data?.mutations),
    targetScale: Number.isFinite(scale) ? Number(scale) : undefined,
    abilities: stringList(x.abilities ?? x.data?.abilities),
  };
}

/** An equipped pet, either a primitive slot or the older `{ slot }` wrapper. */
export function activeSlotToPet(entry: any): InventoryPet | null {
  const slot = entry?.slot ?? entry;
  if (!slot || typeof slot !== "object") return null;
  const id = lower(slot.id);
  if (!id) return null;
  return {
    id,
    itemType: "Pet",
    petSpecies: canonicalSpecies(String(slot.petSpecies ?? slot.species ?? "").trim()),
    name: stringOrNull(slot.name ?? null),
    xp: finiteOrZero(slot.xp),
    hunger: finiteOrZero(slot.hunger),
    mutations: stringList(slot.mutations),
    targetScale: Number.isFinite(slot.targetScale) ? Number(slot.targetScale) : undefined,
    abilities: stringList(slot.abilities),
  };
}

/** The game's item shape for a pet, as the fake inventory modal expects it. */
export function petToInventoryItem(p: InventoryPet): Record<string, unknown> {
  return {
    id: p.id,
    itemType: "Pet",
    petSpecies: canonicalSpecies(p.petSpecies),
    name: p.name ?? null,
    xp: p.xp,
    hunger: p.hunger,
    mutations: p.mutations.slice(),
    targetScale: p.targetScale,
    abilities: p.abilities.slice(),
  };
}

/* --------------------------------- the cache -------------------------------- */

let inventoryRaw: any = null;
let activeRaw: any[] = [];
let hutchRaw: any[] = [];
let cache: InventoryPet[] = [];
let watchersStarted = false;
const watchers = new Subscriptions();

const itemsOf = (inv: any): any[] => (Array.isArray(inv?.items) ? inv.items : Array.isArray(inv) ? inv : []);

/**
 * Signature of a pet without xp and hunger, which tick all the time: the cache
 * is rebuilt only when a pet arrives, leaves, or changes in a way that shows.
 */
function stableSignature(list: Array<InventoryPet | null>): string {
  return list
    .filter((p): p is InventoryPet => !!p)
    .map((p) => JSON.stringify([p.id, p.petSpecies, p.name ?? null, p.mutations, p.targetScale ?? null, p.abilities]))
    .join("\n");
}

function rebuild(): void {
  // Later sources win: hutch, then inventory, then equipped.
  const byId = new Map<string, InventoryPet>();
  for (const pet of hutchRaw.map(inventoryItemToPet)) if (pet) byId.set(pet.id, pet);
  for (const pet of itemsOf(inventoryRaw).map(inventoryItemToPet)) if (pet) byId.set(pet.id, pet);
  for (const pet of activeRaw.map(activeSlotToPet)) if (pet) byId.set(pet.id, pet);
  cache = Array.from(byId.values());
}

async function startWatchers(): Promise<void> {
  let inventorySig = "";
  let activeSig = "";

  try {
    inventoryRaw = await Atoms.inventory.myInventory.get();
    inventorySig = stableSignature(itemsOf(inventoryRaw).map(inventoryItemToPet));
  } catch {}
  watchers.add(Atoms.inventory.myInventory.onChange((inv: any) => {
    const sig = stableSignature(itemsOf(inv).map(inventoryItemToPet));
    if (sig === inventorySig) return;
    inventorySig = sig;
    inventoryRaw = inv;
    rebuild();
  }));

  // The primitive slots atom replaced myPetInfos in a game update; the older
  // one is only watched when the newer one is not there.
  let primitive: unknown = null;
  try { primitive = await Atoms.pets.myPrimitivePetSlots.get(); } catch {}
  const activeAtom = Array.isArray(primitive) ? Atoms.pets.myPrimitivePetSlots : Atoms.pets.myPetInfos;
  if (Array.isArray(primitive)) {
    activeRaw = primitive;
  } else {
    try {
      const infos = await Atoms.pets.myPetInfos.get();
      activeRaw = Array.isArray(infos) ? infos : [];
    } catch {}
  }
  activeSig = stableSignature(activeRaw.map(activeSlotToPet));
  watchers.add(activeAtom.onChange((list: any) => {
    const next = Array.isArray(list) ? list : [];
    const sig = stableSignature(next.map(activeSlotToPet));
    if (sig === activeSig) return;
    activeSig = sig;
    activeRaw = next;
    rebuild();
  }));

  try {
    const hutch = await myPetHutchPetItems.get();
    hutchRaw = Array.isArray(hutch) ? hutch : [];
  } catch {}
  watchers.add(myPetHutchPetItems.onChange((list: any) => {
    hutchRaw = Array.isArray(list) ? list : [];
    rebuild();
  }));

  rebuild();
}

/** Starts the watchers on first use; later calls only wait for that first start. */
let starting: Promise<void> | null = null;
export function ensureInventoryWatchers(): Promise<void> {
  if (!watchersStarted) {
    watchersStarted = true;
    starting = startWatchers().catch(() => {});
  }
  return starting ?? Promise.resolve();
}

/** Every owned pet. Starts the watchers if needed. */
export async function getInventoryPets(): Promise<InventoryPet[]> {
  await ensureInventoryWatchers();
  return cache.slice();
}

/** A pet from the cache, without waiting. For enriching log lines. */
export function findCachedPet(petId: string): InventoryPet | null {
  return cache.find((p) => p.id === petId) ?? null;
}

/**
 * Pets by id for drawing team slots: every owned pet, plus equipped pets the
 * cache has not caught up with yet. While the cache reads empty (the atoms
 * still loading) the last non-empty list is used, so icons do not blink out.
 */
let lastNonEmpty: InventoryPet[] = [];
export async function getPetLookup(): Promise<Map<string, InventoryPet>> {
  const owned = await getInventoryPets().catch(() => []);
  if (owned.length) lastNonEmpty = owned;
  const map = new Map(lastNonEmpty.map((p) => [p.id, p] as const));
  try {
    for (const entry of (await PlayerService.getPets()) ?? []) {
      const pet = activeSlotToPet(entry);
      if (pet && !map.has(pet.id)) map.set(pet.id, pet);
    }
  } catch {}
  return map;
}
