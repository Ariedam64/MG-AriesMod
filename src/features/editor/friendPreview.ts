// Previewing a friend's garden on the player's own plot, read only. Called
// through the `qwsEditorPreviewFriendGarden` global by MG Community Hub.

import type { GardenState } from "../../game/store/atoms";
import { makeEmptyGarden, sanitizeGarden } from "./gardenModel";
import { clearGardenInTileInfo, installGardenOverlay, releaseGardenOverlay, showGardenInTileInfo } from "./gardenOverlay";
import { getPlayerId, readPlayerSlot } from "./liveGarden";
import { pushGardenToTileViews } from "./tilePaint";

/** Set while a preview is on screen: whose plot it covers. */
let active: { userSlotIdx: number; playerId: string } | null = null;
let previewGarden: GardenState = makeEmptyGarden();

/** Shows `garden` over the player's own plot until `clearFriendGardenPreview`. */
export async function applyFriendGardenPreview(garden: GardenState | null): Promise<boolean> {
  if (!garden || typeof garden !== "object") return false;
  try {
    const pid = await getPlayerId();
    if (!pid) return false;
    const match = await readPlayerSlot(pid);
    if (!match?.slot) return false;

    previewGarden = sanitizeGarden(garden);
    if (!(await installGardenOverlay("friend", match.index, () => previewGarden))) return false;
    // The painting is in place; the current tile's info panel follows too.
    await showGardenInTileInfo(previewGarden);
    active = { userSlotIdx: match.index, playerId: pid };
    return true;
  } catch (error) {
    console.error("[EditorService] applyFriendGardenPreview failed", error);
    releaseGardenOverlay();
    await clearGardenInTileInfo();
    active = null;
    return false;
  }
}

/** Ends the preview and paints the player's real garden back. False when no preview was on. */
export async function clearFriendGardenPreview(): Promise<boolean> {
  if (!active) return false;
  const { userSlotIdx, playerId } = active;
  active = null;
  releaseGardenOverlay();
  await clearGardenInTileInfo();
  try {
    // The state was never written: it holds the server's truth, including
    // whatever grew during the preview, so painting from it is enough.
    const match = await readPlayerSlot(playerId);
    await pushGardenToTileViews(sanitizeGarden(match?.slot?.data?.garden), userSlotIdx);
    return true;
  } catch (error) {
    console.error("[EditorService] clearFriendGardenPreview failed", error);
    return false;
  }
}
