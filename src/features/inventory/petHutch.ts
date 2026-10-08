// The pet hutch modal lists pets as cards too: its two lists get the same
// strength line as the inventory, matching each card to a pet by name.

import { Atoms, myPetHutchPetItems } from "../../game/store/atoms";
import { findSectionByHeader, getDomEntries } from "./inventoryDom";
import { normalize, readNestedString } from "./itemInfo";
import { alignStrengthText, updateStrengthText } from "./strengthBadge";

export const PET_HUTCH_ROOT_SELECTOR = ".McGrid.css-3c49ba";
const HUTCH_LIST_SELECTOR = ".McGrid.css-1nv2ym8 .McFlex.css-1tgchvv";
const INVENTORY_LIST_SELECTOR = ".McGrid.css-1nv2ym8 .McFlex.css-gui45t";
const PET_NAME_SELECTOR = ".McFlex.css-1lpag07 .chakra-text";

const petSpeciesOf = (item: any) => readNestedString(item, "petSpecies") ?? readNestedString(item, "species");

function isPetItem(item: any): boolean {
  if (normalize(typeof item?.itemType === "string" ? item.itemType : "") === "pet") return true;
  return !!petSpeciesOf(item);
}

function nameCandidates(item: any): string[] {
  const names = new Set<string>();
  const name = readNestedString(item, "name");
  if (name) names.add(normalize(name));
  const species = petSpeciesOf(item);
  if (species) names.add(normalize(species));
  return [...names];
}

/**
 * Pairs each card with a pet: the first unused pet whose name or species
 * matches the card's name, else the first unused pet.
 */
function applyPetsToList(container: HTMLElement | null, items: unknown): void {
  if (!container) return;
  const entries = getDomEntries(container);
  const pets = (Array.isArray(items) ? items : []).filter(isPetItem);
  if (!entries.length || !pets.length) return;

  const used = new Set<number>();
  const firstUnused = (match: (pet: any) => boolean) => pets.findIndex((pet, i) => !used.has(i) && match(pet));
  for (const entry of entries) {
    const cardName = normalize(entry.card.querySelector<HTMLElement>(PET_NAME_SELECTOR)?.textContent ?? "");
    let index = cardName ? firstUnused((pet) => nameCandidates(pet).includes(cardName)) : -1;
    if (index < 0) index = firstUnused(() => true);
    if (index < 0) continue;
    used.add(index);
    updateStrengthText(entry.card, pets[index]);
    alignStrengthText(entry.card);
  }
}

function setHidden(containers: Array<HTMLElement | null>, hidden: boolean): void {
  for (const container of containers) {
    if (!container) continue;
    if (hidden) container.style.setProperty("visibility", "hidden");
    else container.style.removeProperty("visibility");
  }
}

/**
 * Updates both hutch lists. `hideDuringUpdate` hides them meanwhile, so the
 * game's own strength text does not flash first. False when no list is up.
 */
export async function updatePetHutchSections(hideDuringUpdate = false): Promise<boolean> {
  const root = document.querySelector<HTMLElement>(PET_HUTCH_ROOT_SELECTOR) ?? document.body;
  const hutchList = root.querySelector<HTMLElement>(HUTCH_LIST_SELECTOR) ?? findSectionByHeader("Pets in Hutch");
  const inventoryList = root.querySelector<HTMLElement>(INVENTORY_LIST_SELECTOR) ?? findSectionByHeader("Pets in Inventory");
  if (!hutchList && !inventoryList) return false;

  const lists = [hutchList, inventoryList];
  if (hideDuringUpdate) setHidden(lists, true);
  try {
    const [hutchItems, inventory] = await Promise.all([
      myPetHutchPetItems.get().catch(() => []),
      Atoms.inventory.myInventory.get().catch(() => null),
    ]);
    const inventoryItems = Array.isArray((inventory as any)?.items) ? (inventory as any).items : Array.isArray(inventory) ? inventory : [];
    applyPetsToList(hutchList, hutchItems);
    applyPetsToList(inventoryList, inventoryItems);
    return true;
  } catch (error) {
    console.warn("[InventorySorting] Could not update the hutch pets", error);
    return false;
  } finally {
    if (hideDuringUpdate) setHidden(lists, false);
  }
}
