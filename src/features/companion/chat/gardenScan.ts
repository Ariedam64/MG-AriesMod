// Reads the garden's plants into crops: slot id, growth, size, mutations.

import { readCropSize, CROP_SIZE_MIN } from "../../../data/rules/cropSize";

interface CropSnapshot {
  /**
   * The slot's `slotId`, which `HarvestCrop` expects, not its position in the
   * `slots` array (fix v3.1.503). Sparse plants (Clover after a harvest,
   * Daisy) have non-contiguous ids: 0, 2, 3, 5.
   */
  slotIndex: number;
  species: string;
  startTime: number;
  endTime: number;
  /** Mutations as the game names them, unsorted into groups. */
  mutations: string[];
  /** Growth, 0 to 100. */
  growthPct: number;
  /** Crop Size as the game stores it: a whole number in [50, 100]. */
  sizePct: number;
  /**
   * Preserved by the player: paid for, and frozen as it is.
   *
   * The game shows these a badge of their own and charges coins per crop, so
   * harvesting one throws away what was just paid for it.
   */
  preserved: boolean;
}

interface PlantSnapshot {
  tileIndex: number;
  species: string;
  crops: CropSnapshot[];
}

export interface GardenScanResult {
  plants: PlantSnapshot[];
}

/**
 * A grow slot's Crop Size.
 *
 * `readCropSize` is the one place that knows both the current `size` and the
 * pre-rework `targetScale`; the species is passed along because the legacy
 * branch needs it to find the multiplier. A slot with no size at all reads as
 * the smallest rather than the biggest, so a size filter skips an unreadable
 * crop instead of harvesting it.
 */
function slotCropSize(slot: Record<string, unknown>, species: string): number {
  return readCropSize({ ...slot, species: slot.species ?? species }) ?? CROP_SIZE_MIN;
}

/** The plants in `tileObjects`, limited to `species` when it is given. */
export function scanGarden(
  tileObjects: Record<string, unknown> | null | undefined,
  species?: ReadonlySet<string>,
): GardenScanResult {
  const plants: PlantSnapshot[] = [];
  if (!tileObjects) return { plants };
  const now = Date.now();

  for (const [tileIdx, tileRaw] of Object.entries(tileObjects)) {
    const tile = tileRaw as Record<string, unknown> | null;
    if (!tile || tile.objectType !== "plant") continue;

    const plantSpecies = tile.species as string | undefined;
    if (!plantSpecies || (species && !species.has(plantSpecies))) continue;

    const slots = tile.slots as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(slots) || !slots.length) continue;

    const crops = slots.map((slot, index): CropSnapshot => {
      const rawSlotId = slot.slotId;
      const startTime = Number(slot.startTime) || 0;
      const endTime = Number(slot.endTime) || 0;
      const duration = endTime - startTime;
      const growthPct = duration > 0 ? Math.max(0, Math.min(100, ((now - startTime) / duration) * 100)) : 100;

      return {
        slotIndex: Number.isFinite(rawSlotId as number) ? Number(rawSlotId) : index,
        species: (slot.species as string) ?? plantSpecies,
        startTime,
        endTime,
        mutations: Array.isArray(slot.mutations) ? (slot.mutations as string[]) : [],
        growthPct,
        sizePct: slotCropSize(slot, plantSpecies),
        preserved: slot.preserved === true,
      };
    });

    plants.push({ tileIndex: Number(tileIdx), species: plantSpecies, crops });
  }

  return { plants };
}
