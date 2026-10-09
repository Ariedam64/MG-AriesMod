// The words and numbers of the team stats view: what each effect is called,
// what one roll is per trigger, and how percentages, amounts and durations
// are written.

import type { EffectGroup } from "./teamStats";

/**
 * Human labels and units for the game's baseParameter keys. UI vocabulary,
 * not game data: the values themselves always come from the catalog.
 */
const PARAMETER_LABELS: Record<string, { label: string; unit: string }> = {
  // Crop Size is a whole number in [50, 100]; the boost adds points, not a percentage.
  sizeIncrease: { label: "Crop size", unit: "" },
  scaleIncreasePercentage: { label: "Crop size", unit: "%" },
  cropSellPriceIncreasePercentage: { label: "Sell price", unit: "%" },
  mutationChanceIncreasePercentage: { label: "Mutation chance", unit: "%" },
  hungerRestorePercentage: { label: "Hunger restore", unit: "%" },
  hungerRefundPercentage: { label: "Hunger refund", unit: "%" },
  hungerDepletionRateDecreasePercentage: { label: "Hunger drain", unit: "%" },
  plantGrowthReductionMinutes: { label: "Plant growth", unit: "min" },
  eggGrowthTimeReductionMinutes: { label: "Egg growth", unit: "min" },
  baseMaxCoinsFindable: { label: "Coins (max)", unit: "" },
  bonusXp: { label: "Bonus XP", unit: "" },
  maxStrengthIncreasePercentage: { label: "Max STR", unit: "%" },
  plantAbilityChanceBoostPercentage: { label: "Plant ability", unit: "%" },
};

/** Rolls a `continuous` ability gets per hour: the game rolls them each minute. */
export const CONTINUOUS_ROLLS_PER_HOUR = 60;

/**
 * What one roll of an effect corresponds to, by trigger. `continuous`
 * abilities roll once a minute (the game's own tooltip reads "chance per
 * minute"); everything else rolls once per matching player action, so
 * labelling those per minute would be plainly wrong.
 */
const TRIGGER_UNITS: Record<string, string> = {
  continuous: "/min",
  harvest: "/harvest",
  sellAllCrops: "/sale",
  sellPet: "/pet sold",
  hatchEgg: "/hatch",
  playerActivated: "/use",
  weather: "/weather",
};

export function triggerUnit(trigger: string | null): string {
  return (trigger && TRIGGER_UNITS[trigger]) || "/roll";
}

export function formatPercent(value: number): string {
  if (value >= 10) return `${value.toFixed(1)}%`;
  if (value >= 1) return `${value.toFixed(2)}%`;
  return `${value.toFixed(3)}%`;
}

function formatAmount(value: number, unit: string): string {
  // Coin ranges reach seven digits, where "9900000" is unreadable: group
  // thousands so the magnitude is legible at a glance.
  const decimals = Math.abs(value) >= 10 ? 0 : 1;
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${text}${unit === "%" ? "%" : ` ${unit}`}` : text;
}

export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0) return `${hours}h${String(mins).padStart(2, "0")}`;
  return `${mins}m`;
}

/** The parameter this effect is really about, or null when it carries none. */
function primaryParameterKey(group: EffectGroup): string | null {
  for (const contributor of group.contributors) {
    for (const key of Object.keys(contributor.scaledParameters)) {
      if (PARAMETER_LABELS[key]) return key;
    }
  }
  return null;
}

/**
 * Titles the card by what the effect does ("Crop size") rather than by the
 * ability's name ("Crop Size Boost"), which only repeated the line below it.
 * Effects with no numeric parameter (granters, Seed Finder, Double Hatch)
 * keep their ability name, since there is nothing else to call them.
 */
export function groupTitle(group: EffectGroup): string {
  const key = primaryParameterKey(group);
  return key ? PARAMETER_LABELS[key].label : group.label;
}

/**
 * What one proc delivers. Magnitudes do not add up across the team: a proc is
 * one pet firing, and it applies that pet's own value. When contributors
 * differ (different tiers or strengths) this is a range, never a total.
 */
export function perProcMagnitude(group: EffectGroup): string | null {
  const key = primaryParameterKey(group);
  if (!key) return null;

  const meta = PARAMETER_LABELS[key];
  const values = group.contributors
    .map((contributor) => contributor.scaledParameters[key])
    .filter((value): value is number => typeof value === "number" && value !== 0);
  if (!values.length) return null;

  const low = formatAmount(Math.min(...values), meta.unit);
  const high = formatAmount(Math.max(...values), meta.unit);
  // Spaces around the dash: "3.5 min–5.0 min" reads as one broken token.
  return low === high ? high : `${low} – ${high}`;
}
