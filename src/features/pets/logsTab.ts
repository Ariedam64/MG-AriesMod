// The Logs tab of the Pets menu: every pet ability proc recorded, with
// filters by ability, sort order and free text.

import { button } from "../../ui/kit/button";
import { plainCard, sectionLabel } from "../../ui/kit/card";
import { select, textInput } from "../../ui/kit/fields";
import { color } from "../../ui/kit/theme";
import { abilityPill } from "./abilityChips";
import { PetsService } from "./pets";
import { petIcon } from "./petIcon";

const css = (el: HTMLElement, style: Partial<CSSStyleDeclaration>) => Object.assign(el.style, style);

function options(el: HTMLSelectElement, entries: Array<[value: string, label: string]>): void {
  el.replaceChildren(
    ...entries.map(([value, label]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      return option;
    }),
  );
}

const PANEL_WIDTH = "min(760px, 88vw)";
const LIST_MAX_HEIGHT = "min(56vh, 520px)";
const PET_ICON_PX = 24;
/** Time | pet | ability | details. */
const ROW_TEMPLATE = "104px minmax(120px, 1.2fr) minmax(110px, 0.9fr) minmax(0, 2fr)";

type UILog = {
  petId: string;
  petName: string | null | undefined;
  species: string | null | undefined;
  mutations?: string[];
  abilityId: string;
  abilityName: string;
  /** Already formatted to a string by the service. */
  data: unknown;
  performedAt: number;
  date: string;
  time12: string;
  isActiveSession: boolean;
};

function formatDateMMDDYY(timestamp: number): string {
  const value = Number(timestamp);
  if (!Number.isFinite(value)) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const yy = String(date.getFullYear() % 100).padStart(2, "0");
  return `${mm}/${dd}/${yy}`;
}

function detailsOf(log: UILog): string {
  if (typeof log.data === "string") return log.data;
  try {
    return JSON.stringify(log.data) ?? "";
  } catch {
    return "";
  }
}

/** Ability names differ only by their roman numeral tier, so filtering ignores it. */
const normalizeAbilityKey = (value?: string | null) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/([ivx]+)$/i, "");

