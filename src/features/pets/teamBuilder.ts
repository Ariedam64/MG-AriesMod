// Pure logic (no DOM) for the Pets menu Team Builder tab: groups owned pets
// into ready-to-save teams of up to 3, one Active variant per goal category
// and, where the category's abilities can fire without any player action,
// one AFK variant that always reserves a slot for a hunger-sustain pet.

import { getPetMaxStrength } from "../../data/rules/petValue";
import { computeAbilityStatsAtRatio, getStrengthRatio } from "./abilityStats";
import { computeTeamAutonomy } from "./teamStats";
import type { InventoryPet } from "./pets";
import { CATEGORIES, CATEGORIES_BY_ID, type Category } from "./teamBuilderCategories";
import {
  GRANTER_STRENGTH_PENALTY,
  categoryGrantedMutations,
  countUnwantedGranters,
  granterPenaltyFor,
  isAfkEligibleAbility,
  petAbilityIds,
  sustainScore,
} from "./teamBuilderTraits";

type TeamBuilderMode = "active" | "afk";

// abilityId is the category's best-tier ability id. The UI resolves it to
// a real color via getAbilityChipColors() (already used for the ability
// dots), so the categorization here stays pure/DOM-free.
type MergedCategory = { id: string; label: string; shortLabel: string; icon: string; abilityId: string };

// One team can serve several categories at once (e.g. a Turtle team hits
// both Plant Growth Speed and Egg Growth Speed): categories is never empty,
// and has more than one entry once buildSuggestedTeams merges teams that
// ended up with the exact same pets.
export type SuggestedTeam = {
  categories: MergedCategory[];
  mode: TeamBuilderMode;
  petIds: string[];
  /**
   * Ability ids whose stats this team should report. Beyond its own category,
   * this includes any sibling category the team was padded from: a Sell
   * Boost team topped off with a Crop Refund pet earns its slot on the same
   * "sell all crops" click, so hiding Crop Refund would misrepresent it.
   *
   * Never includes the sustain pet's hunger abilities: that pet is in the
   * team to keep it fed, not to add procs, and it only feeds into the
   * "lasts without feeding" figure.
   */
  focusAbilityIds: string[];
};

// A pet that wasn't picked for any suggested team.
export type UnusedPetInfo = {
  pet: InventoryPet;
  /** Category labels this pet qualified for but lost to a better-ranked pet. Empty when untracked. */
  outrankedIn: string[];
  /** True if it also qualifies as a sustain pet but wasn't the best one owned. */
  outrankedAsSustain: boolean;
  /** True if none of its abilities map to any category and it isn't a sustain candidate: nothing to rank it against. */
  untracked: boolean;
};

export type TeamBuilderResult = {
  teams: SuggestedTeam[];
  sustainPet: InventoryPet | null;
  unusedPets: UnusedPetInfo[];
};

/**
 * Best pet to hold the sustain slot, optionally aware of what the team is
 * actually for.
 *
 * The sustain pet takes a slot no matter what, so one that ALSO carries the
 * team's goal ability is worth far more than a marginally stronger pet that
 * only feeds: it turns a dead slot into a third proc source. Ranking
 * strength above that is what made a max-strength Turtle with no Rainbow
 * Granter beat a 93-strength one that had it.
 *
 * Sustain score still outranks goal usefulness: a pet missing half the hunger
 * abilities is not a sustain pet, and that is a real loss rather than the
 * "slightly lower strength" this is meant to trade away.
 */
function pickSustainPet(
  pets: InventoryPet[],
  category: Category | null,
  afkOnly: boolean,
): InventoryPet | null {
  const NOT_USEFUL = Number.POSITIVE_INFINITY;

  const wantedMutations = category ? categoryGrantedMutations(category) : new Set<string>();

  const ranked = pets
    .map((pet) => {
      const abilities = petAbilityIds(pet);
      const relevant = afkOnly ? abilities.filter(isAfkEligibleAbility) : abilities;
      const tierIndex = category ? bestTierIndex(category, relevant) : -1;
      const { hardAvoidCount, softAvoidCount } = granterPenaltyFor(pet, wantedMutations);
      return {
        pet,
        score: sustainScore(pet),
        hardAvoidCount,
        // Lower is better; pets that do nothing for the goal sort last.
        goalRank: tierIndex === -1 ? NOT_USEFUL : tierIndex,
        effectiveStrength: getPetMaxStrength(pet) - GRANTER_STRENGTH_PENALTY * softAvoidCount,
      };
    })
    .filter((candidate) => candidate.score > 0);

  if (!ranked.length) return null;

  ranked.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.hardAvoidCount !== b.hardAvoidCount) return a.hardAvoidCount - b.hardAvoidCount;
    if (a.goalRank !== b.goalRank) return a.goalRank - b.goalRank;
    if (a.effectiveStrength !== b.effectiveStrength) return b.effectiveStrength - a.effectiveStrength;
    return a.pet.petSpecies.localeCompare(b.pet.petSpecies);
  });

  return ranked[0].pet;
}

