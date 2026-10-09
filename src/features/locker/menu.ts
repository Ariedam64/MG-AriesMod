// The Locker menu: the global harvest filters, the per-crop overrides and the
// other restrictions, one tab each.

import { h } from "../../ui/kit/dom";
import { Menu } from "../../ui/kit/menu";
import { switchInput } from "../../ui/kit/toggles";
import { lockerService } from "./locker";
import { lockerCard } from "./lockerCard";
import { ensureLockerMenuStyles } from "./menuStyles";
import { overridesTab } from "./overridesTab";
import { restrictionsTab, type LockerTab } from "./restrictionsTab";
import { lockerSettingsCard } from "./settingsCard";
import { LockerMenuStore } from "./settingsDraft";

function generalTab(store: LockerMenuStore): LockerTab {
  const root = h("div", "lk-tab");

  const toggle = switchInput(store.global.enabled, (on) => store.setGlobalEnabled(on));
  toggle.setAttribute("aria-label", "Harvest locker");
  const header = lockerCard("Harvest locker", { control: toggle });
  header.root.classList.add("lk-hero");

  const form = lockerSettingsCard(store.global.settings, () => store.notifyGlobalSettingsChanged());
  root.append(header.root, form.root);

  const update = () => {
    toggle.setChecked(store.global.enabled);
    header.setSubtitle(
      store.global.enabled
        ? "On. Harvests follow the rules below."
        : "Off. Turn it on to apply the rules below.",
    );
    form.setDisabled(!store.global.enabled);
    form.refresh();
  };
  store.subscribe(update);
  update();

  return {
    render(view) {
      view.classList.add("lk-view", "qmm-scroll");
      view.replaceChildren(root);
      update();
    },
  };
}

export async function renderLockerMenu(container: HTMLElement) {
  ensureLockerMenuStyles();
  const ui = new Menu({ id: "locker", compact: true });
  ui.mount(container);
  ui.root.classList.add("lk-menu");

  const store = new LockerMenuStore(lockerService.getState());
  const tabs = { general: generalTab(store), overrides: overridesTab(store), restrictions: restrictionsTab() };
  ui.addTabs([
    { id: "locker-general", title: "General", render: (view) => tabs.general.render(view) },
    { id: "locker-overrides", title: "Per crop", render: (view) => tabs.overrides.render(view) },
    { id: "locker-restrictions", title: "Restrictions", render: (view) => tabs.restrictions.render(view) },
  ]);
  ui.switchTo("locker-general");

  lockerService.subscribe((state) => store.syncFromService(state));
}
