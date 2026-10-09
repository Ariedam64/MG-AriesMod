// What one pet brings to a suggested team, read from the catalog: which of
// its abilities fire while AFK, how well it keeps a team fed, and which
// mutations its abilities grant that a team may not want.

import { petAbilities } from "../../data";
import { getAbilityRawParameters } from "./abilityStats";
import type { InventoryPet } from "./pets";
import type { Category } from "./teamBuilderCategories";

function abilityTrigger(id: string): string | undefined {
  return (petAbilities as Record<string, { trigger?: string } | undefined>)[id]?.trigger;
}

// AFK-eligible means "continuous" only: a per-tick passive proc with no
// weather requirement to wait on. "weather" trigger abilities (MoonKisser,
// DawnKisser, Thunderbloom) still need a specific weather event to actually
// fire, which isn't guaranteed to happen while AFK, so they're treated the
// same as any other action-gated ability here: Active-only.
export function isAfkEligibleAbility(id: string): boolean {
  return abilityTrigger(id) === "continuous";
}

// Same "match by id family" idiom already used by getAbilityChipColors() for
// this exact ability family: not a baseParameters read, since the field
// name observed there (hungerDepletionRateDecreasePercentage for HungerBoost
// in abilityLogText.ts's fallback formatter) doesn't match every source,
// while the id family itself is stable.
function isHungerRestoreAbility(id: string): boolean {
  return id === "HungerRestore" || id === "HungerRestoreII" || id === "HungerRestoreIII" || id === "SnowyHungerRestore";
}
function isHungerBoostAbility(id: string): boolean {
  return id === "HungerBoost" || id === "HungerBoostII" || id === "HungerBoostIII" || id === "SnowyHungerBoost";
}

export function petAbilityIds(pet: InventoryPet): string[] {
  return Array.isArray(pet.abilities) ? pet.abilities : [];
}

/** 2 = has both Restore and Boost, 1 = has one of them, 0 = no sustain ability. */
export function sustainScore(pet: InventoryPet): number {
  const abilities = petAbilityIds(pet);
  const hasRestore = abilities.some(isHungerRestoreAbility);
  const hasBoost = abilities.some(isHungerBoostAbility);
  if (hasRestore && hasBoost) return 2;
  if (hasRestore || hasBoost) return 1;
  return 0;
}

/**
 * Only Gold and Rainbow are worth steering around.
 *
 * Gold actively costs you something (a golden crop can no longer turn
 * Rainbow, which is worth far more), so it is avoided outright whenever an
 * equally capable granter-free pet exists. Rainbow is merely unwanted on a
 * team not built for it, so it costs a strength handicap instead: such a pet
 * wins only if it is more than GRANTER_STRENGTH_PENALTY stronger.
 *
 * Every other granter (Wet, Chilled, Frozen, Dawnlit, Ambershine,
 * Thunderstruck) is ignored on purpose. Penalising them reshuffled teams for
 * no real benefit: Ambershine Granter pets were being pushed out of unrelated
 * Dawn teams, which split one merged card into two confusing ones.
 */
const HARD_AVOID_MUTATIONS = new Set(["Gold"]);
const SOFT_AVOID_MUTATIONS = new Set(["Rainbow"]);
export const GRANTER_STRENGTH_PENALTY = 10;

/** Mutations an ability grants, straight from the catalog: nothing hardcoded. */
function abilityGrantedMutations(abilityId: string): string[] {
  const raw = getAbilityRawParameters(abilityId).grantedMutations;
  return Array.isArray(raw) ? raw.filter((m): m is string => typeof m === "string") : [];
}

function petGrantedMutations(pet: InventoryPet): string[] {
  const mutations = new Set<string>();
  for (const abilityId of petAbilityIds(pet)) {
    for (const mutation of abilityGrantedMutations(abilityId)) mutations.add(mutation);
  }
  return Array.from(mutations);
}

/** Mutations this team is actually after, which are therefore not unwanted. */
export function categoryGrantedMutations(category: Category): Set<string> {
  const mutations = new Set<string>();
  for (const abilityId of category.abilityIds) {
    for (const mutation of abilityGrantedMutations(abilityId)) mutations.add(mutation);
  }
  return mutations;
}

type GranterPenalty = { hardAvoidCount: number; softAvoidCount: number };

export function granterPenaltyFor(pet: InventoryPet, wanted: Set<string>): GranterPenalty {
  let hardAvoidCount = 0;
  let softAvoidCount = 0;
  for (const mutation of petGrantedMutations(pet)) {
    if (wanted.has(mutation)) continue;
    if (HARD_AVOID_MUTATIONS.has(mutation)) hardAvoidCount += 1;
    else if (SOFT_AVOID_MUTATIONS.has(mutation)) softAvoidCount += 1;
  }
  return { hardAvoidCount, softAvoidCount };
}

export function countUnwantedGranters(teamPets: InventoryPet[], wanted: Set<string>): GranterPenalty {
  let hardAvoidCount = 0;
  let softAvoidCount = 0;
  for (const pet of teamPets) {
    const penalty = granterPenaltyFor(pet, wanted);
    hardAvoidCount += penalty.hardAvoidCount;
    softAvoidCount += penalty.softAvoidCount;
  }
  return { hardAvoidCount, softAvoidCount };
}
