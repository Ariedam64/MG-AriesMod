import { interceptOutgoing } from "../../game/ws/outgoing";
import { EditorService, removeDecorFromGardenAtCurrentTile } from "./editor";

/**
 * In editor mode the garden on screen is the editor's, not the server's, so
 * picking up a decor removes it locally and the command never leaves.
 */
function pickupDecorLocally() {
  if (!EditorService.isEnabled()) return;
  console.log("[PickupDecor][Editor] intercept -> local remove");
  void removeDecorFromGardenAtCurrentTile();
  return "drop" as const;
}

/** Registers the editor's outgoing rules. Must run before the locker's. */
export function installEditorOutgoingRules(): void {
  interceptOutgoing("PickupDecor", pickupDecorLocally);
}
