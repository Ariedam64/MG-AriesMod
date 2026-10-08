// Display names of pet abilities, and which abilities the logs accept.

import { petAbilities } from "../../data";

type AbilityEntry = { name?: unknown };

/** Mutation-chance boosters driven by the weather. The game never logs them as discrete procs. */
const WEATHER_MUTATION_BOOST_IDS = new Set([
  "ProduceMutationBoost",
  "ProduceMutationBoostII",
  "ProduceMutationBoostIII",
  "DawnBoost",
  "AmberMoonBoost",
  "ThunderBoost",
  "SnowyCropMutationBoost",
  "PetMutationBoost",
  "PetMutationBoostII",
  "PetMutationBoostIII",
  // A passive chance boost the game itself never logs.
  "DawnbinderBoost",
]);

const TIER_SUFFIX = /(?:\s+|-)?(?:I|II|III|IV|V|VI|VII|VIII|IX|X)\s*$/;

/** The catalog name of an ability, or its id when the catalog has none. */
export function abilityName(id: unknown): string {
  const key = String(id ?? "");
  const name = (petAbilities as Record<string, AbilityEntry | undefined>)[key]?.name;
  return typeof name === "string" && name.trim() ? name : key;
}

/** The name without its roman numeral tier: "Coin Finder III" reads "Coin Finder". */
export function abilityNameWithoutLevel(id: unknown): string {
  return abilityName(id).replace(TIER_SUFFIX, "").trim();
}

/**
 * Every pet ability id the catalog knows, minus the weather mutation boosters.
 *
 * Read on demand, never frozen at import: at document-start the live catalog
 * has not arrived, and a set captured then stayed pinned to the bundled copy
 * for the whole session, so every ability shipped since (Double Hatch II, the
 * Thunder, Dawn and Amber lines: 19 of them) never reached the logs. The set
 * is rebuilt only when the catalog gains or loses entries.
 */
let loggableCache: { count: number; ids: Set<string> } | null = null;

export function isLoggableAbility(id: string): boolean {
  return loggableIds().has(id);
}

function loggableIds(): Set<string> {
  const keys = Object.keys(petAbilities);
  if (!loggableCache || loggableCache.count !== keys.length) {
    loggableCache = { count: keys.length, ids: new Set(keys.filter((id) => !WEATHER_MUTATION_BOOST_IDS.has(id))) };
  }
  return loggableCache.ids;
}

/** For the check script: the ids the log ingestion currently accepts. */
export function getLoggablePetAbilityIds(): Set<string> {
  return new Set(loggableIds());
}