/** Best overall feeder, with no particular goal in mind. */
function getBestSustainPet(pets: InventoryPet[]): InventoryPet | null {
  return pickSustainPet(pets, null, false);
}

// Bounds on the AFK search below. Small on purpose: the pools are already
// ranked, so anything past the top few would never win, and this keeps the
// combination count trivial across all ~57 categories.
const AFK_POOL_LIMIT = 6;
const AFK_FEEDER_LIMIT = 4;

function combinations<T>(items: T[], size: number): T[][] {
  if (size <= 0 || size > items.length) return [];
  const out: T[][] = [];
  const current: T[] = [];
  const walk = (start: number) => {
    if (current.length === size) {
      out.push([...current]);
      return;
    }
    for (let i = start; i < items.length; i += 1) {
      current.push(items[i]);
      walk(i + 1);
      current.pop();
    }
  };
  walk(0);
  return out;
}

/** Chance at least one pet procs this category on a roll, as a fraction. */
function categoryCombinedProbability(category: Category, teamPets: InventoryPet[]): number {
  let missAll = 1;
  for (const pet of teamPets) {
    const abilities = petAbilityIds(pet).filter(isAfkEligibleAbility);
    const tierIndex = bestTierIndex(category, abilities);
    if (tierIndex === -1) continue;
    const stats = computeAbilityStatsAtRatio(category.abilityIds[tierIndex], getStrengthRatio(pet));
    if (!stats || stats.effectiveProbability === null) continue;
    missAll *= 1 - stats.effectiveProbability / 100;
  }
  return 1 - missAll;
}

/**
 * Picks the whole AFK team at once, rather than filling N-1 goal slots and
 * reserving exactly one for a feeder.
 *
 * That fixed reservation was wrong whenever the goal pets carry hunger
 * abilities themselves: two Rainbow Turtles that each have Hunger Restore and
 * Hunger Boost sustain each other forever, but the old split took only one of
 * them and handed the last slot to a separate feeder, landing on ~2h31
 * instead of unlimited.
 *
 * Ranking is lexicographic: a team that never needs feeding beats one that
 * does, whatever the strength gap; only then does proc chance decide.
 */
function pickAfkTeam(
  category: Category,
  pets: InventoryPet[],
  maxSlots: number,
): InventoryPet[] | null {
  const qualifying = rankCandidates(category, pets, true).slice(0, AFK_POOL_LIMIT);
  if (!qualifying.length) return null;

  const feeders = pets
    .filter((pet) => sustainScore(pet) > 0)
    .sort((a, b) => sustainScore(b) - sustainScore(a) || getPetMaxStrength(b) - getPetMaxStrength(a))
    .slice(0, AFK_FEEDER_LIMIT);

  const poolById = new Map<string, InventoryPet>();
  for (const pet of [...qualifying, ...feeders]) poolById.set(pet.id, pet);
  const pool = Array.from(poolById.values());
  const qualifyingIds = new Set(qualifying.map((pet) => pet.id));

  const wantedMutations = categoryGrantedMutations(category);

  let best: ScoredAfkTeam | null = null;

  for (const combo of combinations(pool, Math.min(maxSlots, pool.length))) {
    // Must actually serve the goal, and must be able to feed itself at all:
    // otherwise "AFK" means nothing.
    if (!combo.some((pet) => qualifyingIds.has(pet.id))) continue;
    if (!combo.some((pet) => sustainScore(pet) > 0)) continue;

    const { hardAvoidCount, softAvoidCount } = countUnwantedGranters(combo, wantedMutations);
    const strength = combo.reduce((sum, pet) => sum + getPetMaxStrength(pet), 0);

    const sustained = computeTeamAutonomy(combo).status === "sustained";

    const candidate: ScoredAfkTeam = {
      pets: combo,
      sustained,
      // Only meaningful while the team still runs dry: dodging a granter must
      // not cost you a real feeder. Once the team sustains itself, extra
      // hunger capability buys nothing and the later tiers decide.
      sustainCapability: sustained ? 0 : combo.reduce((sum, pet) => sum + sustainScore(pet), 0),
      hardAvoidCount,
      probability: categoryCombinedProbability(category, combo),
      // Soft-avoided granters cost GRANTER_STRENGTH_PENALTY each, so such a
      // pet only wins when it is more than that much stronger.
      effectiveStrength: strength - GRANTER_STRENGTH_PENALTY * softAvoidCount,
    };

    if (!best || isBetterAfkTeam(candidate, best)) best = candidate;
  }

  return best?.pets ?? null;
}

