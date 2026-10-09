// Checks the companion's watch over an absent player: when it worries, when it
// falls asleep, when it snores, and what it says on waking up.
//
// Everything here is pure (src/features/companion/afk.ts): the game
// subscriptions live apart, in afkWatch.ts, and decide nothing.

import {
  AFK_ASLEEP_AFTER_MS,
  AFK_IDLE_AFTER_MS,
  DREAM_CHANCE,
  DREAM_LINES,
  FALL_ASLEEP_LINES,
  IDLE_LINES,
  LONG_WAKE_LINES,
  RETURN_LINES,
  SNORE_LINES,
  SNORE_MAX_MS,
  SNORE_MIN_MS,
  SNORE_SLOW_AFTER_MS,
  SNORE_SLOW_MAX_MS,
  SNORE_SLOW_MIN_MS,
  WAKE_LINES,
  WAKE_LINE_MIN_ASLEEP_MS,
  afkActivity,
  afkReset,
  afkTick,
  initialAfkState,
  snoreDelay,
  snoreLine,
  type AfkEffect,
  type AfkState,
} from "../src/features/companion/afk";
import { EmoteType } from "../src/features/companion/emoteTypes";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};
const r0 = () => 0;
const r99 = () => 0.99;

const kinds = (effects: AfkEffect[]) => effects.map((e) => e.kind).join(",");
const said = (effects: AfkEffect[]) => effects.find((e): e is Extract<AfkEffect, { kind: "say" }> => e.kind === "say") ?? null;
const free = (now: number) => ({ now, busy: false, hidden: false });

const T0 = 1_000_000;

/** Runs the clock step by step up to `until`, and returns the last state. */
function runUntil(state: AfkState, from: number, until: number, stepMs = 5_000, random = r0): { state: AfkState; effects: AfkEffect[] } {
  let s = state;
  const all: AfkEffect[] = [];
  for (let t = from; t <= until; t += stepMs) {
    const step = afkTick(s, free(t), random);
    s = step.state;
    all.push(...step.effects);
  }
  return { state: s, effects: all };
}

function asleepAt(t: number): AfkState {
  return { phase: "asleep", quietSince: t - AFK_IDLE_AFTER_MS - AFK_ASLEEP_AFTER_MS, phaseSince: t, asked: true, nextSnoreAt: t + SNORE_MIN_MS, lastSnore: null };
}

/* ------------------------------ active -> idle ------------------------------ */
{
  const s0 = initialAfkState(T0);
  check("start: active", s0.phase, "active");

  const early = afkTick(s0, free(T0 + AFK_IDLE_AFTER_MS - 1), r0);
  check("before 3 min: still active", early.state.phase, "active");
  check("before 3 min: nothing to say", early.effects.length, 0);

  const idle = afkTick(s0, free(T0 + AFK_IDLE_AFTER_MS), r0);
  check("at 3 min: idle", idle.state.phase, "idle");
  const line = said(idle.effects);
  check("idle: it asks whether you are there", line?.message, IDLE_LINES[0].message);
  check("idle: it comes to say it face to face", line?.approach, true);
  check("idle: questioning look", line?.emote, EmoteType.Questioning);
  check("idle: the question is noted", idle.state.asked, true);
  check("idle: no attention held", kinds(idle.effects), "say");

  const again = afkTick(idle.state, free(T0 + AFK_IDLE_AFTER_MS + 60_000), r0);
  check("idle: the question is only asked once", again.effects.length, 0);

  const busy = afkTick(s0, { now: T0 + AFK_IDLE_AFTER_MS + 10_000, busy: true, hidden: false }, r0);
  check("busy: does not go idle", busy.state.phase, "active");
  check("busy: silence", busy.effects.length, 0);
  const afterBusy = afkTick(busy.state, free(T0 + AFK_IDLE_AFTER_MS + 15_000), r0);
  check("busy then free: idle at once (the clock kept running)", afterBusy.state.phase, "idle");

  const hidden = afkTick(s0, { now: T0 + AFK_IDLE_AFTER_MS, busy: false, hidden: true }, r0);
  check("hidden tab: idle all the same", hidden.state.phase, "idle");
  check("hidden tab: nothing said", hidden.effects.length, 0);
  check("hidden tab: question not asked", hidden.state.asked, false);

  // Signs of life push the deadline back.
  const moved = afkActivity(s0, { now: T0 + 2 * 60_000, busy: false }, r0);
  check("activity while active: nothing to say", moved.effects.length, 0);
  check("activity while active: clock reset", moved.state.quietSince, T0 + 2 * 60_000);
  check("activity: 3 min after the start, still active", afkTick(moved.state, free(T0 + AFK_IDLE_AFTER_MS), r0).state.phase, "active");
}

