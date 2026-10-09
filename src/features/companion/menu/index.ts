// The companion's menu: two tabs. What he says is not one of them: his lines
// follow the game's state and are not set by hand.

import { Menu } from "../../../ui/kit/menu";
import { COMPANION_TAB_EVENT } from "../keybind";
import { renderBehaviorTab } from "./behaviorTab";
import { renderChatTab } from "./chatTab";
import { ensureCompanionStyles } from "./styles";

const TABS = ["behavior", "chat"] as const;

export function renderCompanionMenu(root: HTMLElement): void {
  ensureCompanionStyles();
  const ui = new Menu({ id: "companion", compact: true, windowSelector: ".qws-win" });
  ui.mount(root);
  // The thread needs width: HUD windows size to their content, and with no
  // floor the companion opened in a column where every message took five
  // lines. The floor gives way on a screen narrower than it.
  root.classList.add("qws-cmp-window");

  ui.addTab("behavior", "Behavior", (view) => renderBehaviorTab(view));
  ui.addTab("chat", "Chat", (view) => renderChatTab(view));

  // The keyboard shortcut asks for a given tab.
  //
  // It is checked first: `switchTo` takes any string and simply activates
  // nothing, which would leave an empty window with no way out. And the
  // listener goes once the window is gone, since the HUD redraws a menu
  // without ever calling a cleanup.
  const onTabRequest = (event: Event): void => {
    if (!root.isConnected) {
      window.removeEventListener(COMPANION_TAB_EVENT, onTabRequest);
      return;
    }
    const tab = String((event as CustomEvent).detail?.tab ?? "");
    if (TABS.includes(tab as (typeof TABS)[number])) ui.switchTo(tab);
  };
  window.addEventListener(COMPANION_TAB_EVENT, onTabRequest);
}
