import { pill } from "../../../ui/kit/badges";
import { color } from "../../../ui/kit/theme";
import { h } from "../../../ui/kit/dom";
import { select } from "../../../ui/kit/fields";
import { rarityBadge } from "../../../ui/kit/rarityBadge";
import { isCapReached } from "../inventoryCaps";
import { shopItemIcon } from "../itemIcon";
import { NotifierService } from "../notifier";
import { NotifierRules } from "../rules";
import { ShopRows, type NotifierFilters, type NotifierRow, type NotifierState } from "../shopRows";
import { AlertGrid } from "./alertGrid";

/** Every item a shop can sell, with its alert switch and custom rule. */

const TYPE_FILTERS: Array<[NonNullable<NotifierFilters["type"]>, string]> = [
  ["all", "All"],
  ["seed", "Seeds"],
  ["egg", "Eggs"],
  ["tool", "Tools"],
  ["decor", "Decor"],
];

const RARITY_FILTERS: Array<[NonNullable<NotifierFilters["rarity"]>, string]> = [
  ["all", "All"],
  ["common", "Common"],
  ["uncommon", "Uncommon"],
  ["rare", "Rare"],
  ["legendary", "Legendary"],
  ["mythical", "Mythical"],
  ["divine", "Divine"],
  ["celestial", "Celestial"],
];

const CAPPED_REASON = "Max owned, notifications disabled";

function filterSelect<T extends string>(id: string, minWidth: string, options: Array<[T, string]>): HTMLSelectElement {
  const sel = select({ id, width: minWidth });
  for (const [value, text] of options) {
    const opt = h("option", undefined, text);
    opt.value = value;
    sel.appendChild(opt);
  }
  sel.value = "all";
  return sel;
}

/** A small chip for a weather shop that sells the item: gold when only that shop does. */
function weatherChip(weather: string, only: boolean): HTMLSpanElement {
  const tint = only ? color.warn : color.accent;
  const chip = h("span", undefined, weather);
  Object.assign(chip.style, {
    padding: "1px 6px",
    borderRadius: "999px",
    fontSize: "10px",
    fontWeight: "600",
    background: only ? color.warnSoft : color.accentSoft,
    color: tint,
    border: `1px solid ${only ? color.warnBorder : color.accentBorder}`,
  });
  chip.title = only ? `Only available during ${weather}` : `Also available during ${weather}`;
  return chip;
}

function itemCell(row: NotifierRow): HTMLDivElement {
  const cell = h("div");
  Object.assign(cell.style, { display: "flex", alignItems: "center", gap: "6px", padding: "4px 6px" });

  const icon = shopItemIcon(row.id, row.name, 40, "alerts");
  Object.assign(icon.style, { borderRadius: "8px", background: color.mutedBg, marginRight: "6px" });

  const text = h("div");
  Object.assign(text.style, { display: "flex", flexDirection: "column", gap: "2px", lineHeight: "1.15", minWidth: "0", flex: "1 1 auto" });

  const title = h("div", undefined, row.name);
  Object.assign(title.style, { fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });

  const sub = h("div");
  Object.assign(sub.style, { opacity: "0.7", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" });
  sub.appendChild(h("span", undefined, row.type));
  for (const weather of row.weathers ?? []) sub.appendChild(weatherChip(weather, !!row.weatherOnly));

  text.append(title, sub);
  cell.append(icon, text);
  return cell;
}

export function renderShopsTab(view: HTMLElement): void {
  view.replaceChildren();

  const wrap = h("div");
  Object.assign(wrap.style, {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: "10px",
    height: "54vh",
    overflow: "hidden",
    minHeight: "0",
    position: "relative",
  });
  view.appendChild(wrap);

  const typeSelect = filterSelect("shop.filter.type", "140px", TYPE_FILTERS);
  const raritySelect = filterSelect("shop.filter.rarity", "160px", RARITY_FILTERS);
  const followedCount = pill("Followed: 0");
  followedCount.title = "Items with Overlay enabled";
  followedCount.style.marginLeft = "auto";

  const header = h("div");
  Object.assign(header.style, { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px", rowGap: "8px" });
  header.append(
    h("label", "qmm-label", "Type"),
    typeSelect,
    h("label", "qmm-label", "Rarity"),
    raritySelect,
    followedCount,
  );
  wrap.appendChild(header);

  const grid = new AlertGrid(["Item", "Rarity", "Notify", "Custom rules"], "200px", "No items.");
  wrap.appendChild(grid.root);

  let state: NotifierState | null = null;

  const filters = (): NotifierFilters => ({
    type: (typeSelect.value || "all") as NotifierFilters["type"],
    rarity: (raritySelect.value || "all") as NotifierFilters["rarity"],
  });
  const visibleRows = (s: NotifierState) => ShopRows.filter(s.rows, filters());

  /** Refreshes the switches and the count without redrawing the rows. */
  const updateRows = (s: NotifierState) => {
    for (const row of s.rows) {
      grid.setAlert(row.id, row.popup, isCapReached(row.id) ? CAPPED_REASON : null);
    }
    followedCount.textContent = `Followed: ${s.counts.followed}`;
  };

  const rebuild = () => {
    if (!state) {
      grid.setRows([]);
      return;
    }
    grid.setRows(
      visibleRows(state).map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        context: "shops" as const,
        item: itemCell(row),
        detail: rarityBadge(String(row.rarity ?? "-")),
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
      const rendered = grid.renderedIds();
      const ids = visibleRows(next).map((r) => r.id);
      if (!prev || ids.length !== rendered.size || ids.some((id) => !rendered.has(id))) rebuild();
      else updateRows(next);
    });
    NotifierRules.onChange(() => grid.refreshRules());
  })();
}
