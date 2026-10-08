// Finds the hungry pets and something to feed them.
//
// Two sources, in this order: a crop already in the bag, otherwise a ripe crop
// in the garden that the Locker lets him pick. A pet is never proposed without
// something to feed it: a question that cannot be acted on is not worth asking.
//
// Favourites are left out: they are exactly the crops the player marked as not
// to be spent.

import { loadCompanionSettings } from "../state";
import { PetsService } from "../../pets/pets";
import type { PetInfo } from "../../../game/player";
import { PlayerService, type CropItem } from "../../../game/player";
import { readHarvestable } from "./gardenRead";
import { rowKey, type HarvestRow } from "./harvest";
import { disambiguate, type FeedCandidate, type FeedSource } from "./feed";

function petIdOf(pet: PetInfo): string {
  return String(pet?.slot?.id ?? "");
}

function petNameOf(pet: PetInfo): string {
  const given = pet?.slot?.name;
  const species = String(pet?.slot?.petSpecies ?? "");
  return (typeof given === "string" && given.trim()) || species || "That pet";
}

/**
 * What a pet accepts, worked out from the pet object already in hand.
 *
 * `PetsService.getPetAllowedCrops` does the same, but looks the pet up by id
 * first, and that lookup can fail right after a team change while the state
 * catches up. It then returned an empty set, indistinguishable from "the
 * player forbade everything", and the pet was dropped silently. So the same
 * rule is applied here, from the species the pet object carries.
 */
function allowedCropsFor(petId: string, species: string): Set<string> {
  const compatibles = PetsService.getCompatibleCropsForSpecies(species);
  let rules: Record<string, { allowed: boolean }> = {};
  try {
    rules = PetsService.getOverride(petId).crops ?? {};
  } catch {
    rules = {};
  }
  // A crop with no explicit rule is allowed: that is the game's default.
  return new Set(compatibles.filter((crop) => (rules[crop] ? rules[crop].allowed : true)));
}

export type FeedSearch = {
  /** Fullness below which he worries, in percent. */
  thresholdPct: number;
  /** Lets him pick a garden crop when the bag has none. */
  allowGarden: boolean;
};

/**
 * The whole result of a search, reasons included.
 *
 * "No pet to feed" used to cover three different cases: no hungry pet, hungry
 * pets with nothing to give them, or pets that picking from the garden would
 * have fed if it were allowed. Mixing them made the feature impossible to
 * diagnose from the outside.
 */
export type FeedReview = {
  candidates: FeedCandidate[];
  /** Pets under the threshold, feedable or not. */
  hungry: number;
  /** Pets a garden crop would feed, if picking were allowed. */
  waitingOnGardenRule: number;
};

/**
 * The pets under the threshold, with something to feed them.
 *
 * `thresholdPct` is a fullness percentage: at 10 he worries once a tenth is
 * left. One entry per pet and one source per pet.
 */
export async function reviewFeeding(search?: Partial<FeedSearch>): Promise<FeedReview> {
  // Without explicit options the player's settings apply, so every caller
  // shares the same idea of "hungry" and "may pick".
  const settings = loadCompanionSettings();
  const thresholdPct = search?.thresholdPct ?? settings.feedThresholdPct;
  const allowGarden = search?.allowGarden ?? settings.feedFromGarden;

  const empty: FeedReview = { candidates: [], hungry: 0, waitingOnGardenRule: 0 };

  let pets: PetInfo[] = [];
  try {
    pets = (await PetsService.getPets()) ?? [];
  } catch {
    return empty;
  }

  const hungry = pets.filter((pet) => petIdOf(pet) && PetsService.getHungerPctFor(pet) <= thresholdPct);
  if (hungry.length === 0) return empty;

  let inventory: CropItem[] = [];
  let favourites = new Set<string>();
  try {
    const [invRaw, favRaw] = await Promise.all([
      PlayerService.getCropInventoryState(),
      PlayerService.getFavoriteIds().catch(() => [] as string[]),
    ]);
    inventory = Array.isArray(invRaw) ? invRaw : [];
    favourites = new Set(Array.isArray(favRaw) ? favRaw : []);
  } catch {
    inventory = [];
  }

  // The garden is read once, and only when the bag is not enough.
  let garden: HarvestRow[] | null = null;
  const gardenRows = async (): Promise<HarvestRow[]> => {
    if (garden === null) garden = await readHarvestable().then((scope) => scope.rows).catch(() => []);
    return garden;
  };

  /** Claimed during this search: two pets never share a crop. */
  const claimed = new Set<string>();
  const candidates: FeedCandidate[] = [];
  let waitingOnGardenRule = 0;

  for (const pet of hungry) {
    const petId = petIdOf(pet);
    const species = String(pet?.slot?.petSpecies ?? "");
    const allowed = allowedCropsFor(petId, species);
    if (allowed.size === 0) continue;

    const fromInventory = inventory.find(
      (item) =>
        item?.id &&
        !favourites.has(String(item.id)) &&
        !claimed.has(`inv:${item.id}`) &&
        typeof item.species === "string" &&
        allowed.has(item.species)
    );

    let source: FeedSource | null = null;
    if (fromInventory?.id) {
      claimed.add(`inv:${fromInventory.id}`);
      source = { kind: "inventory", itemId: String(fromInventory.id), species: String(fromInventory.species) };
    } else {
      const rows = await gardenRows();
      const fromGarden = rows.find((row) => allowed.has(row.species) && !claimed.has(`garden:${rowKey(row)}`));
      if (fromGarden && allowGarden) {
        claimed.add(`garden:${rowKey(fromGarden)}`);
        source = { kind: "garden", row: fromGarden, species: fromGarden.species };
      } else if (fromGarden) {
        // Feedable, but picking is off: that gets said.
        waitingOnGardenRule++;
      }
    }

    if (!source) continue;
    candidates.push({
      petId,
      petName: petNameOf(pet),
      petSpecies: species,
      pet: pet?.slot,
      hungerPct: PetsService.getHungerPctFor(pet),
      source,
    });
  }

  return {
    // The hungriest first: the question is most pressing for them.
    candidates: disambiguate(candidates.sort((a, b) => a.hungerPct - b.hungerPct)),
    hungry: hungry.length,
    waitingOnGardenRule,
  };
}

export async function findFeedable(search?: Partial<FeedSearch>): Promise<FeedCandidate[]> {
  return (await reviewFeeding(search)).candidates;
}
