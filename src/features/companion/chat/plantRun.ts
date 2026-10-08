// Runs a confirmed planting plan.
//
// The companion walks to each tile before putting down what it waits for.
// Only for show, since the server accepts the command from anywhere, but it is
// what makes him look like he works rather than growing a garden from a corner.
//
// `PlantSeed` and `GrowEgg` get no acknowledgement, so the sends are not
// counted: the garden is read again to see which tiles filled up.

import { sleep } from "../../../lib/async";
import { PlayerService } from "../../../game/player";
import { StatsService } from "../../stats/stats";
import { SETTLE_MS, runSteps, type BatchReporter } from "./batch";
import { seedIcon } from "./bubbleIcons";
import { compose } from "./bubbleTags";
import { hireCrew } from "./crew";
import { countByItem, listPlantItems, type PlantAssignment } from "./plant";
import { readPlantScope } from "./plantRead";

/** The plan's main seed. An egg has none, and gives `null`. */
function topSeed(plan: PlantAssignment[]) {
  const most = countByItem(plan)[0];
  return most?.kind === "seed" ? seedIcon(most.id) : null;
}

/** Puts down a seed or an egg. */
async function send(assignment: PlantAssignment): Promise<void> {
  if (assignment.kind === "egg") {
    await PlayerService.plantEgg(assignment.tileIndex, assignment.id);
    return;
  }
  await PlayerService.plantSeed(assignment.tileIndex, assignment.id);
}

/**
 * How many targeted tiles really filled up.
 *
 * `null` when the garden could not be read again: announcing a success nobody
 * saw would be worse than admitting he does not know.
 */
async function countPlanted(attempted: PlantAssignment[]): Promise<number | null> {
  try {
    const { occupied } = await readPlantScope();
    return attempted.filter((assignment) => occupied.has(assignment.tileIndex)).length;
  } catch {
    return null;
  }
}

/** Reports on the batch by reading the garden, not by counting the sends. */
async function report(attempted: PlantAssignment[], cancelled: boolean, reporter: BatchReporter): Promise<void> {
  if (attempted.length === 0) {
    reporter.say("report", "Stopped before I planted anything.");
    return;
  }

  await sleep(SETTLE_MS);
  const planted = await countPlanted(attempted);
  const stopped = cancelled ? " before you stopped me" : "";

  if (planted === null) {
    reporter.say("report", `Planted all ${attempted.length}${stopped}, but I could not check.`);
    return;
  }

  if (planted > 0) StatsService.incrementGardenStat("totalPlanted", planted);

  if (planted === attempted.length) {
    const done = cancelled ? `Stopped there. ${planted} are in the ground.` : `All done, ${planted} planted.`;
    reporter.say("report", done, compose(topSeed(attempted), " ", done));
    return;
  }
  if (planted === 0) {
    reporter.say("report", "None took. The tiles are still bare, so the seeds probably ran out.");
    return;
  }
  reporter.say("report", `Planted ${planted} of ${attempted.length}${stopped}. The rest would not go in.`);
}

/**
 * Plants the confirmed plan, tile by tile.
 *
 * The plan runs as it was proposed: no recount, no catching up. If the garden
 * moved meanwhile, the signature check upstream already refused and asked again.
 */
export async function executePlantBatch(plan: PlantAssignment[], reporter: BatchReporter): Promise<void> {
  const what = countByItem(plan);
  const opening =
    what.length === 1
      ? `On it. Planting ${plan.length} ${what[0].name} now.`
      : `On it. Planting ${listPlantItems(plan)} now.`;
  reporter.say("reply", opening, compose(topSeed(plan), " ", opening));

  const attempted: PlantAssignment[] = [];
  await runSteps({
    items: plan,
    reporter,
    hire: () => hireCrew(reporter),
    async step(assignment, walker, pace) {
      // The walk counts as waiting: see `pacer`.
      await walker.toGardenTile(assignment.tileIndex);
      await pace.wait();
      attempted.push(assignment);
      await send(assignment);
      pace.mark();
    },
    progressNote: (done, total) => `${done} of ${total} in the ground so far...`,
  });

  await report(attempted, reporter.stopped(), reporter);
}
