// src/services/petTeamStats.ts
// Pure aggregation (no DOM) of what a team of up to 3 pets is worth, built on
// the per-ability model in petAbilityStats.ts.
//
// Two things this deliberately does NOT do:
//  - It never reports a per-hour rate. The server tick interval for
//    `continuous` abilities is absent from the client bundle, so procs/hour
//    cannot be derived. Every proc figure here is per roll.
//  - It never combines abilities that do different things into one number.
//    Abilities are grouped by their actual effect (see effectGroupKey) and a
//    combined proc chance is reported per group.

import { petCatalog, petHungerDepletionMinutes } from "../data";
import { getPetStrength, getPetMaxStrength } from "../utils/petCalcul";
import {
  computeAbilityStatsAtRatio,
  getStrengthRatio,
  getMaxStrengthRatio,
  getAbilityDisplayName,
  getAbilityRawParameters,
  type AbilityStats,
} from "./petAbilityStats";
import type { InventoryPet } from "./pets";

const PERCENT = 100;

/**
 * Hunger Boost's parameter. The live bundle calls it `hungerRefundPercentage`;
 * the hardcoded fallback still carries the older
 * `hungerDepletionRateDecreasePercentage`. Data is dynamic-first, so either
 * can turn up at runtime and both must be recognised.
 */
const DRAIN_REDUCTION_KEYS = ["hungerRefundPercentage", "hungerDepletionRateDecreasePercentage"];

/** Hunger Restore's parameter: how much of the target's max hunger it can give back. */
const RESTORE_AMOUNT_KEY = "hungerRestorePercentage";

const SECONDS_PER_MINUTE = 60;

/** Trailing tier markers on ability ids/names, e.g. "SeedFinderIV", "…II_NEW". */
const TIER_SUFFIX = /(?:_NEW)?(?:IV|I{1,3})$/;

function stripTierSuffix(text: string): string {
  return text.replace(/\s*(?:_NEW)?(?:IV|I{1,3})$/, "").trim() || text;
}

export type EffectContributor = {
  petId: string;
  petName: string;
  abilityId: string;
  abilityName: string;
  /** Null for always-on modifiers, which do not roll. */
  probability: number | null;
  probabilityAtMax: number | null;
  /**
   * This pet's own effect values, already scaled by its strength. Magnitudes
   * are per proc and belong to whichever pet fired — they do NOT add up
   * across the team, unlike the proc chance.
   */
  scaledParameters: Record<string, number>;
  requiredWeather: string | null;
};

export type EffectGroup = {
  key: string;
  /** Data-derived: the contributing ability's own name minus its tier. */
  label: string;
  /**
   * What makes this effect roll. `continuous` abilities roll once a minute —
   * the game's own tooltip labels them "chance per minute" — so their
   * probability is a per-minute chance. Every other trigger rolls once per
   * matching player action instead, and must not be labelled per minute.
   */
  trigger: string | null;
  contributors: EffectContributor[];
  /**
   * Chance that at least one contributor procs on a single roll:
   * `1 - Π(1 - pᵢ)`, in percent. Null when no contributor rolls.
   */
  combinedProbability: number | null;
  combinedProbabilityAtMax: number | null;
  /**
   * Per-parameter sums across contributors. Only meaningful for effects that
   * genuinely stack team-wide (hunger sustain); it is NOT what a single proc
   * delivers, because one proc applies one pet's value. The UI reports
   * per-proc magnitudes from `contributors` instead.
   */
  summedParameters: Record<string, number>;
  summedParametersAtMax: Record<string, number>;
  /** Weathers required by at least one contributor. */
  requiredWeathers: string[];
};

export type TeamAutonomy = {
  /**
   * `sustained` when expected restore covers drain for every pet (or Hunger
   * Boost removes drain entirely) — the team never needs feeding on average.
   * `runs-out` when at least one pet is projected to empty. `unknown` when a
   * species has no known depletion time.
   */
  status: "sustained" | "runs-out" | "unknown";
  /**
   * Minutes before the first pet empties, starting from full hunger. Set only
   * when status is `runs-out`. Live hunger is deliberately not read: this
   * rates the team's composition so it stays comparable between suggestions.
   */
  minutesFromFull: number | null;
  /** Name of the pet that empties first, when one does. */
  limitingPetName: string | null;
  /** Species that blocked the computation, so the UI can say why. */
  speciesMissingDepletion: string[];
  /** Share of base drain removed by Hunger Boost, team-wide, in percent. */
  drainReductionPercent: number;
  /** Expected Hunger Restore activations per minute across the team. */
  restoreActivationsPerMinute: number;
  /**
   * Hunger abilities left out because they need a specific weather. Excluded
   * rather than assumed active, since that weather is never guaranteed — the
   * UI names them so the figure is not mistaken for a worst case.
   */
  weatherGatedHungerAbilities: string[];
};

