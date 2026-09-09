// src/utils/cropSize.ts
// Crop Size math, mirroring the game runtime.
//
// A produce item / grow slot carries an integer `size` in [50, 100], and every
// figure derived from it — coins, weight, sprite scale — goes through the same
// multiplier:
//
//   multiplier = 1 + (maxSizeMultiplier - 1) * (size - 50) / 50
//
// Older builds carried a fractional `scale` (1 → `maxScale`) instead and the
// displayed size was recovered from it. `readCropSize` still understands that
// shape so replayed captures and stale clients keep resolving to a Size.

import { plantCatalog } from "../data";

export const CROP_SIZE_MIN = 50;
export const CROP_SIZE_MAX = 100;

const SIZE_SPAN = CROP_SIZE_MAX - CROP_SIZE_MIN;

/** Lower bound of the pre-rework fractional scale. */
const LEGACY_SCALE_MIN = 1;
/** Historical default used when a legacy payload names an unknown species. */
const LEGACY_FALLBACK_MAX_SCALE = 2;

type CropCatalogNode = {
  name?: unknown;
  maxSizeMultiplier?: unknown;
  /** Pre-rework name of `maxSizeMultiplier`. */
  maxScale?: unknown;
  baseWeight?: unknown;
};

type PlantCatalogEntry = {
  seed?: { name?: unknown };
  plant?: { name?: unknown };
  crop?: CropCatalogNode;
};

function toFinite(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Mirrors the game's own clamp: a non-finite size falls back to the minimum. */
export function clampCropSize(value: unknown): number {
  const numeric = toFinite(value);
  if (numeric == null) return CROP_SIZE_MIN;
  return Math.min(CROP_SIZE_MAX, Math.max(CROP_SIZE_MIN, Math.round(numeric)));
}

/** Catalog entry for a species id, a crop name, a plant name or a seed name. */
export function findPlantCatalogEntry(species: unknown): PlantCatalogEntry | null {
  const wanted = normalizeKey(species);
  if (!wanted) return null;

  const catalog = plantCatalog as Record<string, PlantCatalogEntry | undefined>;
  const direct = typeof species === "string" ? catalog[species] : undefined;
  if (direct) return direct;

  for (const key of Object.keys(catalog)) {
    const entry = catalog[key];
    if (!entry) continue;
    if (normalizeKey(key) === wanted) return entry;
    if (normalizeKey(entry.crop?.name) === wanted) return entry;
    if (normalizeKey(entry.plant?.name) === wanted) return entry;
    if (normalizeKey(entry.seed?.name) === wanted) return entry;
  }
  return null;
}

/** `crop.maxSizeMultiplier`, or the pre-rework `crop.maxScale` it replaced. */
export function getMaxSizeMultiplier(species: unknown): number | null {
  const crop = findPlantCatalogEntry(species)?.crop;
  if (!crop) return null;
  const value = toFinite(crop.maxSizeMultiplier) ?? toFinite(crop.maxScale);
  return value != null && value > 0 ? value : null;
}

/** Coin / weight / visual multiplier the game derives from a crop's Size. */
export function cropSizeMultiplier(species: unknown, size: unknown): number {
  const maxMultiplier = getMaxSizeMultiplier(species);
  if (maxMultiplier == null || maxMultiplier <= 1) return 1;
  const ratio = (clampCropSize(size) - CROP_SIZE_MIN) / SIZE_SPAN;
  return 1 + (maxMultiplier - 1) * ratio;
}

/** `baseWeight * multiplier`, the game's own weight formula. */
export function cropWeight(species: unknown, size: unknown): number | null {
  const baseWeight = toFinite(findPlantCatalogEntry(species)?.crop?.baseWeight);
  if (baseWeight == null || baseWeight <= 0) return null;
  return baseWeight * cropSizeMultiplier(species, size);
}

/** Pre-rework fractional scale (1 → maxScale) back to a Size in [50, 100]. */
export function legacyScaleToCropSize(scale: unknown, maxScale: number | null): number | null {
  const numeric = toFinite(scale);
  if (numeric == null) return null;
  const upper =
    maxScale != null && maxScale > LEGACY_SCALE_MIN ? maxScale : LEGACY_FALLBACK_MAX_SCALE;
  const clamped = Math.min(upper, Math.max(LEGACY_SCALE_MIN, numeric));
  const ratio = (clamped - LEGACY_SCALE_MIN) / (upper - LEGACY_SCALE_MIN);
  return clampCropSize(CROP_SIZE_MIN + ratio * SIZE_SPAN);
}

/**
 * Size carried by a produce item or a grow slot: the current `size` field when
 * present, else a pre-rework `targetScale` / `scale` converted back to a Size.
 */
export function readCropSize(source: unknown): number | null {
  if (!source || typeof source !== "object") return null;
  const record = source as Record<string, unknown>;

  const direct = toFinite(record.size);
  if (direct != null) return clampCropSize(direct);

  const legacy = toFinite(record.targetScale) ?? toFinite(record.scale);
  if (legacy == null) return null;
  return legacyScaleToCropSize(legacy, getMaxSizeMultiplier(record.species));
}
