// Making the companion walk while he works.
//
// Only for show: the server accepts the commands from anywhere, and nothing
// here gates an action. It is what makes him look like he is doing something
// rather than triggering everything from a corner of the map.
//
// Hence the rule of this file: a failed walk must never prevent the action. At
// worst he stops walking and carries on.

import { CompanionService } from "..";
import { readMySlotIdx } from "../anchors";
import { roundTile } from "../feeds";
import { readCompanionMap } from "../map";
import type { XY } from "../movement";

/** Two failures in a row: it is structural, not one odd tile. */
const GIVE_UP_AFTER = 2;

export type Walker = {
  /** Goes to a crop's dirt tile, given by its index in the plot. */
  toGardenTile(dirtTileIdx: number): Promise<void>;
  /** Goes to a world position: a pet, for one. */
  toPosition(position: XY | null | undefined): Promise<void>;
  /**
   * Goes in front of a building, given by its map key.
   *
   * `false` when the building cannot be found or he did not walk: the caller
   * decides what to say, but never gives up its action.
   */
  toBuilding(name: string): Promise<boolean>;
  /** Gives the companion back his mode. Call once the run is over. */
  release(): void;
  /** False once he gave up, or when there is nobody to walk. */
  readonly walking: boolean;
};

/** A walker that does nothing: no walk, no delay. */
const IDLE: Walker = {
  async toGardenTile() {},
  async toPosition() {},
  async toBuilding() {
    return false;
  },
  release() {},
  walking: false,
};

/**
 * Readies walking for a run of actions.
 *
 * `onGiveUp` is called once, when he gives up: each failure costs its
 * timeout, and insisting would slow the whole batch for decoration.
 */
export async function createWalker(onGiveUp: (message: string) => void): Promise<Walker> {
  if (!CompanionService.isRunning()) return IDLE;

  const slotIdx = await readMySlotIdx();
  if (slotIdx === null) return IDLE;

  let walking = true;
  let failures = 0;

  const record = (arrived: boolean): void => {
    failures = arrived ? 0 : failures + 1;
    if (walking && failures >= GIVE_UP_AFTER) {
      walking = false;
      CompanionService.releaseTask();
      onGiveUp("Cannot get around there, so I work from here.");
    }
  };

  const goTo = async (tile: XY | null): Promise<void> => {
    if (!walking) return;
    if (!tile) {
      record(false);
      return;
    }
    record(await CompanionService.walkTo(tile));
  };

  return {
    async toGardenTile(dirtTileIdx) {
      if (!walking) return;
      await goTo(CompanionService.gardenTileXY(slotIdx, dirtTileIdx));
    },
    async toPosition(position) {
      if (!walking) return;
      // World positions are continuous; the grid is not.
      await goTo(roundTile(position));
    },
    async toBuilding(name) {
      if (!walking) return false;
      const map = await readCompanionMap();
      if (!map) return false;

      // Activation tiles are where the game offers to interact. The first one
      // he can really stand on is taken: some sit on the building itself and
      // cannot be walked on.
      const tiles = map.buildingActivationTiles(name);
      const spot = tiles.map((tile) => map.toXY(tile)).find((xy) => map.isWalkable(xy.x, xy.y));
      if (!spot) return false;

      await goTo(spot);
      return walking;
    },
    release() {
      if (walking) CompanionService.releaseTask();
      walking = false;
    },
    get walking() {
      return walking;
    },
  };
}
