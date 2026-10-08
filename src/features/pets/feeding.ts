// What each pet species eats, how hungry a pet is, and which crops the player
// lets the Instant Feed button use.

import { petCatalog } from "../../data";
import type { PetInfo } from "../../game/player";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { canonicalSpecies } from "./inventoryPets";

type CropRules = Record<string, { allowed: boolean }>;

/**
 * Per-pet feeding rules saved by the autofeed of earlier builds. Nothing
 * writes them any more; the companion still honours the crop rules a player
 * set back then.
 */
export type PetOverride = {
  enabled: boolean;
  thresholdPct: number;
  crops: CropRules;
};

type InstantFeedOverride = { crops: CropRules };

const OVERRIDES_PATH = "pets.overrides";
const INSTANT_FEED_PATH = "pets.instantFeed";
const DEFAULT_THRESHOLD_PCT = 10;
/** Used when the catalog gives no hunger capacity for a species. */
const DEFAULT_MAX_HUNGER = 3000;

const isAllowed = (rules: CropRules, crop: string) => (rules[crop] ? !!rules[crop].allowed : true);

function readMap<T>(path: string): Record<string, T> {
  const saved = readAriesPath<Record<string, T>>(path);
  return saved && typeof saved === "object" ? saved : {};
}

export function getOverride(petId: string): PetOverride {
  const saved = readMap<Partial<PetOverride>>(OVERRIDES_PATH)[petId];
  return {
    enabled: !!saved?.enabled,
    thresholdPct: Math.min(100, Math.max(1, Number(saved?.thresholdPct) || DEFAULT_THRESHOLD_PCT)),
    crops: { ...(saved?.crops || {}) },
  };
}

/* -------------------------------- Instant Feed ------------------------------- */

function instantFeedRules(species: string): CropRules {
  return { ...(readMap<InstantFeedOverride>(INSTANT_FEED_PATH)[canonicalSpecies(String(species || ""))]?.crops || {}) };
}

/** A crop with no rule is allowed: that is the game's own default. */
export function isInstantFeedCropAllowed(species: string, crop: string): boolean {
  return isAllowed(instantFeedRules(species), crop);
}

export function setInstantFeedCropAllowed(species: string, crop: string, allowed: boolean): void {
  const key = canonicalSpecies(String(species || ""));
  const all = readMap<InstantFeedOverride>(INSTANT_FEED_PATH);
  all[key] = { crops: { ...(all[key]?.crops || {}), [crop]: { allowed: !!allowed } } };
  writeAriesPath(INSTANT_FEED_PATH, all);
}

export function getInstantFeedAllowedCrops(species: string): Set<string> {
  const rules = instantFeedRules(species);
  return new Set(getCompatibleCropsForSpecies(canonicalSpecies(String(species || ""))).filter((c) => isAllowed(rules, c)));
}

/* ---------------------------------- catalog --------------------------------- */

type PetCatalogEntry = { diet?: unknown; compatibleCrops?: unknown; crops?: unknown; coinsToFullyReplenishHunger?: unknown };

const catalogEntry = (species: string) => (petCatalog as Record<string, PetCatalogEntry | undefined>)[species];

export function getCompatibleCropsForSpecies(species: string): string[] {
  const entry = catalogEntry(species);
  const raw = entry?.diet ?? entry?.compatibleCrops ?? entry?.crops ?? [];
  return (Array.isArray(raw) ? raw : []).filter((c: unknown): c is string => typeof c === "string" && c.length > 0);
}

function maxHungerForSpecies(species: string): number {
  const v = catalogEntry(species)?.coinsToFullyReplenishHunger;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_HUNGER;
}

/** How full a pet is, 0 to 100, to one decimal. */
export function getHungerPctFor(pet: PetInfo): number {
  const current = Number(pet?.slot?.hunger) || 0;
  const pct = (current / maxHungerForSpecies(String(pet?.slot?.petSpecies || ""))) * 100;
  return +Math.max(0, Math.min(100, pct)).toFixed(1);
}
