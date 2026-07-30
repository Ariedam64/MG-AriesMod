// src/utils/activityLogClassification.ts
// Pure classification of activity-log entries into filter categories, keyed
// off the entry's own `.action` field (the game's own action-dispatch
// identifier, e.g. "harvest", "sellPet", "EggGrowthBoostII"). No DOM, no
// Pixi, no text/sprite parsing — every entry already carries this field, so
// classification is always exact.

export type ActionKey =
  | "all"
  | "found"
  | "buy"
  | "sell"
  | "harvest"
  | "plant"
  | "feed"
  | "hatch"
  | "water"
  | "coinFinder"
  | "seedFinder"
  | "double"
  | "eggGrowth"
  | "plantGrowth"
  | "granter"
  | "kisser"
  | "refund"
  | "boost"
  | "remove"
  | "other"
  | string;

export const ACTION_ORDER: ActionKey[] = [
  "all",
  "found",
  "buy",
  "sell",
  "harvest",
  "plant",
  "feed",
  "hatch",
  "water",
  "coinFinder",
  "seedFinder",
  "double",
  "eggGrowth",
  "plantGrowth",
  "granter",
  "kisser",
  "refund",
  "boost",
  "remove",
  "other",
];

export const ACTION_LABELS: Record<string, string> = {
  all: "All",
  found: "Finds",
  buy: "Purchases",
  sell: "Sold",
  harvest: "Harvests",
  plant: "Planted",
  feed: "Feed",
  hatch: "Hatch",
  water: "Water",
  coinFinder: "Coin Finder",
  seedFinder: "Seed Finder",
  double: "Double",
  eggGrowth: "Egg Growth",
  plantGrowth: "Plant Growth",
  granter: "Granters",
  kisser: "Kissers",
  refund: "Refunds",
  boost: "Boosts",
  remove: "Remove",
  other: "Other",
};

const ACTION_MAP: Record<string, ActionKey> = {
  purchaseDecor: "buy",
  purchaseSeed: "buy",
  purchaseEgg: "buy",
  purchaseTool: "buy",
  upgradePetHutch: "buy",
  upgradeDecorShed: "buy",
  upgradeSeedSilo: "buy",
  waterPlant: "water",
  plantSeed: "plant",
  plantGardenPlant: "plant",
  potPlant: "plant",
  removeGardenObject: "remove",
  preserve: "remove",
  harvest: "harvest",
  feedPet: "feed",
  feedPetFromTrough: "feed",
  plantEgg: "hatch",
  hatchEgg: "hatch",
  instaGrow: "boost",
  customRestock: "boost",
  spinSlotMachine: "boost",
  sellAllCrops: "sell",
  sellPet: "sell",
  logItems: "boost",
  mutationPotion: "boost",
  cropCleanser: "boost",
  dawnCapture: "boost",
  openDawnCapsule: "boost",
  thundercharge: "boost",
  replenishPotion: "boost",
  xpPotion: "boost",
  ProduceScaleBoost: "boost",
  ProduceScaleBoostII: "boost",
  ProduceScaleBoostIII: "boost",
  DoubleHarvest: "double",
  DoubleHatch: "double",
  ProduceEater: "boost",
  SellBoostI: "boost",
  SellBoostII: "boost",
  SellBoostIII: "boost",
  SellBoostIV: "boost",
  ProduceRefund: "boost",
  PlantGrowthBoost: "plantGrowth",
  PlantGrowthBoostII: "plantGrowth",
  PlantGrowthBoostIII: "plantGrowth",
  SnowyPlantGrowthBoost: "plantGrowth",
  DawnPlantGrowthBoost: "plantGrowth",
  AmberPlantGrowthBoost: "plantGrowth",
  ThunderPlantGrowthBoost: "plantGrowth",
  HungerRestore: "boost",
  HungerRestoreII: "boost",
  HungerRestoreIII: "boost",
  SnowyHungerRestore: "boost",
  GoldGranter: "granter",
  RainbowGranter: "granter",
  RainDance: "granter",
  SnowGranter: "granter",
  FrostGranter: "granter",
  DawnlitGranter: "granter",
  AmberlitGranter: "granter",
  ThunderstruckGranter: "granter",
  PetXpBoost: "boost",
  PetXpBoostII: "boost",
  PetXpBoostIII: "boost",
  SnowyPetXpBoost: "boost",
  DawnXpBoost: "boost",
  ThunderXpBoost: "boost",
  SnowyEggGrowthBoost: "eggGrowth",
  EggGrowthBoost: "eggGrowth",
  EggGrowthBoostII_NEW: "eggGrowth",
  EggGrowthBoostII: "eggGrowth",
  ThunderEggGrowthBoost: "eggGrowth",
  PetAgeBoost: "boost",
  PetAgeBoostII: "boost",
  PetAgeBoostIII: "boost",
  CoinFinderI: "coinFinder",
  CoinFinderII: "coinFinder",
  CoinFinderIII: "coinFinder",
  SnowyCoinFinder: "coinFinder",
  DawnCoinFinder: "coinFinder",
  ThunderCoinFinder: "coinFinder",
  SnowyCropSizeBoost: "boost",
  SnowyHungerBoost: "boost",
  SeedFinderI: "seedFinder",
  SeedFinderII: "seedFinder",
  SeedFinderIII: "seedFinder",
  SeedFinderIV: "seedFinder",
  PetHatchSizeBoost: "boost",
  PetHatchSizeBoostII: "boost",
  PetHatchSizeBoostIII: "boost",
  MoonKisser: "kisser",
  DawnKisser: "kisser",
  PetRefund: "refund",
  PetRefundII: "refund",
};

