// Equipping a pet team. With the sync on and the team linked, the game does
// it in one ApplyPetTeam. Otherwise the mod swaps the pets one slot at a time,
// moving pets in and out of the Pet Hutch as space allows.

import { PlayerService } from "../../game/player";
import {
  Atoms,
  myPetHutchItems,
  myPetHutchCapacitySlots,
  myPetHutchPetItems,
} from "../../game/store/atoms";
import { isInventoryFullForUnstackable } from "../../data/rules/inventory";
import { waitUntil } from "../../lib/async";
import { toastSimple } from "../../ui/toast";
import { getInventoryPets } from "./inventoryPets";
import { getTeamById, getTeams, teamIdForPets } from "./teamStore";
import { isTeamSyncEnabled, myUserSlotIndex, sendApplyPetTeam } from "./teamSync";

export type EquipResult = { swapped: number; placed: number; skipped: number };

const MAX_TEAM_SLOTS = 3;
/**
 * Hutch size when the storage entry carries no `capacitySlots`: the game's
 * own capacity atom falls back to 10 for a fresh hutch with no upgrade.
 */
const HUTCH_DEFAULT_CAPACITY = 10;

/** The team last switched to, for Previous and Next when the equipped pets form no team. */
let lastUsedTeamId: string | null = null;

export function getLastUsedTeamId(): string | null {
  return lastUsedTeamId;
}

/* --------------------------------- reading -------------------------------- */

/** Ids of the equipped pets, in slot order. */
export async function getActivePetIds(): Promise<string[]> {
  try {
    // The primitive slots atom came with a game update; its items carry the id directly.
    const primitives = await Atoms.pets.myPrimitivePetSlots.get();
    const ids = (Array.isArray(primitives) ? primitives : [])
      .map((p: any) => String(p?.id || ""))
      .filter(Boolean)
      .slice(0, MAX_TEAM_SLOTS);
    if (ids.length) return ids;

    // Older shape: myPetInfos with a `{ slot: { id } }` wrapper.
    const pets = await PlayerService.getPets();
    return (Array.isArray(pets) ? pets : [])
      .map((p) => String(p?.slot?.id || ""))
      .filter(Boolean)
      .slice(0, MAX_TEAM_SLOTS);
  } catch {
    return [];
  }
}

