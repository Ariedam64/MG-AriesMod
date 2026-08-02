// src/services/petAbilityStats.ts
// Pure model (no DOM) for what a single pet's ability is actually worth at
// that pet's current strength.
//
// Every formula here mirrors the game's own, decompiled from the runtime
// bundle (functions `xg`, `Sg`, `tge`). The game scales everything linearly
// on strength/100:
//
//   ratio     = strength / 100
//   proc%     = min(100, baseProbability * ratio)
//   magnitude = baseParameter * ratio
//   cooldown  = cooldownSeconds / max(ratio, 0.01)
//
// Do not "simplify" the cooldown case into a multiplication: it is the one
// parameter the game divides by the ratio, so a weaker pet waits longer.

import { petAbilities } from "../data";
import { getPetStrength, getPetMaxStrength, type PetLike } from "../utils/petCalcul";

/** The game clamps a rolled probability here (`Math.min(100, y)`). */
const MAX_PROBABILITY_PERCENT = 100;

/** The game's own guard against dividing a cooldown by a ~0 ratio. */
const MIN_COOLDOWN_RATIO = 0.01;

const STRENGTH_SCALE = 100;

/**
 * Parameter keys the game scales by the strength ratio, taken from its `tge`
 * switch. A key absent from this set is passed through unscaled rather than
 * guessed at — `requiredWeather` and `grantedMutations` are not numbers, and
 * inventing a scaling rule for an unknown future key would silently produce
 * wrong figures.
 */
const SCALED_PARAMETER_KEYS = new Set([
  "scaleIncreasePercentage",
  "cropSellPriceIncreasePercentage",
  "mutationChanceIncreasePercentage",
  "hungerRestorePercentage",
  "hungerRefundPercentage",
  // Older name for hungerRefundPercentage, still carried by the hardcoded
  // fallback catalog. Absent from the live bundle's `tge` switch only because
  // the game renamed it — same parameter, so it scales the same way.
  "hungerDepletionRateDecreasePercentage",
  "plantGrowthReductionMinutes",
  "eggGrowthTimeReductionMinutes",
  "baseMaxCoinsFindable",
  "bonusXp",
  "maxStrengthIncreasePercentage",
  "plantAbilityChanceBoostPercentage",
]);

/** The one key the game divides by the ratio instead of multiplying. */
const COOLDOWN_PARAMETER_KEY = "cooldownSeconds";

type AbilityDefinition = {
  name?: string;
  description?: string;
  trigger?: string;
  baseProbability?: number;
  baseParameters?: Record<string, unknown>;
};

export type AbilityStats = {
  abilityId: string;
  name: string;
  trigger: string | null;
  /**
   * Effective chance in percent for one roll, already scaled by strength and
   * clamped. Null when the ability has no baseProbability at all — those are
   * always-on modifiers (e.g. ProduceMutationBoost), not rolls, and showing
   * them a proc figure would misrepresent how they work.
   */
  effectiveProbability: number | null;
  baseProbability: number | null;
  /** baseParameters scaled by strength; non-numeric entries are dropped. */
  scaledParameters: Record<string, number>;
  effectiveCooldownSeconds: number | null;
  requiredWeather: string | null;
};

function getDefinition(abilityId: string): AbilityDefinition | null {
  const entry = (petAbilities as Record<string, AbilityDefinition | undefined>)[abilityId];
  return entry ?? null;
}

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** strength/100 — the multiplier the game applies to everything. */
export function getStrengthRatio(pet: PetLike): number {
  return getPetStrength(pet) / STRENGTH_SCALE;
}

/** The ratio this pet would have once fully grown, used for headroom figures. */
export function getMaxStrengthRatio(pet: PetLike): number {
  return getPetMaxStrength(pet) / STRENGTH_SCALE;
}

export function getAbilityDisplayName(abilityId: string): string {
  return getDefinition(abilityId)?.name ?? abilityId;
}

/**
 * Raw, unscaled baseParameters straight from the catalog. computeAbilityStats
 * drops everything non-numeric, so callers that need the non-numeric entries
 * (grantedMutations, requiredWeather) read them here.
 */
export function getAbilityRawParameters(abilityId: string): Record<string, unknown> {
  return getDefinition(abilityId)?.baseParameters ?? {};
}

export function getRequiredWeather(abilityId: string): string | null {
  const raw = getDefinition(abilityId)?.baseParameters?.requiredWeather;
  return typeof raw === "string" && raw ? raw : null;
}

/**
 * True when the ability rolls a chance at all. Always-on modifiers return
 * false and should be presented as "always on" rather than as a 0% proc.
 */
export function isRolledAbility(abilityId: string): boolean {
  return toFiniteNumber(getDefinition(abilityId)?.baseProbability) !== null;
}

/**
 * Ability stats at an explicit ratio. Split out from computeAbilityStats so
 * team headroom can re-run the exact same maths at max strength without
 * duplicating the formulas.
 */
export function computeAbilityStatsAtRatio(abilityId: string, ratio: number): AbilityStats | null {
  const definition = getDefinition(abilityId);
  // The ability catalog is dynamic and may gain ids this build has never
  // seen — skip them rather than crashing the whole team card.
  if (!definition) return null;

  const safeRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
  const baseProbability = toFiniteNumber(definition.baseProbability);
  const baseParameters = definition.baseParameters ?? {};

  const scaledParameters: Record<string, number> = {};
  let effectiveCooldownSeconds: number | null = null;

  for (const [key, rawValue] of Object.entries(baseParameters)) {
    const value = toFiniteNumber(rawValue);
    if (value === null) continue;

    if (key === COOLDOWN_PARAMETER_KEY) {
      effectiveCooldownSeconds = value / Math.max(safeRatio, MIN_COOLDOWN_RATIO);
      continue;
    }
    scaledParameters[key] = SCALED_PARAMETER_KEYS.has(key) ? value * safeRatio : value;
  }

  return {
    abilityId,
    name: definition.name ?? abilityId,
    trigger: definition.trigger ?? null,
    effectiveProbability:
      baseProbability === null
        ? null
        : Math.min(MAX_PROBABILITY_PERCENT, baseProbability * safeRatio),
    baseProbability,
    scaledParameters,
    effectiveCooldownSeconds,
    requiredWeather: getRequiredWeather(abilityId),
  };
}

/** Ability stats at the pet's current strength. */
export function computeAbilityStats(pet: PetLike, abilityId: string): AbilityStats | null {
  return computeAbilityStatsAtRatio(abilityId, getStrengthRatio(pet));
}

/** Ability stats as if the pet were fully grown. */
export function computeAbilityStatsAtMaxStrength(pet: PetLike, abilityId: string): AbilityStats | null {
  return computeAbilityStatsAtRatio(abilityId, getMaxStrengthRatio(pet));
}

/** Every ability of a pet, at current strength. Unknown ids are skipped. */
export function computePetAbilityStats(pet: PetLike & { abilities?: string[] }): AbilityStats[] {
  const abilityIds = Array.isArray(pet.abilities) ? pet.abilities : [];
  const stats: AbilityStats[] = [];
  for (const abilityId of abilityIds) {
    if (!abilityId) continue;
    const entry = computeAbilityStats(pet, abilityId);
    if (entry) stats.push(entry);
  }
  return stats;
}
