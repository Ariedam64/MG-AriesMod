// The row added under the inventory's filters: sort key, sort direction, the
// "Show values" switch and the total value of what is shown.

import { select as kitSelect } from "../../ui/kit/fields";
import { switchInput } from "../../ui/kit/toggles";
import { color } from "../../ui/kit/theme";
import { FILTERS_BLOCK_SELECTOR } from "./inventoryDom";
import { DIRECTION_LABELS, DIRECTIONS, type SortDirection, type SortKey, type SortOption } from "./sortOptions";
import { ValueSummary } from "./valueDisplay";

const WRAP_CLASS = "tm-sort-wrap";

export interface SortBarHandlers {
  onSortChange(sortKey: SortKey, direction: SortDirection): void;
  onShowValuesChange(visible: boolean): void;
}

export interface SortBar {
  wrap: HTMLElement;
  sortSelect: HTMLSelectElement;
  directionSelect: HTMLSelectElement;
  showValues: HTMLInputElement;
  summary: ValueSummary;
  /** The last key and direction picked, kept while the select is re-rendered. */
  lastSortKey: SortKey | null;
  lastDirection: SortDirection | null;
}

const bars = new WeakMap<HTMLElement, SortBar>();

function caption(text: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.textContent = text;
  Object.assign(el.style, { font: "inherit", opacity: "0.8", flex: "0 0 auto" });
  return el;
}

function createSortBar(handlers: SortBarHandlers): SortBar {
  const wrap = document.createElement("div");
  wrap.className = WRAP_CLASS;
  // Spans every column of the filters grid, as its own full-width row.
  Object.assign(wrap.style, { display: "block", width: "100%", gridColumn: "1 / -1", flex: "0 0 auto", contain: "layout style" });

  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "8px",
    marginTop: "10px",
    paddingTop: "8px",
    borderTop: `1px solid ${color.borderStrong}`,
    width: "100%",
    boxSizing: "border-box",
  });

  const sortSelect = kitSelect({ small: true });
  const directionSelect = kitSelect({ small: true });
  for (const direction of DIRECTIONS) {
    directionSelect.appendChild(new Option(DIRECTION_LABELS[direction], direction));
  }

  const showValues = switchInput(true);
  const showValuesLabel = document.createElement("label");
  Object.assign(showValuesLabel.style, { display: "inline-flex", alignItems: "center", gap: "8px", cursor: "pointer", flex: "0 0 auto" });
  showValuesLabel.append(showValues, "Show values");

  const divider = document.createElement("span");
  Object.assign(divider.style, { alignSelf: "stretch", width: "1px", minHeight: "24px", background: color.border, flex: "0 0 auto" });

  const summary = new ValueSummary();
  row.append(caption("Sort by:"), sortSelect, caption("Order:"), directionSelect, divider, showValuesLabel, summary.el);
  wrap.appendChild(row);

  const bar: SortBar = { wrap, sortSelect, directionSelect, showValues, summary, lastSortKey: null, lastDirection: null };
  const picked = () => {
    bar.lastSortKey = (sortSelect.value as SortKey) || "none";
    bar.lastDirection = (directionSelect.value as SortDirection) || "asc";
    handlers.onSortChange(bar.lastSortKey, bar.lastDirection);
  };
  sortSelect.addEventListener("change", picked);
  directionSelect.addEventListener("change", picked);
  showValues.addEventListener("change", () => handlers.onShowValuesChange(showValues.checked));
  return bar;
}

/** The grid's sort bar, added at the end of its filters block the first time. Null when the block is not there. */
export function ensureSortBar(grid: Element, handlers: SortBarHandlers): SortBar | null {
  const filtersBlock = grid.querySelector(FILTERS_BLOCK_SELECTOR);
  if (!filtersBlock) return null;
  const existing = filtersBlock.querySelector<HTMLElement>(`:scope > .${WRAP_CLASS}`);
  const bar = (existing && bars.get(existing)) || createSortBar(handlers);
  bars.set(bar.wrap, bar);
  if (bar.wrap.parentElement !== filtersBlock) filtersBlock.appendChild(bar.wrap);
  return bar;
}

/** Lists `options`, selecting `preferred` when it is one of them, else "None". */
export function renderSortOptions(select: HTMLSelectElement, options: SortOption[], preferred: string | null): void {
  const previous = preferred ?? select.value;
  select.replaceChildren(...options.map((opt) => new Option(opt.label, opt.value)));
  if (options.some((o) => o.value === "none")) select.value = "none";
  if (previous && previous !== "none" && options.some((o) => o.value === previous)) select.value = previous;
}
