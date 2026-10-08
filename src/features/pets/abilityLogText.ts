// What one pet-ability proc reads as in the logs, and the number it adds to
// the ability stats.

import { formatAbilityLog, isPetAbilityAction, petAbilities } from "../../data";

type Params = Record<string, unknown>;

const baseParameters = (abilityId: string): Params =>
  ((petAbilities as Record<string, { baseParameters?: Params } | undefined>)[abilityId]?.baseParameters ?? {});

const formatCount = (n: unknown): string =>
  Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString("en-US") : "0";

const plural = (n: unknown, word: string): string => `${word}${Number(n) === 1 ? "" : "s"}`;

/** Text for the few abilities the shared formatter does not cover yet. */
function fallbackText(abilityId: string, params: Params): string {
  switch (abilityId) {
    case "HungerBoost":
    case "HungerBoostII":
    case "HungerBoostIII":
    case "SnowyHungerBoost": {
      const pct = baseParameters(abilityId)["hungerDepletionRateDecreasePercentage"];
      return pct != null ? `- ${Number(pct).toFixed(0)}% hunger drain` : "Hunger reduced";
    }
    case "Copycat":
      return "Copied another ability";
    case "DawnCapture": {
      // The game shows the `dawnboundRemoved` count as Dawncharged.
      const capsules = params["capsulesAdded"];
      const dawnlit = Number(params["dawnlitRemoved"]) || 0;
      const dawncharged = Number(params["dawnboundRemoved"]) || 0;
      const absorbed: string[] = [];
      if (dawnlit > 0) absorbed.push(`${formatCount(dawnlit)} Dawnlit`);
      if (dawncharged > 0) absorbed.push(`${formatCount(dawncharged)} Dawncharged`);
      const head = capsules != null
        ? `+ ${formatCount(capsules)} ${plural(capsules, "Dawn Capsule")}`
        : "Dawn Capsules added";
      return absorbed.length ? `${head} (${absorbed.join(", ")} absorbed)` : head;
    }
    case "Thunderbloom":
      return "Thunder mutations empowered";
    case "Thundercharger": {
      // Turns Thunderstruck crops into Thundercharged ones.
      const charged = params["cropsCharged"];
      return charged != null ? `${formatCount(charged)} ${plural(charged, "crop")} Thundercharged` : "Crops Thundercharged";
    }
    default: {
      const meta = (petAbilities as Record<string, { name?: string; description?: string } | undefined>)[abilityId];
      return meta?.description || meta?.name || abilityId;
    }
  }
}

/**
 * The log line for one activity log entry, or null for a phantom proc (a Gold
 * or Rainbow Granter that resolved no crop). Prefers the shared formatter,
 * which follows the real myActivityLog shape.
 */
export function abilityLogText(abilityId: string, params: Params): string | null {
  if (abilityId === "GoldGranter" || abilityId === "RainbowGranter") {
    const growSlot = params.growSlot as Params | undefined;
    const species = typeof growSlot?.species === "string" ? growSlot.species.trim() : "";
    if (!species) return null;
  }

  if (isPetAbilityAction(abilityId)) {
    try {
      const text = formatAbilityLog({ action: abilityId, timestamp: 0, parameters: params });
      if (text) return text;
    } catch {}
  }
  return fallbackText(abilityId, params);
}

const nonNegative = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};

/** First field present in the proc, then in the catalog's base parameters. */
const firstOf = (data: Params, base: Params, dataKeys: string[], baseKeys: string[] = []): unknown => {
  for (const key of dataKeys) if (data[key] != null) return data[key];
  for (const key of baseKeys) if (base[key] != null) return base[key];
  return 0;
};

/** Growth reduction in ms. The log reports seconds; older minute fields stay as a fallback. */
const reductionMs = (data: Params, base: Params, minuteKeys: string[], baseMinuteKey: string): number => {
  if (data["secondsReduced"] != null) return nonNegative(data["secondsReduced"]) * 1000;
  return nonNegative(firstOf(data, base, minuteKeys, [baseMinuteKey])) * 60 * 1000;
};

/**
 * The amount one proc is worth for the ability stats: coins found, bonus XP,
 * time saved in ms, and so on. 0 for abilities without a tracked amount.
 */
export function abilityLogValue(abilityId: string, rawData: unknown): number {
  const data = (rawData ?? {}) as Params;
  const base = baseParameters(abilityId);

  switch (abilityId) {
    case "CoinFinderI":
    case "CoinFinderII":
    case "CoinFinderIII":
    case "SnowyCoinFinder":
    case "DawnCoinFinder":
    case "ThunderCoinFinder":
      return nonNegative(firstOf(data, base, ["coinsFound", "coins"]));

    case "SellBoostI":
    case "SellBoostII":
    case "SellBoostIII":
    case "SellBoostIV":
      return nonNegative(firstOf(data, base, ["bonusCoins", "coinsEarned"]));

    case "ProduceEater":
      return nonNegative(firstOf(data, base, ["sellPrice"]));

    case "ProduceScaleBoost":
    case "ProduceScaleBoostII":
    case "ProduceScaleBoostIII":
    case "SnowyCropSizeBoost":
      // Whole Size points added to the crop, not a percentage of its scale.
      return nonNegative(firstOf(
        data, base,
        ["sizeIncrease", "scaleIncreasePercentage", "cropScaleIncreasePercentage"],
        ["sizeIncrease", "scaleIncreasePercentage"],
      ));

    case "EggGrowthBoost":
    case "EggGrowthBoostII_NEW":
    case "EggGrowthBoostII":
    case "SnowyEggGrowthBoost":
    case "ThunderEggGrowthBoost":
      return reductionMs(data, base, ["eggGrowthTimeReductionMinutes", "minutesReduced", "reductionMinutes"], "eggGrowthTimeReductionMinutes");

    case "PlantGrowthBoost":
    case "PlantGrowthBoostII":
    case "PlantGrowthBoostIII":
    case "SnowyPlantGrowthBoost":
    case "DawnPlantGrowthBoost":
    case "AmberPlantGrowthBoost":
    case "ThunderPlantGrowthBoost":
      return reductionMs(data, base, ["minutesReduced", "reductionMinutes", "plantGrowthReductionMinutes"], "plantGrowthReductionMinutes");

    case "PetXpBoost":
    case "SnowyPetXpBoost":
    case "PetXpBoostII":
    case "PetXpBoostIII":
    case "DawnXpBoost":
    case "ThunderXpBoost":
    case "PetAgeBoost":
    case "PetAgeBoostII":
    case "PetAgeBoostIII":
      return nonNegative(firstOf(data, base, ["bonusXp"], ["bonusXp"]));

    case "DawnCapture":
      return nonNegative(firstOf(data, base, ["capsulesAdded"]));

    case "PetHatchSizeBoost":
    case "PetHatchSizeBoostII":
    case "PetHatchSizeBoostIII":
      return nonNegative(firstOf(data, base, ["strengthIncrease"]));

    case "HungerRestore":
    case "HungerRestoreII":
    case "HungerRestoreIII":
    case "SnowyHungerRestore":
      return nonNegative(firstOf(data, base, ["hungerRestoreAmount", "hungerRestoredPercentage"], ["hungerRestorePercentage"]));

    case "HungerBoost":
    case "HungerBoostII":
    case "HungerBoostIII":
    case "SnowyHungerBoost":
      return nonNegative(firstOf(data, base, ["hungerDepletionRateDecreasePercentage"], ["hungerDepletionRateDecreasePercentage"]));

    case "Thundercharger":
      return nonNegative(firstOf(data, base, ["cropsCharged"]));

    default:
      return 0;
  }
}