const ACTION_MAP_LOWER: Record<string, ActionKey> = Object.fromEntries(
  Object.entries(ACTION_MAP).map(([key, value]) => [key.toLowerCase(), value])
) as Record<string, ActionKey>;

/** Strips known ability-name suffixes/prefixes (Snowy/_NEW/roman numerals) to find a shared bucket for tiered abilities. */
export function normalizeAbilityAction(raw: string): ActionKey | null {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return null;
  let key = trimmed.replace(/^Snowy/i, "");
  key = key.replace(/_NEW$/i, "");
  key = key.replace(/(?:[_-]?(?:I|II|III|IV|V|VI|VII|VIII|IX|X)|\d+)$/i, "");
  key = key.replace(/[_-]+$/g, "");
  return key ? (key as ActionKey) : null;
}

/** Classifies an activity-log entry's `.action` field into a filter bucket. */
export function classifyEntryAction(action: string | null | undefined): ActionKey {
  const raw = String(action ?? "").trim();
  if (!raw) return "other";

  const lowered = raw.toLowerCase();
  const mapped = ACTION_MAP[raw];
  const mappedLower = ACTION_MAP_LOWER[lowered];
  const abilityKey = normalizeAbilityAction(raw);

  if (mapped) return mapped === "boost" && abilityKey ? abilityKey : mapped;
  if (mappedLower) return mappedLower === "boost" && abilityKey ? abilityKey : mappedLower;
  if (abilityKey) return abilityKey;
  return lowered || "other";
}

export function getActionLabel(action: ActionKey): string {
  const preset = ACTION_LABELS[action];
  if (preset) return preset;
  const spaced = String(action || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return String(action || "");
  return spaced
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Orders a set of present action keys per ACTION_ORDER; unknown keys are appended in encounter order. Never includes "all". */
export function mergeActions(actions: ActionKey[]): ActionKey[] {
  const seen = new Set<ActionKey>();
  const ordered: ActionKey[] = [];
  for (const key of ACTION_ORDER) {
    if (key === "all") continue;
    if (actions.includes(key) && !seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  for (const action of actions) {
    if (action === "all") continue;
    if (!seen.has(action)) {
      seen.add(action);
      ordered.push(action);
    }
  }
  return ordered;
}
