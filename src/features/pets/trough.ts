// Which active pets the Feeding Trough will feed, by the game's own rule.
//
// The game computes the same set in `myAuthoritativeTroughFedPetIdsAtom` and
// hides its "Low hunger" toast for those pets. The rule is rebuilt here from
// `myDataAtom` rather than by subscribing to that atom's label: a renamed label
// would silence nothing and fail without a trace, while a renamed field here
// only brings the alerts back.
//
// The rule: a FeedingTrough decor is placed in the garden, the pet is active
// and not ridden, and the trough storage holds a Produce item that is not a
// favourite (a favourite is "locked") and whose species is in the pet's diet.

import { Atoms } from "../../game/store/atoms";
import { getCompatibleCropsForSpecies } from "./feeding";

const TROUGH_DECOR_ID = "FeedingTrough";
const PRODUCE = "Produce";

const isRecord = (v: unknown): v is Record<string, any> => typeof v === "object" && v !== null;

function hasTroughDecor(garden: Record<string, any>): boolean {
  for (const key of ["tileObjects", "boardwalkTileObjects"]) {
    const objects = garden[key];
    if (!isRecord(objects)) continue;
    for (const obj of Object.values(objects)) {
      if (isRecord(obj) && obj.objectType === "decor" && obj.decorId === TROUGH_DECOR_ID) return true;
    }
  }
  return false;
}

/**
 * The ids of the pets the trough will feed, or null when the player's data
 * cannot be read (the caller then keeps alerting as before).
 */
export function troughFedPetIds(myData: unknown, dietOf: (species: string) => string[]): Set<string> | null {
  if (!isRecord(myData)) return null;
  const garden = myData.garden;
  const inventory = myData.inventory;
  if (!isRecord(garden) || !isRecord(inventory)) return null;

  const fed = new Set<string>();
  if (!hasTroughDecor(garden)) return fed;

  const favourites = new Set<string>(
    (Array.isArray(inventory.favoritedItemIds) ? inventory.favoritedItemIds : []).map((id: unknown) => String(id))
  );
  const storages: unknown[] = Array.isArray(inventory.storages) ? inventory.storages : [];
  const edible = new Set<string>();
  for (const storage of storages) {
    if (!isRecord(storage) || storage.decorId !== TROUGH_DECOR_ID || !Array.isArray(storage.items)) continue;
    for (const item of storage.items) {
      if (!isRecord(item) || item.itemType !== PRODUCE) continue;
      if (favourites.has(String(item.id))) continue;
      if (typeof item.species === "string") edible.add(item.species);
    }
  }
  if (edible.size === 0) return fed;

  const riddenPetId = myData.riddenPetId ?? null;
  const slots: unknown[] = Array.isArray(myData.petSlots) ? myData.petSlots : [];
  for (const slot of slots) {
    if (!isRecord(slot) || slot.id == null) continue;
    const id = String(slot.id);
    if (riddenPetId != null && id === String(riddenPetId)) continue;
    const diet = dietOf(String(slot.petSpecies ?? ""));
    if (diet.some((crop) => edible.has(crop))) fed.add(id);
  }
  return fed;
}

/** The same set, read from the game now. Any failure gives null. */
export async function readTroughFedPetIds(): Promise<Set<string> | null> {
  try {
    return troughFedPetIds(await Atoms.data.myData.get(), getCompatibleCropsForSpecies);
  } catch {
    return null;
  }
}

const signatureOf = (ids: Set<string> | null) => (ids ? [...ids].sort().join(",") : "null");

/** Calls back with the set now, then each time it changes. */
export async function onTroughFedChange(cb: (ids: Set<string> | null) => void): Promise<() => void> {
  let last: string | undefined;
  return Atoms.data.myData.onChangeNow((myData) => {
    let ids: Set<string> | null;
    try {
      ids = troughFedPetIds(myData, getCompatibleCropsForSpecies);
    } catch {
      ids = null;
    }
    const sig = signatureOf(ids);
    if (sig === last) return;
    last = sig;
    cb(ids);
  });
}
