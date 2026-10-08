// Time spent together: the greeting on arrival, the hours played, midnight and
// sunrise, and the anniversaries of the first meeting.

import { pickOne, type Random } from "../../../lib/random";
import { HOLIDAY_GREETINGS, dayPart, type DayPart, type Holiday } from "../dialogueTime";
import { EmoteType } from "../emoteTypes";
import type { Reaction } from "./gate";

/** Away for longer than this, a new session starts. */
export const SESSION_GAP_MS = 20 * 60_000;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export type StoredSession = {
  startedAt: number;
  lastSeenAt: number;
  announcedHours: number;
  /** The first meeting: where anniversaries count from. Survives sessions. */
  firstMetAt: number;
  /** The last anniversary celebrated, in days, so it is not celebrated twice. */
  celebratedDays: number;
};

type SessionResume = {
  session: StoredSession;
  /** `null`: the same session (a reload), nothing to say. */
  greeting: { first: boolean; awayMs: number } | null;
};

/**
 * Resumes or opens a session.
 *
 * A page reload or a short drop does not reset the count: "it's been 2 hours"
 * must stay true after F5. Past `SESSION_GAP_MS` without a sign of life it is
 * a return, and it deserves a greeting.
 *
 * The meeting date never resets. A session written before it existed has
 * none and is dated today, for want of better.
 */
export function resumeSession(stored: unknown, now: number): SessionResume {
  const s = stored as Partial<StoredSession> | null | undefined;
  const lastSeenAt = Number(s?.lastSeenAt);
  const startedAt = Number(s?.startedAt);
  const valid =
    Number.isFinite(lastSeenAt) && lastSeenAt > 0 && Number.isFinite(startedAt) && startedAt > 0 && startedAt <= now;

  const storedMet = Number(s?.firstMetAt);
  const firstMetAt = Number.isFinite(storedMet) && storedMet > 0 && storedMet <= now ? storedMet : now;
  const celebratedDays = Math.max(0, Math.floor(Number(s?.celebratedDays) || 0));

  if (valid && now - lastSeenAt < SESSION_GAP_MS) {
    const announcedHours = Math.max(0, Math.floor(Number(s?.announcedHours) || 0));
    return { session: { startedAt, lastSeenAt: now, announcedHours, firstMetAt, celebratedDays }, greeting: null };
  }
  return {
    session: { startedAt: now, lastSeenAt: now, announcedHours: 0, firstMetAt, celebratedDays },
    greeting: { first: !valid, awayMs: valid ? now - lastSeenAt : 0 },
  };
}

const GREETING_BY_DAY_PART: Record<DayPart, readonly string[]> = {
  night: ["Hey, night owl! Couldn't sleep?", "Gardening at this hour? I like your style."],
  early: ["Up with the sun, I see!", "Good morning! You're up early."],
  morning: ["Good morning! Let's grow something.", "Morning! Ready when you are."],
  afternoon: ["Good afternoon! Ready to garden?", "Hey! Perfect timing, the plants were asking for you."],
  evening: ["Good evening! Glad you're here.", "Evening! Let's make it a good one."],
  late: ["Evening, boss. Late session tonight?", "Hey! Quick one before bed?"],
};

/**
 * The greeting on arrival.
 *
 * A long absence beats everything, then today's holiday, then the part of the
 * day: "Merry Christmas" beats "Good morning" on the 25th, but "where were
 * you?" still fits better after a week away.
 */
export function greetingReaction(
  greeting: { first: boolean; awayMs: number },
  hour: number,
  random: Random,
  holiday: Holiday | null = null,
): Reaction {
  let lines: readonly string[];
  if (greeting.first) {
    lines = ["Hi there! I'll be sticking around.", "Nice to meet you! Let's grow something great."];
  } else if (greeting.awayMs >= 3 * DAY_MS) {
    lines = ["Where have you been? I missed you!", "You're back! It's been ages.", "Finally! I was starting to talk to the plants."];
  } else if (holiday) {
    lines = HOLIDAY_GREETINGS[holiday];
  } else if (greeting.awayMs >= DAY_MS) {
    lines = ["Welcome back! The garden missed you.", "Hey, you're back! Good to see you."];
  } else {
    lines = GREETING_BY_DAY_PART[dayPart(hour)];
  }
  return { key: "session:greeting", message: pickOne(lines, random), emote: EmoteType.Love, priority: "high" };
}

