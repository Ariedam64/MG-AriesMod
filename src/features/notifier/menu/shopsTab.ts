import { pill } from "../../../ui/kit/badges";
import { h } from "../../../ui/kit/dom";
import { select } from "../../../ui/kit/fields";
import { rarityBadge } from "../../../ui/kit/rarityBadge";
import { isCapReached } from "../inventoryCaps";
import { shopItemIcon } from "../itemIcon";
import { NotifierService } from "../notifier";
import { NotifierRules } from "../rules";
import { ShopRows, type NotifierFilters, type NotifierRow, type NotifierState } from "../shopRows";
import { AlertList } from "./alertList";
import { ensureMenuStyles } from "./styles";

/** Every item a shop can sell, with its alert switch and custom rule. */

const TYPE_FILTERS: Array<[NonNullable<NotifierFilters["type"]>, string]> = [
  ["all", "All types"],
  ["seed", "Seeds"],
  ["egg", "Eggs"],
  ["tool", "Tools"],
  ["decor", "Decor"],
];

const RARITY_FILTERS: Array<[NonNullable<NotifierFilters["rarity"]>, string]> = [
  ["all", "All rarities"],
  ["common", "Common"],
  ["uncommon", "Uncommon"],
  ["rare", "Rare"],
  ["legendary", "Legendary"],
  ["mythical", "Mythical"],
  ["divine", "Divine"],
  ["celestial", "Celestial"],
];

const CAPPED_REASON = "Max owned, notifications disabled";

function filterSelect<T extends string>(id: string, label: string, options: Array<[T, string]>): HTMLSelectElement {
  const sel = select({ id, small: true });
  sel.setAttribute("aria-label", label);
  for (const [value, text] of options) {
    const opt = h("option", undefined, text);
    opt.value = value;
    sel.appendChild(opt);
  }
  sel.value = "all";
  return sel;
}

/** A weather shop that sells the item: warm when only that shop does. */
function weatherChip(weather: string, only: boolean): HTMLSpanElement {
  const chip = h("span", only ? "qws-al-chip is-only" : "qws-al-chip is-weather", only ? `${weather} only` : weather);
  chip.title = only ? `Only available during ${weather}` : `Also available during ${weather}`;
  return chip;
}


function details(row: NotifierRow): HTMLDivElement {
  const meta = h("div", "qws-al-meta");
  meta.append(rarityBadge(String(row.rarity ?? "-")), h("span", undefined, row.type));
  for (const weather of row.weathers ?? []) meta.appendChild(weatherChip(weather, !!row.weatherOnly));
  return meta;
}

export function renderShopsTab(view: HTMLElement): void {
  ensureMenuStyles();
  const tab = h("div", "qws-al-tab");
  view.replaceChildren(tab);

  const typeSelect = filterSelect("shop.filter.type", "Type", TYPE_FILTERS);
  const raritySelect = filterSelect("shop.filter.rarity", "Rarity", RARITY_FILTERS);
  const followedCount = pill("0 followed");
  followedCount.title = "Items with alerts on";

  const toolbar = h("div", "qws-al-toolbar");
  toolbar.append(typeSelect, raritySelect, followedCount);

  const list = new AlertList("No item matches these filters.");
  tab.append(toolbar, list.root);

  let state: NotifierState | null = null;

  const filters = (): NotifierFilters => ({
    type: (typeSelect.value || "all") as NotifierFilters["type"],
    rarity: (raritySelect.value || "all") as NotifierFilters["rarity"],
  });
  const visibleRows = (s: NotifierState) => ShopRows.filter(s.rows, filters());

  /** Refreshes the switches and the count without redrawing the rows. */
  const updateRows = (s: NotifierState) => {
    for (const row of s.rows) {
      list.setAlert(row.id, row.popup, isCapReached(row.id) ? CAPPED_REASON : null);
    }
    followedCount.textContent = `${s.counts.followed} followed`;
  };

  const rebuild = () => {
    if (!state) {
      list.setRows([]);
      return;
    }
    list.setRows(
      visibleRows(state).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        context: "shops" as const,
        icon: shopItemIcon(row.id, row.name, 40, "alerts"),
        details: [details(row)],
        alertOn: row.popup,
        onAlertChange: (on: boolean) => ShopRows.setFollowed(row.id, on),
      })),
    );
    updateRows(state);
  };

  typeSelect.onchange = () => state && rebuild();
  raritySelect.onchange = () => state && rebuild();

  void (async () => {
    await NotifierService.onChangeNow((next) => {
      const prev = state;
      state = next;
      // Redraw only when the filtered set of items changed.
      const rendered = list.renderedIds();
      const ids = visibleRows(next).map((r) => r.id);
      if (!prev || ids.length !== rendered.size || ids.some((id) => !rendered.has(id))) rebuild();
      else updateRows(next);
    });
    NotifierRules.onChange(() => list.refreshRules());
  })();
}
