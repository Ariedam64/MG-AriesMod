// Bad luck at hatching: long runs without a Gold or a Rainbow, and the relief
// when one finally comes.

import { pickOne, type Random } from "../../../lib/random";
import { EmoteType } from "../emoteTypes";
import type { Reaction } from "./gate";

/**
 * Hatches in a row without a Gold or a Rainbow, per egg, as `hatchTracker`
 * counts them (the observed count, without the head start set by hand).
 */
export type LuckCounters = Record<string, { gold: number; rainbow: number }>;

/** Bad luck steps. Rainbow is far rarer, so are its steps. */
const DROUGHT_STEPS: Record<"gold" | "rainbow", readonly number[]> = {
  gold: [25, 50, 100, 200, 400],
  rainbow: [100, 250, 500, 1000, 2000],
};

/** Below this, a Gold coming out is no relief at all. */
const RELIEF_MIN: Record<"gold" | "rainbow", number> = { gold: 25, rainbow: 100 };

const RARITY_LABEL: Record<"gold" | "rainbow", string> = { gold: "Gold", rainbow: "Rainbow" };

/**
 * What bad luck makes him say after a hatch.
 *
 * A counter crossing a step: he sympathises. A counter dropping to zero after
 * a long wait: he rejoices, louder than the usual Gold reaction, which it
 * replaces (same key, higher `weight`).
 */
export function badLuckReactions(
  prev: LuckCounters,
  next: LuckCounters,
  eggName: (eggId: string) => string,
  random: Random,
): Reaction[] {
  const out: Reaction[] = [];
  for (const [eggId, after] of Object.entries(next ?? {})) {
    const before = prev?.[eggId];
    if (!before || !after) continue;
    const egg = eggName(eggId);

    for (const kind of ["rainbow", "gold"] as const) {
      const was = Number(before[kind]) || 0;
      const now = Number(after[kind]) || 0;
      const label = RARITY_LABEL[kind];

      if (now < was) {
        if (was < RELIEF_MIN[kind]) continue;
        const tries = was + 1;
        out.push({
          key: `hatch:${kind}`,
          message: pickOne(
            [
              `FINALLY! A ${label} pet after ${tries} tries!`,
              `${tries} hatches of waiting, and there it is. ${label}!`,
              `I told you it was coming! ${label}, at last!`,
            ],
            random,
          ),
          emote: EmoteType.Love,
          priority: "high",
          weight: 1,
        });
        continue;
      }

      let step: number | null = null;
      for (const s of DROUGHT_STEPS[kind]) if (was < s && now >= s) step = s;
      if (step === null) continue;
      out.push({
        key: `badluck:${kind}`,
        message: pickOne(
          [
            `${step} ${egg} hatches without a ${label}... it's coming, I can feel it.`,
            `Still no ${label} after ${step} tries. The game owes you one.`,
            `${step} in a row with no ${label}. Hang in there, boss.`,
          ],
          random,
        ),
        emote: EmoteType.Crying,
        priority: "high",
      });
    }
  }
  return out;
}
