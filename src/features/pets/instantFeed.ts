// The Instant Feed action: one compatible crop into one pet, the favourites
// left alone.

import { PlayerService, type PetInfo } from "../../game/player";
import { PetsService } from "./pets";

async function findPetById(petId: string): Promise<PetInfo | null> {
  try {
    const list = await PetsService.getPets();
    const arr = Array.isArray(list) ? list : [];
    return arr.find((p) => String(p?.slot?.id || "") === petId) ?? null;
  } catch (err) {
    console.warn("[InstantFeed] Failed to fetch pets", err);
    return null;
  }
}

/**
 * Feeds the pet one crop it is allowed to eat: the first in the inventory that
 * is not a favourite. Does nothing when there is none.
 */
export async function instantFeedPet(petId: string): Promise<void> {
  const pet = await findPetById(petId);
  if (!pet) return;

  const species = String(pet?.slot?.petSpecies || "");
  const compatible = PetsService.getInstantFeedAllowedCrops(species);
  if (!compatible.size) return;

  const inventory = await PlayerService.getCropInventoryState();
  const items = Array.isArray(inventory) ? inventory : [];
  const favoriteSet = await PlayerService.getFavoriteIdSet().catch(() => new Set<string>());

  const chosen = items.find((item) => {
    const speciesId = String((item as any)?.species || "");
    if (!speciesId || !compatible.has(speciesId)) return false;
    const id = String((item as any)?.id || "");
    return id && !favoriteSet.has(id);
  }) as any;

  const chosenId = String(chosen?.id || "");
  if (!chosenId) return;

  await PlayerService.feedPet(petId, chosenId);
}