/** The team the equipped pets form, if any. */
export async function getActiveTeamId(): Promise<string | null> {
  try {
    return teamIdForPets(await getActivePetIds());
  } catch {
    return null;
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/** Resolves once the equipped pets are exactly this team's, or false after the timeout. */
export async function waitForTeamEquipped(teamId: string, timeoutMs = 2000): Promise<boolean> {
  const target = (getTeamById(teamId)?.slots ?? []).filter((x): x is string => !!x);
  const done = await waitUntil(
    async () => {
      const pets = await PlayerService.getPets().catch(() => null);
      const equipped = Array.isArray(pets) ? pets.map((p) => String(p?.slot?.id || "")).filter(Boolean) : [];
      return sameSet(equipped, target);
    },
    { timeoutMs, intervalMs: 80 },
  );
  return !!done;
}

/* ----------------------------------- hutch ---------------------------------- */

async function hutchInfo(): Promise<{ capacity: number; used: number; free: number }> {
  let capacity = 0;
  let used = 0;
  try {
    const inv: any = await Atoms.inventory.myInventory.get();
    const storages: any[] = Array.isArray(inv?.storages) ? inv.storages : [];
    const hutch = storages.find((s) => s?.id === "PetHutch" || s?.decorId === "PetHutch");
    const slots = Number(hutch?.capacitySlots);
    if (Number.isFinite(slots) && slots > 0) capacity = slots;
    if (Array.isArray(hutch?.items)) used = hutch.items.length;
  } catch {}
  if (!capacity) {
    try {
      const n = Number(await myPetHutchCapacitySlots.get());
      if (Number.isFinite(n) && n > 0) capacity = n;
    } catch {}
  }
  if (!capacity) capacity = HUTCH_DEFAULT_CAPACITY;
  if (!used) {
    try {
      const items = await myPetHutchItems.get();
      if (Array.isArray(items) && items.length > 0) used = items.length;
    } catch {}
  }
  return { capacity, used, free: Math.max(0, capacity - used) };
}

async function hutchPetIds(): Promise<Set<string>> {
  try {
    const items = await myPetHutchPetItems.get();
    return new Set((Array.isArray(items) ? items : []).map((it: any) => String(it?.id ?? "")).filter(Boolean));
  } catch {
    return new Set();
  }
}

/** Move one inventory pet that is neither equipped nor wanted into the hutch, to free an inventory slot. */
async function moveSparePetToHutch(targets: Set<string>, activeSlots: string[], inHutch: Set<string>): Promise<boolean> {
  try {
    const spare = (await getInventoryPets()).find((p) => {
      const id = String(p?.id || "");
      return id && !inHutch.has(id) && !activeSlots.includes(id) && !targets.has(id);
    });
    if (!spare) return false;
    await PlayerService.putItemInStorage(spare.id, "PetHutch");
    return true;
  } catch {
    return false;
  }
}

/* --------------------------------- placing -------------------------------- */

/**
 * The n-th dirt tile of my garden. Each placed pet needs its own tile: the
 * server ignores all but the first pet placed on one.
 */
async function myDirtTile(tileOffset: number): Promise<{ position: { x: number; y: number }; localTileIndex: number } | null> {
  try {
    const map: any = await Atoms.root.map.get();
    const cols = Number(map?.cols);
    const dirtBySlot: number[][] = Array.isArray(map?.userSlotIdxAndDirtTileIdxToGlobalTileIdx)
      ? map.userSlotIdxAndDirtTileIdxToGlobalTileIdx
      : [];
    if (!Number.isFinite(cols) || cols <= 0 || !dirtBySlot.length) return null;
    const slotIndex = await myUserSlotIndex();
    if (slotIndex == null) return null;
    const dirt: number[] = Array.isArray(dirtBySlot[slotIndex]) ? dirtBySlot[slotIndex] : [];
    if (!dirt.length) return null;
    const localTileIndex = Math.min(Math.max(0, tileOffset), dirt.length - 1);
    const globalIndex = Number(dirt[localTileIndex]);
    if (!Number.isFinite(globalIndex)) return null;
    return { position: { x: globalIndex % cols, y: Math.floor(globalIndex / cols) }, localTileIndex };
  } catch {
    return null;
  }
}

async function placePetInMyGarden(petId: string, tileOffset: number): Promise<void> {
  const tile = await myDirtTile(tileOffset);
  if (tile) {
    await PlayerService.placePet(petId, tile.position, "Dirt", tile.localTileIndex);
    return;
  }
  // Without map data: the old fixed boardwalk spot.
  await PlayerService.placePet(petId, { x: 0, y: 0 }, "Boardwalk", 64);
}

/**
 * Lines the wanted pets up with the equipped slots so a pet already equipped
 * keeps its slot. A swap then never targets a pet of the team itself, which
 * would break the swap sequence.
 */
function alignTargetsToActiveSlots(targets: string[], activeSlots: string[]): string[] {
  const aligned: string[] = new Array(MAX_TEAM_SLOTS).fill("");
  const remaining: string[] = [];
  for (const id of targets) {
    const index = activeSlots.indexOf(id);
    if (index >= 0 && index < MAX_TEAM_SLOTS && !aligned[index]) aligned[index] = id;
    else remaining.push(id);
  }
  for (const id of remaining) {
    const free = aligned.indexOf("");
    if (free < 0) break;
    aligned[free] = id;
  }
  return aligned;
}

/** Equips these pets slot by slot, the way the game's own pet switcher does. */
async function equipPetIds(rawIds: string[], markTeamId: string | null, markUsed = true): Promise<EquipResult> {
  const targets = Array.from(new Set(rawIds.map((v) => String(v || "")).filter(Boolean))).slice(0, MAX_TEAM_SLOTS);
  const teamToMark = markTeamId ?? teamIdForPets(targets);
  const finish = (result: EquipResult) => {
    if (markUsed && teamToMark) lastUsedTeamId = teamToMark;
    return result;
  };
  if (!targets.length) return finish({ swapped: 0, placed: 0, skipped: 0 });

  const activeSlots = await getActivePetIds();
  if (sameSet(targets, activeSlots)) return finish({ swapped: 0, placed: 0, skipped: targets.length });

  let freeHutch = (await hutchInfo()).free;
  const inHutch = await hutchPetIds();
  const targetSet = new Set(targets);
  const aligned = alignTargetsToActiveSlots(targets, activeSlots);

  let swapped = 0;
  let placed = 0;
  let skipped = 0;
  let placementOffset = 0;

  const storeInHutch = async (petId: string) => {
    if (freeHutch <= 0) return;
    await PlayerService.putItemInStorage(petId, "PetHutch");
    freeHutch--;
  };
  const place = async (petId: string) => {
    await placePetInMyGarden(petId, placementOffset++);
    placed++;
  };

  for (let slot = 0; slot < MAX_TEAM_SLOTS; slot++) {
    const targetId = aligned[slot];
    const currentId = String(activeSlots[slot] ?? "");

    // The slot already holds the right pet.
    if (targetId && targetId === currentId) {
      skipped++;
      continue;
    }

    // The slot must end up empty: unequip, and into the hutch if there is room.
    if (!targetId) {
      if (currentId) {
        try {
          await PlayerService.storePet(currentId);
          activeSlots[slot] = "";
          await storeInHutch(currentId);
        } catch {}
      }
      continue;
    }

    // The wanted pet is in the hutch and a pet is equipped: one atomic
    // SwapPetFromStorage. The equipped pet takes the exact hutch slot the
    // wanted one leaves, so the free count does not move.
    if (currentId && inHutch.has(targetId)) {
      try {
        await PlayerService.swapPetFromStorage(currentId, targetId, "PetHutch");
        swapped++;
        activeSlots[slot] = targetId;
        inHutch.delete(targetId);
        inHutch.add(currentId);
      } catch {
        try { await place(targetId); } catch {}
      }
      continue;
    }

    // The wanted pet must be in the inventory before it can be swapped in or placed.
    if (inHutch.has(targetId)) {
      let inventoryFull = false;
      try {
        const inventory: any = await Atoms.inventory.myInventory.get();
        inventoryFull = isInventoryFullForUnstackable(inventory?.items);
      } catch {}
      if (inventoryFull) {
        const freed = freeHutch > 0 && (await moveSparePetToHutch(targetSet, activeSlots, inHutch));
        if (!freed) {
          try {
            await toastSimple(
              "Inventory Full",
              "Cannot equip team: required pets are in the Pet Hutch and your inventory is full.",
              "error",
            );
          } catch {}
          return finish({ swapped, placed, skipped });
        }
        freeHutch--;
      }
      try {
        await PlayerService.retrieveItemFromStorage(targetId, "PetHutch");
        inHutch.delete(targetId);
        freeHutch++;
      } catch {
        continue;
      }
    }

    // An empty slot: place the pet on its own dirt tile.
    if (!currentId) {
      try {
        await place(targetId);
        activeSlots[slot] = targetId;
      } catch {}
      continue;
    }

    // Swap the equipped pet for the wanted one, then hutch the old one if there is room.
    try {
      await PlayerService.swapPet(currentId, targetId);
      swapped++;
      activeSlots[slot] = targetId;
      try { await storeInHutch(currentId); } catch {}
    } catch {
      try { await place(targetId); } catch {}
    }
  }

  return finish({ swapped, placed, skipped });
}

/** Equips a saved team. */
export async function useTeam(teamId: string, opts?: { markUsed?: boolean }): Promise<EquipResult> {
  const team = getTeams().find((t) => t.id === teamId);
  if (!team) throw new Error("Team not found");
  const petIds = team.slots.filter((x): x is string => typeof x === "string" && x.length > 0).slice(0, MAX_TEAM_SLOTS);

  if (isTeamSyncEnabled() && team.serverId) {
    sendApplyPetTeam(team.serverId);
    if (opts?.markUsed !== false) lastUsedTeamId = teamId;
    return { swapped: petIds.length, placed: 0, skipped: 0 };
  }
  return equipPetIds(petIds, teamId, opts?.markUsed !== false);
}

/** Equips any set of pets, saved as a team or not. */
export function usePetIds(petIds: string[]): Promise<EquipResult> {
  return equipPetIds(petIds, null);
}
