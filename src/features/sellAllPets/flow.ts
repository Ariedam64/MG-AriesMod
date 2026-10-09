// Sell All Pets: every pet in the inventory that is not a favourite, sold one
// by one, after the player confirms the ones the locker protects.

import { Atoms } from "../../game/store/atoms";
import { ensureStore } from "../../game/store/jotai";
import { PlayerService } from "../../game/player";
import { audioPlayer } from "../../game/audioPlayer";
import { toastSimple } from "../../ui/toast";
import { StatsService } from "../stats/stats";
import { computeInventoryItemValue } from "../inventory/value";
import { confirmProtectedPetSale } from "./confirmModal";
import { flagProtectedPets, type InventoryPet } from "./protection";

const isInventoryPet = (item: any): item is InventoryPet =>
  !!item && item.itemType === "Pet" && typeof item.id === "string" && item.id.trim().length > 0;

async function unfavoritedInventoryPets(): Promise<InventoryPet[]> {
  try {
    await ensureStore();
  } catch {}
  const [inventory, favoriteIds] = await Promise.all([
    Atoms.inventory.myInventory.get().catch(() => null),
    Atoms.inventory.favoriteIds.get().catch(() => [] as string[]),
  ]);
  const favorites = new Set(Array.isArray(favoriteIds) ? favoriteIds.filter((id) => typeof id === "string") : []);
  const items: unknown[] = Array.isArray((inventory as any)?.items) ? (inventory as any).items : [];
  return items.filter(isInventoryPet).filter((pet) => !favorites.has(pet.id));
}

function totalSellValue(pets: InventoryPet[]): string {
  let total = 0;
  for (const pet of pets) {
    const value = computeInventoryItemValue(pet);
    if (typeof value === "number" && Number.isFinite(value)) total += value;
  }
  return total.toLocaleString("en-US");
}

/** Counts one sold pet's value in the stats, priced the same way as the confirmation. */
function countSaleValue(pet: InventoryPet): void {
  const value = computeInventoryItemValue(pet);
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    StatsService.incrementShopStat("petsSoldValue", value);
  }
}

export async function runSellAllPetsFlow(): Promise<void> {
  await PlayerService.logItems();
  const pets = await unfavoritedInventoryPets();
  if (pets.length === 0) return;

  const flagged = flagProtectedPets(pets);
  if (flagged.length && !(await confirmProtectedPetSale(flagged))) {
    void toastSimple("Sell all Pets", "Sale cancelled.", "info").catch(() => {});
    return;
  }

  const totalValue = totalSellValue(pets);
  let sold = 0;
  let failures = 0;
  for (const pet of pets) {
    try {
      await PlayerService.sellPet(pet.id);
      sold += 1;
      StatsService.incrementShopStat("petsSoldCount");
      countSaleValue(pet);
    } catch {
      failures += 1;
    }
  }

  if (failures === 0) {
    void toastSimple("Sell all Pets", `${sold} pets have been sold for ${totalValue} coins!`, "success").catch(() => {});
  }
  audioPlayer.playSellNotification();
}