/* ------------------------------ idle -> asleep ------------------------------ */
{
  const tIdle = T0 + AFK_IDLE_AFTER_MS;
  const idle = afkTick(initialAfkState(T0), free(tIdle), r0).state;

  check("idle: not asleep yet just before 6 min", afkTick(idle, free(tIdle + AFK_ASLEEP_AFTER_MS - 1), r0).state.phase, "idle");

  const sleep = afkTick(idle, free(tIdle + AFK_ASLEEP_AFTER_MS), r0);
  check("6 min after idle: asleep", sleep.state.phase, "asleep");
  check("falling asleep: a line, then attention", kinds(sleep.effects), "say,hold");
  check("falling asleep: a sleepy line", said(sleep.effects)?.message, FALL_ASLEEP_LINES[0].message);
  check("falling asleep: it first comes over to the player", said(sleep.effects)?.approach, true);
  check("falling asleep: first snore 45 s at the earliest", sleep.state.nextSnoreAt, tIdle + AFK_ASLEEP_AFTER_MS + SNORE_MIN_MS);

  const hidden = afkTick(idle, { now: tIdle + AFK_ASLEEP_AFTER_MS, busy: false, hidden: true }, r0);
  check("hidden tab: falls asleep without a word, but stays by the player", kinds(hidden.effects), "hold");

  const busy = afkTick(idle, { now: tIdle + AFK_ASLEEP_AFTER_MS, busy: true, hidden: false }, r0);
  check("busy: does not fall asleep", busy.state.phase, "idle");

  // End to end, with the driver's clock.
  const run = runUntil(initialAfkState(T0), T0, T0 + AFK_IDLE_AFTER_MS + AFK_ASLEEP_AFTER_MS);
  check("end to end: asleep at 9 min", run.state.phase, "asleep");
  check("end to end: question, sleep, attention", kinds(run.effects), "say,say,hold");
}

/* ------------------------------ back from idle ------------------------------ */
{
  const tIdle = T0 + AFK_IDLE_AFTER_MS;
  const idle = afkTick(initialAfkState(T0), free(tIdle), r0).state;

  const back = afkActivity(idle, { now: tIdle + 30_000, busy: false }, r0);
  check("back from idle: active", back.state.phase, "active");
  check("back from idle (lucky draw): a short word", said(back.effects)?.message, RETURN_LINES[0].message);
  check("back from idle: a short word without moving", said(back.effects)?.approach, false);
  check("back from idle: no attention to release", back.effects.some((e) => e.kind === "release"), false);

  const quiet = afkActivity(idle, { now: tIdle + 30_000, busy: false }, r99);
  check("back from idle (unlucky draw): silence", quiet.effects.length, 0);

  const notAsked = { ...idle, asked: false };
  check("back from idle with no question asked: silence", afkActivity(notAsked, { now: tIdle + 30_000, busy: false }, r0).effects.length, 0);
  check("back from idle while it is busy: silence", afkActivity(idle, { now: tIdle + 30_000, busy: true }, r0).effects.length, 0);
}

