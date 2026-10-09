// The Calculator menu: pick a crop on the left, then set its Size, mutations
// and friend bonus on the right to see its sell price and weight.

import { getLockerSeedOptions, type LockerSeedOption } from "../locker/seedOptions";
import { Menu } from "../../ui/kit/menu";
import { h } from "../../ui/kit/dom";
import { VTabs } from "../../ui/kit/vtabs";
import { defaultCalculatorState, type CalculatorState } from "./compute";
import { calculatorDetail } from "./detail";
import { cropEmoji, cropListIcon } from "./sprites";
import { ensureCalculatorStyles } from "./styles";

const LIST_ICON_PX = 24;

function renderCropsTab(view: HTMLElement): void {
  ensureCalculatorStyles();
  view.replaceChildren();

  const detail = calculatorDetail();
  const listPane = h("div", "qws-calc__list");
  const layout = h("div", "qws-calc__layout");
  layout.append(listPane, detail.root);
  const root = h("div", "qws-calc");
  root.appendChild(layout);
  view.appendChild(root);

  // State: one set of choices per crop, kept while the menu lives.
  const states = new Map<string, CalculatorState>();
  const optionByKey = new Map<string, LockerSeedOption>();
  const listIcons = new Map<string, HTMLElement>();
  let selectedKey: string | null = null;

  const stateFor = (key: string): CalculatorState => {
    let state = states.get(key);
    if (!state) states.set(key, (state = defaultCalculatorState()));
    return state;
  };

  function renderDetail(): void {
    detail.show(selectedKey ? { key: selectedKey, option: optionByKey.get(selectedKey), state: stateFor(selectedKey) } : null);
  }

  const tabs = new VTabs({
    filterPlaceholder: "Search crops",
    emptyText: "No crops found.",
    fillAvailableHeight: true,
    onSelect: (id) => {
      if (id === selectedKey) return;
      selectedKey = id;
      renderDetail();
    },
    renderItem: (item, btn) => {
      // Icons are kept between renders: the list redraws on every selection,
      // and a fresh icon would flash its emoji for a frame.
      let icon = listIcons.get(item.id);
      if (!icon) {
        const option = optionByKey.get(item.id);
        icon = option ? cropListIcon(option, cropEmoji(option, option.key), LIST_ICON_PX) : h("span");
        listIcons.set(item.id, icon);
      }
      btn.append(icon, h("span", "qws-calc-item__name", item.title), h("span"));
    },
  });
  listPane.appendChild(tabs.root);

  function renderList(): void {
    const options = getLockerSeedOptions();
    optionByKey.clear();
    listIcons.clear();
    for (const option of options) optionByKey.set(option.key, option);

    tabs.setItems(options.map((option) => ({ id: option.key, title: option.cropName || option.key })));
    const selected = tabs.getSelected()?.id ?? null;
    if (!selected && options.length) {
      tabs.select(options[0].key);
      return;
    }
    selectedKey = selected;
    renderDetail();
  }

  renderList();

  // The live plant catalog can land after the menu is drawn.
  window.addEventListener("gemini:data-updated", (event) => {
    if ((event as CustomEvent<{ key: string }>).detail?.key === "plants") renderList();
  });
}

export async function renderCalculatorMenu(container: HTMLElement) {
  const ui = new Menu({ id: "calculator", compact: true });
  ui.addTab("crops", "Crops", renderCropsTab);
  ui.mount(container);
}
