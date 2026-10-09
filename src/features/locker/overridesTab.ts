// The locker menu's per-crop tab: every crop in a list, and for the selected
// one a switch to give it its own filters instead of the global ones.

import { h } from "../../ui/kit/dom";
import { switchInput, type SwitchInput } from "../../ui/kit/toggles";
import { VTabs, type VTabItem } from "../../ui/kit/vtabs";
import { lockerCard } from "./lockerCard";
import { seedIcon } from "./menuIcons";
import type { LockerTab } from "./restrictionsTab";
import { lockerSettingsCard, type SettingsCard } from "./settingsCard";
import type { LockerMenuStore, OverrideDraft } from "./settingsDraft";
import { getLockerSeedOptions } from "./seedOptions";

const overrideStatus = (enabled: boolean) =>
  enabled ? "Uses its own rules below." : "Follows the General tab.";

export function overridesTab(store: LockerMenuStore): LockerTab {
  const layout = h("div", "lk-overrides");
  const detail = h("div", "lk-overrides__detail");

  /** Icons are kept across list redraws, so a click does not reload every sprite. */
  const icons = new Map<string, HTMLElement>();
  const iconFor = (key: string) => {
    let icon = icons.get(key);
    if (!icon) {
      icon = seedIcon(key, 24, getLockerSeedOptions().find((opt) => opt.key === key)?.spriteKey);
      icons.set(key, icon);
    }
    return icon;
  };

  const list = new VTabs({
    filterPlaceholder: "Search crops",
    emptyText: "No crops found.",
    fillAvailableHeight: true,
    renderItem: (item, btn) => {
      btn.classList.add("lk-crop-tab");
      btn.append(iconFor(item.id), h("span", "lk-crop-tab__name", item.title));
      if (item.badge) btn.appendChild(h("span", "lk-on", item.badge));
    },
    onSelect: () => renderDetail(),
  });
  layout.append(list.root, detail);

  const listItems = (): VTabItem[] =>
    getLockerSeedOptions().map((opt) => ({
      id: opt.key,
      title: opt.cropName || opt.key,
      badge: store.isOverrideEnabled(opt.key) ? "On" : null,
    }));

  /** Scroll position of the detail pane per crop, so coming back to one lands where it was. */
  const scrollMemory = new Map<string, number>();
  let shown: { key: string; entry: OverrideDraft; form: SettingsCard; toggle: SwitchInput; showStatus(): void } | null = null;
  detail.addEventListener("scroll", () => {
    if (shown) scrollMemory.set(shown.key, detail.scrollTop);
  });

  function renderDetail() {
    const key = list.getSelected()?.id ?? null;
    if (!key) {
      shown = null;
      detail.replaceChildren(h("div", "lk-empty-state", "Pick a crop to give it rules of its own."));
      return;
    }

    const entry = store.ensureOverride(key);
    // The same crop and the same draft: the open form only needs to catch up.
    if (shown && shown.key === key && shown.entry === entry) {
      shown.toggle.setChecked(entry.enabled);
      shown.form.setDisabled(!entry.enabled);
      shown.form.refresh();
      shown.showStatus();
      return;
    }

    const seed = getLockerSeedOptions().find((opt) => opt.key === key);
    const name = seed?.cropName || key;
    const toggle = switchInput(entry.enabled, (on) => store.setOverrideEnabled(key, on));
    toggle.setAttribute("aria-label", `Own rules for ${name}`);
    const header = lockerCard(name, { icon: seedIcon(key, 36, seed?.spriteKey), control: toggle });
    header.root.classList.add("lk-hero");
    const showStatus = () => header.setSubtitle(overrideStatus(entry.enabled));

    const form = lockerSettingsCard(entry.settings, () => store.notifyOverrideSettingsChanged(key));
    form.setDisabled(!entry.enabled);
    showStatus();

    detail.replaceChildren(header.root, form.root);
    detail.scrollTop = scrollMemory.get(key) ?? 0;
    shown = { key, entry, form, toggle, showStatus };
  }

  const refresh = () => {
    list.setItems(listItems());
    renderDetail();
  };
  refresh();
  store.subscribe(refresh);

  // The live catalog can add crops after the menu was built.
  window.addEventListener("gemini:data-updated", (e) => {
    if ((e as CustomEvent<{ key: string }>).detail?.key === "plants") refresh();
  });

  return {
    render(view) {
      view.classList.add("lk-view", "qmm-scroll");
      view.replaceChildren(layout);
      refresh();
    },
  };
}
