// Runs a confirmed hatch.
//
// A bad hatch can be lived with, a bad sale cannot be undone, so the sale that
// sometimes follows is a batch of its own (`sellRun.ts`) with its own
// question. Nothing here chains one into the other.
//
// As everywhere else the sends are not counted, since `HatchEgg` gets no
// acknowledgement: the garden is read again to see what really hatched.

import { sleep } from "../../../lib/async";
import { PlayerService } from "../../../game/player";
import { CompanionService } from "..";
import { loadCompanionSettings } from "../state";
import { SETTLE_MS, runSteps, type BatchReporter } from "./batch";
import { eggIcon, mutationChips, petThing } from "./bubbleIcons";
import { compose, spaced } from "./bubbleTags";
import { hireCrew } from "./crew";
import { hatchCheer, type KeepRules } from "./hatch";
import { INVENTORY_CAPACITY, readHatchScope, readInventoryCount, readPetRows } from "./hatchRead";

/** The game lets the bag fill up, then refuses silently: near the cap it is counted often. */
const RECOUNT_EVERY = 5;
const NEAR_CAPACITY = 5;

/**
 * What an exceptional roll is granted: the pose held, then a pause.
 *
 * `holdMs` is the emote's length, 1.5 s everywhere else. `pauseMs` is how long
 * he does nothing before the next egg, where the usual pace is hundreds of
 * milliseconds. Both matter: holding the pose without pausing the batch would
 * give a companion who adores and opens the next egg at the same time.
 *
 * The pose outlasts the pause slightly, on purpose: he walks off while still
 * glowing rather than dropping to rest the instant he moves. Gold gets half of
 * Rainbow, so the two stay ranked.
 */
const CHEER_TIMING: Record<string, { holdMs: number; pauseMs: number }> = {
  Rainbow: { holdMs: 5000, pauseMs: 4500 },
  Gold: { holdMs: 2500, pauseMs: 2250 },
};

/**
 * What he says on the spot, and what he says getting back to it.
 *
 * `cheer` follows the named pet, `resume` comes after the pause. The resume is
 * skipped when the player asked to stop meanwhile.
 */
const CHEER_LINES: Record<string, { cheer: string; resume: string }> = {
  Rainbow: { cheer: "I have never seen one of those.", resume: "Right. Where was I." },
  Gold: { cheer: "That one is a beauty.", resume: "Okay, back to it." },
};

/** Why the hatch stopped. It decides the next question. */
export type HatchStop = "done" | "full" | "cancelled";

/** How many targeted tiles no longer hold an egg: the only proof of hatching. */
async function countHatched(slots: number[]): Promise<number | null> {
  try {
    const still = new Set((await readHatchScope()).readySlots);
    return slots.filter((slot) => !still.has(slot)).length;
  } catch {
    return null;
  }
}

async function reportHatch(attempted: number[], stop: HatchStop, reporter: BatchReporter): Promise<void> {
  if (attempted.length === 0) {
    reporter.say(
      "report",
      stop === "full" ? "Your bag was already full, so I opened none." : "Stopped before I opened any.",
    );
    return;
  }

  await sleep(SETTLE_MS);
  const hatched = await countHatched(attempted);

  if (hatched === null) {
    reporter.say("report", `Opened all ${attempted.length}, but I could not check.`);
    return;
  }
  if (hatched === 0) {
    reporter.say("report", "None opened. They are all still there.");
    return;
  }

  const tail = stop === "full" ? " Your bag is full now." : stop === "cancelled" ? " Stopped there." : "";
  if (hatched === attempted.length) {
    reporter.say("report", `${hatched} hatched.${tail}`);
    return;
  }
  reporter.say("report", `${hatched} of ${attempted.length} hatched.${tail}`);
}

/**
 * Announces the pet that just came out, and remembers it.
 *
 * The bag's ids are compared with the ones before: what is new came out of the
 * egg. One local atom read per egg, nothing on the network.
 *
 * This is the one place a bubble really composes: `petThing` gets the
 * inventory object and goes through the game's pet renderer, so a Gold Bee
 * comes out golden. The STR belongs here because this is when it gets looked at.
 */
