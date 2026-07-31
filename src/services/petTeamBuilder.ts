// src/services/petTeamBuilder.ts
// Pure logic (no DOM) for the Pets → Team Builder tab: groups owned pets
// into ready-to-save teams of up to 3, one Active variant per goal category
// and, where the category's abilities can fire without any player action,
// one AFK variant that always reserves a slot for a hunger-sustain pet.

import { petAbilities } from "../data";
import { getPetMaxStrength } from "../utils/petCalcul";
import type { InventoryPet } from "./pets";

export type TeamBuilderMode = "active" | "afk";

// abilityId is the category's best-tier ability id — the UI resolves it to
// a real color via getAbilityChipColors() (already used for the ability
// dots), so the categorization here stays pure/DOM-free.
export type MergedCategory = { id: string; label: string; icon: string; abilityId: string };

// One team can serve several categories at once (e.g. a Turtle team hits
// both Plant Growth Speed and Egg Growth Speed) — categories is never empty,
// and has more than one entry once buildSuggestedTeams merges teams that
// ended up with the exact same pets.
export type SuggestedTeam = {
  categories: MergedCategory[];
  mode: TeamBuilderMode;
  petIds: string[];
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
  { id: "cropSize", label: "Crop Size", icon: "📏", afkCapable: true,
    abilityIds: ["ProduceScaleBoostIII", "ProduceScaleBoostII", "ProduceScaleBoost"] },
  { id: "cropSizeFrost", label: "Crop Size (Frost)", icon: "📏❄️", afkCapable: false,
    abilityIds: ["SnowyCropSizeBoost"], paddingParentId: "cropSize" },

  { id: "plantGrowth", label: "Plant Growth Speed", icon: "🌱", afkCapable: true,
    abilityIds: ["PlantGrowthBoostIII", "PlantGrowthBoostII", "PlantGrowthBoost"] },
  { id: "plantGrowthFrost", label: "Plant Growth Speed (Frost)", icon: "🌱❄️", afkCapable: false,
    abilityIds: ["SnowyPlantGrowthBoost"], paddingParentId: "plantGrowth" },
  { id: "plantGrowthDawn", label: "Plant Growth Speed (Dawn)", icon: "🌱🌅", afkCapable: false,
    abilityIds: ["DawnPlantGrowthBoost"], paddingParentId: "plantGrowth" },
  { id: "plantGrowthAmber", label: "Plant Growth Speed (Amber Moon)", icon: "🌱🌙", afkCapable: false,
    abilityIds: ["AmberPlantGrowthBoost"], paddingParentId: "plantGrowth" },
  { id: "plantGrowthThunder", label: "Plant Growth Speed (Thunderstorm)", icon: "🌱⚡", afkCapable: false,
    abilityIds: ["ThunderPlantGrowthBoost"], paddingParentId: "plantGrowth" },

  // Ability ids/tier names here are the game's own naming, not ours: despite
  // the "II" suffix, EggGrowthBoostII is the strongest tier (11min reduction
  // per baseParameters.eggGrowthTimeReductionMinutes) — EggGrowthBoostII_NEW
  // (9min) is the actual mid tier. Don't "fix" this ordering back to
  // alphabetical/numeral without re-checking baseParameters.
  { id: "eggGrowth", label: "Egg Growth Speed", icon: "🥚", afkCapable: true,
    abilityIds: ["EggGrowthBoostII", "EggGrowthBoostII_NEW", "EggGrowthBoost"] },
  { id: "eggGrowthFrost", label: "Egg Growth Speed (Frost)", icon: "🥚❄️", afkCapable: false,
    abilityIds: ["SnowyEggGrowthBoost"], paddingParentId: "eggGrowth" },
  { id: "eggGrowthThunder", label: "Egg Growth Speed (Thunderstorm)", icon: "🥚⚡", afkCapable: false,
    abilityIds: ["ThunderEggGrowthBoost"], paddingParentId: "eggGrowth" },

  { id: "mutationWet", label: "Mutation: Wet", icon: "💧", afkCapable: true,
    abilityIds: ["RainDance"] },
  { id: "mutationFrozen", label: "Mutation: Frozen", icon: "🧊", afkCapable: true,
    abilityIds: ["FrostGranter"] },
  { id: "mutationChilled", label: "Mutation: Chilled", icon: "❄️", afkCapable: true,
    abilityIds: ["SnowGranter"] },
  { id: "mutationChilledFrost", label: "Mutation: Chilled (Frost)", icon: "❄️❄️", afkCapable: false,
    abilityIds: ["SnowyCropMutationBoost"], paddingParentId: "mutationChilled" },
  { id: "mutationDawnlit", label: "Mutation: Dawnlit", icon: "🌅", afkCapable: true,
    abilityIds: ["DawnlitGranter", "DawnbinderBoost"] },
  { id: "mutationDawnlitDawn", label: "Mutation: Dawnlit (Dawn)", icon: "🌅🌅", afkCapable: false,
    abilityIds: ["DawnKisser", "DawnBoost"], paddingParentId: "mutationDawnlit" },
  { id: "mutationAmbershine", label: "Mutation: Ambershine", icon: "🌙", afkCapable: true,
    abilityIds: ["AmberlitGranter"] },
  { id: "mutationAmbershineAmber", label: "Mutation: Ambershine (Amber Moon)", icon: "🌙🌙", afkCapable: false,
    abilityIds: ["MoonKisser", "AmberMoonBoost"], paddingParentId: "mutationAmbershine" },
  { id: "mutationGold", label: "Mutation: Gold", icon: "✨", afkCapable: true,
    abilityIds: ["GoldGranter"] },
  { id: "mutationRainbow", label: "Mutation: Rainbow", icon: "🌈", afkCapable: true,
    abilityIds: ["RainbowGranter"] },
  { id: "mutationThunderstruck", label: "Mutation: Thunderstruck", icon: "⚡", afkCapable: true,
    abilityIds: ["ThunderstruckGranter"] },
  { id: "mutationThunderstruckThunder", label: "Mutation: Thunderstruck (Thunderstorm)", icon: "⚡⚡", afkCapable: false,
    abilityIds: ["Thunderbloom", "ThunderBoost"], paddingParentId: "mutationThunderstruck" },
  // Generic weather-mutation chance boost — unlike its Snowy/Dawn/Amber/Thunder
  // siblings above, ProduceMutationBoost has no requiredWeather in
  // baseParameters: it applies regardless of which weather is active, which
  // makes it one of the more reliable AFK picks in the whole catalog.
  { id: "mutationChanceGeneric", label: "Mutation Chance Boost (any weather)", icon: "🎲", afkCapable: true,
    abilityIds: ["ProduceMutationBoostIII", "ProduceMutationBoostII", "ProduceMutationBoost"] },

  { id: "coins", label: "Coins", icon: "🪙", afkCapable: true,
    abilityIds: ["CoinFinderIII", "CoinFinderII", "CoinFinderI"] },
  { id: "coinsFrost", label: "Coins (Frost)", icon: "🪙❄️", afkCapable: false,
    abilityIds: ["SnowyCoinFinder"], paddingParentId: "coins" },
  { id: "coinsDawn", label: "Coins (Dawn)", icon: "🪙🌅", afkCapable: false,
    abilityIds: ["DawnCoinFinder"], paddingParentId: "coins" },
  { id: "coinsThunder", label: "Coins (Thunderstorm)", icon: "🪙⚡", afkCapable: false,
    abilityIds: ["ThunderCoinFinder"], paddingParentId: "coins" },
  { id: "produceEater", label: "Crop Eater (auto-sell)", icon: "🍽️", afkCapable: true,
    abilityIds: ["ProduceEater"] },
  // One category per tier rather than a merged "Seeds" bucket: unlike
  // CoinFinder/SellBoost (where a higher tier is strictly the same effect,
  // just bigger), SeedFinder's baseParameters carry no magnitude to compare
  // tiers by — each tier is its own goal, not a strict upgrade of the last.
  { id: "seedFinderI", label: "Seed Finder I", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderI"] },
  { id: "seedFinderII", label: "Seed Finder II", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderII"] },
  { id: "seedFinderIII", label: "Seed Finder III", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderIII"] },
  { id: "seedFinderIV", label: "Seed Finder IV", icon: "🌾", afkCapable: true,
    abilityIds: ["SeedFinderIV"] },

  // Pet XP boosts whichever pets are active — the point is 1-2 dedicated
  // boosters plus a slot deliberately left empty for whatever pet you're
  // actually trying to level, so maxTeamSlots caps at 2 instead of 3.
  { id: "petXp", label: "Pet XP", icon: "📈", afkCapable: true, maxTeamSlots: 2,
    abilityIds: ["PetXpBoostIII", "PetXpBoostII", "PetXpBoost"] },
  { id: "petXpFrost", label: "Pet XP (Frost)", icon: "📈❄️", afkCapable: false, maxTeamSlots: 2,
    abilityIds: ["SnowyPetXpBoost"], paddingParentId: "petXp" },
  { id: "petXpDawn", label: "Pet XP (Dawn)", icon: "📈🌅", afkCapable: false, maxTeamSlots: 2,
    abilityIds: ["DawnXpBoost"], paddingParentId: "petXp" },
  { id: "petXpThunder", label: "Pet XP (Thunderstorm)", icon: "📈⚡", afkCapable: false, maxTeamSlots: 2,
    abilityIds: ["ThunderXpBoost"], paddingParentId: "petXp" },

  // Split out of a single "Hatch Prep" bucket: these 4 abilities all fire on
  // hatchEgg but do unrelated things (duplicate the hatch, boost the new
  // pet's max strength, give it bonus XP, or boost its gold/rainbow chance).
  // Merged under one tier-ranked list, DoubleHatch (ranked first) silently
  // crowded out every other ability's pets from ever being suggested.
  { id: "doubleHatch", label: "Double Hatch", icon: "🐣", afkCapable: false,
    abilityIds: ["DoubleHatch"] },
  { id: "maxStrengthBoost", label: "Max Strength Boost", icon: "💪", afkCapable: false,
    abilityIds: ["PetHatchSizeBoostIII", "PetHatchSizeBoostII", "PetHatchSizeBoost"] },
  { id: "hatchXpBoost", label: "Hatch XP Boost", icon: "🎓", afkCapable: false,
    abilityIds: ["PetAgeBoostIII", "PetAgeBoostII", "PetAgeBoost"] },
  { id: "petMutationBoost", label: "Pet Mutation Boost", icon: "🎲", afkCapable: false,
    abilityIds: ["PetMutationBoostIII", "PetMutationBoostII", "PetMutationBoost"] },
  // Split out of a single "Sell Session" bucket: DoubleHarvest fires on
  // `harvest` (not selling at all), ProduceRefund and SellBoost fire on
  // `sellAllCrops`, and PetRefund fires on `sellPet` — three different
  // player actions, so three different categories rather than one vague one.
  { id: "doubleHarvest", label: "Double Harvest", icon: "🌾✂️", afkCapable: false,
    abilityIds: ["DoubleHarvest"] },
  { id: "cropRefund", label: "Crop Refund", icon: "♻️", afkCapable: false,
    abilityIds: ["ProduceRefund"] },
  { id: "sellBoost", label: "Sell Boost", icon: "💰", afkCapable: false,
    abilityIds: ["SellBoostIV", "SellBoostIII", "SellBoostII", "SellBoostI"] },
  { id: "petRefund", label: "Pet Refund", icon: "🔁", afkCapable: false,
    abilityIds: ["PetRefundII", "PetRefund"] },

  // playerActivated (manual click + cooldown) — never AFK, distinct from the
  // Dawnlit/Thunderstruck mutation pipelines since they convert already-
  // mutated crops into a separate resource rather than helping crops mutate.
  { id: "dawnCapsules", label: "Dawn Capsules", icon: "🌇", afkCapable: false,
    abilityIds: ["DawnCapture"] },
  { id: "thundercharge", label: "Thundercharge", icon: "🔌", afkCapable: false,
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

export function getBestSustainPet(pets: InventoryPet[]): InventoryPet | null {
  let best: InventoryPet | null = null;
  let bestScore = 0;
  let bestStrength = -1;
  for (const pet of pets) {
    const score = sustainScore(pet);
    if (score <= 0) continue;
    const strength = getPetMaxStrength(pet);
    if (score > bestScore || (score === bestScore && strength > bestStrength)) {
      best = pet;
      bestScore = score;
      bestStrength = strength;
    }
  }
  return best;
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
  const ranked = pets
    .map((pet) => {
      const abilities = petAbilityIds(pet);
      const relevant = afkOnly ? abilities.filter(isAfkEligibleAbility) : abilities;
      return { pet, tierIndex: bestTierIndex(category, relevant), strength: getPetMaxStrength(pet) };
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
    if (a.tierIndex !== b.tierIndex) return a.tierIndex - b.tierIndex;
    if (a.strength !== b.strength) return b.strength - a.strength;
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
    } else {
      byKey.set(key, { ...team, categories: [...team.categories] });
      order.push(key);
    }
  }
  return order.map((key) => byKey.get(key)!);
}

const CATEGORIES_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function buildSuggestedTeams(pets: InventoryPet[]): TeamBuilderResult {
  const sustainPet = getBestSustainPet(pets);
  const teams: SuggestedTeam[] = [];
  const usedIds = new Set<string>();
  if (sustainPet) usedIds.add(sustainPet.id);

  for (const category of CATEGORIES) {
    const categoryRef: MergedCategory = { id: category.id, label: category.label, icon: category.icon, abilityId: category.abilityIds[0] };
    // Everything below fills at most this many *real* pets; the rest of the
    // 3 team slots (all of them, for Pet XP's case) stay genuinely empty —
    // slicing to fewer than 3 already leaves them unfilled when saved.
    const maxSlots = category.maxTeamSlots ?? 3;

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
        activeCandidates = [...activeCandidates, ...padding].slice(0, maxSlots);
      }
    }
    activeCandidates.forEach((p) => usedIds.add(p.id));
    if (activeCandidates.length) {
      teams.push({
        categories: [categoryRef],
        mode: "active",
        petIds: activeCandidates.map((p) => p.id),
      });
    }

    if (category.afkCapable && sustainPet) {
      const afkCandidates = rankCandidates(category, pets, true)
        .filter((p) => p.id !== sustainPet.id)
        .slice(0, maxSlots - 1);
      afkCandidates.forEach((p) => usedIds.add(p.id));
      if (afkCandidates.length) {
        teams.push({
          categories: [categoryRef],
          mode: "afk",
          petIds: [...afkCandidates.map((p) => p.id), sustainPet.id],
        });
      }
    }

    // A leftover empty slot (fewer than maxSlots real candidates even after
    // weather-parent padding) can just as well be filled by the sustain
    // pet instead of staying empty — offered as an AFK variant, since
    // "abilityIsPassive() + a pet that keeps the team fed" is exactly what
    // AFK means. Only when the abilities actually in play are passive
    // (this category, or its padding parent for weather-exclusive ones):
    // an empty slot on e.g. Double Hatch shouldn't get labeled AFK just
    // because a feeder pet could technically sit there doing nothing.
    const afkRelevant = category.afkCapable
      || (category.paddingParentId != null && !!CATEGORIES_BY_ID.get(category.paddingParentId)?.afkCapable);
    if (
      afkRelevant && sustainPet && activeCandidates.length > 0 && activeCandidates.length < maxSlots &&
      !activeCandidates.some((p) => p.id === sustainPet.id)
    ) {
      usedIds.add(sustainPet.id);
      teams.push({
        categories: [categoryRef],
        mode: "afk",
        petIds: [...activeCandidates.map((p) => p.id), sustainPet.id],
      });
    }
  }

  return {
    teams: mergeTeamsWithSamePets(teams),
    sustainPet,
    unusedPets: findUnusedPets(pets, usedIds, sustainPet),
  };
}
