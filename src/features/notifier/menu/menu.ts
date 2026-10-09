import { Menu } from "../../../ui/kit/menu";
import { renderPetsTab } from "./petsTab";
import { renderSettingsTab } from "./settingsTab";
import { renderShopsTab } from "./shopsTab";
import { renderWeatherTab } from "./weatherTab";

/** The Alerts window: shop items, weathers, pet hunger, and the sound settings. */
export function renderNotifierMenu(root: HTMLElement): void {
  const ui = new Menu({ id: "alerts", compact: true, windowSelector: ".qws-win" });
  ui.addTab("shops", "Shops", renderShopsTab);
  ui.addTab("weather", "Weather", renderWeatherTab);
  ui.addTab("pets", "Pets", renderPetsTab);
  ui.addTab("settings", "Settings", renderSettingsTab);
  ui.mount(root);
}