async function announceHatchling(known: Set<string>, rules: KeepRules, reporter: BatchReporter): Promise<void> {
  const pets = await readPetRows();
  if (pets.length === 0) return;

  const born = pets.filter((pet) => !known.has(pet.petId));
  for (const pet of born) known.add(pet.petId);
  if (born.length === 0) return;

  // The cheering follows the keep rules, not the announcement: a pet he will
  // offer to sell right after is not worth applause.
  const cheer = hatchCheer(born, rules);
  const mutation = cheer?.mutation ?? null;
  const timing = mutation ? CHEER_TIMING[mutation] : undefined;
  const lines = mutation ? CHEER_LINES[mutation] : undefined;

  // Several can appear between two reads: the inventory only updates when the
  // server answers, and hatches follow each other fast. Announcing every one
  // would take longer than the batch, so one is named and the rest counted,
  // none lost silently. The one named is the star when there is one: telling
  // of a Rainbow while showing the Worm that came out just before would miss
  // the moment.
  const star = cheer?.star ?? born[0];
  const others = born.length - 1;
  const tail = others > 0 ? ` And ${others} more.` : "";
  const strength = star.maxStrength === null ? "" : `, ${star.maxStrength} STR`;

  const line = lines
    ? `A ${mutation} ${star.species}${strength}! ${lines.cheer}${tail}`
    : `A ${star.species}${strength}.${tail}`;

  // The cheered mutation is already named in the sentence: its chip would say
  // it twice. The others stay, they were not said.
  const shown = mutation
    ? star.mutations.filter((name) => name.toLowerCase() !== mutation.toLowerCase())
    : star.mutations;

  // The emote is not awaited: it must not hold up the announcement.
  if (cheer) void CompanionService.emote(cheer.emote, timing?.holdMs).catch(() => {});

  // Forced: hatches come faster than the minimum gap between bubbles, and
  // without it two in three were lost.
  reporter.say("system", line, compose(petThing(star.item, ""), " ", line, ...spaced(mutationChips(shown))), true);

  if (!timing || !lines) return;

  // He stops for real: holding the pose without pausing the batch would give
  // a companion who marvels and opens the next egg at once.
  await sleep(timing.pauseMs);
  // The stop is checked before the next egg, right after this wait: saying he
  // gets back to it while stopping would make no sense.
  if (!reporter.stopped()) reporter.say("system", lines.resume);
}

/**
 * Hatches the confirmed eggs, one by one.
 *
 * The bag is counted again regularly rather than once: the atom only updates
 * when the server answers, and a purely local count would end up past the cap
 * without noticing. Past the cap he stops and says so, and what comes next is
 * decided with the player.
 */
export async function executeHatchBatch(slots: number[], reporter: BatchReporter): Promise<HatchStop> {
  const kinds = (await readHatchScope().catch(() => null))?.eggIds ?? [];
  const opening = `On it. Opening ${slots.length} now.`;
  reporter.say("reply", opening, compose(kinds.length === 1 ? eggIcon(kinds[0]) : null, " ", opening));

  const settings = loadCompanionSettings();
  const attempted: number[] = [];
  let count = 0;
  let stop: HatchStop = "done";
  // The pets already in the bag once the team is on: anything that appears
  // after came out of an egg just opened.
  const known = new Set<string>();

  const outcome = await runSteps({
    items: slots,
    reporter,
    async hire() {
      // The team goes on first: some abilities act on what comes out of an
      // egg, and wearing them after the first hatch would already be too late.
      const crew = await hireCrew(reporter, { teamId: settings.hatchTeamId });
      for (const pet of await readPetRows()) known.add(pet.petId);
      return crew;
    },
    async step(slot, walker, pace) {
      if (attempted.length % RECOUNT_EVERY === 0 || count >= INVENTORY_CAPACITY - NEAR_CAPACITY) {
        count = await readInventoryCount();
      }
      if (count >= INVENTORY_CAPACITY) {
        stop = "full";
        return "halt";
      }

      // The walk counts as waiting: see `pacer`.
      await walker.toGardenTile(slot);
      await pace.wait();
      await PlayerService.hatchEgg(slot);
      pace.mark();
      attempted.push(slot);
      count++;

      // The announcement reads the bag, so it takes time too: the pacer
      // accounts for it on the next egg.
      await announceHatchling(known, settings.hatchKeepRules, reporter);
    },
    progressNote: (done, total) => `${done} of ${total} open so far...`,
  });
  if (outcome.cancelled) stop = "cancelled";

  await reportHatch(attempted, stop, reporter);
  return stop;
}
