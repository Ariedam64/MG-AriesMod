// Reads the garden and what the companion is allowed to harvest from it.
//
// The crops come from `scanGarden`, which carries the size reading and above
// all the `slotId` resolution: `HarvestCrop` wants the slot's id, not its
// position in the array, and sparse plants have gaps. Rewriting that here
// would risk harvesting the wrong crop.
//
// Deciding what to take and what to leave is the Locker's job. The companion
// has no rules of its own: the Locker's are richer (size ranges, weather
// recipes, per-species exceptions) and above all they are the ones the player
// already set. Two sets of rules would be a promise that they drift apart.

import { Atoms } from "../../../game/store/atoms";
import { lockerService } from "../../locker/locker";
import { scanGarden } from "./gardenScan";
import type { HarvestRow } from "./harvest";

/** What the garden offers, and what the Locker sets aside. */
export type HarvestScope = {
  rows: HarvestRow[];
  /** Ripe crops the Locker kept back: something to tell the player. */
  lockedOut: number;
};

/** Every crop in the garden, ripe or not, without judgement. */
export async function readHarvestRows(): Promise<HarvestRow[]> {
  let tileObjects: Record<string, unknown> | null = null;
  try {
    tileObjects = (await Atoms.data.gardenTileObjects.get()) as Record<string, unknown> | null;
  } catch {
    return [];
  }
  if (!tileObjects || typeof tileObjects !== "object") return [];

  const now = Date.now();
  const rows: HarvestRow[] = [];
  for (const plant of scanGarden(tileObjects).plants) {
    for (const crop of plant.crops) {
      rows.push({
        tileIndex: plant.tileIndex,
        slotId: crop.slotIndex,
        species: crop.species,
        sizePct: crop.sizePct,
        growthPct: Math.round(crop.growthPct),
        mutations: crop.mutations,
        ready: crop.endTime > 0 && crop.endTime <= now,
        preserved: crop.preserved,
      });
    }
  }
  return rows;
}

/**
 * What the companion may harvest: ripe, and allowed by the Locker.
 *
 * The species serves directly as the seed key, as the `HarvestCrop` hook
 * already does: the Locker keys its exceptions on that name. A disabled Locker
 * allows everything, which gives the expected default: everything ripe.
 */
export async function readHarvestable(): Promise<HarvestScope> {
  const rows = await readHarvestRows();
  const ripe = rows.filter((row) => row.ready);

  const allowed = ripe.filter((row) => {
    try {
      return lockerService.allowsHarvest({
        seedKey: row.species,
        sizePercent: row.sizePct,
        mutations: row.mutations,
      });
    } catch {
      // A Locker in error must not decide for the player: hold back rather
      // than harvest what it may have been protecting.
      return false;
    }
  });

  return { rows: allowed, lockedOut: ripe.length - allowed.length };
}
