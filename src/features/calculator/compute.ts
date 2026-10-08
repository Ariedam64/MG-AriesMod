// What the crop price simulator shows: price and weight for a species, a Size
// and a set of mutations. Pure, on top of the shared crop rules.

import { DefaultPricing, estimateProduceValue } from "../../data/rules/cropValue";
import { CROP_SIZE_MIN, cropWeight } from "../../data/rules/cropSize";
import { formatInteger } from "../../lib/format";
import { clampFinite } from "../../lib/math";

export const COLOR_LABELS = ["None", "Gold", "Rainbow"] as const;
export const WEATHER_LABELS = ["None", "Wet", "Chilled", "Frozen", "Thunderstruck", "Thundercharged"] as const;
export const LIGHTING_LABELS = ["None", "Dawnlit", "Dawnbound", "Amberlit", "Amberbound"] as const;
/** One label per player count, 1 to 6: each extra player adds 10%. */
export const FRIEND_BONUS_LABELS = ["+0%", "+10%", "+20%", "+30%", "+40%", "+50%"] as const;

type ColorLabel = (typeof COLOR_LABELS)[number];
type WeatherLabel = (typeof WEATHER_LABELS)[number];
type LightingLabel = (typeof LIGHTING_LABELS)[number];
export type FriendBonusLabel = (typeof FRIEND_BONUS_LABELS)[number];

export type CalculatorState = {
  /** Crop Size, a whole number in [50, 100]. */
  size: number;
  color: ColorLabel;
  weather: WeatherLabel;
  lighting: LightingLabel;
  /** Players in the room, 1 to 6. */
  friendPlayers: number;
};

export const defaultCalculatorState = (): CalculatorState => ({
  size: CROP_SIZE_MIN,
  color: "None",
  weather: "None",
  lighting: "None",
  friendPlayers: 1,
});

/** The chosen mutations, by name, leaving out the "None" picks. */
export function mutationsOf(state: CalculatorState): string[] {
  return [state.color, state.weather, state.lighting].filter((label) => label !== "None");
}

const clampFriendPlayers = (players: number) => clampFinite(Math.round(players), 1, FRIEND_BONUS_LABELS.length, 1);

export const friendPlayersLabel = (players: number): FriendBonusLabel =>
  FRIEND_BONUS_LABELS[clampFriendPlayers(players) - 1];

export const friendPlayersOf = (label: FriendBonusLabel): number =>
  Math.max(1, FRIEND_BONUS_LABELS.indexOf(label) + 1);

/** Sell price of the crop in coins, or null when the species has no price. */
export function calculatorPrice(species: string, state: CalculatorState): number | null {
  const value = estimateProduceValue(species, state.size, mutationsOf(state), {
    ...DefaultPricing,
    friendPlayers: clampFriendPlayers(state.friendPlayers),
  });
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Weight in kg at that Size, or null when the catalog has no base weight. */
export const calculatorWeight = (species: string, size: number): number | null => cropWeight(species, size);

export function formatCoins(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return formatInteger(value, "round");
}

const WEIGHT_FORMAT = new Intl.NumberFormat("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

/** `1.25` -> `"1.25 kg"`: three decimals at most, trailing zeros dropped. */
export function formatWeight(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "-";
  const text = WEIGHT_FORMAT.format(value)
    .replace(/(\.\d*?[1-9])0+$/u, "$1")
    .replace(/\.0+$/u, "");
  return `${text} kg`;
}
