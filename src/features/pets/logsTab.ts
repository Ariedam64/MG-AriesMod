// The Logs tab of the Pets menu: every pet ability proc recorded, with
// filters by ability, sort order and free text.

import { pill } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { sectionLabel } from "../../ui/kit/card";
import { select, textInput } from "../../ui/kit/fields";
import { abilityPill } from "./abilityChips";
import { PetsService } from "./pets";
import { petIcon } from "./petIcon";
import { ensurePetsStyles } from "./styles";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

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

const PET_ICON_PX = 24;

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
  ensurePetsStyles();
  view.replaceChildren();

  // Style an inner wrapper, never the tab view itself: an inline display on
  // the view would override the menu's .qmm-view show/hide rule.
  const wrap = document.createElement("div");
  wrap.className = "pt-tab";
  view.appendChild(wrap);

  /* ----- Title, count and clear ----- */
  const head = document.createElement("div");
  head.className = "pt-logs__head";
  const count = pill("");
  const btnClear = button("Clear", {
    variant: "danger",
    size: "sm",
    title: "Clear all recorded logs",
    onClick: () => PetsService.clearAbilityLogs(),
  });
  head.append(el("div", "pt-logs__title", "Ability logs"), count, btnClear);
  wrap.appendChild(head);

  /* ----- Filters ----- */
  const toolbar = document.createElement("div");
  toolbar.className = "pt-logs__tools";

  const inputSearch = textInput("Search pets, abilities, details", "", { small: true });
  inputSearch.classList.add("pt-logs__search");
  inputSearch.setAttribute("aria-label", "Search the logs");

  const selAbility = select({ small: true });
  selAbility.classList.add("pt-logs__ability");
  selAbility.setAttribute("aria-label", "Ability");
  options(selAbility, [["", "All abilities"]]);

  const selSort = select({ small: true });
  selSort.setAttribute("aria-label", "Order");
  options(selSort, [["desc", "Newest first"], ["asc", "Oldest first"]]);
  selSort.value = "desc";

  toolbar.append(inputSearch, selAbility, selSort);
  wrap.appendChild(toolbar);

  /* ----- Column header ----- */
  const columns = document.createElement("div");
  columns.className = "pt-logs__cols";
  for (const label of ["When", "Pet", "Ability", "Details"]) {
    columns.appendChild(sectionLabel(label));
  }
  wrap.appendChild(columns);

  /* ----- List ----- */
  const list = document.createElement("div");
  list.className = "pt-logs__list qws-pnl-scroll";
  wrap.appendChild(list);

  /* ----- State ----- */
  const sessionStart = PetsService.getAbilityLogsSessionStart?.() ?? 0;

  let logs: UILog[] = [];
  let abilityFilter = "";
  let sortDir: "asc" | "desc" = "desc";
  let search = "";

  /* ----- Cells ----- */
  function whenCell(log: UILog): HTMLElement {
    const cell = el("div", "pt-log__when");
    if (log.date) cell.appendChild(el("span", "pt-log__date", log.date));
    cell.appendChild(el("span", "pt-log__time", log.time12));
    return cell;
  }

  function petCell(log: UILog): HTMLElement {
    const cell = el("div", "pt-log__pet");
    const name = el("span", "pt-log__name", log.petName || log.species || "Pet");
    name.title = name.textContent ?? "";
    const icon = petIcon({ petSpecies: log.species, mutations: log.mutations, name: log.petName }, PET_ICON_PX);
    cell.append(icon, name);
    return cell;
  }

  function abilityCell(log: UILog): HTMLElement {
    const cell = el("div", "pt-log__ability");
    cell.appendChild(abilityPill(log.abilityId, log.abilityName || log.abilityId || "-"));
    return cell;
  }

  function detailsCell(log: UILog): HTMLElement {
    const text = detailsOf(log);
    const cell = el("div", "pt-log__details", text);
    cell.title = text;
    return cell;
  }

  function logRow(log: UILog): HTMLElement {
    const row = el("div", log.isActiveSession ? "pt-log is-session" : "pt-log");
    if (log.isActiveSession) row.title = "From this session";
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
    btnClear.setEnabled(logs.length > 0);

    list.replaceChildren();
    if (!visible.length) {
      list.appendChild(el("div", "pt-empty", logs.length
        ? "No log matches these filters."
        : "No logs yet. Abilities show up here as your pets trigger them."));
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
