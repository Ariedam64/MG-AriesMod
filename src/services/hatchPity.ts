// src/services/hatchPity.ts
//
// Bad Luck Protection maths for eggs, derived entirely from the game catalogs.
//
// The game keeps the real counters server-side (`serverOnly.pityCounters` is
// stripped from the client payload), so the mod can only track what it sees
// hatch. Thresholds, however, are public data:
//   - per-egg rare species: `speciesPityThresholdPulls` on the egg entry;
//   - Gold / Rainbow: `baseChance` on the mutation entry.
//
// Every threshold the game ships is PITY_MULTIPLIER times the pulls its listed
// rate would average, which is how the missing species thresholds are derived
// when an egg predates the field.

import { eggCatalog, mutationCatalog, rarityRank } from "../data";

/**
 * Guarantees land at this many times the pulls the listed rate would average.
 * Stated by the developers when Bad Luck Protection shipped, and consistent
 * with every threshold in the catalog: a 5% species guarantees at 40 pulls,
 * Phoenix at 2% guarantees at 100, Gold at 1% at 200, Rainbow at 0.1% at 2000.
 */
const PITY_MULTIPLIER = 2;

/** Only outcomes at or below this rate get Bad Luck Protection. */
const MAX_PROTECTED_CHANCE = 0.05;

export const GOLD_MUTATION = "Gold";
export const RAINBOW_MUTATION = "Rainbow";

export interface PityTarget {
  /** `gold`, `rainbow`, or the rare species id. */
  key: string;
  label: string;
  /** Atlas frame key or image URL standing for the outcome. */
  icon: string;
  /** Pull at which the outcome is forced. */
  threshold: number;
  /** Natural rate, as a fraction (0.05 for 5%). */
  chance: number;
  kind: "species" | "mutation";
}

export interface EggFauna {
  species: string;
  /** Spawn share within this egg, as a fraction. */
  share: number;
}

export interface EggPity {
  eggId: string;
  name: string;
  /** The egg's own rarity, for ordering. */
  rarity: string;
  /** Everything the egg can hatch, commonest first. */
  fauna: EggFauna[];
  targets: PityTarget[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toPositiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** `threshold = multiplier / chance`, the rule every shipped threshold follows. */
export function thresholdForChance(chance: number): number {
  if (!Number.isFinite(chance) || chance <= 0) return 0;
  return Math.round(PITY_MULTIPLIER / chance);
}

function mutationEntry(mutationId: string): Record<string, unknown> | null {
  const entry = (mutationCatalog as Record<string, unknown>)[mutationId];
  return isRecord(entry) ? entry : null;
}

/**
 * Icon standing for a mutation.
 *
 * MGData serves an image URL; the atlas frame key is the fallback for the
 * hardcoded catalog, which carries no sprite for Gold and Rainbow.
 */
export function mutationIcon(mutationId: string): string {
  const sprite = mutationEntry(mutationId)?.sprite;
  return typeof sprite === "string" && sprite ? sprite : `sprite/ui/Mutation${mutationId}`;
}

/** Gold / Rainbow apply to every egg, at rates the mutation catalog carries. */
function mutationTargets(): PityTarget[] {
  const targets: PityTarget[] = [];
  for (const [key, mutationId] of [
    ["gold", GOLD_MUTATION],
    ["rainbow", RAINBOW_MUTATION],
  ] as const) {
    const chance = toPositiveNumber(mutationEntry(mutationId)?.baseChance) ?? 0;
    if (chance <= 0) continue;
    targets.push({
      key,
      label: `${mutationId} pet`,
      icon: mutationIcon(mutationId),
      chance,
      threshold: thresholdForChance(chance),
      kind: "mutation",
    });
  }
  return targets;
}

/** Species weights are relative, so a share needs the egg's own total. */
function speciesChances(weights: Record<string, unknown>): Map<string, number> {
  const out = new Map<string, number>();
  let total = 0;
  for (const value of Object.values(weights)) {
    total += toPositiveNumber(value) ?? 0;
  }
  if (total <= 0) return out;
  for (const [species, value] of Object.entries(weights)) {
    const weight = toPositiveNumber(value);
    if (weight === null) continue;
    out.set(species, weight / total);
  }
  return out;
}

function speciesTargets(entry: Record<string, unknown>): PityTarget[] {
  const weights = isRecord(entry.faunaSpawnWeights) ? entry.faunaSpawnWeights : {};
  const chances = speciesChances(weights);
  const declared = isRecord(entry.speciesPityThresholdPulls) ? entry.speciesPityThresholdPulls : null;

  const targets: PityTarget[] = [];

  // The catalog's own thresholds win wherever they exist. Where the field is
  // missing — an older egg, or a stale hardcoded fallback — every species at or
  // below the protected rate gets the derived threshold instead, so the panel
  // still shows something truthful rather than nothing.
  const species = declared ? Object.keys(declared) : Array.from(chances.keys());
  for (const id of species) {
    const chance = chances.get(id) ?? 0;
    const declaredThreshold = declared ? toPositiveNumber(declared[id]) : null;
    if (declaredThreshold === null && (chance <= 0 || chance > MAX_PROTECTED_CHANCE)) continue;
    const threshold = declaredThreshold ?? thresholdForChance(chance);
    if (threshold <= 0) continue;
    targets.push({
      key: id,
      label: id,
      icon: `sprite/pet/${id}`,
      chance,
      threshold,
      kind: "species",
    });
  }

  targets.sort((a, b) => b.threshold - a.threshold || a.label.localeCompare(b.label));
  return targets;
}

function buildEggPity(eggId: string, entry: Record<string, unknown>): EggPity | null {
  const targets = [...speciesTargets(entry), ...mutationTargets()];
  if (!targets.length) return null;

  const weights = isRecord(entry.faunaSpawnWeights) ? entry.faunaSpawnWeights : {};
  const fauna = Array.from(speciesChances(weights))
    .map(([species, share]) => ({ species, share }))
    .sort((a, b) => b.share - a.share || a.species.localeCompare(b.species));

  return {
    eggId,
    name: typeof entry.name === "string" && entry.name.trim() ? entry.name : eggId,
    rarity: typeof entry.rarity === "string" ? entry.rarity : "",
    fauna,
    targets,
  };
}

/**
 * Every egg the catalog knows, ordered by rarity as the game orders it.
 *
 * `rarityRank` reads MGData's `enums`, so the order follows the game rather
 * than a list maintained here.
 */
export function listEggPity(): EggPity[] {
  const out: EggPity[] = [];

  for (const eggId of Object.keys(eggCatalog)) {
    const entry = (eggCatalog as Record<string, unknown>)[eggId];
    if (!isRecord(entry)) continue;
    const pity = buildEggPity(eggId, entry);
    if (pity) out.push(pity);
  }

  out.sort((a, b) => {
    const diff = rarityRank(a.rarity) - rarityRank(b.rarity);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });
  return out;
}

export function getEggPity(eggId: string): EggPity | null {
  const entry = (eggCatalog as Record<string, unknown>)[eggId];
  return isRecord(entry) ? buildEggPity(eggId, entry) : null;
}

/** Rare species of an egg, i.e. the ones its counters track. */
export function protectedSpecies(eggId: string): string[] {
  const pity = getEggPity(eggId);
  if (!pity) return [];
  return pity.targets.filter(target => target.kind === "species").map(target => target.key);
}
