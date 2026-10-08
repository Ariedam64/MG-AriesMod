// The companion notices the player has stopped moving, falls asleep, and
// wakes up.
//
// Pure: clock and chance passed in. Everything deciding WHEN to change phase
// and WHAT to say is checked outside the browser (scripts/checkCompanionAfk.ts).
// The subscriptions and the effects run in `afkWatch.ts`.
//
// Three phases:
//  - `active`: the player is there. Nothing to say.
//  - `idle`: nothing for a few minutes. He comes over and asks, once, whether
//    the player is still there.
//  - `asleep`: still nothing. He falls asleep by the player and snores now and
//    then, less and less often as the absence goes on.
//
// Two rules hold the rest:
//  - he never speaks while someone else has him (`busy`) or the tab is hidden
//    (`hidden`): a bubble nobody sees is lost;
//  - only the player moves the absence clock. A reaction or a task that takes
//    him only delays the next phase, unless he is asleep: then it wakes him,
//    silently since he is busy.

import { pickOne, type Random } from "../../lib/random";
import { EmoteType } from "./emoteTypes";

/* ------------------------------------------------------------------ */
/*  Settings                                                           */
/* ------------------------------------------------------------------ */

/** Nothing from the player for this long, and he goes `idle`. */
export const AFK_IDLE_AFTER_MS = 3 * 60_000;
/** Time spent `idle` before falling asleep. */
export const AFK_ASLEEP_AFTER_MS = 6 * 60_000;
/** The gap between two snores, drawn in this range. */
export const SNORE_MIN_MS = 45_000;
export const SNORE_MAX_MS = 90_000;
/** Asleep for longer than this, the snores spread out a lot. */
export const SNORE_SLOW_AFTER_MS = 30 * 60_000;
export const SNORE_SLOW_MIN_MS = 3 * 60_000;
export const SNORE_SLOW_MAX_MS = 6 * 60_000;
/**
 * Asleep for less than this, he wakes without a word: jumping up after
 * thirty seconds of nap would ring false.
 */
export const WAKE_LINE_MIN_ASLEEP_MS = 60_000;
/** The chance of a word when the player comes back, if he had asked whether they were there. */
const RETURN_LINE_CHANCE = 0.3;
/** The chance a snore is a dream line rather than a plain "Zzz". */
export const DREAM_CHANCE = 0.12;

/* ------------------------------------------------------------------ */
/*  Shape                                                              */
/* ------------------------------------------------------------------ */

type AfkPhase = "active" | "idle" | "asleep";

export type AfkState = {
  phase: AfkPhase;
  /** The player's last sign of life (or when the watch started). */
  quietSince: number;
  /** When the current phase began. */
  phaseSince: number;
  /** He asked his question while `idle`. The return line only makes sense after. */
  asked: boolean;
  /** The next snore, `null` outside sleep. */
  nextSnoreAt: number | null;
  /** The last sleep line, so the same one is not said twice in a row. */
  lastSnore: string | null;
};

/**
 * What the driver must do, in order.
 *
 * `approach`: come to the player before speaking. Otherwise the line is only
 * said when he is already close enough to be read.
 * `hold` / `release`: keep him by the player while he sleeps, then give him
 * back his mode.
 */
export type AfkEffect =
  | { kind: "say"; message: string; emote: EmoteType | null; approach: boolean }
  | { kind: "hold" }
  | { kind: "release" };

export type AfkStep = { state: AfkState; effects: AfkEffect[] };

type AfkTickInput = {
  now: number;
  /** Taken by something other than us: a task, a chat question, a batch. */
  busy: boolean;
  /** Tab hidden: nobody would read what is said. */
  hidden: boolean;
};

type AfkActivityInput = { now: number; busy: boolean };

/* ------------------------------------------------------------------ */
/*  Lines                                                              */
/* ------------------------------------------------------------------ */

type Line = { message: string; emote: EmoteType | null };

