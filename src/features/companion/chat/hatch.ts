// What to keep from a hatch, and what goes.
//
// No game reads and no commands here.
//
// Two protections are not up for discussion and appear in no setting: a
// player's favourite and a pet on the active team are never sold. They are
// rules set elsewhere, on purpose, the way the Locker is for harvesting, and
// sorting rules must not contradict them.
//
// A sale cannot be undone either, so everything below leans towards keeping:
// with no rule set, nothing goes.

import { EmoteType } from "../emoteTypes";
import { listWords } from "./harvest";

/** What the player wants to keep. Everything else is for sale. */
export type KeepRules = {
  species: string[];
  mutations: string[];
  /** Ability ids, not their display names. */
  abilities: string[];
  /** Keeps from this max strength up. `null` turns the rule off. */
  minMaxStr: number | null;
};

export const DEFAULT_KEEP_RULES: KeepRules = {
  species: [],
  mutations: [],
  abilities: [],
  minMaxStr: null,
};

/** Why a hatch stopped. It decides the next question. */
export type HatchStop = "done" | "full" | "cancelled";

/**
 * At least one rule is set.
 *
 * With none, "what does not match" means everything: offering a sale then
 * would empty the bag by default. The action is refused and the reason given.
 */
export function hasAnyRule(rules: KeepRules): boolean {
  return (
    rules.species.length > 0 || rules.mutations.length > 0 || rules.abilities.length > 0 || rules.minMaxStr !== null
  );
}

export type PetRow = {
  petId: string;
  /** The name the player gave it, or its species. */
  name: string;
  species: string;
  mutations: string[];
  abilities: string[];
  maxStrength: number | null;
  favorited: boolean;
  /** On the active team. */
  onTeam: boolean;
  /**
   * The inventory object as is, kept for drawing only.
   *
   * A bubble can show a composed pet, mutations included, but the game's tag
   * wants the object, not its name. Opaque on purpose: nothing here reads it.
   */
  item?: unknown;
};

/** Case-insensitive match: the sources disagree on case. */
function hasAny(present: string[], wanted: string[]): boolean {
  if (wanted.length === 0) return false;
  const set = new Set(present.map((value) => value.toLowerCase()));
  return wanted.some((value) => set.has(value.toLowerCase()));
}

/** The pet ticks at least one keep rule. */
export function matchesKeep(pet: PetRow, rules: KeepRules): boolean {
  if (rules.species.includes(pet.species)) return true;
  if (hasAny(pet.mutations, rules.mutations)) return true;
  if (rules.abilities.some((ability) => pet.abilities.includes(ability))) return true;
  if (rules.minMaxStr !== null && pet.maxStrength !== null && pet.maxStrength >= rules.minMaxStr) return true;
  return false;
}

/**
 * The mutations cheered louder than the rest, rarest first.
 *
 * Not a copy of the game's catalog but a preference of ours: these two are the
 * rolls that make people look up. A name the game stopped using breaks
 * nothing: the match finds nobody, and he claps instead of adoring. The order
 * decides: a hatch that brings both cheers the Rainbow.
 */
const CHEERED_MUTATIONS = ["Rainbow", "Gold"];

export type HatchCheer = {
  emote: EmoteType;
  /**
   * The pet to feature. `null` when none stands out.
   *
   * Several can appear between two reads of the bag, and the fine one is not
   * always first: without this he would make a fuss while showing the Worm
   * that came out just before.
   */
  star: PetRow | null;
  /** The mutation worth the fuss, under its canonical name. `null` for a plain match. */
  mutation: string | null;
};

/**
 * What the companion plays on seeing these pets come out. `null` for nothing.
 *
 * A pet that ticks no keep rule deserves no celebration: it is exactly the one
 * he will offer to sell next, and cheering it first would be absurd. With no
 * rule set nothing matches, so nothing is cheered, which agrees with
 * `hasAnyRule` refusing to sort in that state.
 *
 * The name given back is our list's, not the pet's: the sources capitalise
 * mutations inconsistently, and this is the name that goes in the sentence.
 */
export function hatchCheer(pets: PetRow[], rules: KeepRules): HatchCheer | null {
  const kept = pets.filter((pet) => matchesKeep(pet, rules));
  if (kept.length === 0) return null;

  for (const mutation of CHEERED_MUTATIONS) {
    const star = kept.find((pet) => hasAny(pet.mutations, [mutation]));
    if (star) return { emote: EmoteType.Love, star, mutation };
  }
  return { emote: EmoteType.Clapping, star: null, mutation: null };
}

