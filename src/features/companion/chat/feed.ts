// A feeding batch: what it is made of, how it is named, and how he asks.
//
// No game reads here. `feedRead.ts` fills it, `commands/feed.ts` asks the
// question, `feedRun.ts` carries it out. The icons come from the catalogs,
// which are read on each call.

import { compose, spaced, type BubbleLine, type BubbleTag } from "./bubbleTags";
import { petSpeciesIcon, petThing } from "./bubbleIcons";
import type { HarvestRow } from "./harvest";

/** What the pet would be fed with. */
export type FeedSource =
  | { kind: "inventory"; itemId: string; species: string }
  /** To pick first: the crop is still in the ground. */
  | { kind: "garden"; row: HarvestRow; species: string };

export type FeedCandidate = {
  petId: string;
  /** The name the player gave it, or its species. */
  petName: string;
  petSpecies: string;
  hungerPct: number;
  source: FeedSource;
  /**
   * The pet as the game knows it, kept for drawing only.
   *
   * A bubble cannot draw a pet from an atlas key: pets go through the game's
   * own pet renderer, which wants the object. Opaque on purpose.
   */
  pet?: unknown;
};

/**
 * A feeding batch is identified by its PETS, not by the crops chosen.
 *
 * Two searches in a row may well pick two different carrots for the same
 * turtle, since the inventory is walked in whatever order the game serves it.
 * Putting the crop in the signature made the proposal unstable: he asked again
 * every few seconds, saying "things moved". What the player confirms is "feed
 * these pets", and the signature says exactly that.
 */
export function feedSignature(candidates: FeedCandidate[]): string {
  return candidates
    .map((candidate) => candidate.petId)
    .sort()
    .join("|");
}

/**
 * Makes every name in the list unique.
 *
 * Two unnamed pets of the same species share a name, and "Turtle, Turtle"
 * points at nothing. Namesakes are numbered in an order fixed by their id, so
 * a pet keeps its label from one display to the next.
 */
export function disambiguate(candidates: FeedCandidate[]): FeedCandidate[] {
  const byName = new Map<string, FeedCandidate[]>();
  for (const candidate of candidates) {
    const group = byName.get(candidate.petName);
    if (group) group.push(candidate);
    else byName.set(candidate.petName, [candidate]);
  }

  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a.petId.localeCompare(b.petId));
    ordered.forEach((candidate, index) => {
      candidate.petName = `${candidate.petName} #${index + 1}`;
    });
  }

  return candidates;
}

/**
 * The feeding question no longer has a point.
 *
 * Only true once NONE of the proposed pets is still hungry: as long as one is,
 * the question stands. Withdrawing at the first change would make him slippery,
 * since one pet fed by hand out of three would drop everything.
 */
export function isSettled(picks: FeedCandidate[], stillFeedable: Set<string>): boolean {
  return !picks.some((pick) => stillFeedable.has(pick.petId));
}

/** The summary he announces before asking. */
export function describeFeed(candidates: FeedCandidate[]): string {
  if (candidates.length === 0) return "nothing";
  if (candidates.length === 1) {
    const only = candidates[0];
    const where = only.source.kind === "garden" ? ", which I would pick first" : "";
    return `${only.petName} is down to ${only.hungerPct}% and I have ${only.source.species}${where}`;
  }
  const names = candidates.map((candidate) => candidate.petName);
  const head = names.slice(0, 3).join(", ");
  const rest = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return `${candidates.length} pets are hungry: ${head}${rest}`;
}

/** A pet's icon: the game's composed render, or its species sprite as a fallback. */
export function petIcon(pick: FeedCandidate): BubbleTag | null {
  return petThing(pick.pet, "") ?? petSpeciesIcon(pick.petSpecies);
}

/** One icon per species, two at most: they say who without making the line longer. */
export function petIcons(picks: FeedCandidate[]): BubbleTag[] {
  const seen = new Set<string>();
  const icons: BubbleTag[] = [];
  for (const pick of picks) {
    if (seen.has(pick.petSpecies) || icons.length >= 2) continue;
    seen.add(pick.petSpecies);
    const icon = petIcon(pick);
    if (icon) icons.push(icon);
  }
  return icons;
}

/**
 * The question as it fits in a bubble: short, no list.
 *
 * A bubble is a quarter of the thread's width. The list of names wraps three
 * times there and reads badly, while it reads fine in the menu. That is the
 * only difference allowed between the two, and it comes from the medium.
 */
export function feedBubble(picks: FeedCandidate[]): BubbleLine {
  const only = picks.length === 1 ? picks[0] : null;
  if (only) return compose(petIcon(only), ` ${only.petName} is at ${only.hungerPct}%. Feed it?`);
  return compose(...spaced(petIcons(picks)), ` ${picks.length} pets are hungry. Feed them all?`);
}

/**
 * The question in the thread: every pet named, with its sprite and hunger.
 *
 * Each name carries its own icon rather than one sprite up front: that is the
 * difference between "a picture then two names" and a list that reads.
 */
export function feedQuestion(picks: FeedCandidate[]): BubbleLine {
  const listed = picks.flatMap((pick, index) => [
    index === 0 ? "" : ", ",
    petIcon(pick),
    ` ${pick.petName} (${pick.hungerPct}%)`,
  ]);

  return compose(
    picks.length === 1 ? "" : `${picks.length} pets are hungry: `,
    ...listed,
    picks.length === 1 ? ". Should I feed it?" : ". Should I feed all of them?",
  );
}