export type TeamStats = {
  groups: EffectGroup[];
  strengthCurrent: number;
  strengthMax: number;
  /** Σ current STR / Σ max STR, 0..1. */
  potential: number;
  /**
   * Magnitude gain from bringing every pet to max strength, as a fraction
   * (0.12 = +12%). Proc-chance gain is non-linear and is reported per group
   * via combinedProbabilityAtMax instead.
   */
  headroom: number;
  weatherExposure: { weather: string; abilityCount: number }[];
  totalAbilityCount: number;
  autonomy: TeamAutonomy;
  /** Pets whose species is absent from the catalog — strength is unusable. */
  unknownSpecies: string[];
};

type CatalogEntry = { coinsToFullyReplenishHunger?: number };

function getMaxHunger(species: string): number | null {
  const entry = (petCatalog as Record<string, CatalogEntry | undefined>)[species];
  const raw = entry?.coinsToFullyReplenishHunger;
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

function getDepletionMinutes(species: string): number | null {
  const raw = (petHungerDepletionMinutes as Record<string, number | undefined>)[species];
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0 ? raw : null;
}

function isKnownSpecies(species: string): boolean {
  return Boolean((petCatalog as Record<string, unknown>)[species]);
}

function petLabel(pet: InventoryPet): string {
  return pet.name || pet.petSpecies || "Pet";
}

/**
 * Groups abilities by what they actually do, derived from the catalog rather
 * than from a hardcoded taxonomy:
 *  - abilities granting mutations key on the mutations granted, so a Gold
 *    Granter and a Rainbow Granter never merge into one proc figure;
 *  - abilities with numeric parameters key on those parameter names plus the
 *    trigger, which correctly merges tier and weather variants of the same
 *    effect (Plant Growth Boost I/II/III, Snowy/Dawn/Amber…) while keeping
 *    Crop Eater apart from Sell Boost despite the shared parameter;
 *  - the rest key on their ability id minus the tier suffix, which keeps
 *    Seed Finder I-IV together without merging them with Copycat or the
 *    Kisser abilities that share an empty parameter set.
 */
function effectGroupKey(stats: AbilityStats, rawParameters: Record<string, unknown>): string {
  const granted = rawParameters.grantedMutations;
  if (Array.isArray(granted) && granted.length) {
    return `mutation:${granted.slice().sort().join(",")}`;
  }

  const numericKeys = Object.keys(stats.scaledParameters).sort();
  if (numericKeys.length) {
    return `param:${numericKeys.join("+")}@${stats.trigger ?? "?"}`;
  }

  return `id:${stats.abilityId.replace(TIER_SUFFIX, "")}`;
}

/**
 * The group key an ability id lands in, for callers that want to show only
 * the effect a team was built for. Tier and weather variants of the same
 * effect share a key, so a category's best-tier id still matches a pet
 * carrying a lower tier. Null when the id is unknown to the catalog.
 */
export function effectGroupKeyForAbility(abilityId: string): string | null {
  // Ratio 1 is arbitrary: scaling changes the values, never which parameter
  // keys exist, and the key is derived from key names alone.
  const stats = computeAbilityStatsAtRatio(abilityId, 1);
  if (!stats) return null;
  return effectGroupKey(stats, getAbilityRawParameters(abilityId));
}

function combineProbabilities(probabilities: number[]): number | null {
  if (!probabilities.length) return null;
  // 1 - Π(1 - p): the chance at least one of them fires on a single roll.
  // Deliberately not a sum — three 25.92% pets clear 59.35%, not 77.76%.
  let missAll = 1;
  for (const probability of probabilities) {
    missAll *= 1 - probability / PERCENT;
  }
  return (1 - missAll) * PERCENT;
}

function addInto(target: Record<string, number>, source: Record<string, number>): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

/**
 * Expected Hunger Restore activations per minute for one ability.
 *
 * The ability's chance is stated per minute, but the game checks it every
 * second, so it can fire more than once in a minute — converting the minute
 * chance to a per-second one and counting 60 checks is what makes a 14%
 * ability average ~0.15 activations/min rather than exactly 0.14.
 */
function restoreActivationsPerMinute(probabilityPercent: number): number {
  const perMinute = probabilityPercent / 100;
  if (perMinute <= 0) return 0;
  if (perMinute >= 1) return SECONDS_PER_MINUTE;
  const perSecond = 1 - Math.pow(1 - perMinute, 1 / SECONDS_PER_MINUTE);
  return perSecond * SECONDS_PER_MINUTE;
}

type RestoreSource = {
  /** Percent of the TARGET's max hunger this source can give back, scaled by the source's strength. */
  amountPercent: number;
  activationsPerMinute: number;
};

/**
 * How long the team lasts unattended, accounting for both hunger abilities.
 *
 * Hunger Boost cuts the drain rate team-wide; Hunger Restore periodically
 * refills a random active pet. A team whose expected restore matches its
 * drain never needs feeding at all — reporting the raw depletion time, as an
 * earlier version did, understated such a team by an order of magnitude.
 *
 * These are averages: a run of bad luck on Restore does worse.
 */
export function computeTeamAutonomy(pets: InventoryPet[]): TeamAutonomy {
  const speciesMissingDepletion: string[] = [];
  for (const pet of pets) {
    if (getDepletionMinutes(pet.petSpecies) === null || getMaxHunger(pet.petSpecies) === null) {
      if (!speciesMissingDepletion.includes(pet.petSpecies)) {
        speciesMissingDepletion.push(pet.petSpecies);
      }
    }
  }

  // Hunger Boost stacks across the team and applies to every pet.
  let drainReductionPercent = 0;
  const restoreSources: RestoreSource[] = [];
  const weatherGatedHungerAbilities: string[] = [];

  for (const pet of pets) {
    const ratio = getStrengthRatio(pet);
    for (const abilityId of Array.isArray(pet.abilities) ? pet.abilities : []) {
      const stats = computeAbilityStatsAtRatio(abilityId, ratio);
      if (!stats) continue;
      // Weather-gated hunger abilities (Snow Hunger Boost and friends) only
      // work while that weather is up, which is never guaranteed. Counting
      // them would overstate how long the team really lasts.
      if (stats.requiredWeather) {
        if (!weatherGatedHungerAbilities.includes(stats.name)) {
          const touchesHunger =
            RESTORE_AMOUNT_KEY in stats.scaledParameters ||
            DRAIN_REDUCTION_KEYS.some((key) => key in stats.scaledParameters);
          if (touchesHunger) weatherGatedHungerAbilities.push(stats.name);
        }
        continue;
      }

      for (const key of DRAIN_REDUCTION_KEYS) {
        const value = stats.scaledParameters[key];
        if (typeof value === "number") drainReductionPercent += value;
      }

      const amountPercent = stats.scaledParameters[RESTORE_AMOUNT_KEY];
      if (typeof amountPercent === "number" && stats.effectiveProbability !== null) {
        restoreSources.push({
          amountPercent,
          activationsPerMinute: restoreActivationsPerMinute(stats.effectiveProbability),
        });
      }
    }
  }

  const restoreActivationsTotal = restoreSources.reduce((sum, s) => sum + s.activationsPerMinute, 0);
  const remainingDrain = Math.max(0, 1 - drainReductionPercent / 100);

  const base = {
    limitingPetName: null,
    speciesMissingDepletion,
    drainReductionPercent,
    restoreActivationsPerMinute: restoreActivationsTotal,
    weatherGatedHungerAbilities,
  };

  if (speciesMissingDepletion.length) {
    return { ...base, status: "unknown", minutesFromFull: null };
  }
  // Hunger Boost alone can cancel the drain outright.
  if (remainingDrain <= 0) {
    return { ...base, status: "sustained", minutesFromFull: null };
  }

  let worstMinutes: number | null = null;
  let limitingPetName: string | null = null;

  for (const pet of pets) {
    const maxHunger = getMaxHunger(pet.petSpecies)!;
    const depletionMinutes = getDepletionMinutes(pet.petSpecies)!;
    const drainPerMinute = (maxHunger / depletionMinutes) * remainingDrain;

    let restorePerMinute = 0;
    for (const source of restoreSources) {
      // Restore targets "a random active pet", so each pet receives an equal
      // share of every source's activations.
      const hitsPerMinute = source.activationsPerMinute / pets.length;
      // The roll is uniform between 1 and the cap, so it averages (cap+1)/2.
      const cap = Math.floor((maxHunger * source.amountPercent) / 100);
      const averageRoll = cap > 0 ? (cap + 1) / 2 : 0;
      restorePerMinute += hitsPerMinute * averageRoll;
    }

    const net = restorePerMinute - drainPerMinute;
    if (net >= 0) continue;

    const minutes = maxHunger / -net;
    if (worstMinutes === null || minutes < worstMinutes) {
      worstMinutes = minutes;
      limitingPetName = petLabel(pet);
    }
  }

  return worstMinutes === null
    ? { ...base, status: "sustained", minutesFromFull: null }
    : { ...base, status: "runs-out", minutesFromFull: worstMinutes, limitingPetName };
}

/**
 * Full stats for an arbitrary team. Works equally for a Team Builder
 * suggestion and for the equipped team, since it derives its groupings from
 * the pets' own abilities rather than from any goal category.
 */
export function computeTeamStats(pets: InventoryPet[]): TeamStats {
  const realPets = pets.filter(Boolean);

  const groupsByKey = new Map<string, EffectGroup>();
  const groupOrder: string[] = [];
  const weatherCounts = new Map<string, number>();
  const unknownSpecies: string[] = [];
  let totalAbilityCount = 0;

  let strengthCurrent = 0;
  let strengthMax = 0;

  for (const pet of realPets) {
    if (!isKnownSpecies(pet.petSpecies) && !unknownSpecies.includes(pet.petSpecies)) {
      unknownSpecies.push(pet.petSpecies);
    }

    strengthCurrent += getPetStrength(pet);
    strengthMax += getPetMaxStrength(pet);

    const ratio = getStrengthRatio(pet);
    const maxRatio = getMaxStrengthRatio(pet);
    const abilityIds = Array.isArray(pet.abilities) ? pet.abilities.filter(Boolean) : [];

    for (const abilityId of abilityIds) {
      const stats = computeAbilityStatsAtRatio(abilityId, ratio);
      // Unknown ability id: the catalog is dynamic and may carry ids this
      // build has never seen. Skip rather than break the whole card.
      if (!stats) continue;
      const statsAtMax = computeAbilityStatsAtRatio(abilityId, maxRatio);

      totalAbilityCount += 1;
      if (stats.requiredWeather) {
        weatherCounts.set(stats.requiredWeather, (weatherCounts.get(stats.requiredWeather) ?? 0) + 1);
      }

      const key = effectGroupKey(stats, getAbilityRawParameters(abilityId));
      let group = groupsByKey.get(key);
      if (!group) {
        group = {
          key,
          label: stripTierSuffix(getAbilityDisplayName(abilityId)),
          trigger: stats.trigger,
          contributors: [],
          combinedProbability: null,
          combinedProbabilityAtMax: null,
          summedParameters: {},
          summedParametersAtMax: {},
          requiredWeathers: [],
        };
        groupsByKey.set(key, group);
        groupOrder.push(key);
      }

      group.contributors.push({
        petId: pet.id,
        petName: petLabel(pet),
        abilityId,
        abilityName: stats.name,
        probability: stats.effectiveProbability,
        probabilityAtMax: statsAtMax?.effectiveProbability ?? null,
        scaledParameters: stats.scaledParameters,
        requiredWeather: stats.requiredWeather,
      });

      addInto(group.summedParameters, stats.scaledParameters);
      if (statsAtMax) addInto(group.summedParametersAtMax, statsAtMax.scaledParameters);

      if (stats.requiredWeather && !group.requiredWeathers.includes(stats.requiredWeather)) {
        group.requiredWeathers.push(stats.requiredWeather);
      }
    }
  }

  const groups = groupOrder.map((key) => {
    const group = groupsByKey.get(key)!;
    const probabilities = group.contributors
      .map((c) => c.probability)
      .filter((p): p is number => p !== null);
    const probabilitiesAtMax = group.contributors
      .map((c) => c.probabilityAtMax)
      .filter((p): p is number => p !== null);

    group.combinedProbability = combineProbabilities(probabilities);
    group.combinedProbabilityAtMax = combineProbabilities(probabilitiesAtMax);
    return group;
  });

  const potential = strengthMax > 0 ? strengthCurrent / strengthMax : 0;
  // Magnitudes scale linearly on strength, so the whole-team magnitude gain
  // is exactly the strength ratio. Proc gain is not linear and is left to
  // each group's combinedProbabilityAtMax.
  const headroom = strengthCurrent > 0 ? strengthMax / strengthCurrent - 1 : 0;

  const weatherExposure = Array.from(weatherCounts.entries())
    .map(([weather, abilityCount]) => ({ weather, abilityCount }))
    .sort((a, b) => b.abilityCount - a.abilityCount);

  return {
    groups,
    strengthCurrent,
    strengthMax,
    potential,
    headroom,
    weatherExposure,
    totalAbilityCount,
    autonomy: computeTeamAutonomy(realPets),
    unknownSpecies,
  };
}
