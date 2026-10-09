// Whether the Debug menu shows in the launcher. It is a developer tool, so it
// stays hidden until a player turns it on in Misc, Display.

import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { setMenuHidden } from "../../ui/kit/menuVisibility";

const PATH = "misc.showDebugMenu";
const MENU_ID = "debug-data";

export function isDebugMenuShown(): boolean {
  return readAriesPath<unknown>(PATH) === true;
}

export function setDebugMenuShown(shown: boolean): void {
  writeAriesPath(PATH, shown);
  setMenuHidden(MENU_ID, !shown);
}

/** Applies the saved choice; call before the HUD registers its menus. */
export function initDebugMenuVisibility(): void {
  setMenuHidden(MENU_ID, !isDebugMenuShown());
}