type ScoredAfkTeam = {
  pets: InventoryPet[];
  sustained: boolean;
  sustainCapability: number;
  hardAvoidCount: number;
  probability: number;
  effectiveStrength: number;
};

/**
 * Ranking tiers, strongest first:
 *  1. the team feeds itself forever;
 *  2. failing that, it keeps the most feeding capability;
 *  3. it avoids Gold, which costs you Rainbow crops;
 *  4. it procs the goal more often;
 *  5. raw strength, minus a handicap for other unwanted granters.
 */
function isBetterAfkTeam(
  candidate: Omit<ScoredAfkTeam, "pets">,
  best: Omit<ScoredAfkTeam, "pets">,
): boolean {
  if (candidate.sustained !== best.sustained) return candidate.sustained;
  if (candidate.sustainCapability !== best.sustainCapability) {
    return candidate.sustainCapability > best.sustainCapability;
  }
  if (candidate.hardAvoidCount !== best.hardAvoidCount) {
    return candidate.hardAvoidCount < best.hardAvoidCount;
  }
  if (candidate.probability !== best.probability) return candidate.probability > best.probability;
  return candidate.effectiveStrength > best.effectiveStrength;
}

/** Index of the best (lowest) tier this pet reaches in the category, or -1 if none. */
function bestTierIndex(category: Category, abilities: string[]): number {
  let best = -1;
  for (const id of abilities) {
    const idx = category.abilityIds.indexOf(id);
    if (idx === -1) continue;
    if (best === -1 || idx < best) best = idx;
  }
  return best;
}

function rankCandidates(category: Category, pets: InventoryPet[], afkOnly: boolean): InventoryPet[] {
  // Unwanted mutation granters are avoided on every pet, not just on feeders:
  // a Plant Growth team of Turtles rewrites the garden just as happily as a
  // feeder does if one of them carries Gold Granter.
  const wantedMutations = categoryGrantedMutations(category);

  const ranked = pets
    .map((pet) => {
      const abilities = petAbilityIds(pet);
      const relevant = afkOnly ? abilities.filter(isAfkEligibleAbility) : abilities;
      const { hardAvoidCount, softAvoidCount } = granterPenaltyFor(pet, wantedMutations);
      return {
        pet,
        tierIndex: bestTierIndex(category, relevant),
        hardAvoidCount,
        // Same handicap as the AFK ranking: a soft-avoided granter only wins
        // when it is more than GRANTER_STRENGTH_PENALTY stronger.
        effectiveStrength: getPetMaxStrength(pet) - GRANTER_STRENGTH_PENALTY * softAvoidCount,
      };
    })
    .filter((c) => c.tierIndex !== -1);

  // How many qualifying candidates share each species, across the whole
  // pool for this category (not just those tied on strength). Used as a
  // tie-break below: e.g. 3 Butterflies + 1 Ostrich all at max strength 96
  // on the same ability: picking 2 Butterflies + the Ostrich over 3
  // Butterflies gains nothing (same strength) but costs a second diet list
  // to keep the team fed, so the species you own more of for this goal
  // wins the tie.
  const speciesCount = new Map<string, number>();
  for (const c of ranked) {
    speciesCount.set(c.pet.petSpecies, (speciesCount.get(c.pet.petSpecies) ?? 0) + 1);
  }

  ranked.sort((a, b) => {
    // Tier first: dropping a whole ability tier to dodge a granter costs more
    // than the granter does.
    if (a.tierIndex !== b.tierIndex) return a.tierIndex - b.tierIndex;
    if (a.hardAvoidCount !== b.hardAvoidCount) return a.hardAvoidCount - b.hardAvoidCount;
    if (a.effectiveStrength !== b.effectiveStrength) return b.effectiveStrength - a.effectiveStrength;
    const aCount = speciesCount.get(a.pet.petSpecies) ?? 0;
    const bCount = speciesCount.get(b.pet.petSpecies) ?? 0;
    if (aCount !== bCount) return bCount - aCount;
    return a.pet.petSpecies.localeCompare(b.pet.petSpecies);
  });

  return ranked.map((c) => c.pet);
}