/** Everything that keeps a pet safe, the player's rules included. */
export function isProtected(pet: PetRow, rules: KeepRules): boolean {
  return pet.favorited || pet.onTeam || matchesKeep(pet, rules);
}

/**
 * The pets to favourite.
 *
 * Only those that match without already being favourites: favouriting a
 * favourite again adds nothing and lengthens the list the player reads.
 */
export function toFavourite(pets: PetRow[], rules: KeepRules): PetRow[] {
  return pets.filter((pet) => !pet.favorited && matchesKeep(pet, rules));
}

/** The pets that would go. None without a rule: see `hasAnyRule`. */
export function toSell(pets: PetRow[], rules: KeepRules): PetRow[] {
  if (!hasAnyRule(rules)) return [];
  return pets.filter((pet) => !isProtected(pet, rules));
}

/**
 * A sale's signature: the exact set of pets concerned.
 *
 * A sale cannot be undone, so the slightest difference must void the
 * confirmation. A pet hatched, favourited by hand or put on the team between
 * the question and the answer is enough to ask again.
 */
export function petSignature(pets: PetRow[]): string {
  return pets.map((pet) => pet.petId).sort().join("|");
}

/** A hatch's signature: the ready egg tiles, sorted. */
export function slotSignature(slots: number[]): string {
  return [...slots].sort((a, b) => a - b).join("|");
}

/** Counts per species, largest first, for a readable summary. */
function bySpecies(pets: PetRow[]): Array<{ species: string; count: number }> {
  const counts = new Map<string, number>();
  for (const pet of pets) counts.set(pet.species, (counts.get(pet.species) ?? 0) + 1);
  return [...counts.entries()]
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count || a.species.localeCompare(b.species));
}

/** The keep rules in words, as a summary shows them. */
export function describeKeep(rules: KeepRules, abilityNames: Map<string, string> = new Map()): string {
  if (!hasAnyRule(rules)) return "Nothing set yet";
  const parts: string[] = [];
  if (rules.species.length) parts.push(listWords(rules.species));
  if (rules.mutations.length) parts.push(listWords(rules.mutations));
  if (rules.abilities.length) {
    parts.push(listWords(rules.abilities.map((id) => abilityNames.get(id) ?? id)));
  }
  if (rules.minMaxStr !== null) parts.push(`max STR ${rules.minMaxStr} and up`);
  return parts.join(", ");
}

/** What the player asks, on their side of the thread. */
export function describeHatchRequest(count: number): string {
  return count === 1 ? "Hatch that egg for me" : `Hatch my ${count} eggs`;
}

/** What the companion announces before asking. No full stop. */
export function summarizeHatch(slots: number[]): string {
  return `${slots.length} egg${slots.length === 1 ? "" : "s"} ready to hatch`;
}

/**
 * What a sale takes away, as he announces it before asking.
 *
 * Species are named rather than counted in one lump: "23 pets" cannot be
 * checked, and this is exactly the moment to be able to change your mind.
 */
export function summarizeSell(pets: PetRow[]): string {
  if (pets.length === 0) return "nothing";
  const parts = bySpecies(pets).map((entry) => `${entry.count} ${entry.species}`);
  const head = parts.slice(0, 3);
  const rest = parts.length > head.length ? ` and ${parts.length - head.length} other kinds` : "";
  if (parts.length === 1) return parts[0];
  return `${pets.length} pets: ${listWords(head)}${rest}`;
}

/**
 * What he notes after a hatch, before asking anything. `null` when there is
 * nothing to say.
 *
 * The no-rule case gets its own words: a full bag with no sorting rule is not
 * a fault but a missing setting, and saying so saves looking elsewhere.
 */
export function afterHatchNote(stop: HatchStop, eggsWaiting: number, rules: KeepRules, sellable: number): string | null {
  const eggs = eggsWaiting > 0 ? ` ${eggsWaiting} egg${eggsWaiting === 1 ? "" : "s"} still waiting.` : "";

  if (stop === "full") {
    if (sellable > 0) return `Your bag is full.${eggs}`;
    return hasAnyRule(rules)
      ? `Your bag is full, nothing in it is up for sale.${eggs}`
      : `Your bag is full.${eggs} Nothing set to keep, so I am not selling.`;
  }

  // Hatch finished: the sale is only mentioned when there is something to sell.
  return sellable > 0 ? "All open. Now the ones you did not want." : null;
}
