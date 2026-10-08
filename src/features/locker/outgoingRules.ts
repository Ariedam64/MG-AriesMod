import { interceptOutgoing } from "../../game/ws/outgoing";
import { Atoms, type GardenState } from "../../game/store/atoms";
import { readAndFollow } from "../../game/store/hub";
import { editGameToasts } from "../../game/toasts";
import { tos } from "../../game/pixi/tileObjects";
import { toastSimple } from "../../ui/toast";
import { EditorService } from "../editor/editor";
import { lockerService } from "./locker";
import { normalizeMutationsList } from "./harvestRules";
import { extractSeedKey, extractSizePercent } from "./slotWatcher";
import { eggIdOf, lockerRestrictionsService, percentToRequiredFriendCount } from "./restrictions";
import { currentFriendBonus, followFriendBonus } from "./friendBonus";

/**
 * The locker's hold on what the game sends: harvests the crop locker refuses,
 * decor pickups and egg hatches the restrictions lock, and Sell All while the
 * friend bonus is below the player's minimum.
 */

let garden: GardenState | null = null;
let currentGardenObject: any = null;


/**
 * Fail-closed fallback for a harvest whose tile cannot be resolved from the
 * garden atom: rely on the locker's own current-slot assessment (fed by
 * myCurrentGardenObject and the selected slot, the pipeline behind the purple
 * outline). A harvest targets the current selection, so a negative assessment
 * is enough to block instead of silently allowing.
 */
function blockedByCurrentSlot(): boolean {
  return lockerService.isEnabled() && lockerService.currentHarvestAllowed() === false;
}

/** The garden tile a harvest targets, from the garden atom or, in editor mode, the tile view. */
function harvestedTile(slot: number): any {
  let tile: any = garden?.tileObjects?.[String(slot)];
  // In editor mode the tile view is updated directly, bypassing the garden
  // atom, so the tile object system is what reflects the current state.
  if ((!tile || typeof tile !== "object") && EditorService.isEnabled()) {
    try {
      const tosTile = tos.getTileObjectByIndex(slot);
      if (tosTile?.tileObject && typeof tosTile.tileObject === "object") tile = tosTile.tileObject;
    } catch {}
  }
  return tile;
}

/**
 * `slotsIndex` in a HarvestCrop message is the sub-slot's `slotId` (the game
 * takes it from the selected slot id), not its position in `slots[]`. Sparse
 * plants (Clover after a harvest, Daisy, ...) have gaps in their slotIds, so
 * indexing the array by it would land on the wrong fruit or on nothing.
 */
function findGrowSlot(slots: unknown, slotId: number): any {
  const list = Array.isArray(slots) ? slots : [];
  return list.find((s) => s && typeof s === "object" && s.slotId === slotId) ?? list[slotId] ?? null;
}

function checkHarvest(message: any) {
  const { slot, slotsIndex } = message;
  if (!Number.isInteger(slot) || !Number.isInteger(slotsIndex)) return;

  const tile = harvestedTile(slot);
  if (!tile || typeof tile !== "object" || tile.objectType !== "plant") {
    if (blockedByCurrentSlot()) {
      console.log("[HarvestCrop] Blocked by locker (current-slot fallback, tile not found)", { slot, slotsIndex });
      return "drop" as const;
    }
    return;
  }

  const cropSlot = findGrowSlot(tile.slots, slotsIndex);
  if (!cropSlot || typeof cropSlot !== "object") {
    if (blockedByCurrentSlot()) {
      console.log("[HarvestCrop] Blocked by locker (current-slot fallback, sub-slot not found)", { slot, slotsIndex });
      return "drop" as const;
    }
    return;
  }

  if (!lockerService.isEnabled()) return;

  // The garden atom names the species on each sub-slot (a FourLeafClover
  // inside a Clover tile), so the sub-slot wins. The same slot of the player's
  // current garden object, then the plant itself, cover payloads that do not.
  const seedKey =
    extractSeedKey(cropSlot) ??
    extractSeedKey(findGrowSlot(currentGardenObject?.slots, slotsIndex)) ??
    extractSeedKey(tile);
  const sizePercent = extractSizePercent(cropSlot);
  const mutations = normalizeMutationsList(cropSlot.mutations);

  let allowed = true;
  try {
    allowed = lockerService.allowsHarvest({ seedKey, sizePercent, mutations });
  } catch {}
  if (allowed) return;

  console.log("[HarvestCrop] Blocked by locker", { slot, slotsIndex, seedKey, sizePercent, mutations });
  return "drop" as const;
}

function checkDecorPickup() {
  if (!lockerRestrictionsService.isDecorPickupLocked()) return;
  console.log("[PickupDecor] Blocked by decor picker");
  return "drop" as const;
}

const EGG_TOAST_TITLE = "Egg hatch locker";

/** One egg locker toast at a time: a fresh one replaces the last instead of stacking. */
async function showEggLockToast(eggId: string | null) {
  const description = eggId ? `Hatching locked for ${eggId}` : "Hatching locked by egg locker";
  const edited = await editGameToasts((toasts) => [
    ...toasts.filter((t) => t?.title !== EGG_TOAST_TITLE),
    { isClosable: true, duration: 3500, title: EGG_TOAST_TITLE, description, variant: "error", id: "quinoa-game-toast" },
  ]);
  if (!edited) await toastSimple(EGG_TOAST_TITLE, description, "error");
}

function checkHatch() {
  const eggId = eggIdOf(currentGardenObject);
  if (!lockerRestrictionsService.isEggLocked(eggId)) return;
  console.log("[HatchEgg] Blocked by egg locker", { eggId });
  void showEggLockToast(eggId).catch(() => {});
  return "drop" as const;
}

/** The game's own "crops sold" toast, shown even when the sale never reached the server. */
function isSellSuccessToast(t: any): boolean {
  if (!t || typeof t !== "object" || t.variant !== "success") return false;
  const icon = t.icon;
  const isTileSell = icon?.type === "tile" && icon?.spritesheet === "items" && Number(icon?.index) === 11;
  return isTileSell || !!t.description?.props?.values?.cropText;
}

function checkSellAllCrops() {
  const currentBonusPct = currentFriendBonus();
  if (lockerRestrictionsService.allowsCropSale(currentBonusPct)) return;

  const requiredPct = lockerRestrictionsService.getRequiredPercent();
  console.log("[SellAllCrops] Blocked by friend bonus restriction", {
    requiredPct,
    requiredPlayers: lockerRestrictionsService.getState().minRequiredPlayers,
    currentBonusPct,
    currentPlayers: currentBonusPct != null ? percentToRequiredFriendCount(currentBonusPct) : null,
  });
  void (async () => {
    try {
      await toastSimple("Friend bonus locker", `Require at least ${requiredPct}% friend bonus`, "error");
    } catch {}
    try {
      await editGameToasts((toasts) => toasts.filter((t) => !isSellSuccessToast(t)));
    } catch {}
  })();
  return "drop" as const;
}

/** Registers the locker's outgoing rules. Must run after the inventory reserve's. */
export function installLockerOutgoingRules(): void {
  void readAndFollow(Atoms.data.garden, (next) => {
    garden = next ?? null;
  });
  void readAndFollow(Atoms.data.myCurrentGardenObject, (next) => {
    currentGardenObject = next;
  });
  followFriendBonus();

  interceptOutgoing("HarvestCrop", checkHarvest);
  interceptOutgoing("PickupDecor", checkDecorPickup);
  interceptOutgoing("HatchEgg", checkHatch);
  interceptOutgoing("SellAllCrops", checkSellAllCrops);
}
