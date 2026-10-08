// The companion answers the player's emotes.
//
// The player claps, the companion claps along a moment later; the player
// cries, the companion comforts them. Everything that decides is here, pure:
// chance and clock are passed in and nothing touches the game. The
// subscriptions live apart, in `emoteMirrorWatch.ts`, and decide nothing.
//
// Where the player's emotes come from (live bundle 1400): the chat's emote
// button sends `{ type: "Emote", emoteType }` to the server and keeps nothing
// locally. The emote comes back in the room state, `stateAtom.data.chat.entries`,
// as `{ kind: "emote", playerId, emoteType, seq, lastSeq, lastTimestampMs, count }`.
// Repeating an emote creates no new entry: it bumps `count` and moves
// `lastTimestampMs` forward. So that date, and only it, says an emote was just
// played.

import { pickOne, type Random } from "../../lib/random";
import { EmoteType } from "./emoteTypes";

/** Past this he does not see the emote, so he does not answer. Same bound as `low` reactions. */
export const MIRROR_MAX_DISTANCE = 8;
/** Minimum gap between two answers. */
export const MIRROR_COOLDOWN_MS = 6_000;
/** Reaction delay, drawn between these: the time to see, then to answer. */
export const MIRROR_DELAY_MIN_MS = 400;
export const MIRROR_DELAY_MAX_MS = 1_200;

/**
 * Two emotes closer than this belong to the same streak.
 *
 * A streak is the player hammering the button: the companion answers the
 * first, maybe a second, then lets it go until the player calms down.
 */
export const STREAK_GAP_MS = 12_000;
/** At most this many answers per streak. */
const STREAK_MAX_ANSWERS = 2;
/** The chance of answering a second time in the same streak. Drawn once. */
const SECOND_ANSWER_CHANCE = 0.5;

/** About one answer in six comes with a word. */
const LINE_CHANCE = 1 / 6;
/** Never more than one word every two minutes. */
export const LINE_COOLDOWN_MS = 120_000;

/** From this many emotes in a streak, he may point it out. */
export const SPAM_THRESHOLD = 6;
/** The chance he points it out, drawn once per streak. */
const SPAM_LINE_CHANCE = 0.3;
/** And at most once every five minutes. */
export const SPAM_LINE_COOLDOWN_MS = 300_000;

/** The emotes a player can play: all but the resting pose. */
const PLAYABLE: ReadonlySet<number> = new Set(Object.values(EmoteType).filter((value) => value !== EmoteType.Idle));

export type OwnEmote = { emote: EmoteType; at: number };

/**
 * A player's latest emote among the room chat's entries.
 *
 * `ignoreIds` leaves out ids that are surely not the player's, the
 * companion's NPC first: those are never their emotes.
 */
export function latestOwnEmote(
  entries: unknown,
  playerId: string | null | undefined,
  ignoreIds: readonly string[] = [],
): OwnEmote | null {
  if (!playerId || !Array.isArray(entries) || ignoreIds.includes(playerId)) return null;
  let best: OwnEmote | null = null;
  for (const raw of entries) {
    const entry = raw as { kind?: unknown; playerId?: unknown; emoteType?: unknown; lastTimestampMs?: unknown } | null;
    if (!entry || entry.kind !== "emote" || entry.playerId !== playerId) continue;
    const emote = entry.emoteType;
    const at = entry.lastTimestampMs;
    if (typeof emote !== "number" || !PLAYABLE.has(emote)) continue;
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    if (!best || at > best.at) best = { emote: emote as EmoteType, at };
  }
  return best;
}

export type MirrorState = {
  /** False until the first reading has been taken as the reference. */
  primed: boolean;
  /** The reference reading's room and player: changing either starts over. */
  scope: string | null;
  /** The date of the latest emote already seen. Only a newer one counts. */
  seenAt: number;

  /** The current streak's emotes, answers given, and (local clock) date of the last one. */
  streakCount: number;
  streakAnswers: number;
  streakLastAt: number;
  /** The remark about the streak was already drawn, successful or not. */
  streakSpamRolled: boolean;

  lastMirrorAt: number;
  lastLineAt: number;
  lastSpamLineAt: number;
};

export function initialMirrorState(): MirrorState {
  return {
    primed: false,
    scope: null,
    seenAt: Number.NEGATIVE_INFINITY,
    streakCount: 0,
    streakAnswers: 0,
    streakLastAt: Number.NEGATIVE_INFINITY,
    streakSpamRolled: false,
    lastMirrorAt: Number.NEGATIVE_INFINITY,
    lastLineAt: Number.NEGATIVE_INFINITY,
    lastSpamLineAt: Number.NEGATIVE_INFINITY,
  };
}

/** What the watch read: `null` while the room or the player is not known yet. */
export type MirrorRead = { scope: string; latest: OwnEmote | null } | null;

/**
 * Keeps the reading current, and says whether an emote was just played.
 *
 * The first usable reading only notes what was already there: emotes played
 * before the watch started are not news. The same goes for every room change,
 * whose chat history could hold an old emote of the player.
 *
 * An unusable reading (room state not loaded, player id unknown) does not
 * serve as the reference: it would let the emotes found at the next reading
 * pass for new ones.
 */
