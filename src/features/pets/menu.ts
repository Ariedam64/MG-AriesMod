// The Pets window: Manager, Team Builder, Feeding, Hatch and Logs tabs.

import { Menu } from "../../ui/kit/menu";
import { renderHatchTab } from "../hatch/tab";
import { renderFeedingTab } from "./feedingTab";
import { renderLogsTab } from "./logsTab";
import { renderManagerTab } from "./managerTab";
import { renderTeamBuilderTab } from "./teamBuilderTab";

/** Other features open a tab with `qws:pets-open-tab`, `{ detail: { tab } }`. */
const OPEN_TAB_EVENT = "qws:pets-open-tab";
const TABS = new Set(["manager", "teambuilder", "feeding", "hatch", "logs"]);

let detachOpenTabListener: (() => void) | null = null;

export function renderPetsMenu(root: HTMLElement): void {
  const ui = new Menu({ id: "pets", compact: true, windowSelector: ".qws-win" });
  ui.mount(root);

  ui.addTab("manager", "🧰 Manager", (view) => renderManagerTab(view, ui));
  ui.addTab("teambuilder", "🧩 Team Builder", (view) => renderTeamBuilderTab(view));
  ui.addTab("feeding", "🍖 Feeding", (view) => renderFeedingTab(view));
  ui.addTab("hatch", "🥚 Hatch", (view) => renderHatchTab(view));
  ui.addTab("logs", "📝 Logs", (view) => renderLogsTab(view));

  const onOpenTab = (ev: Event) => {
    const tab = String((ev as CustomEvent).detail?.tab || "");
    if (TABS.has(tab)) ui.switchTo(tab);
  };
  detachOpenTabListener?.();
  window.addEventListener(OPEN_TAB_EVENT, onOpenTab);
  detachOpenTabListener = () => window.removeEventListener(OPEN_TAB_EVENT, onOpenTab);
}
