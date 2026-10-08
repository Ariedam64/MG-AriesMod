// The editor's page globals. The mod itself imports these functions; the
// globals stay for code outside this bundle:
//   - qwsEditorSaveGardenForPlayer: the room menu (features/room/menu.ts)
//   - qwsEditorPreviewFriendGarden, qwsEditorClearFriendGardenPreview: MG Community Hub
//   - the rest: console use and older external tools.

import { shareGlobal } from "../../platform/pageContext";
import { Atoms, type GardenState } from "../../game/store/atoms";
import { applyFriendGardenPreview, clearFriendGardenPreview } from "./friendPreview";
import { makeEmptyGarden } from "./gardenModel";
import { placeBrushAtCurrentTile, removeGardenObjectAtCurrentTile } from "./planEdits";
import { setCurrentGarden } from "./plannedGarden";
import {
  deleteSavedGarden,
  exportSavedGarden,
  importGarden,
  listSavedGardens,
  loadSavedGarden,
  saveCurrentGarden,
} from "./savedGardens";
import { getCurrentEditorTile } from "./session";

/** Logs the hotbar's selected item next to the current tile, for debugging placement. */
async function logSelectedInventoryItemWithTile(): Promise<void> {
  try {
    const target = getCurrentEditorTile();
    const selectedIndex = await Atoms.inventory.myValidatedSelectedItemIndex.get();
    const inventory = await Atoms.inventory.myInventory.get();
    const rotation = await Atoms.inventory.mySelectedItemRotation.get();
    const items = Array.isArray(inventory?.items) ? inventory.items : [];
    if (typeof selectedIndex !== "number" || selectedIndex < 0 || selectedIndex >= items.length) {
      console.log("[EditorService] no valid selected item", { selectedIndex, itemsLen: items.length });
      return;
    }
    console.log("[EditorService] selected item placement debug", {
      tileType: target?.tileType,
      localTileIndex: target?.localTileIndex,
      selectedIndex,
      rotation,
      item: items[selectedIndex],
    });
  } catch (err) {
    console.log("[EditorService] logSelectedInventoryItemWithTile failed", err);
  }
}

export function publishEditorGlobals(): void {
  const removeAtCurrentTile = () => void removeGardenObjectAtCurrentTile();

  shareGlobal("qwsLogSelectedInventoryItemWithTile", () => void logSelectedInventoryItemWithTile());
  shareGlobal("qwsPlaceSelectedItemInGardenAtCurrentTile", () => void placeBrushAtCurrentTile());
  shareGlobal("qwsRemoveItemFromGardenAtCurrentTile", removeAtCurrentTile);
  shareGlobal("qwsRemoveDecorFromGardenAtCurrentTile", removeAtCurrentTile);

  shareGlobal("qwsEditorListSavedGardens", listSavedGardens);
  shareGlobal("qwsEditorSaveGarden", (name?: string) => saveCurrentGarden(name || "Untitled"));
  shareGlobal("qwsEditorSaveGardenForPlayer", (playerId: string, name?: string) =>
    saveCurrentGarden(name || "Untitled", playerId),
  );
  shareGlobal("qwsEditorClearGarden", () => setCurrentGarden(makeEmptyGarden()));
  shareGlobal("qwsEditorLoadGarden", loadSavedGarden);
  shareGlobal("qwsEditorDeleteGarden", deleteSavedGarden);
  shareGlobal("qwsEditorExportGarden", exportSavedGarden);
  shareGlobal("qwsEditorImportGarden", importGarden);

  shareGlobal("qwsEditorPreviewFriendGarden", (garden: GardenState | null) => applyFriendGardenPreview(garden));
  shareGlobal("qwsEditorClearFriendGardenPreview", clearFriendGardenPreview);
}
