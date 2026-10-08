import { observeOutgoing } from "../../game/ws/outgoing";
import { Atoms } from "../../game/store/atoms";
import { StatsService } from "./stats";

/**
 * Garden and shop stats, counted from the actions the game sends. Observers
 * only see what the locker and the inventory reserve let through, so a
 * blocked action is never counted.
 */

const WATER_TIME_SAVED_MS = 5 * 60 * 1000;

const PURCHASE_STATS = {
  seed: "seedsBought",
  egg: "eggsBought",
  tool: "toolsBought",
  decor: "decorBought",
} as const;

async function addPositive(read: () => Promise<unknown>, stat: "cropsSoldValue" | "petsSoldValue") {
  const value = Number(await read());
  if (Number.isFinite(value) && value > 0) StatsService.incrementShopStat(stat, value);
}

function countHarvest(message: any) {
  if (!Number.isInteger(message?.slot) || !Number.isInteger(message?.slotsIndex)) return;
  StatsService.incrementGardenStat("totalHarvested");
}

function countPurchase(message: any) {
  const stat = PURCHASE_STATS[message?.shop as keyof typeof PURCHASE_STATS];
  if (!stat) return;
  // The game's own Buy All sends the whole stack as one command (v1292).
  const quantity = Math.max(1, Math.floor(Number(message?.quantity) || 1));
  StatsService.incrementShopStat(stat, quantity);
}

function countCropSale() {
  void (async () => {
    try {
      const items = await Atoms.inventory.myCropItemsToSell.get();
      const count = Array.isArray(items) ? items.length : 0;
      if (count > 0) StatsService.incrementShopStat("cropsSoldCount", count);
    } catch (error) {
      console.error("[SellAllCrops] Unable to read crop items", error);
    }
    try {
      await addPositive(() => Atoms.shop.totalCropSellPrice.get(), "cropsSoldValue");
    } catch (error) {
      console.error("[SellAllCrops] Unable to read crop sell price", error);
    }
  })();
}

function countPetSale() {
  StatsService.incrementShopStat("petsSoldCount");
  void addPositive(() => Atoms.pets.totalPetSellPrice.get(), "petsSoldValue").catch((error) => {
    console.error("[SellPet] Unable to read pet sell price", error);
  });
}

/** Starts counting. Observers always run after every rule, so the order of installs does not matter. */
export function installStatsCounters(): void {
  observeOutgoing("HarvestCrop", countHarvest);
  observeOutgoing("RemoveGardenObject", () => StatsService.incrementGardenStat("totalDestroyed"));
  observeOutgoing("WaterPlant", () => {
    StatsService.incrementGardenStat("watercanUsed");
    StatsService.incrementGardenStat("waterTimeSavedMs", WATER_TIME_SAVED_MS);
  });
  observeOutgoing("PlantSeed", () => StatsService.incrementGardenStat("totalPlanted"));
  observeOutgoing("PurchaseShopItem", countPurchase);
  observeOutgoing("SellAllCrops", countCropSale);
  observeOutgoing("SellPet", countPetSale);
}