export function renderLogsTab(view: HTMLElement): void {
  view.replaceChildren();

  // Style an inner wrapper, never the tab view itself: an inline display on
  // the view would override the menu's .qmm-view show/hide rule.
  const wrap = document.createElement("div");
  css(wrap, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    width: PANEL_WIDTH,
    maxWidth: "100%",
    minHeight: "0",
    boxSizing: "border-box",
  });
  view.appendChild(wrap);

  const panel = plainCard();
  css(panel, { minHeight: "0" });
  wrap.appendChild(panel);

  /* ----- Toolbar ----- */
  const head = document.createElement("div");
  css(head, { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" });

  const title = document.createElement("div");
  css(title, { fontSize: "14.5px", fontWeight: "700", color: color.text, flex: "1 1 auto" });
  title.textContent = "📝 Ability logs";
  head.appendChild(title);

  const count = document.createElement("span");
  css(count, { fontSize: "11px", color: color.textDim, whiteSpace: "nowrap" });
  head.appendChild(count);

  panel.appendChild(head);

  const toolbar = document.createElement("div");
  css(toolbar, { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" });

  const selAbility = select({ small: true });
  options(selAbility, [["", "All abilities"]]);
  css(selAbility, { minWidth: "170px" });

  const selSort = select({ small: true });
  options(selSort, [["desc", "Newest first"], ["asc", "Oldest first"]]);
  selSort.value = "desc";

  const inputSearch = textInput("Search pet / ability / details", "", { small: true });
  css(inputSearch, { flex: "1 1 200px", minWidth: "160px" });

  const btnClear = button("🧹 Clear", {
    variant: "danger",
    size: "sm",
    title: "Clear all recorded logs",
    onClick: () => PetsService.clearAbilityLogs(),
  });

  toolbar.append(selAbility, selSort, inputSearch, btnClear);
  panel.appendChild(toolbar);

  /* ----- Column header ----- */
  const columns = document.createElement("div");
  css(columns, {
    display: "grid",
    gridTemplateColumns: ROW_TEMPLATE,
    gap: "10px",
    padding: "0 8px",
  });
  for (const label of ["When", "Pet", "Ability", "Details"]) {
    columns.appendChild(sectionLabel(label));
  }
  panel.appendChild(columns);

  /* ----- List ----- */
  const list = document.createElement("div");
  list.classList.add("qws-pnl-scroll");
  css(list, {
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    maxHeight: LIST_MAX_HEIGHT,
    overflowY: "auto",
    minHeight: "0",
  });
  panel.appendChild(list);

  /* ----- State ----- */
  const sessionStart = PetsService.getAbilityLogsSessionStart?.() ?? 0;

  let logs: UILog[] = [];
  let abilityFilter = "";
  let sortDir: "asc" | "desc" = "desc";
  let search = "";

  /* ----- Cells ----- */
  function whenCell(log: UILog): HTMLElement {
    const cell = document.createElement("div");
    css(cell, { display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" });

    if (log.date) {
      const date = document.createElement("span");
      css(date, { fontSize: "10px", color: color.textDim, fontVariantNumeric: "tabular-nums" });
      date.textContent = log.date;
      cell.appendChild(date);
    }

    const time = document.createElement("span");
    css(time, {
      fontSize: "11.5px",
      color: log.isActiveSession ? color.accent : color.text,
      fontWeight: log.isActiveSession ? "600" : "500",
      fontVariantNumeric: "tabular-nums",
      whiteSpace: "nowrap",
    });
    time.textContent = log.time12;
    cell.appendChild(time);

    return cell;
  }

  function petCell(log: UILog): HTMLElement {
    const cell = document.createElement("div");
    css(cell, { display: "flex", alignItems: "center", gap: "8px", minWidth: "0" });

    const name = document.createElement("span");
    css(name, {
      fontSize: "12px",
      color: color.text,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    });
    name.textContent = log.petName || log.species || "Pet";
    name.title = name.textContent;

    const icon = petIcon({ petSpecies: log.species, mutations: log.mutations, name: log.petName }, PET_ICON_PX);
    cell.append(icon, name);
    return cell;
  }

  function abilityCell(log: UILog): HTMLElement {
    const cell = document.createElement("div");
    css(cell, { display: "flex", minWidth: "0" });

    cell.appendChild(abilityPill(log.abilityId, log.abilityName || log.abilityId || "-"));
    return cell;
  }

  function detailsCell(log: UILog): HTMLElement {
    const cell = document.createElement("div");
    const text = detailsOf(log);
    css(cell, {
      fontSize: "11.5px",
      color: color.textDim,
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      minWidth: "0",
    });
    cell.textContent = text;
    cell.title = text;
    return cell;
  }

  function logRow(log: UILog): HTMLElement {
    const row = document.createElement("div");
    css(row, {
      display: "grid",
      gridTemplateColumns: ROW_TEMPLATE,
      alignItems: "center",
      gap: "10px",
      padding: "5px 8px",
      borderRadius: "8px",
      background: log.isActiveSession ? color.accentSoft : color.cardBg,
      border: `1px solid ${color.border}`,
      // A proc from this session reads at a glance without a legend.
      borderLeft: log.isActiveSession ? `2px solid ${color.accent}` : `1px solid ${color.border}`,
    });
    row.append(whenCell(log), petCell(log), abilityCell(log), detailsCell(log));
    return row;
  }

  /* ----- Filtering ----- */
  function applyFilters(): UILog[] {
    let result = logs.slice();

    if (abilityFilter.trim()) {
      const wanted = normalizeAbilityKey(abilityFilter);
      result = result.filter(log => {
        const byId = normalizeAbilityKey(log.abilityId);
        const byName = normalizeAbilityKey(PetsService.getAbilityNameWithoutLevel(log.abilityId));
        return byId === wanted || byName === wanted;
      });
    }

    if (search.trim()) {
      const needle = search.toLowerCase();
      result = result.filter(log =>
        (log.petName || log.species || "").toLowerCase().includes(needle) ||
        (log.abilityName || "").toLowerCase().includes(needle) ||
        (log.abilityId || "").toLowerCase().includes(needle) ||
        detailsOf(log).toLowerCase().includes(needle) ||
        (log.petId || "").toLowerCase().includes(needle));
    }

    result.sort((a, b) =>
      sortDir === "asc" ? a.performedAt - b.performedAt : b.performedAt - a.performedAt);
    return result;
  }

  function rebuildAbilityOptions(): void {
    const current = selAbility.value;
    const entries: Array<[string, string]> = [
      ["", "All abilities"],
      ...PetsService.getSeenAbilityIds().map((id) => [id, id] as [string, string]),
    ];
    options(selAbility, entries);
    selAbility.value = entries.some(([value]) => value === current) ? current : "";
  }

  function repaint(): void {
    const visible = applyFilters();
    count.textContent =
      visible.length === logs.length
        ? `${logs.length} entries`
        : `${visible.length} of ${logs.length} entries`;

    list.innerHTML = "";
    if (!visible.length) {
      const empty = document.createElement("div");
      css(empty, {
        fontSize: "12px",
        color: color.textDim,
        textAlign: "center",
        padding: "24px 8px",
      });
      empty.textContent = logs.length ? "No log matches these filters." : "🗒️ No logs yet.";
      list.appendChild(empty);
      return;
    }

    for (const log of visible) list.appendChild(logRow(log));
    // Newest first scrolls to the top; oldest first follows the tail.
    list.scrollTop = sortDir === "asc" ? list.scrollHeight : 0;
  }

  /* ----- Handlers ----- */
  selAbility.onchange = () => { abilityFilter = selAbility.value; repaint(); };
  selSort.onchange = () => { sortDir = (selSort.value as "asc" | "desc") || "desc"; repaint(); };
  inputSearch.addEventListener("input", () => { search = inputSearch.value.trim(); repaint(); });

  /* ----- Subscriptions ----- */
  void (async () => {
    try {
      await PetsService.startAbilityLogsWatcher();
      rebuildAbilityOptions();

      PetsService.onAbilityLogs(all => {
        logs = all.map(entry => ({
          petId: entry.petId,
          petName: entry.name ?? null,
          species: entry.species ?? null,
          mutations: Array.isArray(entry.mutations) ? entry.mutations.slice() : undefined,
          abilityId: entry.abilityId,
          abilityName: entry.abilityName,
          data: entry.data,
          performedAt: entry.performedAt,
          date: formatDateMMDDYY(entry.performedAt),
          time12: entry.time12,
          isActiveSession: sessionStart > 0 && entry.performedAt >= sessionStart,
        }));
        rebuildAbilityOptions();
        repaint();
      });
    } catch {}
  })();

  repaint();
}
