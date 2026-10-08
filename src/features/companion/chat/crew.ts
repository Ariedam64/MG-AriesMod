// What a batch borrows while it runs: the companion walking from tile to tile,
// and a work team worn in place of the player's.
//
// Three commands wear a team (harvest, hatch, sell), and half of that job is
// putting the player's team back. Nothing here is silent: a team swap touches
// what the player built by hand, so it is named in the question before it
// happens, and said again when it does.

import { sleep } from "../../../lib/async";
import { PetsService } from "../../pets/pets";
import type { BatchReporter, Crew } from "./batch";
import { createWalker, type Walker } from "./walk";

/** A team swap is not instant on the server's side. */
const AFTER_TEAM_SWAP_MS = 300;

type TeamSwap = {
  /** Puts the previous team back. Does nothing when nothing was changed. */
  restore(): Promise<void>;
};

const NOT_SWAPPED: TeamSwap = { async restore() {} };

/** A team's name, or `null` when it was deleted since it was picked. */
export function teamName(teamId: string | null): string | null {
  if (!teamId) return null;
  try {
    return PetsService.getTeamById(teamId)?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Wears a team for the length of a batch.
 *
 * A failure never blocks the batch: at worst he works with the team already
 * on, and says so. Same rule as walking: dressing up must never prevent the
 * action.
 */
async function wearTeam(teamId: string | null, reporter: BatchReporter): Promise<TeamSwap> {
  if (!teamId) return NOT_SWAPPED;

  const name = teamName(teamId);
  if (!name) {
    reporter.say("system", "That team is gone, keeping the one you have on.");
    return NOT_SWAPPED;
  }

  // The team on now is noted BEFORE leaving it: this is the only chance.
  let previous: string[] | null = null;
  try {
    const ids = await PetsService.getActivePetIds();
    previous = ids.length ? ids : null;
  } catch {
    previous = null;
  }

  try {
    await PetsService.useTeam(teamId, { markUsed: false });
    await sleep(AFTER_TEAM_SWAP_MS);
  } catch {
    reporter.say("system", "The team switch failed, working as I am.");
    return NOT_SWAPPED;
  }

  reporter.say("system", `Wearing ${name} for this.`);

  return {
    async restore() {
      if (!previous || previous.length === 0) return;
      try {
        await PetsService.usePetIds(previous);
        await sleep(AFTER_TEAM_SWAP_MS);
        reporter.say("system", "Your team is back the way it was.");
      } catch {
        reporter.say("system", "Could not put your team back, sorry.");
      }
    },
  };
}

export type CrewOptions = {
  /** The team to wear, `null` to leave the player's alone. */
  teamId?: string | null;
  /**
   * A walk to take before the team goes on. The sale walks to the shop first:
   * wearing the sale team across the map would serve nothing, and the team
   * message then lands right before the sale it is about.
   */
  approach?: (walker: Walker) => Promise<void>;
};

/** Readies the walker, takes the approach walk, then wears the team. */
export async function hireCrew(reporter: BatchReporter, options: CrewOptions = {}): Promise<Crew> {
  const walker = await createWalker((message) => reporter.say("system", message));
  try {
    await options.approach?.(walker);
    const team = await wearTeam(options.teamId ?? null, reporter);
    return {
      walker,
      async dismiss() {
        // Back to his mode: otherwise he would stay planted on the last tile.
        walker.release();
        await team.restore();
      },
    };
  } catch (error) {
    walker.release();
    throw error;
  }
}
