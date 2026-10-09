// The locker menu's Overrides tab: every crop in a list, and for the selected
// one a switch to give it its own filters instead of the global ones.

import { card } from "../../ui/kit/card";
import { switchInput, type SwitchInput } from "../../ui/kit/toggles";
import { VTabs, type VTabItem } from "../../ui/kit/vtabs";
import { color } from "../../ui/kit/theme";
import { seedIcon } from "./menuIcons";
import type { LockerTab } from "./restrictionsTab";
import { lockerSettingsCard, type SettingsCard } from "./settingsCard";
import type { LockerMenuStore, OverrideDraft } from "./settingsDraft";
import { getLockerSeedOptions } from "./seedOptions";

const OVERRIDE_ON = color.ok;
const OVERRIDE_OFF = color.danger;

export function overridesTab(store: LockerMenuStore): LockerTab {
  const layout = document.createElement("div");
  layout.className = "lk-overrides";
  const detail = document.createElement("div");
  detail.className = "lk-overrides__detail";

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
    emptyText: "No crops available.",
    fillAvailableHeight: true,
    renderItem: (item, btn) => {
      btn.classList.add("lk-crop-tab");
      const dot = document.createElement("span");
      dot.className = "qmm-dot";
      dot.style.background = item.statusColor ?? OVERRIDE_OFF;
      const label = document.createElement("span");
      label.className = "label";
      label.textContent = item.title;
      btn.append(dot, label, iconFor(item.id));
    },
    onSelect: () => renderDetail(),
  });
  layout.append(list.root, detail);

  const listItems = (): VTabItem[] =>
    getLockerSeedOptions().map((opt) => ({
      id: opt.key,
      title: opt.cropName || opt.key,
      statusColor: store.isOverrideEnabled(opt.key) ? OVERRIDE_ON : OVERRIDE_OFF,
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
      const empty = document.createElement("div");
      empty.className = "lk-empty lk-overrides__placeholder lk-wide";
      empty.textContent = "Select a crop on the left to customise its locker settings.";
      detail.replaceChildren(empty);
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
    const toggle = switchInput(entry.enabled, (on) => store.setOverrideEnabled(key, on));
    const header = card(seed?.cropName || key, { actions: [toggle] });
    header.root.classList.add("lk-wide");
    header.header.prepend(seedIcon(key, 32, seed?.spriteKey));
    header.root.removeChild(header.body);

    const status = document.createElement("div");
    status.className = "lk-hint lk-wide";
    const showStatus = () => {
      status.textContent = entry.enabled ? "This crop uses its own locker filters." : "Uses the global locker settings.";
    };

    const form = lockerSettingsCard(entry.settings, () => store.notifyOverrideSettingsChanged(key));
    form.setDisabled(!entry.enabled);
    showStatus();

    detail.replaceChildren(header.root, status, form.root);
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
      view.replaceChildren(layout);
      refresh();
    },
  };
}
