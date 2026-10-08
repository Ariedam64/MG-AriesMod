// Picks what the companion says when he is talked to.
//
// Two sources, mixed in one draw:
//  1. contextual lines, which point out something useful (a harvest ready, a
//     hungry pet, the weather, crops to sell), at a fixed chance
//     (`CONTEXTUAL_CHANCE`);
//  2. otherwise, a free line from the list the player set.
//
// Only the picking lives here: `pickDialogueLine` is pure (chance and clock
// passed in) and checked outside the browser (scripts/checkCompanionDialogue.ts).
// Reading the game is in `dialogueContext.ts`.

import { pickOne } from "../../lib/random";

/**
 * A contextual line, with a key so it can be put on cooldown.
 *
 * `emote` is the game's enum value (see `emoteTypes.ts`), kept as a bare number.
 */
export type ContextualLine = { key: string; message: string; emote?: number | null };

export type DialogueState = {
  /** The last free line's index, so it is not repeated twice in a row. */
  lastCustomIndex: number;
  /** Per provider key: the time before which it stays quiet. */
  mutedUntil: Record<string, number>;
};

type PickInput = {
  /** Contextual candidates, most important first. */
  contextual: ContextualLine[];
  customLines: string[];
  state: DialogueState;
  nowMs: number;
  random: () => number;
  /** How long the same alert is not repeated. */
  cooldownMs: number;
};

type PickResult = {
  /** `null`: nothing to say, the game's own line goes through as is. */
  message: string | null;
  /** A contextual line's pose. For a free line the caller works it out from the text. */
  emote: number | null;
  /** True when the line comes from the free lines. */
  custom: boolean;
  state: DialogueState;
};

/** The chance, on each Talk, that an available alert comes out rather than a free line. */
export const CONTEXTUAL_CHANCE = 0.25;

/** The default cooldown of a contextual alert. */
export const DEFAULT_CONTEXTUAL_COOLDOWN_MS = 120_000;

/**
 * The timestamp to give a companion bubble.
 *
 * The game only shows an NPC bubble whose timestamp is past the last one shown
 * (bundle 1299, `deliverNpcChatBubble`). But two clocks write these bubbles:
 * the mod dates its own with `Date.now()`, the game with its clock synced to
 * the server. A PC a few seconds ahead was enough for a Talk right after a
 * companion reaction to look older than it: the text stayed frozen while the
 * pose played. Hence the rule: always at least one tick after the previous.
 */
export function nextBubbleTimestamp(last: number | null, proposed: number): number {
  if (!Number.isFinite(proposed) || last === null || !Number.isFinite(last)) return proposed;
  return Math.max(proposed, last + 1);
}

export function initialDialogueState(): DialogueState {
  return { lastCustomIndex: -1, mutedUntil: {} };
}

/** Picks the next line. Pure: the same `random` and `nowMs` give the same answer. */
export function pickDialogueLine(input: PickInput): PickResult {
  const { contextual, customLines, nowMs, random, cooldownMs } = input;
  const state: DialogueState = {
    lastCustomIndex: input.state.lastCustomIndex,
    mutedUntil: { ...input.state.mutedUntil },
  };

  const lines = customLines.filter((line) => typeof line === "string" && line.trim().length > 0);

  // 1. An alert, about one time in four, drawn among those not on cooldown.
  //    They used to always come first: the player heard them all in a row at
  //    the start, then only free lines until their cooldown ended. With no
  //    free line, the alert is the only choice.
  const available = contextual.filter(
    (candidate) => candidate?.message && nowMs >= (state.mutedUntil[candidate.key] ?? 0),
  );
  if (available.length > 0 && (lines.length === 0 || random() < CONTEXTUAL_CHANCE)) {
    const candidate = pickOne(available, random);
    state.mutedUntil[candidate.key] = nowMs + cooldownMs;
    return { message: candidate.message, emote: candidate.emote ?? null, custom: false, state };
  }

  // 2. A free line, avoiding the previous one.
  if (lines.length === 0) return { message: null, emote: null, custom: false, state };
  if (lines.length === 1) {
    state.lastCustomIndex = 0;
    return { message: lines[0], emote: null, custom: true, state };
  }

  let index = pickOne([...lines.keys()], random);
  if (index === state.lastCustomIndex) index = (index + 1) % lines.length;
  state.lastCustomIndex = index;
  return { message: lines[index], emote: null, custom: true, state };
}