/* ------------------------------ snoring ------------------------------ */
{
  const tSleep = T0;
  const s = asleepAt(tSleep);

  const before = afkTick(s, free(tSleep + SNORE_MIN_MS - 1), r0);
  check("snore: nothing before it is due", before.effects.length, 0);

  // Draws in order: delay to the next one, dream or not, line. The second one
  // is above DREAM_CHANCE: we want an ordinary one here.
  const seq = [0, 0.5, 0];
  let i = 0;
  const rSeq = () => seq[i++ % seq.length];
  const snore = afkTick(s, free(tSleep + SNORE_MIN_MS), rSeq);
  const line = said(snore.effects);
  check("snore: a bubble", line !== null, true);
  check("snore: without moving", line?.approach, false);
  check("snore: without an emote", line?.emote, null);
  check("snore: an ordinary sleepy line", SNORE_LINES.includes(line?.message ?? ""), true);
  check("snore: remembered so it is not repeated", snore.state.lastSnore, line?.message);
  const delay = (snore.state.nextSnoreAt ?? 0) - (tSleep + SNORE_MIN_MS);
  check("snore: the next one between 45 and 90 s", delay >= SNORE_MIN_MS && delay <= SNORE_MAX_MS, true);

  check("snoreDelay: 45 s minimum", snoreDelay(0, r0), SNORE_MIN_MS);
  check("snoreDelay: 90 s maximum", snoreDelay(0, () => 1), SNORE_MAX_MS);
  check("snoreDelay: slower after 30 min (min)", snoreDelay(SNORE_SLOW_AFTER_MS, r0), SNORE_SLOW_MIN_MS);
  check("snoreDelay: slower after 30 min (max)", snoreDelay(SNORE_SLOW_AFTER_MS + 1, () => 1), SNORE_SLOW_MAX_MS);
  check("snoreDelay: not slower yet just before 30 min", snoreDelay(SNORE_SLOW_AFTER_MS - 1, () => 1), SNORE_MAX_MS);

  const late = { ...s, nextSnoreAt: tSleep + SNORE_SLOW_AFTER_MS };
  const lateSnore = afkTick(late, free(tSleep + SNORE_SLOW_AFTER_MS), r99);
  const lateDelay = (lateSnore.state.nextSnoreAt ?? 0) - (tSleep + SNORE_SLOW_AFTER_MS);
  check("after 30 min: the next snore is minutes away", lateDelay >= SNORE_SLOW_MIN_MS && lateDelay <= SNORE_SLOW_MAX_MS, true);

  // Over an hour of sleep, with the worst draw (the closest together).
  const hour = runUntil(s, tSleep, tSleep + 60 * 60_000, 5_000, () => 0.5);
  const count = hour.effects.filter((e) => e.kind === "say").length;
  const fastMax = Math.ceil(SNORE_SLOW_AFTER_MS / SNORE_MIN_MS);
  const slowMax = Math.ceil((30 * 60_000) / SNORE_SLOW_MIN_MS) + 1;
  check(`an hour of sleep: at most ${fastMax + slowMax} bubbles (${count})`, count <= fastMax + slowMax && count > 0, true);
  const lastHalf = runUntil({ ...s, phaseSince: tSleep - SNORE_SLOW_AFTER_MS, nextSnoreAt: tSleep }, tSleep, tSleep + 30 * 60_000, 5_000, () => 0.5);
  const slowCount = lastHalf.effects.filter((e) => e.kind === "say").length;
  check(`30 min of deep sleep: only a few bubbles (${slowCount})`, slowCount <= slowMax && slowCount >= 1, true);
  check("sleep: no other kind of effect along the way", hour.effects.every((e) => e.kind === "say"), true);
  check("sleep: stays asleep with no sign of life", hour.state.phase, "asleep");

  const hidden = afkTick(s, { now: tSleep + SNORE_MIN_MS, busy: false, hidden: true }, r0);
  check("hidden tab: no snore", hidden.effects.length, 0);
  check("hidden tab: the next one is rescheduled", (hidden.state.nextSnoreAt ?? 0) > tSleep + SNORE_MIN_MS, true);

  check("snoreLine: never the same twice", snoreLine(SNORE_LINES[0], () => 0.5) !== SNORE_LINES[0], true);
  check("snoreLine: a dream below DREAM_CHANCE", DREAM_LINES.includes(snoreLine(null, () => DREAM_CHANCE / 2)), true);
  check("snoreLine: ordinary above it", SNORE_LINES.includes(snoreLine(null, () => DREAM_CHANCE + 0.01)), true);
}

