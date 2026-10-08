// Runs a feeding: from the bag, or by picking a crop first.
//
// Feeding from the garden relies on a protocol detail: the *client* makes up
// the id of the produce about to exist and sends it in `HarvestCrop.cropItemId`
// (bundle 1125). So the id is made here, the crop is picked with it, and the
// pet is fed with that same id, with no guessing which freshly picked crop is
// the right one.
//
// The companion walks there: to the crop if he has to pick it, then to the
// pet. Only for show, and it never prevents the action.

import { sleep } from "../../../lib/async";
import { randomClientId } from "../../../game/ws/commands";
import { PlayerService, type PetInfo } from "../../../game/player";
import { PetsService } from "../../pets/pets";
import { StatsService } from "../../stats/stats";
import type { XY } from "../movement";
import { SETTLE_MS, runSteps, type BatchReporter, type Pacer } from "./batch";
import { compose, spaced } from "./bubbleTags";
import { hireCrew } from "./crew";
import { petIcon, petIcons, type FeedCandidate } from "./feed";
import { listWords } from "./harvest";
import type { Walker } from "./walk";

type FeedOutcome = { ok: true } | { ok: false; reason: string };

/**
 * Where the pet is right now.
 *
 * Read when he sets off rather than captured with the proposal: pets roam,
 * and walking to where one stood a minute ago would look exactly wrong.
 */
async function petPosition(petId: string): Promise<XY | null> {
  try {
    const pets = (await PetsService.getPets()) ?? [];
    const found = pets.find((pet: PetInfo) => String(pet?.slot?.id ?? "") === petId);
    return (found?.position as XY | undefined) ?? null;
  } catch {
    return null;
  }
}

async function feedOne(candidate: FeedCandidate, walker: Walker, pace: Pacer): Promise<FeedOutcome> {
  let cropItemId: string;

  if (candidate.source.kind === "inventory") {
    cropItemId = candidate.source.itemId;
  } else {
    await walker.toGardenTile(candidate.source.row.tileIndex);

    // The id is chosen here so it can be handed over right after.
    cropItemId = randomClientId();
    await pace.wait();
    try {
      await PlayerService.harvestCrop(candidate.source.row.tileIndex, candidate.source.row.slotId, cropItemId);
    } catch {
      return { ok: false, reason: "could not pick it" };
    } finally {
      pace.mark();
    }
    StatsService.incrementGardenStat("totalHarvested", 1);
    // The produce must exist on the server before it can be fed.
    await sleep(SETTLE_MS);
  }

  await walker.toPosition(await petPosition(candidate.petId));

  await pace.wait();
  try {
    await PlayerService.feedPet(candidate.petId, cropItemId);
  } catch {
    return { ok: false, reason: "the feed did not go through" };
  } finally {
    pace.mark();
  }
  return { ok: true };
}

/**
 * Feeds the confirmed pets, one by one.
 *
 * Each result is said as it comes rather than at the end: across several pets
 * the walks take a while, and a long silence looks like a breakdown.
 */
export async function executeFeedBatch(picks: FeedCandidate[], reporter: BatchReporter): Promise<void> {
  const opening = picks.length === 1 ? "On it." : `On it. Feeding ${picks.length} of them.`;
  reporter.say("reply", opening, compose(...spaced(petIcons(picks)), " ", opening));

  // The candidates themselves, not their names: the report needs their
  // species to put the right icons on.
  const fed: FeedCandidate[] = [];
  const failures: string[] = [];

  await runSteps({
    items: picks,
    reporter,
    hire: () => hireCrew(reporter),
    async step(pick, walker, pace) {
      const outcome = await feedOne(pick, walker, pace);
      if (outcome.ok) {
        fed.push(pick);
        const fedLine = `${pick.petName} has been fed.`;
        reporter.say("system", fedLine, compose(petIcon(pick), " ", fedLine));
      } else {
        failures.push(`${pick.petName} (${outcome.reason})`);
      }
    },
  });

  const cancelled = reporter.stopped();
  if (fed.length === 0) {
    reporter.say("report", `That did not work: ${failures.join(", ") || "nothing went through"}.`);
    return;
  }
  const tail = failures.length > 0 ? ` I could not manage ${failures.join(", ")}.` : "";
  // The bubble shows icons rather than a list: three names fit in the thread,
  // not above his head.
  const done = `${cancelled ? "Stopped there. " : ""}Fed ${listWords(fed.map((pick) => pick.petName))}.${tail}`;
  reporter.say("report", done, compose(...spaced(petIcons(fed)), " ", done));
}
