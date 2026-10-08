// Choosing a pet for a team slot, through the game's own inventory modal
// filled with every pet the player owns.

import { fakeInventory, isInventoryOpen } from "../../game/fakeModal";
import { PlayerService } from "../../game/player";
import { Atoms, myPetHutchPetItems } from "../../game/store/atoms";
import { sleep } from "../../lib/async";
import {
  activeSlotToPet,
  getInventoryPets,
  inventoryItemToPet,
  petToInventoryItem,
  type InventoryPet,
} from "./inventoryPets";
import { getTeamById } from "./teamStore";
import { saveTeam } from "./teams";

const PICK_TIMEOUT_MS = 20_000;

async function clearHandSelection(): Promise<void> {
  try { await Atoms.inventory.setSelectedIndexToEnd.set(null); } catch {}
  try { await Atoms.inventory.mySelectedItemId.set(null); } catch {}
  try { await Atoms.inventory.myPossiblyNoLongerValidSelectedItemIndex.set(null); } catch {}
  try { await PlayerService.setSelectedItem(null); } catch {}
  try { await PlayerService.dropObject(); } catch {}
}

/** The index the player picked in the inventory modal, or null if they closed it or time ran out. */
async function waitForPickedIndex(timeoutMs: number): Promise<number | null> {
  await clearHandSelection();
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    try {
      if (!isInventoryOpen(await Atoms.ui.activeModal.get())) return null;
    } catch {
      return null;
    }
    try {
      const index = await Atoms.inventory.myValidatedSelectedItemIndex.get();
      if (typeof index === "number" && Number.isInteger(index) && index >= 0) return index;
    } catch {}
    await sleep(80);
  }
  return null;
}

/**
 * Every owned pet as a modal item, minus `exclude`. The cache already holds
 * the hutch and equipped pets; they are read fresh as well, in case the cache
 * has not caught up with a move made a moment ago.
 */
async function pickablePets(exclude: Set<string>): Promise<InventoryPet[]> {
  const seen = new Set<string>();
  const out: InventoryPet[] = [];
  const add = (pet: InventoryPet | null) => {
    if (!pet || exclude.has(pet.id) || seen.has(pet.id)) return;
    seen.add(pet.id);
    out.push(pet);
  };

  for (const pet of await getInventoryPets()) add(pet);
  try {
    const hutch = await myPetHutchPetItems.get();
    for (const item of Array.isArray(hutch) ? hutch : []) add(inventoryItemToPet(item));
    const active = await PlayerService.getPets();
    for (const entry of Array.isArray(active) ? active : []) add(activeSlotToPet(entry));
  } catch {}
  return out;
}

/**
 * Lets the player pick the pet for one slot of a team, and saves it. Pets
 * already in the team's other slots are left out of the list.
 */
export async function chooseSlotPet(teamId: string, slotIndex: number): Promise<InventoryPet | null> {
  const index = Math.max(0, Math.min(2, Math.floor(slotIndex || 0)));
  const team = getTeamById(teamId);
  if (!team) return null;

  const exclude = new Set<string>();
  team.slots.forEach((id, i) => {
    if (i !== index && id) exclude.add(String(id));
  });

  const pets = await pickablePets(exclude);
  if (!pets.length) return null;

  let favoritedItemIds: string[] = [];
  try {
    const favorites: string[] = (await Atoms.inventory.favoriteIds.get()) || [];
    const ids = new Set(pets.map((p) => p.id));
    favoritedItemIds = favorites.filter((id) => ids.has(id));
  } catch {}

  await fakeInventory.show({ items: pets.map(petToInventoryItem), favoritedItemIds }, { open: true });
  const picked = await waitForPickedIndex(PICK_TIMEOUT_MS);

  // A pick closes the modal, which the player is done with. Otherwise (timeout,
  // or they went elsewhere) only the fake data is dropped: if they are still
  // in the modal they now see their real inventory, and if they left there is
  // nothing to close.
  if (picked == null || picked >= pets.length) {
    await fakeInventory.disable();
    return null;
  }
  await fakeInventory.close();

  const chosen = pets[picked];
  const slots = team.slots.slice(0, 3);
  slots[index] = chosen.id;
  saveTeam({ id: team.id, slots });

  try { await clearHandSelection(); } catch {}
  return chosen;
}
