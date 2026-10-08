// The Team Builder's goal categories: which abilities serve which goal, how
// many slots a team for it fills, and which other goals can pad its empty
// slots. Pure data over real ability ids; the ranking lives in teamBuilder.ts.

export type Category = {
  id: string;
  label: string;
  /** A terse (~4-9 char) name tried first for the saved team name, e.g. "Plant" for Plant Growth Speed: short enough that a merge ("Plant + Egg") or a weather tag ("Amber (Moon)") still usually fits the game's 16-char team name limit, unlike the full label. */
  shortLabel: string;
  icon: string;
  /** Ability ids for this goal, best tier first. */
  abilityIds: string[];
  /** False for categories whose abilities are all action-triggered (hatchEgg/sellAllCrops/sellPet/harvest): no AFK variant is possible. */
  afkCapable: boolean;
  /**
   * A weather-exclusive category's id for its general (non-weather) counterpart.
   * When set and this category doesn't fill all 3 slots on its own (e.g. only
   * one owned pet has ThunderPlantGrowthBoost), the remaining slots are padded
   * with the parent category's own best candidates: still the same overall
   * goal (plant growth speed), just without the weather requirement, rather
   * than leaving 1-2 slots empty.
   */
  paddingParentId?: string;
  /**
   * Real pets to fill for this category: defaults to 3. Pet XP is the one
   * exception: its abilities boost whichever pets are active, so the point
   * is 1-2 dedicated XP-boosters plus a genuinely empty slot left for
   * whatever pet you're actually trying to level up, not a 3rd booster.
   */
  maxTeamSlots?: number;
  /**
   * Other category ids that fire on the exact same player action (e.g.
   * Sell Boost and Crop Refund both fire on "sell all crops"; Double Hatch,
   * Max Strength Boost, Hatch XP Boost and Pet Mutation Boost all fire on
   * hatching an egg). When this category doesn't fill all its slots on its
   * own, the rest are padded with these siblings' best pets: one team
   * gets the benefit of every ability that triggers on that single action,
   * instead of showing several separate teams that each waste slots.
   * Deliberately not used for "playerActivated" abilities like DawnCapture/
   * Thundercharger: those are two distinct manual buttons, not one shared
   * action, so stacking them doesn't make the same kind of sense.
   */
  paddingSiblingIds?: string[];
};

