// What a reaction is, and the queue that decides when one may be said.
//
// The reactions are what the companion says on his own when something
// happens. None asks a question or acts: they only comment, which is why they
// do not go through the proposals. Everything in `reactions/` is pure (chance
// and clock passed in) and checked outside the browser; the subscriptions that
// feed it live in `reactionWatch.ts`.

import type { EmoteType } from "../emoteTypes";

/**
 * `high` waits its turn while the companion is busy; `low` only makes sense
 * on the spot and is dropped if it cannot be said at once.
 */
export type ReactionPriority = "high" | "low";

export type Reaction = {
  /** `family:detail`. The family carries the cooldown. */
  key: string;
  message: string;
  emote: EmoteType | null;
  priority: ReactionPriority;
  /**
   * Breaks the tie between two waiting reactions with the same key: the
   * heavier stays. "A Gold at last after 80 tries" says more than "a Gold!",
   * and the two come from different sources, in an order nobody controls.
   */
  weight?: number;
};

/** Minimum gap between two reactions: he comments, he does not comment on everything. */
export const REACTION_GAP_MS = 15_000;

/** How long a reaction can still be said. */
export const REACTION_TTL_MS: Record<ReactionPriority, number> = {
  high: 3 * 60_000,
  low: 10_000,
};

/** Cooldown per family, once a line of that family was said. */
export const FAMILY_COOLDOWN_MS: Record<string, number> = {
  ability: 5 * 60_000,
  sale: 60_000,
  hatch: 60_000,
  egg: 5 * 60_000,
  shop: 30_000,
  rarecrop: 30_000,
};

type Queued = Reaction & { at: number };

export type GateState = {
  lastSpokeAt: number;
  mutedUntil: Record<string, number>;
  queue: Queued[];
};

export function initialGateState(): GateState {
  return { lastSpokeAt: 0, mutedUntil: {}, queue: [] };
}

const familyOf = (key: string) => key.split(":")[0];

/**
 * Offers a reaction. A family on cooldown ignores it; a waiting reaction with
 * the same key is replaced, since the newer one says it better.
 */
export function offerReaction(state: GateState, reaction: Reaction, now: number): GateState {
  if (now < (state.mutedUntil[familyOf(reaction.key)] ?? 0)) return state;
  const existing = state.queue.find((q) => q.key === reaction.key);
  if (existing && (existing.weight ?? 0) > (reaction.weight ?? 0)) return state;
  const queue = state.queue.filter((q) => q.key !== reaction.key);
  queue.push({ ...reaction, at: now });
  return { ...state, queue };
}

/**
 * Takes the next reaction to say, if there is one and the moment suits.
 * `high` goes before `low`, then the oldest first.
 */
export function takeReaction(state: GateState, now: number, busy: boolean): { reaction: Reaction | null; state: GateState } {
  const queue = state.queue.filter((q) => now - q.at <= REACTION_TTL_MS[q.priority]);
  const kept = { ...state, queue };
  if (busy || queue.length === 0 || now - state.lastSpokeAt < REACTION_GAP_MS) return { reaction: null, state: kept };

  const chosen = queue.find((q) => q.priority === "high") ?? queue[0];
  const family = familyOf(chosen.key);
  const { at: _at, ...reaction } = chosen;
  return {
    reaction,
    state: {
      lastSpokeAt: now,
      mutedUntil: { ...state.mutedUntil, [family]: now + (FAMILY_COOLDOWN_MS[family] ?? 0) },
      // The rest of the family that just spoke goes quiet too.
      queue: queue.filter((q) => q !== chosen && (FAMILY_COOLDOWN_MS[family] ? familyOf(q.key) !== family : true)),
    },
  };
}