/** Days celebrated: a week, a month, a hundred days, then every year. */
function anniversarySteps(days: number): number[] {
  const steps = [7, 30, 100];
  for (let year = 1; year * 365 <= days; year++) steps.push(year * 365);
  return steps;
}

/**
 * The anniversary to celebrate, if a new one is due.
 *
 * Only the latest: a player away for three months is not wished the week, the
 * month and the hundred days all at once.
 */
export function anniversaryReaction(
  firstMetAt: number,
  now: number,
  celebratedDays: number,
  random: Random,
): { reaction: Reaction | null; celebratedDays: number } {
  const days = Math.floor((now - firstMetAt) / DAY_MS);
  let due: number | null = null;
  for (const step of anniversarySteps(days)) if (step <= days && step > celebratedDays) due = step;
  if (due === null) return { reaction: null, celebratedDays };

  let lines: readonly string[];
  if (due === 7) lines = ["One week together already! Thanks for having me.", "A whole week of gardening together!"];
  else if (due === 30) lines = ["We've been gardening together for a whole month!", "One month together! Time flies."];
  else if (due === 100) lines = ["100 days together! That's a lot of crops.", "Day 100! Best garden buddy ever."];
  else {
    const years = due / 365;
    lines =
      years === 1
        ? ["Happy anniversary! One year together!", "One year already! Thanks for keeping me around."]
        : [`Happy anniversary! ${years} years together!`, `${years} years of gardening together. Wow.`];
  }
  return {
    reaction: { key: "anniversary", message: pickOne(lines, random), emote: EmoteType.Love, priority: "high" },
    celebratedDays: due,
  };
}

/** Full hours since the session started. */
export function sessionHours(session: StoredSession, now: number): number {
  return Math.max(0, Math.floor((now - session.startedAt) / HOUR_MS));
}

export function sessionHourReaction(hours: number, random: Random): Reaction | null {
  if (hours < 1) return null;
  let lines: readonly string[];
  let emote: EmoteType = EmoteType.Clapping;
  if (hours === 1) {
    lines = ["We've been at it for an hour already.", "One hour in! Time flies when you're gardening."];
  } else if (hours === 2) {
    lines = ["Two hours in! Look at this place.", "Two hours already? Where did the time go?"];
  } else if (hours < 6) {
    lines = [
      `${hours} hours straight. Maybe stretch your legs?`,
      `${hours} hours! Don't forget to drink some water.`,
      `${hours} hours already. You're dedicated!`,
    ];
    emote = EmoteType.Questioning;
  } else {
    lines = [`${hours} hours?! Are you okay?`, `${hours} hours. I think the plants need a break. And you too.`];
    emote = EmoteType.Crying;
  }
  return { key: `session:hours`, message: pickOne(lines, random), emote, priority: "high" };
}

/**
 * Midnight passing, and sunrise after a long night.
 *
 * A midnight that opens a holiday (January 1st, October 31st...) wishes it
 * rather than marvelling at the hour.
 */
export function clockReaction(
  prevHour: number,
  hour: number,
  sessionMs: number,
  random: Random,
  holiday: Holiday | null = null,
): Reaction | null {
  if (prevHour === hour) return null;
  if (hour === 0) {
    if (holiday) {
      return { key: "clock:holiday", message: pickOne(HOLIDAY_GREETINGS[holiday], random), emote: EmoteType.Love, priority: "high" };
    }
    return {
      key: "clock:midnight",
      message: pickOne(["It's midnight! Still going?", "Midnight already. The garden never sleeps, huh?"], random),
      emote: EmoteType.Questioning,
      priority: "high",
    };
  }
  if (hour === 6 && sessionMs >= 3 * HOUR_MS) {
    return {
      key: "clock:sunrise",
      message: pickOne(["The sun's coming up. Did we just pull an all-nighter?", "Is that... sunrise? We've been up all night!"], random),
      emote: EmoteType.Laughing,
      priority: "high",
    };
  }
  return null;
}
