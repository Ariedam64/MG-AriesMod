import { interceptOutgoing } from "../../game/ws/outgoing";
import { EditorService } from "./editor";
import { removeGardenObjectAtCurrentTile } from "./planEdits";

/**
 * In editor mode the garden on screen is the editor's, not the server's, so
 * picking up a decor removes it locally and the command never leaves.
 */
function pickupDecorLocally() {
  if (!EditorService.isEnabled()) return;
  void removeGardenObjectAtCurrentTile();
  return "drop" as const;
}

/** Registers the editor's outgoing rules. Must run before the locker's. */
export function installEditorOutgoingRules(): void {
  interceptOutgoing("PickupDecor", pickupDecorLocally);
}
