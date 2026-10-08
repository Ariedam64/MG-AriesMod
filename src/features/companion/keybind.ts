// The shortcut that opens the companion straight on its chat.
//
// Two events rather than a direct call: the HUD and the menus live in `ui/`,
// and a feature has no business reaching for an instance there. The first
// opens the window, the second tells it which tab to show.
//
// The order matters. `qws:open-panel` mounts the menu, which installs its tab
// listener on the way, so the second event can only go after. A window
// already open is just brought forward and its listener is still in place, so
// both cases end up the same.

import { eventMatchesKeybind } from "../keybinds/keybinds";
import { shouldIgnoreKeydown } from "../../lib/keyboard";

/** The window's id, as `main.ts` registers it with the HUD. */
const COMPANION_PANEL_ID = "companion";
const CHAT_TAB_ID = "chat";

/** Asks the companion menu to switch tab. Listened to by `menu/index.ts`. */
export const COMPANION_TAB_EVENT = "qws:companion-tab";

let installed = false;

function openCompanionChat(): void {
  window.dispatchEvent(new CustomEvent("qws:open-panel", { detail: { id: COMPANION_PANEL_ID } }));
  window.dispatchEvent(new CustomEvent(COMPANION_TAB_EVENT, { detail: { tab: CHAT_TAB_ID } }));
}

export function installCompanionKeybindsOnce(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind("companion.chat", event)) return;

      event.preventDefault();
      event.stopPropagation();
      openCompanionChat();
    },
    true,
  );
}
