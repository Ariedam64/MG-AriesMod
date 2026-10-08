// The Locker menu: the global harvest filters, the per-crop overrides and the
// other restrictions, one tab each.

import { Menu } from "../../ui/kit/menu";
import { card } from "../../ui/kit/card";
import { switchInput } from "../../ui/kit/toggles";
import { lockerService } from "./locker";
import { ensureLockerMenuStyles } from "./menuStyles";
import { overridesTab } from "./overridesTab";
import { restrictionsTab, type LockerTab } from "./restrictionsTab";
import { lockerSettingsCard } from "./settingsCard";
import { LockerMenuStore } from "./settingsDraft";


function generalTab(store: LockerMenuStore): LockerTab {
  const root = document.createElement("div");
  root.className = "lk-column";

  const toggle = switchInput(store.global.enabled, (on) => store.setGlobalEnabled(on));
  const enabled = document.createElement("label");
  enabled.className = "qmm-flex";
  const enabledText = document.createElement("span");
  enabledText.className = "qmm-label";
  enabledText.textContent = "Enabled";
  enabled.append(enabledText, toggle);
  const header = card("Global locker", {
    subtitle: "Set the rules for locking or allowing harvests using the filters below",
    actions: [enabled],
  });
  header.root.classList.add("lk-wide");
  header.root.removeChild(header.body);

  const form = lockerSettingsCard(store.global.settings, () => store.notifyGlobalSettingsChanged());
  root.append(header.root, form.root);

  const update = () => {
    toggle.setChecked(store.global.enabled);
    form.setDisabled(!store.global.enabled);
    form.refresh();
  };
  const off = store.subscribe(update);
  update();

  return {
    render(view) {
      view.classList.add("lk-view");
      view.replaceChildren(root);
      update();
    },
    destroy: off,
  };
}

export async function renderLockerMenu(container: HTMLElement) {
  ensureLockerMenuStyles();
  const ui = new Menu({ id: "locker", compact: true });
  ui.mount(container);

  const store = new LockerMenuStore(lockerService.getState());
  const tabs = { general: generalTab(store), overrides: overridesTab(store), restrictions: restrictionsTab() };
  ui.addTabs([
    { id: "locker-general", title: "General", render: (view) => tabs.general.render(view) },
    { id: "locker-overrides", title: "Overrides", render: (view) => tabs.overrides.render(view) },
    { id: "locker-restrictions", title: "Restrictions", render: (view) => tabs.restrictions.render(view) },
  ]);
  ui.switchTo("locker-general");

  const offService = lockerService.subscribe((state) => store.syncFromService(state));
  // Nothing unmounts a menu today, so this never runs; it is here for the day something does.
  ui.on("unmounted", () => {
    offService();
    Object.values(tabs).forEach((tab) => tab.destroy());
  });
}
