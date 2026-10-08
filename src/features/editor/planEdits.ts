// Placing, removing and changing objects on the current tile of the plan.
//
// The plan is updated first and the tile painted after: the overlay serves
// what the plan holds, so painting first would show the old object again.

import { Atoms } from "../../game/store/atoms";
import { audioPlayer } from "../../game/audioPlayer";
import { tos } from "../../game/pixi/tileObjects";
import { buildBrushTileObject } from "./brush";
import { ensureSlotIds, tileObjectAt, withTileObject, type TileObject } from "./gardenModel";
import { getPlayerId, readMapData } from "./liveGarden";
import { getPlannedGarden, setPlannedGarden } from "./plannedGarden";
import { currentItemChanged, getCurrentEditorTile } from "./session";
import { paintTileObject } from "./tilePaint";
import { tileCoordsOf, type EditorTileTarget } from "./tileMap";

/** The object on a tile of the plan, or null. */
export const readTileObjectAt = (target: EditorTileTarget): TileObject | null =>
  tileObjectAt(getPlannedGarden(), target.tileType, target.localTileIndex);

/** The player's avatar acts out the edit, with its sound. */
async function playEditAnimation(animation: "dig" | "dropObject"): Promise<void> {
  try {
    const playerId = await getPlayerId();
    if (!playerId) return;
    await Atoms.player.avatarTriggerAnimationAtom.set({ playerId, animation });
    if (animation === "dig") {
      void audioPlayer.playBy("Break_Dirt_01");
    } else {
      void (
        audioPlayer.playGroup("plant") ||
        audioPlayer.playGroup("hit_dirt") ||
        audioPlayer.playGroup("hit") ||
        audioPlayer.playBy(/Hit_Dirt/i)
      );
    }
  } catch {}
}

/** The current tile and its world position, or null when there is none or the tile system is not ready. */
async function currentTileWithCoords(): Promise<{ target: EditorTileTarget; x: number; y: number } | null> {
  const target = getCurrentEditorTile();
  if (!target) return null;
  const coords = tileCoordsOf(await readMapData(), target);
  if (!coords || !tos.isReady()) return null;
  return { target, ...coords };
}

/** Places the picker's brush on the current tile. Does nothing when nothing is selected. */
export async function placeBrushAtCurrentTile(): Promise<void> {
  try {
    const tileObject = buildBrushTileObject();
    if (!tileObject) return;
    const tile = await currentTileWithCoords();
    if (!tile) return;

    setPlannedGarden(withTileObject(getPlannedGarden(), tile.target.tileType, tile.target.localTileIndex, tileObject));
    paintTileObject(tile.x, tile.y, tileObject);

    currentItemChanged.emit();
    void playEditAnimation("dropObject");
    tos.flashTileGreen(tile.x, tile.y, { startAlpha: 1, durationMs: 400 });
  } catch (err) {
    console.log("[EditorService] placing on the current tile failed", err);
  }
}

/** Empties the current tile, whatever is on it. */
export async function removeGardenObjectAtCurrentTile(): Promise<boolean> {
  try {
    const tile = await currentTileWithCoords();
    if (!tile) return false;

    setPlannedGarden(withTileObject(getPlannedGarden(), tile.target.tileType, tile.target.localTileIndex, null));
    paintTileObject(tile.x, tile.y, null);

    currentItemChanged.emit();
    void playEditAnimation("dig");
    return true;
  } catch (err) {
    console.log("[EditorService] removing from the current tile failed", err);
    return false;
  }
}

async function repaintTile(target: EditorTileTarget, obj: TileObject): Promise<void> {
  try {
    const coords = tileCoordsOf(await readMapData(), target);
    if (coords && tos.isReady()) paintTileObject(coords.x, coords.y, obj);
  } catch {}
}

/**
 * Replaces the object on the current tile with `updater(object)`. False when
 * the tile is empty. The plan changes at once; the tile is repainted after.
 */
export function updateGardenObjectAtCurrentTile(updater: (obj: TileObject) => TileObject): boolean {
  try {
    const target = getCurrentEditorTile();
    if (!target) return false;
    const current = readTileObjectAt(target);
    if (!current) return false;

    const updated = updater(current);
    const next = updated?.objectType === "plant" ? { ...updated, slots: ensureSlotIds(updated.slots) } : updated;
    setPlannedGarden(withTileObject(getPlannedGarden(), target.tileType, target.localTileIndex, next));
    if (next) void repaintTile(target, next);
    return true;
  } catch {
    return false;
  }
}
