// Everything the editor puts on screen while it is on: the toolbar, and the
// two side panels the toolbar can hide.

import { makeEmptyGarden } from "../gardenModel";
import { setCurrentGarden } from "../plannedGarden";
import { setCurrentEditorTile } from "../session";
import { hideCurrentItemPanel, showCurrentItemPanel } from "./currentItemPanel";
import { hideItemPicker, showItemPicker } from "./itemPicker";
import { hideToolbar, setHudButtonLabel, showToolbar } from "./toolbar";

/** Whether the side panels are shown. The toolbar always is. */
let panelsVisible = true;

async function clearEditorGarden(): Promise<void> {
  await setCurrentGarden(makeEmptyGarden());
  setCurrentEditorTile(null);
}

function togglePanels(): void {
  panelsVisible = !panelsVisible;
  showPanels(panelsVisible);
  setHudButtonLabel(panelsVisible);
}

function showPanels(visible: boolean): void {
  if (visible) {
    showItemPicker();
    showCurrentItemPanel();
  } else {
    hideItemPicker();
    hideCurrentItemPanel();
  }
}

/** Shows or removes the editor's on-screen UI. */
export function setEditorUiShown(shown: boolean): void {
  if (shown) {
    showToolbar({ onClear: () => void clearEditorGarden(), onToggleHud: togglePanels }, panelsVisible);
  } else {
    hideToolbar();
  }
  showPanels(shown && panelsVisible);
}