// Grouping of already-real ability ids into goal categories, same pattern as
// getAbilityChipColors() in abilityChipColors.ts. This hardcodes a UI grouping,
// not a game value (no probabilities/prices/durations are invented here).
// Every one of the catalog's 81 ability ids is accounted for below, except
// "Copycat" (dynamically copies whatever ability a nearby pet has: no fixed
// goal to rank it against).
// Any ability whose baseParameters carry a requiredWeather is only useful
// while that exact weather is active, which is not guaranteed, so it gets its own
// category (icon/label calls out which weather) instead of being ranked
// together with the unconditional version of the same effect, and it's
// never afkCapable even when its trigger is "continuous": the trigger just
// means "no click needed", it doesn't mean the weather will show up while
// you're away.
export const CATEGORIES: Category[] = [
  { id: "cropSize", label: "Crop Size", shortLabel: "Size", icon: "📏", afkCapable: true,
    abilityIds: ["ProduceScaleBoostIII", "ProduceScaleBoostII", "ProduceScaleBoost"] },
  { id: "cropSizeFrost", label: "Crop Size (Frost)", shortLabel: "Size", icon: "📏❄️", afkCapable: false,
    abilityIds: ["SnowyCropSizeBoost"], paddingParentId: "cropSize" },

  { id: "plantGrowth", label: "Plant Growth Speed", shortLabel: "Plant", icon: "🌱", afkCapable: true,
    abilityIds: ["PlantGrowthBoostIII", "PlantGrowthBoostII", "PlantGrowthBoost"] },
  { id: "plantGrowthFrost", label: "Plant Growth Speed (Frost)", shortLabel: "Plant", icon: "🌱❄️", afkCapable: false,
    abilityIds: ["SnowyPlantGrowthBoost"], paddingParentId: "plantGrowth" },
  { id: "plantGrowthDawn", label: "Plant Growth Speed (Dawn)", shortLabel: "Plant", icon: "🌱🌅", afkCapable: false,
    abilityIds: ["DawnPlantGrowthBoost"], paddingParentId: "plantGrowth" },
  { id: "plantGrowthAmber", label: "Plant Growth Speed (Amber Moon)", shortLabel: "Plant", icon: "🌱🌙", afkCapable: false,
    abilityIds: ["AmberPlantGrowthBoost"], paddingParentId: "plantGrowth" },
  { id: "plantGrowthThunder", label: "Plant Growth Speed (Thunderstorm)", shortLabel: "Plant", icon: "🌱⚡", afkCapable: false,
    abilityIds: ["ThunderPlantGrowthBoost"], paddingParentId: "plantGrowth" },

  // Ability ids/tier names here are the game's own naming, not ours: despite
  // the "II" suffix, EggGrowthBoostII is the strongest tier (11min reduction
  // per baseParameters.eggGrowthTimeReductionMinutes): EggGrowthBoostII_NEW
  // (9min) is the actual mid tier. Don't "fix" this ordering back to
  // alphabetical/numeral without re-checking baseParameters.
  { id: "eggGrowth", label: "Egg Growth Speed", shortLabel: "Egg", icon: "🥚", afkCapable: true,
    abilityIds: ["EggGrowthBoostII", "EggGrowthBoostII_NEW", "EggGrowthBoost"] },
  { id: "eggGrowthFrost", label: "Egg Growth Speed (Frost)", shortLabel: "Egg", icon: "🥚❄️", afkCapable: false,
    abilityIds: ["SnowyEggGrowthBoost"], paddingParentId: "eggGrowth" },
  { id: "eggGrowthThunder", label: "Egg Growth Speed (Thunderstorm)", shortLabel: "Egg", icon: "🥚⚡", afkCapable: false,
    abilityIds: ["ThunderEggGrowthBoost"], paddingParentId: "eggGrowth" },

  { id: "mutationWet", label: "Mutation: Wet", shortLabel: "Wet", icon: "💧", afkCapable: true,
    abilityIds: ["RainDance"] },
  { id: "mutationFrozen", label: "Mutation: Frozen", shortLabel: "Frozen", icon: "🧊", afkCapable: true,
    abilityIds: ["FrostGranter"] },
  { id: "mutationChilled", label: "Mutation: Chilled", shortLabel: "Chilled", icon: "❄️", afkCapable: true,
    abilityIds: ["SnowGranter"] },
  { id: "mutationChilledFrost", label: "Mutation: Chilled (Frost)", shortLabel: "Chilled", icon: "❄️❄️", afkCapable: false,
    abilityIds: ["SnowyCropMutationBoost"], paddingParentId: "mutationChilled" },
  { id: "mutationDawnlit", label: "Mutation: Dawnlit", shortLabel: "Dawnlit", icon: "🌅", afkCapable: true,
    abilityIds: ["DawnlitGranter", "DawnbinderBoost"] },
  { id: "mutationDawnlitDawn", label: "Mutation: Dawnlit (Dawn)", shortLabel: "Dawnlit", icon: "🌅🌅", afkCapable: false,
    abilityIds: ["DawnKisser", "DawnBoost"], paddingParentId: "mutationDawnlit" },
  { id: "mutationAmbershine", label: "Mutation: Ambershine", shortLabel: "Amber", icon: "🌙", afkCapable: true,
    abilityIds: ["AmberlitGranter"] },
  { id: "mutationAmbershineAmber", label: "Mutation: Ambershine (Amber Moon)", shortLabel: "Amber", icon: "🌙🌙", afkCapable: false,
    abilityIds: ["MoonKisser", "AmberMoonBoost"], paddingParentId: "mutationAmbershine" },
  { id: "mutationGold", label: "Mutation: Gold", shortLabel: "Gold", icon: "✨", afkCapable: true,
    abilityIds: ["GoldGranter"] },
  { id: "mutationRainbow", label: "Mutation: Rainbow", shortLabel: "Rainbow", icon: "🌈", afkCapable: true,
    abilityIds: ["RainbowGranter"] },
  { id: "mutationThunderstruck", label: "Mutation: Thunderstruck", shortLabel: "TStruck", icon: "⚡", afkCapable: true,
    abilityIds: ["ThunderstruckGranter"] },
  { id: "mutationThunderstruckThunder", label: "Mutation: Thunderstruck (Thunderstorm)", shortLabel: "TStruck", icon: "⚡⚡", afkCapable: false,
    abilityIds: ["Thunderbloom", "ThunderBoost"], paddingParentId: "mutationThunderstruck" },
  // Generic weather-mutation chance boost: unlike its Snowy/Dawn/Amber/Thunder
  // siblings above, ProduceMutationBoost has no requiredWeather in
  // baseParameters: it applies regardless of which weather is active, which
  // makes it one of the more reliable AFK picks in the whole catalog.
  { id: "mutationChanceGeneric", label: "Mutation Chance Boost (any weather)", shortLabel: "MutBoost", icon: "🎲", afkCapable: true,
    abilityIds: ["ProduceMutationBoostIII", "ProduceMutationBoostII", "ProduceMutationBoost"] },

  { id: "coins", label: "Coins", shortLabel: "Coins", icon: "🪙", afkCapable: true,
    abilityIds: ["CoinFinderIII", "CoinFinderII", "CoinFinderI"] },
  { id: "coinsFrost", label: "Coins (Frost)", shortLabel: "Coins", icon: "🪙❄️", afkCapable: false,
    abilityIds: ["SnowyCoinFinder"], paddingParentId: "coins" },
  { id: "coinsDawn", label: "Coins (Dawn)", shortLabel: "Coins", icon: "🪙🌅", afkCapable: false,
    abilityIds: ["DawnCoinFinder"], paddingParentId: "coins" },
  { id: "coinsThunder", label: "Coins (Thunderstorm)", shortLabel: "Coins", icon: "🪙⚡", afkCapable: false,
    abilityIds: ["ThunderCoinFinder"], paddingParentId: "coins" },
  { id: "produceEater", label: "Crop Eater (auto-sell)", shortLabel: "CropEater", icon: "🍽️", afkCapable: true,
    abilityIds: ["ProduceEater"] },
  // One category per tier rather than a merged "Seeds" bucket: unlike
  // CoinFinder/SellBoost (where a higher tier is strictly the same effect,
  // just bigger), SeedFinder's baseParameters carry no magnitude to compare
  // tiers by: each tier is its own goal, not a strict upgrade of the last.
  { id: "seedFinderI", label: "Seed Finder I", shortLabel: "Seed I", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderI"] },
  { id: "seedFinderII", label: "Seed Finder II", shortLabel: "Seed II", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderII"] },
  { id: "seedFinderIII", label: "Seed Finder III", shortLabel: "Seed III", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderIII"] },
  { id: "seedFinderIV", label: "Seed Finder IV", shortLabel: "Seed IV", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderIV"] },

  // Pet XP boosts whichever pets are active: the point is 1-2 dedicated
  // boosters plus a slot deliberately left empty for whatever pet you're
  // actually trying to level, so maxTeamSlots caps at 2 instead of 3.
  { id: "petXp", label: "Pet XP", shortLabel: "Pet XP", icon: "📈", afkCapable: true, maxTeamSlots: 2,
    abilityIds: ["PetXpBoostIII", "PetXpBoostII", "PetXpBoost"] },
  { id: "petXpFrost", label: "Pet XP (Frost)", shortLabel: "Pet XP", icon: "📈❄️", afkCapable: false, maxTeamSlots: 2,
    abilityIds: ["SnowyPetXpBoost"], paddingParentId: "petXp" },
  { id: "petXpDawn", label: "Pet XP (Dawn)", shortLabel: "Pet XP", icon: "📈🌅", afkCapable: false, maxTeamSlots: 2,
    abilityIds: ["DawnXpBoost"], paddingParentId: "petXp" },
  { id: "petXpThunder", label: "Pet XP (Thunderstorm)", shortLabel: "Pet XP", icon: "📈⚡", afkCapable: false, maxTeamSlots: 2,
    abilityIds: ["ThunderXpBoost"], paddingParentId: "petXp" },

  // Split out of a single "Hatch Prep" bucket: these 4 abilities all fire on
  // hatchEgg but do unrelated things (duplicate the hatch, boost the new
  // pet's max strength, give it bonus XP, or boost its gold/rainbow chance).
  // Merged under one tier-ranked list, DoubleHatch (ranked first) silently
  // crowded out every other ability's pets from ever being suggested. But
  // they all still fire together on the same hatch, so each pads from the
  // other three when it doesn't fill its own slots alone.
  // Sibling padding order follows a value ranking (best first), not
  // declaration order: Max Strength Boost (raises the pet's actual STR
  // ceiling, which everything else here is ranked by) > Double Hatch
  // (a whole extra pet) > Pet Mutation Boost (nice-to-have gold/rainbow
  // odds) > Hatch XP Boost (just a shortcut to XP you'd get from feeding
  // anyway: the weakest of the four).
  { id: "doubleHatch", label: "Double Hatch", shortLabel: "2xHatch", icon: "🐣", afkCapable: false,
    abilityIds: ["DoubleHatch"], paddingSiblingIds: ["maxStrengthBoost", "petMutationBoost", "hatchXpBoost"] },
  { id: "maxStrengthBoost", label: "Max Strength Boost", shortLabel: "MaxStr", icon: "💪", afkCapable: false,
    abilityIds: ["PetHatchSizeBoostIII", "PetHatchSizeBoostII", "PetHatchSizeBoost"], paddingSiblingIds: ["doubleHatch", "petMutationBoost", "hatchXpBoost"] },
  { id: "hatchXpBoost", label: "Hatch XP Boost", shortLabel: "HatchXP", icon: "🎓", afkCapable: false,
    abilityIds: ["PetAgeBoostIII", "PetAgeBoostII", "PetAgeBoost"], paddingSiblingIds: ["maxStrengthBoost", "doubleHatch", "petMutationBoost"] },
  { id: "petMutationBoost", label: "Pet Mutation Boost", shortLabel: "PetMut", icon: "🎲", afkCapable: false,
    abilityIds: ["PetMutationBoostIII", "PetMutationBoostII", "PetMutationBoost"], paddingSiblingIds: ["maxStrengthBoost", "doubleHatch", "hatchXpBoost"] },
  // Split out of a single "Sell Session" bucket: DoubleHarvest fires on
  // `harvest` (not selling at all), ProduceRefund and SellBoost fire on
  // `sellAllCrops`, and PetRefund fires on `sellPet`: three different
  // player actions, so three different categories rather than one vague one.
  { id: "doubleHarvest", label: "Double Harvest", shortLabel: "2xHarv", icon: "🌾✂️", afkCapable: false,
    abilityIds: ["DoubleHarvest"] },
  // Crop Refund ranks above Sell Boost: a flat % more coins is good, but
  // getting an expensive crop back outright is worth more when it's a
  // high-value one: only matters when a category needs padding from more
  // than one sibling, but keep the declared order consistent regardless.
  { id: "cropRefund", label: "Crop Refund", shortLabel: "Refund", icon: "♻️", afkCapable: false,
    abilityIds: ["ProduceRefund"], paddingSiblingIds: ["sellBoost"] },
  { id: "sellBoost", label: "Sell Boost", shortLabel: "Sell", icon: "💰", afkCapable: false,
    abilityIds: ["SellBoostIV", "SellBoostIII", "SellBoostII", "SellBoostI"], paddingSiblingIds: ["cropRefund"] },
  { id: "petRefund", label: "Pet Refund", shortLabel: "PetRfnd", icon: "🔁", afkCapable: false,
    abilityIds: ["PetRefundII", "PetRefund"] },

  // playerActivated (manual click + cooldown): never AFK, distinct from the
  // Dawnlit/Thunderstruck mutation pipelines since they convert already-
  // mutated crops into a separate resource rather than helping crops mutate.
  { id: "dawnCapsules", label: "Dawn Capsules", shortLabel: "Capsules", icon: "🌇", afkCapable: false,
    abilityIds: ["DawnCapture"] },
  { id: "thundercharge", label: "Thundercharge", shortLabel: "Charge", icon: "🔌", afkCapable: false,
    abilityIds: ["Thundercharger"] },
];

export const CATEGORIES_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));