/** Every category this pet has at least one matching ability for, regardless of rank. */
function qualifyingCategories(pet: InventoryPet): Category[] {
  const abilities = petAbilityIds(pet);
  return CATEGORIES.filter((c) => bestTierIndex(c, abilities) !== -1);
}

function findUnusedPets(pets: InventoryPet[], usedIds: Set<string>, sustainPet: InventoryPet | null): UnusedPetInfo[] {
  const unused: UnusedPetInfo[] = [];
  const seenIds = new Set<string>();
  for (const pet of pets) {
    if (usedIds.has(pet.id) || seenIds.has(pet.id)) continue;
    seenIds.add(pet.id);

    const outrankedIn = qualifyingCategories(pet).map((c) => c.label);
    const outrankedAsSustain = sustainScore(pet) > 0 && sustainPet?.id !== pet.id;
    const untracked = !outrankedIn.length && !outrankedAsSustain;
    unused.push({ pet, outrankedIn, outrankedAsSustain, untracked });
  }
  return unused;
}

// Two categories that both land on the exact same 3 (or 2+sustain) pets
// (e.g. a Turtle team hitting both Plant Growth Speed and Egg Growth Speed)
// get folded into a single card instead of showing the same team twice.
function mergeTeamsWithSamePets(teams: SuggestedTeam[]): SuggestedTeam[] {
  const order: string[] = [];
  const byKey = new Map<string, SuggestedTeam>();
  for (const team of teams) {
    const key = `${team.mode}::${team.petIds.slice().sort().join(",")}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.categories.push(...team.categories);
      // Same pets serving two goals: the merged card must report both.
      existing.focusAbilityIds = dedupe([...existing.focusAbilityIds, ...team.focusAbilityIds]);
    } else {
      byKey.set(key, {
        ...team,
        categories: [...team.categories],
        focusAbilityIds: [...team.focusAbilityIds],
      });
      order.push(key);
    }
  }
  return order.map((key) => byKey.get(key)!);
}

function dedupe(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

export function buildSuggestedTeams(pets: InventoryPet[]): TeamBuilderResult {
  const sustainPet = getBestSustainPet(pets);
  const teams: SuggestedTeam[] = [];
  const usedIds = new Set<string>();
  if (sustainPet) usedIds.add(sustainPet.id);

  for (const category of CATEGORIES) {
    const categoryRef: MergedCategory = {
      id: category.id,
      label: category.label,
      shortLabel: category.shortLabel,
      icon: category.icon,
      abilityId: category.abilityIds[0],
    };
    // Everything below fills at most this many *real* pets; the rest of the
    // 3 team slots (all of them, for Pet XP's case) stay genuinely empty:
    // slicing to fewer than 3 already leaves them unfilled when saved.
    const maxSlots = category.maxTeamSlots ?? 3;

    // Stats this team should report: its own goal first, then whatever a
    // padding pet legitimately adds on the same action.
    const focusAbilityIds: string[] = [category.abilityIds[0]];

    let activeCandidates = rankCandidates(category, pets, false).slice(0, maxSlots);
    // Weather-exclusive categories often only have one qualifying pet:
    // top the team off with the parent (non-weather) category's own best
    // picks rather than leaving slots empty, since they still work toward
    // the same goal whenever the required weather isn't active.
    if (activeCandidates.length && activeCandidates.length < maxSlots && category.paddingParentId) {
      const parent = CATEGORIES_BY_ID.get(category.paddingParentId);
      if (parent) {
        const already = new Set(activeCandidates.map((p) => p.id));
        const padding = rankCandidates(parent, pets, false).filter((p) => !already.has(p.id));
        const before = activeCandidates.length;
        activeCandidates = [...activeCandidates, ...padding].slice(0, maxSlots);
        if (activeCandidates.length > before) focusAbilityIds.push(parent.abilityIds[0]);
      }
    }
    // Still short? Pull in pets from sibling categories that fire on the
    // same action (sell all crops, hatch an egg, ...): they proc from the
    // same single click, so combining them is strictly better than an
    // empty slot.
    if (activeCandidates.length && activeCandidates.length < maxSlots && category.paddingSiblingIds?.length) {
      const already = new Set(activeCandidates.map((p) => p.id));
      const siblingPool: InventoryPet[] = [];
      const siblingByPetId = new Map<string, Category>();
      for (const siblingId of category.paddingSiblingIds) {
        const sibling = CATEGORIES_BY_ID.get(siblingId);
        if (!sibling) continue;
        for (const p of rankCandidates(sibling, pets, false)) {
          if (!already.has(p.id)) {
            siblingPool.push(p);
            already.add(p.id);
            siblingByPetId.set(p.id, sibling);
          }
        }
      }
      activeCandidates = [...activeCandidates, ...siblingPool].slice(0, maxSlots);
      // Only siblings whose pet survived the slice actually made the team,
      // so only those earn a reported stat.
      for (const pet of activeCandidates) {
        const sibling = siblingByPetId.get(pet.id);
        if (sibling) focusAbilityIds.push(sibling.abilityIds[0]);
      }
    }
    activeCandidates.forEach((p) => usedIds.add(p.id));
    if (activeCandidates.length) {
      teams.push({
        categories: [categoryRef],
        mode: "active",
        petIds: activeCandidates.map((p) => p.id),
        focusAbilityIds: dedupe(focusAbilityIds),
      });
    }

    if (category.afkCapable) {
      // Chosen as a whole team: a self-sustaining composition wins over a
      // stronger one that still needs feeding.
      const afkTeam = pickAfkTeam(category, pets, maxSlots);
      if (afkTeam?.length) {
        afkTeam.forEach((p) => usedIds.add(p.id));
        teams.push({
          categories: [categoryRef],
          mode: "afk",
          // Only the category's own ability. A feeder in this team may well
          // carry it too (that is often why it was picked), and the stats
          // layer counts whatever abilities the pets actually have.
          petIds: afkTeam.map((p) => p.id),
          focusAbilityIds: [category.abilityIds[0]],
        });
      }
    }

    // A leftover empty slot (fewer than maxSlots real candidates even after
    // weather-parent padding) can just as well be filled by the sustain
    // pet instead of staying empty: offered as an AFK variant, since
    // "abilityIsPassive() + a pet that keeps the team fed" is exactly what
    // AFK means. Only for categories that don't already get their own
    // dedicated AFK team above (category.afkCapable === true already
    // covers that: running this too produced a duplicate identical AFK
    // team, merged into the same card twice, i.e. the same category label
    // showing up twice in the title). Only relevant when the abilities
    // actually in play are passive (this category, or its padding parent
    // for weather-exclusive ones): an empty slot on e.g. Double Hatch
    // shouldn't get labeled AFK just because a feeder pet could technically
    // sit there doing nothing.
    const afkRelevant = !category.afkCapable
      && category.paddingParentId != null && !!CATEGORIES_BY_ID.get(category.paddingParentId)?.afkCapable;
    // Same goal-aware choice here; these candidates are not AFK-filtered, so
    // the feeder is judged on all of its abilities.
    const fillerSustainPet = pickSustainPet(pets, category, false);
    if (
      afkRelevant && fillerSustainPet && activeCandidates.length > 0 && activeCandidates.length < maxSlots &&
      !activeCandidates.some((p) => p.id === fillerSustainPet.id)
    ) {
      usedIds.add(fillerSustainPet.id);
      teams.push({
        categories: [categoryRef],
        mode: "afk",
        petIds: [...activeCandidates.map((p) => p.id), fillerSustainPet.id],
        focusAbilityIds: dedupe(focusAbilityIds),
      });
    }
  }

  return {
    teams: mergeTeamsWithSamePets(teams),
    sustainPet,
    unusedPets: findUnusedPets(pets, usedIds, sustainPet),
  };
}
