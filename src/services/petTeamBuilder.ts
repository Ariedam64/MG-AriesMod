// src/services/petTeamBuilder.ts
// Pure logic (no DOM) for the Pets → Team Builder tab: groups owned pets
// into ready-to-save teams of up to 3, one Active variant per goal category
// and, where the category's abilities can fire without any player action,
// one AFK variant that always reserves a slot for a hunger-sustain pet.

import { petAbilities } from "../data";
import { getPetMaxStrength } from "../utils/petCalcul";
import {
  computeAbilityStatsAtRatio,
  getAbilityRawParameters,
  getStrengthRatio,
} from "./petAbilityStats";
import { computeTeamAutonomy } from "./petTeamStats";
import type { InventoryPet } from "./pets";

export type TeamBuilderMode = "active" | "afk";

// abilityId is the category's best-tier ability id — the UI resolves it to
// a real color via getAbilityChipColors() (already used for the ability
// dots), so the categorization here stays pure/DOM-free.
export type MergedCategory = { id: string; label: string; shortLabel: string; icon: string; abilityId: string };

// One team can serve several categories at once (e.g. a Turtle team hits
// both Plant Growth Speed and Egg Growth Speed) — categories is never empty,
// and has more than one entry once buildSuggestedTeams merges teams that
// ended up with the exact same pets.
export type SuggestedTeam = {
  categories: MergedCategory[];
  mode: TeamBuilderMode;
  petIds: string[];
  /**
   * Ability ids whose stats this team should report. Beyond its own category,
   * this includes any sibling category the team was padded from — a Sell
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
  /** True if none of its abilities map to any category and it isn't a sustain candidate — nothing to rank it against. */
  untracked: boolean;
};

export type TeamBuilderResult = {
  teams: SuggestedTeam[];
  sustainPet: InventoryPet | null;
  unusedPets: UnusedPetInfo[];
};

type Category = {
  id: string;
  label: string;
  /** A terse (~4-9 char) name tried first for the saved team name, e.g. "Plant" for Plant Growth Speed — short enough that a merge ("Plant + Egg") or a weather tag ("Amber (Moon)") still usually fits the game's 16-char team name limit, unlike the full label. */
  shortLabel: string;
  icon: string;
  /** Ability ids for this goal, best tier first. */
  abilityIds: string[];
  /** False for categories whose abilities are all action-triggered (hatchEgg/sellAllCrops/sellPet/harvest) — no AFK variant is possible. */
  afkCapable: boolean;
  /**
   * A weather-exclusive category's id for its general (non-weather) counterpart.
   * When set and this category doesn't fill all 3 slots on its own (e.g. only
   * one owned pet has ThunderPlantGrowthBoost), the remaining slots are padded
   * with the parent category's own best candidates — still the same overall
   * goal (plant growth speed), just without the weather requirement, rather
   * than leaving 1-2 slots empty.
   */
  paddingParentId?: string;
  /**
   * Real pets to fill for this category — defaults to 3. Pet XP is the one
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
   * own, the rest are padded with these siblings' best pets — one team
   * gets the benefit of every ability that triggers on that single action,
   * instead of showing several separate teams that each waste slots.
   * Deliberately not used for "playerActivated" abilities like DawnCapture/
   * Thundercharger — those are two distinct manual buttons, not one shared
   * action, so stacking them doesn't make the same kind of sense.
   */
  paddingSiblingIds?: string[];
};

