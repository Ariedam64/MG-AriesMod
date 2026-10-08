// The planned garden: the local garden the editor paints instead of the real
// one. Editor mode never touches the real garden, inventory or pets. It
// seeds the plan from the real garden, holds the tiles on the plan through the
// overlay, and paints the real garden back on exit.

import type { GardenState } from "../../game/store/atoms";
import { makeEmptyGarden, sanitizeGarden } from "./gardenModel";
import {
  clearGardenInTileInfo,
  installGardenOverlay,
  overlayOwner,
  releaseGardenOverlay,
  repaintOverlay,
  showGardenInTileInfo,
} from "./gardenOverlay";
import { getPlayerId, readRealGardenForPlayer, readUserSlotIdx } from "./liveGarden";
import { editorSession } from "./session";
import { paintGarden, pushGardenToTileViews } from "./tilePaint";

let planned: GardenState = makeEmptyGarden();
let plannedUserSlotIdx: number | null = null;

export const getPlannedGarden = (): GardenState => planned;

/**
 * Replaces the plan. Always go through here rather than assigning `planned`:
 * the info panel reads `myDataAtom`, whose injected copy has to follow every
 * placement, removal and rotation.
 */
export function setPlannedGarden(next: GardenState): void {
  planned = next;
  if (overlayOwner() === "editor") void showGardenInTileInfo(planned);
}

/**
 * Seeds the plan from the real garden, then holds the tiles so the plan keeps
 * showing.
 *
 * An older version repainted the plan every second, betting on winning
 * against the server's redraws. Between two ticks the game took over again: an
 * ability proc wiped the plan for a tick. The overlay takes over the painting
 * instead of redoing it, so there is no window left.
 */
export async function startPlannedGarden(): Promise<void> {
  try {
    const pid = await getPlayerId();
    if (!pid) return;
    const userSlotIdx = await readUserSlotIdx();
    planned = (await readRealGardenForPlayer(pid)) || makeEmptyGarden();
    plannedUserSlotIdx = userSlotIdx;
    await installGardenOverlay("editor", userSlotIdx, () => planned);
    // The current tile's info panel now describes what was placed, not the real garden.
    await showGardenInTileInfo(planned);
  } catch (err) {
    console.log("[EditorService] startPlannedGarden failed", err);
  }
}

/** Releases the overlay and paints the real garden back over the plan. */
export async function stopPlannedGarden(): Promise<void> {
  releaseGardenOverlay();
  await clearGardenInTileInfo();
  try {
    const pid = await getPlayerId();
    if (pid && plannedUserSlotIdx != null) {
      const realGarden = (await readRealGardenForPlayer(pid)) || makeEmptyGarden();
      await pushGardenToTileViews(realGarden, plannedUserSlotIdx);
    }
  } catch (err) {
    console.log("[EditorService] stopPlannedGarden failed", err);
  }
  planned = makeEmptyGarden();
  plannedUserSlotIdx = null;
}

/** Replaces the whole plan (clear, load) and paints it. */
export async function setCurrentGarden(nextGarden: GardenState): Promise<boolean> {
  try {
    const pid = await getPlayerId();
    if (!pid) return false;
    const userSlotIdx = plannedUserSlotIdx ?? (await readUserSlotIdx());
    setPlannedGarden(sanitizeGarden(nextGarden));
    plannedUserSlotIdx = userSlotIdx;
    try {
      // Under the overlay the tiles are already held: asking the resolver
      // again is enough, and it reads the plan just replaced.
      if (overlayOwner() === "editor") repaintOverlay();
      else await paintGarden(planned, userSlotIdx);
    } catch {}
    return true;
  } catch (err) {
    console.log("[EditorService] setCurrentGarden failed", err);
    return false;
  }
}

/** A player's garden as the editor sees it: the plan for the local player while editing, else the real one. */
export async function getGardenForPlayer(playerId: string): Promise<GardenState | null> {
  if (!playerId) return null;
  try {
    if (editorSession.enabled && (await getPlayerId()) === playerId) return sanitizeGarden(planned);
    return await readRealGardenForPlayer(playerId);
  } catch {
    return null;
  }
}
