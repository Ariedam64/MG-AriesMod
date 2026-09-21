// src/services/workflowScan.ts
// Garden tile scan for the auto-workflow feature.

import { Atoms } from "../store/atoms";
import { plantCatalog, mutationCatalog } from "../data";
import { CROP_SIZE_MAX, CROP_SIZE_MIN, readCropSize } from "../utils/cropSize";

/* ─── Types ─── */

export interface CropSnapshot {
  slotIndex: number;
  species: string;
  startTime: number;
  endTime: number;
  /** Crop Size as the game stores it: a whole number in [50, 100]. */
  size: number;
  mutations: string[];
  /** Growth maturity 0–100 (clamped). */
  growthPct: number;
  /** Same figure as `size`, under the name the size filters read. */
  sizePct: number;
  /** Color mutations present on this crop (Gold, Rainbow). */
  colorMutations: string[];
  /** Weather mutations present on this crop. */
  weatherMutations: string[];
  /** Time mutations present on this crop. */
  timeMutations: string[];
  /**
   * Preserved by the player: paid for, and frozen as it is.
   *
   * The game shows these a dedicated badge and charges coins per crop, so
   * harvesting one throws away what was just paid for it.
   */
  preserved: boolean;
}

export interface PlantSnapshot {
  tileIndex: number;
  species: string;
  crops: CropSnapshot[];
}

export interface GardenScanResult {
  /** Total number of crops observed across all matching plants. */
  totalCrops: number;
  /** Plants matching the selected species. */
  plants: PlantSnapshot[];
  /** Average growth maturity (0–100) across all crops. */
  avgGrowthPct: number;
  /** Average size (50–100) across all crops. */
  avgSizePct: number;
  /**
   * Color mutation coverage: percentage of crops that have at least one
   * color mutation, out of all observed crops (0–100).
   */
  colorMutationPct: number;
  /**
   * Per-weather-mutation coverage.
   * Key = mutation id (e.g. "Chilled"), value = % of crops having it (0–100).
   */
  weatherMutationPcts: Record<string, number>;
  /**
   * Per-time-mutation coverage.
   * Key = mutation id (e.g. "Dawnlit"), value = % of crops having it (0–100).
   */
  timeMutationPcts: Record<string, number>;
  /**
   * Size completion: percentage of crops that have reached max size (sizePct >= 100).
   */
  sizeCompletePct: number;
  /** Number of mature crops (growthPct >= 100) ready to harvest. */
  matureCropCount: number;
  /** Harvestable crop locations: { tileIndex, slotIndex } for each mature crop. */
  harvestTargets: { tileIndex: number; slotIndex: number }[];
}

/* ─── Mutation classification ─── */

const COLOR_MUTATIONS = new Set(
  Object.keys(mutationCatalog as Record<string, unknown>).filter((k) => {
    const entry = (mutationCatalog as Record<string, Record<string, unknown>>)[k];
    return !entry.tileRef; // Gold & Rainbow have no tileRef
  }),
);

const WEATHER_MUTATIONS = new Set(["Wet", "Chilled", "Frozen", "Thunderstruck"]);
const TIME_MUTATIONS = new Set(["Dawnlit", "Amberlit", "Dawncharged", "Ambercharged"]);
const ALL_KNOWN_MUTATIONS = new Set([
  ...COLOR_MUTATIONS,
  ...WEATHER_MUTATIONS,
  ...TIME_MUTATIONS,
]);

/* ─── Crop Size ─── */

/**
 * A grow slot's Crop Size.
 *
 * This used to derive the figure itself, from the slot's fractional
 * `targetScale` against the catalog's `maxScale`. The game renamed both in the
 * Crop Size rework: slots carry a whole-number `size` and the catalog carries
 * `maxSizeMultiplier`. Reading the old names left `maxScale` at 1, which the
 * old formula treated as "this species has no size range" and answered 100 for
 * every crop — so the companion's size filter and the Locker's size range both
 * saw a garden full of perfect crops and let everything through.
 *
 * `readCropSize` is the one place that knows both shapes, so the conversion
 * lives there rather than being written a second time here. The species is
 * passed along because the legacy branch needs it to find the multiplier.
 */
function slotCropSize(slot: Record<string, unknown>, species: string): number {
  const size = readCropSize({ ...slot, species: slot.species ?? species });
  if (size != null) return size;
  // No size on the slot at all: treat it as the smallest rather than the
  // biggest, so an unreadable crop is skipped by a size filter instead of
  // being harvested by one.
  return CROP_SIZE_MIN;
}

/* ─── Core scan ─── */

