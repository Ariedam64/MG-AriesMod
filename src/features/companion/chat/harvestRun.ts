// Runs a confirmed harvest.
//
// The companion walks to each crop before picking it. That is only for show,
// since the server accepts the command from anywhere, but it is what makes him
// look like he is working rather than emptying a garden from a corner of the
// map.

import { sleep } from "../../../lib/async";
import { PlayerService } from "../../../game/player";
import { StatsService } from "../../stats/stats";
import { loadCompanionSettings } from "../state";
import { SETTLE_MS, runSteps, type BatchReporter } from "./batch";
import { cropIcon } from "./bubbleIcons";
import { compose } from "./bubbleTags";
import { hireCrew } from "./crew";
import { readHarvestRows } from "./gardenRead";
import { groupVariants, rowKey, type HarvestRow } from "./harvest";

/** The batch's main crop, for a bubble's icon. */
function topCrop(rows: HarvestRow[]) {
  const top = groupVariants(rows)[0];
  return top ? cropIcon(top.species) : null;
}

/**
 * Reports on a batch by reading the garden again.
 *
 * `HarvestCrop` gets no acknowledgement: the server answers nothing, and a
 * refused command (full bag, crop already gone) looks just like an accepted
 * one. Counting what was sent would announce a success nobody saw, so the
 * garden is read again to see what really went.
 *
 * A harvested crop leaves the list, or starts growing again if it regrows:
 * either way it stops being ripe. Those still ripe were not taken.
 *
 * The raw garden is read, not the Locker's scope: the question is "is it still
 * ripe?", not "may I still touch it?". A rule changed during the batch would
 * otherwise pass an untouched crop off as harvested.
 */
async function report(attempted: HarvestRow[], cancelled: boolean, reporter: BatchReporter): Promise<void> {
  if (attempted.length === 0) {
    reporter.say("report", "Stopped before I picked anything.");
    return;
  }

  await sleep(SETTLE_MS);

  let fresh: HarvestRow[] | null = null;
  try {
    fresh = (await readHarvestRows()).filter((row) => row.ready);
  } catch {
    fresh = null;
  }

  const stopped = cancelled ? " before you stopped me" : "";

  if (!fresh) {
    reporter.say("report", `Sent all ${attempted.length}${stopped}, but I could not check they landed.`);
    return;
  }

  const targeted = new Set(attempted.map(rowKey));
  const stillRipe = fresh.filter((row) => targeted.has(rowKey(row))).length;
  const picked = attempted.length - stillRipe;

  if (picked > 0) StatsService.incrementGardenStat("totalHarvested", picked);

  if (stillRipe === 0) {
    const done = cancelled ? `Stopped there. Got ${picked}.` : `All done, ${picked} picked.`;
    reporter.say("report", done, compose(topCrop(attempted), " ", done));
    return;
  }
  if (picked === 0) {
    reporter.say("report", "None went through. Still ripe, so your bag is probably full.");
    return;
  }
  reporter.say("report", `Got ${picked} of ${attempted.length}${stopped}. ${stillRipe} still ripe.`);
}

/** Harvests the confirmed batch, crop by crop. */
export async function executeHarvestBatch(rows: HarvestRow[], reporter: BatchReporter): Promise<void> {
  const opening = `On it. Picking ${rows.length} now.`;
  reporter.say("reply", opening, compose(topCrop(rows), " ", opening));

  const attempted: HarvestRow[] = [];
  await runSteps({
    items: rows,
    reporter,
    // The team goes on before the first crop: some abilities act on harvest.
    hire: () => hireCrew(reporter, { teamId: loadCompanionSettings().harvestTeamId }),
    async step(row, walker, pace) {
      // The walk counts as waiting: it spaces the commands out as well as a
      // sleep would, and adding it to the gap would pay it twice.
      await walker.toGardenTile(row.tileIndex);
      await pace.wait();
      attempted.push(row);
      await PlayerService.harvestCrop(row.tileIndex, row.slotId);
      pace.mark();
    },
    progressNote: (done, total) => `${done} of ${total} so far...`,
  });

  await report(attempted, reporter.stopped(), reporter);
}
