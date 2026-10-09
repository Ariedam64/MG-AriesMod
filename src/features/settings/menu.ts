import { Menu } from "../../ui/kit/menu";
import { renderAppearanceTab } from "./appearanceTab";
import { renderDataTab } from "./dataTab";
import { renderInfosTab } from "./infosTab";

export function renderSettingsMenu(container: HTMLElement) {
  const ui = new Menu({ id: "settings", compact: true });
  ui.mount(container);
  ui.addTabs([
    { id: "settings-data", title: "Settings", render: renderDataTab },
    { id: "settings-appearance", title: "Appearance", render: renderAppearanceTab },
    { id: "settings-infos", title: "Infos", render: renderInfosTab },
  ]);
  ui.switchTo("settings-data");
}