// Grouping of already-real ability ids into goal categories, same pattern as
// getAbilityChipColors() in ui/menus/pets.ts — this hardcodes a UI grouping,
// not a game value (no probabilities/prices/durations are invented here).
// Every one of the catalog's 81 ability ids is accounted for below, except
// "Copycat" (dynamically copies whatever ability a nearby pet has — no fixed
// goal to rank it against).
// Any ability whose baseParameters carry a requiredWeather is only useful
// while that exact weather is active — not guaranteed, so it gets its own
// category (icon/label calls out which weather) instead of being ranked
// together with the unconditional version of the same effect, and it's
// never afkCapable even when its trigger is "continuous": the trigger just
// means "no click needed", it doesn't mean the weather will show up while
// you're away.
const CATEGORIES: Category[] = [
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
  // per baseParameters.eggGrowthTimeReductionMinutes) — EggGrowthBoostII_NEW
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
  // Generic weather-mutation chance boost — unlike its Snowy/Dawn/Amber/Thunder
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
  // tiers by — each tier is its own goal, not a strict upgrade of the last.
  { id: "seedFinderI", label: "Seed Finder I", shortLabel: "Seed I", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderI"] },
  { id: "seedFinderII", label: "Seed Finder II", shortLabel: "Seed II", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderII"] },
  { id: "seedFinderIII", label: "Seed Finder III", shortLabel: "Seed III", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderIII"] },
  { id: "seedFinderIV", label: "Seed Finder IV", shortLabel: "Seed IV", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderIV"] },

  // Pet XP boosts whichever pets are active — the point is 1-2 dedicated
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
  // crowded out every other ability's pets from ever being suggested — but
  // they all still fire together on the same hatch, so each pads from the
  // other three when it doesn't fill its own slots alone.
  // Sibling padding order follows a value ranking (best first), not
  // declaration order: Max Strength Boost (raises the pet's actual STR
  // ceiling, which everything else here is ranked by) > Double Hatch
  // (a whole extra pet) > Pet Mutation Boost (nice-to-have gold/rainbow
  // odds) > Hatch XP Boost (just a shortcut to XP you'd get from feeding
  // anyway — the weakest of the four).
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
  // `sellAllCrops`, and PetRefund fires on `sellPet` — three different
  // player actions, so three different categories rather than one vague one.
  { id: "doubleHarvest", label: "Double Harvest", shortLabel: "2xHarv", icon: "🌾✂️", afkCapable: false,
    abilityIds: ["DoubleHarvest"] },
  // Crop Refund ranks above Sell Boost: a flat % more coins is good, but
  // getting an expensive crop back outright is worth more when it's a
  // high-value one — only matters when a category needs padding from more
  // than one sibling, but keep the declared order consistent regardless.
  { id: "cropRefund", label: "Crop Refund", shortLabel: "Refund", icon: "♻️", afkCapable: false,
    abilityIds: ["ProduceRefund"], paddingSiblingIds: ["sellBoost"] },
  { id: "sellBoost", label: "Sell Boost", shortLabel: "Sell", icon: "💰", afkCapable: false,
    abilityIds: ["SellBoostIV", "SellBoostIII", "SellBoostII", "SellBoostI"], paddingSiblingIds: ["cropRefund"] },
  { id: "petRefund", label: "Pet Refund", shortLabel: "PetRfnd", icon: "🔁", afkCapable: false,
    abilityIds: ["PetRefundII", "PetRefund"] },

  // playerActivated (manual click + cooldown) — never AFK, distinct from the
  // Dawnlit/Thunderstruck mutation pipelines since they convert already-
  // mutated crops into a separate resource rather than helping crops mutate.
  { id: "dawnCapsules", label: "Dawn Capsules", shortLabel: "Capsules", icon: "🌇", afkCapable: false,
    abilityIds: ["DawnCapture"] },
  { id: "thundercharge", label: "Thundercharge", shortLabel: "Charge", icon: "🔌", afkCapable: false,
    abilityIds: ["Thundercharger"] },
];

function abilityTrigger(id: string): string | undefined {
  return (petAbilities as Record<string, { trigger?: string } | undefined>)[id]?.trigger;
}

// AFK-eligible means "continuous" only — a per-tick passive proc with no
// weather requirement to wait on. "weather" trigger abilities (MoonKisser,
// DawnKisser, Thunderbloom) still need a specific weather event to actually
// fire, which isn't guaranteed to happen while AFK, so they're treated the
// same as any other action-gated ability here: Active-only.
function isAfkEligibleAbility(id: string): boolean {
  return abilityTrigger(id) === "continuous";
}

// Same "match by id family" idiom already used by getAbilityChipColors() for
// this exact ability family — not a baseParameters read, since the field
// name observed there (hungerDepletionRateDecreasePercentage for HungerBoost
// in ui/menus/pets.ts's log fallback formatter) doesn't match every source,
// while the id family itself is stable.
function isHungerRestoreAbility(id: string): boolean {
  return id === "HungerRestore" || id === "HungerRestoreII" || id === "HungerRestoreIII" || id === "SnowyHungerRestore";
}
function isHungerBoostAbility(id: string): boolean {
  return id === "HungerBoost" || id === "HungerBoostII" || id === "HungerBoostIII" || id === "SnowyHungerBoost";
}

function petAbilityIds(pet: InventoryPet): string[] {
  return Array.isArray(pet.abilities) ? pet.abilities : [];
}

/** 2 = has both Restore and Boost, 1 = has one of them, 0 = no sustain ability. */
function sustainScore(pet: InventoryPet): number {
  const abilities = petAbilityIds(pet);
  const hasRestore = abilities.some(isHungerRestoreAbility);
  const hasBoost = abilities.some(isHungerBoostAbility);
  if (hasRestore && hasBoost) return 2;
  if (hasRestore || hasBoost) return 1;
  return 0;
}

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
export function getBestSustainPet(pets: InventoryPet[]): InventoryPet | null {
  return pickSustainPet(pets, null, false);
}

/**
 * Only Gold and Rainbow are worth steering around.
 *
 * Gold actively costs you something — a golden crop can no longer turn
 * Rainbow, which is worth far more — so it is avoided outright whenever an
 * equally capable granter-free pet exists. Rainbow is merely unwanted on a
 * team not built for it, so it costs a strength handicap instead: such a pet
 * wins only if it is more than GRANTER_STRENGTH_PENALTY stronger.
 *
 * Every other granter (Wet, Chilled, Frozen, Dawnlit, Ambershine,
 * Thunderstruck) is ignored on purpose. Penalising them reshuffled teams for
 * no real benefit — Ambershine Granter pets were being pushed out of unrelated
 * Dawn teams, which split one merged card into two confusing ones.
 */
const HARD_AVOID_MUTATIONS = new Set(["Gold"]);
const SOFT_AVOID_MUTATIONS = new Set(["Rainbow"]);
const GRANTER_STRENGTH_PENALTY = 10;

/** Mutations an ability grants, straight from the catalog — nothing hardcoded. */
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
function categoryGrantedMutations(category: Category): Set<string> {
  const mutations = new Set<string>();
  for (const abilityId of category.abilityIds) {
    for (const mutation of abilityGrantedMutations(abilityId)) mutations.add(mutation);
  }
  return mutations;
}

type GranterPenalty = { hardAvoidCount: number; softAvoidCount: number };

function granterPenaltyFor(pet: InventoryPet, wanted: Set<string>): GranterPenalty {
  let hardAvoidCount = 0;
  let softAvoidCount = 0;
  for (const mutation of petGrantedMutations(pet)) {
    if (wanted.has(mutation)) continue;
    if (HARD_AVOID_MUTATIONS.has(mutation)) hardAvoidCount += 1;
    else if (SOFT_AVOID_MUTATIONS.has(mutation)) softAvoidCount += 1;
  }
  return { hardAvoidCount, softAvoidCount };
}

function countUnwantedGranters(teamPets: InventoryPet[], wanted: Set<string>): GranterPenalty {
  let hardAvoidCount = 0;
  let softAvoidCount = 0;
  for (const pet of teamPets) {
    const penalty = granterPenaltyFor(pet, wanted);
    hardAvoidCount += penalty.hardAvoidCount;
    softAvoidCount += penalty.softAvoidCount;
  }
  return { hardAvoidCount, softAvoidCount };
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
    // Must actually serve the goal, and must be able to feed itself at all —
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
  // on the same ability — picking 2 Butterflies + the Ostrich over 3
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

// Two categories that both land on the exact same 3 (or 2+sustain) pets —
// e.g. a Turtle team hitting both Plant Growth Speed and Egg Growth Speed —
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

const CATEGORIES_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

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
    // 3 team slots (all of them, for Pet XP's case) stay genuinely empty —
    // slicing to fewer than 3 already leaves them unfilled when saved.
    const maxSlots = category.maxTeamSlots ?? 3;

    // Stats this team should report: its own goal first, then whatever a
    // padding pet legitimately adds on the same action.
    const focusAbilityIds: string[] = [category.abilityIds[0]];

    let activeCandidates = rankCandidates(category, pets, false).slice(0, maxSlots);
    // Weather-exclusive categories often only have one qualifying pet —
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
    // same action (sell all crops, hatch an egg, ...) — they proc from the
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
          // carry it too — that is often why it was picked — and the stats
          // layer counts whatever abilities the pets actually have.
          petIds: afkTeam.map((p) => p.id),
          focusAbilityIds: [category.abilityIds[0]],
        });
      }
    }

    // A leftover empty slot (fewer than maxSlots real candidates even after
    // weather-parent padding) can just as well be filled by the sustain
    // pet instead of staying empty — offered as an AFK variant, since
    // "abilityIsPassive() + a pet that keeps the team fed" is exactly what
    // AFK means. Only for categories that don't already get their own
    // dedicated AFK team above (category.afkCapable === true already
    // covers that — running this too produced a duplicate identical AFK
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