export function scanGarden(
  tileObjects: Record<string, unknown> | null | undefined,
  selectedSpecies: Set<string>,
): GardenScanResult {
  const plants: PlantSnapshot[] = [];
  const allCrops: CropSnapshot[] = [];
  const now = Date.now();

  if (!tileObjects || !selectedSpecies.size) {
    return emptyResult();
  }

  for (const [tileIdx, tileRaw] of Object.entries(tileObjects)) {
    const tile = tileRaw as Record<string, unknown> | null;
    if (!tile || tile.objectType !== "plant") continue;

    const species = tile.species as string | undefined;
    if (!species || !selectedSpecies.has(species)) continue;

    const slots = tile.slots as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(slots) || !slots.length) continue;

    const crops: CropSnapshot[] = [];

    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si];

      // HarvestCrop attend le slotId du sous-slot (cf. fix WS hook v3.1.503),
      // pas la position dans le tableau. Plantes sparse (Clover après récolte,
      // Daisy...) ont des slotIds non-contigus (ex: 0,2,3,5).
      const rawSlotId = slot.slotId;
      const slotId = Number.isFinite(rawSlotId as number) ? Number(rawSlotId) : si;

      const startTime = Number(slot.startTime) || 0;
      const endTime = Number(slot.endTime) || 0;
      const mutations = Array.isArray(slot.mutations) ? (slot.mutations as string[]) : [];

      // Growth maturity
      let growthPct = 0;
      const duration = endTime - startTime;
      if (duration > 0) {
        const elapsed = now - startTime;
        growthPct = Math.max(0, Math.min(100, (elapsed / duration) * 100));
      } else {
        growthPct = 100;
      }

      // Size
      const size = slotCropSize(slot, species);

      // Classify mutations
      const colorMuts: string[] = [];
      const weatherMuts: string[] = [];
      const timeMuts: string[] = [];
      for (const m of mutations) {
        if (COLOR_MUTATIONS.has(m)) colorMuts.push(m);
        else if (WEATHER_MUTATIONS.has(m)) weatherMuts.push(m);
        else if (TIME_MUTATIONS.has(m)) timeMuts.push(m);
      }

      const crop: CropSnapshot = {
        slotIndex: slotId,
        species: (slot.species as string) ?? species,
        startTime,
        endTime,
        size,
        mutations,
        growthPct,
        sizePct: size,
        colorMutations: colorMuts,
        weatherMutations: weatherMuts,
        timeMutations: timeMuts,
        preserved: slot.preserved === true,
      };

      crops.push(crop);
      allCrops.push(crop);
    }

    plants.push({
      tileIndex: Number(tileIdx),
      species,
      crops,
    });
  }

  if (!allCrops.length) return emptyResult();

  const total = allCrops.length;

  // Average growth
  const avgGrowthPct = allCrops.reduce((s, c) => s + c.growthPct, 0) / total;

  // Average size
  const avgSizePct = allCrops.reduce((s, c) => s + c.sizePct, 0) / total;

  // Color mutation coverage
  const cropsWithColor = allCrops.filter((c) => c.colorMutations.length > 0).length;
  const colorMutationPct = (cropsWithColor / total) * 100;

  // Per-weather-mutation coverage
  const weatherMutationPcts: Record<string, number> = {};
  for (const wm of WEATHER_MUTATIONS) {
    const count = allCrops.filter((c) => c.weatherMutations.includes(wm)).length;
    weatherMutationPcts[wm] = (count / total) * 100;
  }

  // Per-time-mutation coverage
  const timeMutationPcts: Record<string, number> = {};
  for (const tm of TIME_MUTATIONS) {
    const count = allCrops.filter((c) => c.timeMutations.includes(tm)).length;
    timeMutationPcts[tm] = (count / total) * 100;
  }

  // Size completion (crops at max size)
  const cropsAtMaxSize = allCrops.filter((c) => c.sizePct >= CROP_SIZE_MAX).length;
  const sizeCompletePct = (cropsAtMaxSize / total) * 100;

  // Mature crops (ready to harvest)
  const harvestTargets: { tileIndex: number; slotIndex: number }[] = [];
  for (const plant of plants) {
    for (const crop of plant.crops) {
      if (crop.growthPct >= 100) {
        harvestTargets.push({ tileIndex: plant.tileIndex, slotIndex: crop.slotIndex });
      }
    }
  }

  return {
    totalCrops: total,
    plants,
    avgGrowthPct: Math.round(avgGrowthPct * 100) / 100,
    avgSizePct: Math.round(avgSizePct * 100) / 100,
    colorMutationPct: Math.round(colorMutationPct * 100) / 100,
    weatherMutationPcts,
    timeMutationPcts,
    sizeCompletePct: Math.round(sizeCompletePct * 100) / 100,
    matureCropCount: harvestTargets.length,
    harvestTargets,
  };
}

function emptyResult(): GardenScanResult {
  return {
    totalCrops: 0,
    plants: [],
    avgGrowthPct: 0,
    avgSizePct: 50,
    colorMutationPct: 0,
    weatherMutationPcts: {},
    timeMutationPcts: {},
    sizeCompletePct: 0,
    matureCropCount: 0,
    harvestTargets: [],
  };
}

/* ─── Watcher ─── */

let _unsub: (() => void) | null = null;

export function startWorkflowScan(
  getSelectedSpecies: () => string[],
  onScan: (result: GardenScanResult) => void,
): void {
  stopWorkflowScan();

  void (async () => {
    try {
      _unsub = await Atoms.data.gardenTileObjects.onChangeNow((tileObjects) => {
        const species = new Set(getSelectedSpecies());
        const result = scanGarden(tileObjects, species);
        onScan(result);
      });
    } catch (err) {
      console.warn("[WorkflowScan] failed to subscribe:", err);
    }
  })();
}

export function stopWorkflowScan(): void {
  try { _unsub?.(); } catch {}
  _unsub = null;
}
