// Runs a confirmed pet sale.
//
// The sale is its own batch with its own question, never chained onto a hatch
// (see `hatchRun.ts`). As everywhere else the sends are not counted, since
// `SellPet` gets no acknowledgement: the bag is read again to see who left.

import { sleep } from "../../../lib/async";
import { PlayerService } from "../../../game/player";
import { PetsService } from "../../pets/pets";
import { readCompanionMap } from "../map";
import { SETTLE_MS, runSteps, type BatchReporter } from "./batch";
import { petRowIcons, petThing } from "./bubbleIcons";
import { compose, spaced } from "./bubbleTags";
import { hireCrew } from "./crew";
import { summarizeSell, type PetRow } from "./hatch";
import { readHatchScope } from "./hatchRead";
import type { Walker } from "./walk";

/**
 * How to recognise the pet shop among the map's keys.
 *
 * Fragments to look for, not building names: the map stays the only source,
 * and its keys change from one game version to the next. "pet" alone would
 * not do, since the kennel mentions pets too, hence the second group, of which
 * at least one word must be present.
 */
const SELL_BUILDING_WORDS = ["pet"];
const SELL_BUILDING_ALTERNATIVES = ["sell", "shop", "store", "market"];

export type SellPlan = {
  /** To protect before selling: they match the keep rules without being favourites yet. */
  favourite: PetRow[];
  sell: PetRow[];
  /** The team to wear during the sale. `null` leaves the player's team alone. */
  teamId: string | null;
};

/**
 * Takes the companion to the pet shop.
 *
 * Only for show, like all his walks: the server accepts the sale from
 * anywhere. But selling thirty pets from the back of the garden looks like
 * nothing, and the shop is where the player would go.
 *
 * A missing building never blocks the sale. It is logged once with the keys
 * the map exposes, which is what fixing the keywords needs if the game renames
 * its places.
 */
async function goToSellShop(walker: Walker, reporter: BatchReporter): Promise<void> {
  if (!walker.walking) return;

  const map = await readCompanionMap();
  if (!map) return;

  const shop = map.findBuilding(SELL_BUILDING_WORDS, SELL_BUILDING_ALTERNATIVES);
  if (!shop) {
    console.warn("[companion] no pet shop found on the map, selling from here. Buildings:", map.buildingNames);
    return;
  }

  reporter.say("system", "Heading to the pet shop.");
  const arrived = await walker.toBuilding(shop);
  if (!arrived) reporter.say("system", "Could not get there, selling from here.");
}

/** Reports by reading the bag again: a sold pet leaves it. */
async function reportSell(attempted: PetRow[], skipped: PetRow[], reporter: BatchReporter): Promise<void> {
  if (attempted.length === 0) {
    reporter.say("report", skipped.length > 0 ? "None of them went through." : "Nothing sold.");
    return;
  }

  await sleep(SETTLE_MS);

  let sold: number | null = null;
  try {
    const left = new Set((await readHatchScope()).pets.map((pet) => pet.petId));
    sold = attempted.filter((pet) => !left.has(pet.petId)).length;
  } catch {
    sold = null;
  }

  const tail = skipped.length > 0 ? ` I left ${skipped.length} alone.` : "";
  if (sold === null) {
    reporter.say("report", `Sent all ${attempted.length}, but I could not check.${tail}`);
    return;
  }
  if (sold === 0) {
    reporter.say("report", `None of them sold. They are all still in your bag.${tail}`);
    return;
  }
  reporter.say("report", `${sold} sold.${tail}`);
}

export async function executeSellBatch(plan: SellPlan, reporter: BatchReporter): Promise<void> {
  const opening = `On it. ${summarizeSell(plan.sell)} going.`;
  reporter.say("reply", opening, compose(...spaced(petRowIcons(plan.sell)), " ", opening));

  for (const pet of plan.favourite) {
    if (reporter.stopped()) break;
    try {
      await PlayerService.ensureFavoriteItem(pet.petId, true);
    } catch {
      reporter.say("system", `Could not favourite ${pet.name}, leaving it alone.`);
    }
  }
  if (plan.favourite.length > 0) {
    // The first one kept carries the bubble, composed and with its STR: that
    // is the one worth seeing. The others are counted.
    const best = plan.favourite[0];
    const strength = best.maxStrength === null ? "" : ` ${best.maxStrength} STR,`;
    const others = plan.favourite.length - 1;
    reporter.say(
      "system",
      `${plan.favourite.length} kept and favourited.`,
      compose(petThing(best.item, ""), `${strength} keeping that one${others > 0 ? ` and ${others} more` : ""}.`),
    );
  }

  const attempted: PetRow[] = [];
  const skipped: PetRow[] = [];
  let onTeam = new Set<string>();

  await runSteps({
    items: plan.sell,
    reporter,
    async hire() {
      const crew = await hireCrew(reporter, {
        teamId: plan.teamId,
        approach: (walker) => goToSellShop(walker, reporter),
      });
      // The game will not sell a pet from the active team.
      onTeam = new Set(await PetsService.getActivePetIds().catch(() => [] as string[]));
      return crew;
    },
    async step(pet, _walker, pace) {
      if (onTeam.has(pet.petId)) {
        skipped.push(pet);
        return;
      }
      // No walk between two sales: here the gap is paid in full.
      await pace.wait();
      try {
        await PlayerService.sellPet(pet.petId);
        attempted.push(pet);
      } catch {
        skipped.push(pet);
      }
      pace.mark();
    },
  });

  await reportSell(attempted, skipped, reporter);
}