export const IDLE_LINES: readonly Line[] = [
  { message: "Hello? You still there?", emote: EmoteType.Questioning },
  { message: "Did you fall asleep on me?", emote: EmoteType.Questioning },
  { message: "Psst... are you still with me?", emote: EmoteType.Questioning },
  { message: "It's very quiet all of a sudden...", emote: EmoteType.Questioning },
];

export const RETURN_LINES: readonly Line[] = [
  { message: "Oh, there you are!", emote: EmoteType.Laughing },
  { message: "Welcome back!", emote: EmoteType.Love },
  { message: "Ah, you're still here. Good.", emote: null },
];

export const FALL_ASLEEP_LINES: readonly Line[] = [
  { message: "I'll just rest my eyes...", emote: null },
  { message: "Yawn... wake me up if anything grows.", emote: null },
  { message: "Okay... a tiny nap. Just a tiny one...", emote: null },
  { message: "I'll keep watch... with my eyes closed...", emote: null },
];

export const SNORE_LINES: readonly string[] = [
  "Zzz...",
  "Zzz... zzz...",
  "zzz... carrots...",
  "Mmh... five more minutes...",
  "*snore*",
  "Zzz... mmh...",
];

/** Rare: he dreams out loud. */
export const DREAM_LINES: readonly string[] = [
  "Zzz... no, the golden one is mine...",
  "Mmh... a pumpkin... the size of a house...",
  "zzz... don't eat the seeds, little bunny...",
  "Zzz... I'm the best gardener in the world...",
  "Mmh... rain... more rain... perfect...",
];

export const WAKE_LINES: readonly Line[] = [
  { message: "Huh? I wasn't sleeping!", emote: EmoteType.Questioning },
  { message: "I'm up! I'm up!", emote: EmoteType.Laughing },
  { message: "Oh, you're back!", emote: EmoteType.Laughing },
  { message: "Wha-? Oh, it's you. Hi!", emote: EmoteType.Questioning },
];

/** After a very long absence, the wake-up says so. */
export const LONG_WAKE_LINES: readonly Line[] = [
  { message: "You were gone forever! I may have napped. A little.", emote: EmoteType.Laughing },
  { message: "Oh! You're back! I kept the garden safe. Mostly by sleeping.", emote: EmoteType.Laughing },
  { message: "Huh? What time is it? Welcome back!", emote: EmoteType.Questioning },
];

const say = (line: Line, approach: boolean): AfkEffect => ({
  kind: "say",
  message: line.message,
  emote: line.emote,
  approach,
});

/* ------------------------------------------------------------------ */
/*  Machine                                                            */
/* ------------------------------------------------------------------ */

export function initialAfkState(now: number): AfkState {
  return { phase: "active", quietSince: now, phaseSince: now, asked: false, nextSnoreAt: null, lastSnore: null };
}

/**
 * The time until the next snore, depending on how long he has slept.
 *
 * Past `SNORE_SLOW_AFTER_MS` the player is gone for good: a bubble a minute
 * over an hour away would only be noise.
 */
export function snoreDelay(asleepForMs: number, random: Random): number {
  const slow = asleepForMs >= SNORE_SLOW_AFTER_MS;
  const min = slow ? SNORE_SLOW_MIN_MS : SNORE_MIN_MS;
  const max = slow ? SNORE_SLOW_MAX_MS : SNORE_MAX_MS;
  const r = Math.min(Math.max(random(), 0), 1);
  return Math.round(min + (max - min) * r);
}

/** A snore, rarely a dream, never the same twice in a row. */
export function snoreLine(last: string | null, random: Random): string {
  const pool = random() < DREAM_CHANCE ? DREAM_LINES : SNORE_LINES;
  const options = pool.filter((line) => line !== last);
  return pickOne(options.length > 0 ? options : pool, random);
}

