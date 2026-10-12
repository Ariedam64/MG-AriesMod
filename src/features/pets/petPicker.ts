// Choosing a pet for a team slot, in the mod's own popup listing every pet the
// player owns. It used to fake the game's inventory modal, which since build
// 1449 no longer shows the faked list and opened empty.

import { PlayerService } from "../../game/player";
import { myPetHutchPetItems } from "../../game/store/atoms";
import { activeSlotToPet, getInventoryPets, inventoryItemToPet, type InventoryPet } from "./inventoryPets";
import { labelPetSources, openPetPickerModal, type PickablePet } from "./petPickerModal";
import { getTeamById } from "./teamStore";
import { saveTeam } from "./teams";

const isPet = (pet: InventoryPet | null): pet is InventoryPet => pet !== null;

/** Every owned pet with where it is (active, hutch or bag), minus `exclude`. */
async function pickablePets(exclude: Set<string>): Promise<PickablePet[]> {
  let active: InventoryPet[] = [];
  let hutch: InventoryPet[] = [];
  try {
    const slots = await PlayerService.getPets();
    active = (Array.isArray(slots) ? slots : []).map(activeSlotToPet).filter(isPet);
  } catch {}
  try {
    const items = await myPetHutchPetItems.get();
    hutch = (Array.isArray(items) ? items : []).map(inventoryItemToPet).filter(isPet);
  } catch {}
  return labelPetSources({ active, hutch, owned: await getInventoryPets(), exclude });
}

/**
 * Lets the player pick the pet for one slot of a team, and saves it. Pets
 * already in the team's other slots are left out of the list. `host` is the
 * window the popup stacks above.
 */
export async function chooseSlotPet(teamId: string, slotIndex: number, host: HTMLElement): Promise<InventoryPet | null> {
  const index = Math.max(0, Math.min(2, Math.floor(slotIndex || 0)));
  const team = getTeamById(teamId);
  if (!team) return null;

  const exclude = new Set<string>();
  team.slots.forEach((id, i) => {
    if (i !== index && id) exclude.add(String(id));
  });

  const chosen = await openPetPickerModal({
    host,
    title: "Choose a pet",
    subtitle: `Slot ${index + 1} of ${team.name || "this team"}`,
    pets: await pickablePets(exclude),
  });
  if (!chosen) return null;

  const slots = team.slots.slice(0, 3);
  slots[index] = chosen.id;
  saveTeam({ id: team.id, slots });
  return chosen;
}
