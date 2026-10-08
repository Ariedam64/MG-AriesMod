// The garden editor: a sandbox garden with every plant and decor unlocked. It
// paints a local plan over the player's own plot (never touching the real
// state, inventory or pets), with an item picker on the left and the clicked
// tile's editor on the right. Mouse input is in `pointerControls.ts`.

import { Emitter, type Unsubscribe } from "../../lib/emitter";
import { publishEditorGlobals } from "./globals";
import { startPlannedGarden, stopPlannedGarden } from "./plannedGarden";
import { savedGardensChanged } from "./savedGardens";
import { editorSession, forgetCurrentEditorTile } from "./session";
import { setEditorUiShown } from "./ui/overlays";

const enabledChanged = new Emitter<boolean>();

/** Editor mode always starts off: the toggle is not persisted. */
function applyState(enabled: boolean, emit: boolean): void {
  const wasEnabled = editorSession.enabled;
  if (enabled && !wasEnabled) forgetCurrentEditorTile();
  setEditorUiShown(enabled);

  if (enabled && !wasEnabled) void startPlannedGarden();
  else if (!enabled && wasEnabled) void stopPlannedGarden();

  editorSession.enabled = enabled;
  if (emit && enabled !== wasEnabled) enabledChanged.emit(enabled);
}

export const EditorService = {
  init(): void {
    applyState(editorSession.enabled, false);
  },

  isEnabled(): boolean {
    return editorSession.enabled;
  },

  setEnabled(enabled: boolean): void {
    applyState(!!enabled, true);
  },

  onChange(listener: (enabled: boolean) => void): Unsubscribe {
    return enabledChanged.on(listener);
  },

  onSavedGardensChange(listener: () => void): Unsubscribe {
    return savedGardensChanged.on(listener);
  },
};

// Published when the module loads, as before the split: the room menu and
// MG Community Hub reach the editor through these globals.
publishEditorGlobals();