/** Back to `active` without a word. Releases the attention if he was asleep. */
function wakeSilently(state: AfkState, now: number): AfkStep {
  const effects: AfkEffect[] = state.phase === "asleep" ? [{ kind: "release" }] : [];
  return { state: initialAfkState(now), effects };
}

/**
 * One clock step.
 *
 * Busy with something else: awake, he simply waits, the absence clock keeps
 * running and the next phase comes once he is free; asleep, he wakes without
 * a word, since he has better to do.
 *
 * Tab hidden: the phases still move (the player really is away), but nothing
 * is said. The `idle` question is then lost, and coming back to the tab counts
 * as a sign of life: that is where the wake-up happens, in front of the player.
 */
export function afkTick(state: AfkState, input: AfkTickInput, random: Random): AfkStep {
  const { now, busy, hidden } = input;

  if (state.phase === "asleep") {
    if (busy) return wakeSilently(state, now);
    if (state.nextSnoreAt === null || now < state.nextSnoreAt) return { state, effects: [] };
    const asleepFor = now - state.phaseSince;
    const nextSnoreAt = now + snoreDelay(asleepFor, random);
    if (hidden) return { state: { ...state, nextSnoreAt }, effects: [] };
    const message = snoreLine(state.lastSnore, random);
    return {
      state: { ...state, nextSnoreAt, lastSnore: message },
      effects: [say({ message, emote: null }, false)],
    };
  }

  if (busy) return { state, effects: [] };

  if (state.phase === "active") {
    if (now - state.quietSince < AFK_IDLE_AFTER_MS) return { state, effects: [] };
    const next: AfkState = { ...state, phase: "idle", phaseSince: now, asked: !hidden };
    return { state: next, effects: hidden ? [] : [say(pickOne(IDLE_LINES, random), true)] };
  }

  // idle
  if (now - state.phaseSince < AFK_ASLEEP_AFTER_MS) return { state, effects: [] };
  const next: AfkState = {
    ...state,
    phase: "asleep",
    phaseSince: now,
    nextSnoreAt: now + snoreDelay(0, random),
    lastSnore: null,
  };
  // He first comes to settle by the player, then is held there.
  const effects: AfkEffect[] = hidden ? [] : [say(pickOne(FALL_ASLEEP_LINES, random), true)];
  effects.push({ kind: "hold" });
  return { state: next, effects };
}

/**
 * The player gave a sign of life: moved, clicked, typed, or came back to the
 * tab.
 *
 * Asleep for at least `WAKE_LINE_MIN_ASLEEP_MS`, he jumps up; for less, he
 * wakes silently. While `idle`, a short word now and then, and only if he had
 * really asked his question.
 */
export function afkActivity(state: AfkState, input: AfkActivityInput, random: Random): AfkStep {
  const { now, busy } = input;

  if (state.phase === "active") {
    return { state: { ...state, quietSince: now }, effects: [] };
  }

  if (state.phase === "idle") {
    const effects: AfkEffect[] = [];
    if (state.asked && !busy && random() < RETURN_LINE_CHANCE) effects.push(say(pickOne(RETURN_LINES, random), false));
    return { state: initialAfkState(now), effects };
  }

  // asleep
  // The line first, the attention after: he jumps up where he slept, next to
  // the player, before going back to what he was doing.
  const asleepFor = now - state.phaseSince;
  const effects: AfkEffect[] = [];
  if (!busy && asleepFor >= WAKE_LINE_MIN_ASLEEP_MS) {
    const pool = asleepFor >= SNORE_SLOW_AFTER_MS ? LONG_WAKE_LINES : WAKE_LINES;
    effects.push(say(pickOne(pool, random), false));
  }
  effects.push({ kind: "release" });
  return { state: initialAfkState(now), effects };
}

/**
 * A reset without a word: companion put away, setting switched off, watch
 * stopped, or a wake-up asked from outside.
 */
export function afkReset(state: AfkState, now: number): AfkStep {
  return wakeSilently(state, now);
}