/* ------------------------------ waking up ------------------------------ */
{
  const tSleep = T0;
  const s = asleepAt(tSleep);

  const wake = afkActivity(s, { now: tSleep + WAKE_LINE_MIN_ASLEEP_MS, busy: false }, r0);
  check("waking: active", wake.state.phase, "active");
  check("waking: a line, then attention released", kinds(wake.effects), "say,release");
  check("waking: a startled line", said(wake.effects)?.message, WAKE_LINES[0].message);
  check("waking: without moving", said(wake.effects)?.approach, false);
  const emote = said(wake.effects)?.emote;
  check("waking: Questioning or Laughing", emote === EmoteType.Questioning || emote === EmoteType.Laughing, true);
  check("waking: the clock starts again", wake.state.quietSince, tSleep + WAKE_LINE_MIN_ASLEEP_MS);
  check("waking: no more snoring planned", wake.state.nextSnoreAt, null);

  const nap = afkActivity(s, { now: tSleep + WAKE_LINE_MIN_ASLEEP_MS - 1, busy: false }, r0);
  check("waking after under a minute: silent, but releases", kinds(nap.effects), "release");

  const long = afkActivity(s, { now: tSleep + SNORE_SLOW_AFTER_MS, busy: false }, r0);
  check("waking after a very long absence: a dedicated line", said(long.effects)?.message, LONG_WAKE_LINES[0].message);

  for (const line of [...WAKE_LINES, ...LONG_WAKE_LINES]) {
    check(`waking "${line.message}": Questioning or Laughing`, line.emote === EmoteType.Questioning || line.emote === EmoteType.Laughing, true);
  }

  // Interrupted by something else: it wakes up, but without a word.
  const interrupted = afkTick(s, { now: tSleep + 5 * 60_000, busy: true, hidden: false }, r0);
  check("busy during sleep: awake", interrupted.state.phase, "active");
  check("busy during sleep: without a word", kinds(interrupted.effects), "release");
  check("busy during sleep: the clock starts from there", interrupted.state.quietSince, tSleep + 5 * 60_000);

  const busyWake = afkActivity(s, { now: tSleep + 5 * 60_000, busy: true }, r0);
  check("sign of life while it is busy: releases without speaking", kinds(busyWake.effects), "release");

  check("reset while asleep: releases", kinds(afkReset(s, tSleep + 1).effects), "release");
  check("reset while awake: nothing to release", afkReset(initialAfkState(T0), T0 + 1).effects.length, 0);
  check("reset: active", afkReset(s, tSleep + 1).state.phase, "active");
}

/* ------------------------------ writing ------------------------------ */
{
  const all = [
    ...IDLE_LINES.map((l) => l.message),
    ...RETURN_LINES.map((l) => l.message),
    ...FALL_ASLEEP_LINES.map((l) => l.message),
    ...SNORE_LINES,
    ...DREAM_LINES,
    ...WAKE_LINES.map((l) => l.message),
    ...LONG_WAKE_LINES.map((l) => l.message),
  ];
  const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
  check("no em or en dash", all.some((s) => dashes.some((d) => s.includes(d))), false);
  check("no empty line", all.every((s) => s.trim().length > 0), true);
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