export function observeOwnEmote(state: MirrorState, read: MirrorRead): { state: MirrorState; fresh: OwnEmote | null } {
  if (!read) return { state, fresh: null };
  if (!state.primed || state.scope !== read.scope) {
    return {
      state: { ...state, primed: true, scope: read.scope, seenAt: read.latest?.at ?? Number.NEGATIVE_INFINITY },
      fresh: null,
    };
  }
  const latest = read.latest;
  if (!latest || latest.at <= state.seenAt) return { state, fresh: null };
  return { state: { ...state, seenAt: latest.at }, fresh: latest };
}

/**
 * The emote he answers with.
 *
 * The same one, most of the time: sharing the moment is doing the same. Two
 * exceptions. The player cries: he comforts them (Love) or cries along. The
 * player is angry: he wonders or saddens, but never gets angry back.
 */
export function mirrorEmoteFor(played: EmoteType, random: Random): EmoteType {
  switch (played) {
    case EmoteType.Crying:
      return random() < 0.6 ? EmoteType.Love : EmoteType.Crying;
    case EmoteType.Angered:
      return random() < 0.6 ? EmoteType.Questioning : EmoteType.Crying;
    default:
      return played;
  }
}

/** The delay before answering, a whole number in `[MIRROR_DELAY_MIN_MS, MIRROR_DELAY_MAX_MS]`. */
export function mirrorDelay(random: Random): number {
  const span = MIRROR_DELAY_MAX_MS - MIRROR_DELAY_MIN_MS;
  const r = Math.min(1, Math.max(0, random()));
  return Math.round(MIRROR_DELAY_MIN_MS + r * span);
}

/** The word that sometimes comes with the answer, depending on what the player played. */
export const MIRROR_LINES: Readonly<Record<number, readonly string[]>> = {
  [EmoteType.Clapping]: ["Bravo!", "Woo!", "Nice one!"],
  [EmoteType.Laughing]: ["Haha!", "Hehe.", "Too funny."],
  [EmoteType.Angered]: ["Uh oh.", "Easy there.", "What happened?"],
  [EmoteType.Crying]: ["Aww.", "There, there.", "I'm here."],
  [EmoteType.Questioning]: ["Hmm?", "No idea either.", "Good question."],
  [EmoteType.Love]: ["Aww.", "Same!", "Right back at you!"],
};

/** What he says when the player hammers the button. */
export const SPAM_LINES: readonly string[] = ["Okay okay, I get it!", "Alright, alright!", "You're on a roll, huh?"];

export type MirrorAction =
  | { kind: "mirror"; emote: EmoteType; delayMs: number; line: string | null }
  | { kind: "line"; line: string; delayMs: number };

type MirrorContext = {
  now: number;
  /** False when he is busy, put away, or his reactions are off. */
  available: boolean;
  /** Tiles to the player, `null` when unknown. */
  distance: number | null;
  random: Random;
};

/**
 * Decides the answer to a new emote from the player.
 *
 * The streak is kept current either way, answered or not: a player hammering
 * the button while the companion is far away is hammering all the same, and it
 * is not on arriving that he should answer the sixth one.
 */
export function decideMirror(
  state: MirrorState,
  played: OwnEmote,
  ctx: MirrorContext,
): { state: MirrorState; action: MirrorAction | null } {
  const { now, random } = ctx;
  let next: MirrorState =
    now - state.streakLastAt > STREAK_GAP_MS
      ? { ...state, streakCount: 1, streakAnswers: 0, streakSpamRolled: false, streakLastAt: now }
      : { ...state, streakCount: state.streakCount + 1, streakLastAt: now };

  // Busy, or too far to have seen it: he does not answer.
  if (!ctx.available || ctx.distance === null || ctx.distance > MIRROR_MAX_DISTANCE) {
    return { state: next, action: null };
  }

  // The player insists: a remark, rarely, at most once per streak.
  if (next.streakCount >= SPAM_THRESHOLD && !next.streakSpamRolled && now - next.lastSpamLineAt >= SPAM_LINE_COOLDOWN_MS) {
    next = { ...next, streakSpamRolled: true };
    if (random() < SPAM_LINE_CHANCE) {
      next = { ...next, lastSpamLineAt: now, lastLineAt: now, lastMirrorAt: now };
      return { state: next, action: { kind: "line", line: pickOne(SPAM_LINES, random), delayMs: mirrorDelay(random) } };
    }
  }

  if (now - next.lastMirrorAt < MIRROR_COOLDOWN_MS) return { state: next, action: null };
  if (next.streakAnswers >= STREAK_MAX_ANSWERS) return { state: next, action: null };

  // A second answer in the same streak is not a given. The draw happens once:
  // missed, the streak is closed, or he would always end up answering by sheer
  // number of emotes.
  if (next.streakAnswers >= 1 && random() >= SECOND_ANSWER_CHANCE) {
    return { state: { ...next, streakAnswers: STREAK_MAX_ANSWERS }, action: null };
  }

  const emote = mirrorEmoteFor(played.emote, random);
  const delayMs = mirrorDelay(random);
  let line: string | null = null;
  if (now - next.lastLineAt >= LINE_COOLDOWN_MS && random() < LINE_CHANCE) {
    const lines = MIRROR_LINES[played.emote];
    if (lines && lines.length) line = pickOne(lines, random);
  }

  next = {
    ...next,
    streakAnswers: next.streakAnswers + 1,
    lastMirrorAt: now,
    lastLineAt: line ? now : next.lastLineAt,
  };
  return { state: next, action: { kind: "mirror", emote, delayMs, line } };
}
