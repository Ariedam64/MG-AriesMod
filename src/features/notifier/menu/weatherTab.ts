import { pill } from "../../../ui/kit/badges";
import { h } from "../../../ui/kit/dom";
import { color } from "../../../ui/kit/theme";
import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import { NotifierService } from "../notifier";
import { NotifierRules } from "../rules";
import { formatLastSeen, formatWeatherMutation } from "../weather";
import { WeatherAlerts, weatherStateSignature, type WeatherRow, type WeatherState } from "../weatherAlerts";
import { AlertGrid, ruleSummaryLine } from "./alertGrid";

/** Every weather, when it was last seen, and its alert switch and custom rule. */

const LAST_SEEN_REFRESH_MS = 30_000;
const STATE_REFRESH_MS = 60_000;

/** Sprite names to try for a weather: its icon first, then the weather itself. */
function weatherSpriteCandidates(row: WeatherRow): string[] {
  const names = new Set<string>();
  for (const value of [row.name, row.atomValue, row.id]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    names.add(trimmed);
    names.add(trimmed.replace(/\s+/g, ""));
  }
  const icons = [...names].map((value) => `${value.replace(/icon$/i, "")}Icon`);
  return [...new Set([...icons, ...names])].filter(Boolean);
}

function weatherIcon(row: WeatherRow): HTMLDivElement {
  const size = 40;
  const wrap = h("div");
  Object.assign(wrap.style, {
    width: `${size}px`,
    height: `${size}px`,
    flex: `0 0 ${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "8px",
    background: color.mutedBg,
  });
  const glyph = h("span", undefined, row.name.trim().charAt(0) || "🌦");
  glyph.style.fontSize = `${size - 8}px`;
  glyph.setAttribute("aria-hidden", "true");
  wrap.appendChild(glyph);
  attachSpriteIcon(wrap, ["ui", "weather", "mutation"], weatherSpriteCandidates(row), size, "alerts-weather");
  return wrap;
}

function mutationList(row: WeatherRow): HTMLDivElement {
  const list = h("div");
  Object.assign(list.style, {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "flex-start",
    fontSize: "12px",
    lineHeight: "1.3",
    opacity: row.mutations.length ? "0.85" : "0.6",
  });
  if (!row.mutations.length) {
    const none = h("span", undefined, "No mutation effects.");
    none.style.whiteSpace = "nowrap";
    list.appendChild(none);
    return list;
  }
  for (const mutation of row.mutations) {
    const chip = h("span", undefined, formatWeatherMutation(mutation));
    Object.assign(chip.style, {
      display: "inline-flex",
      alignItems: "center",
      padding: "2px 8px",
      borderRadius: "999px",
      background: color.hoverBg,
      whiteSpace: "nowrap",
    });
    list.appendChild(chip);
  }
  return list;
}

function itemCell(row: WeatherRow, summary: HTMLElement): HTMLDivElement {
  const cell = h("div");
  Object.assign(cell.style, { display: "flex", alignItems: "center", gap: "8px", padding: "6px" });
  if (row.isCurrent) {
    cell.style.background = color.accentSoft;
    cell.style.borderRadius = "8px";
  }

  const text = h("div");
  Object.assign(text.style, { display: "flex", flexDirection: "column", gap: "4px", lineHeight: "1.2", minWidth: "0", flex: "1 1 auto" });

  const titleRow = h("div");
  Object.assign(titleRow.style, { display: "flex", alignItems: "center", gap: "6px", minWidth: "0" });
  const title = h("div", undefined, row.name);
  Object.assign(title.style, { fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 auto" });
  titleRow.appendChild(title);
  if (row.isCurrent) titleRow.appendChild(pill("Current", "ok"));

  const mutationsLabel = h("div", undefined, "Mutations");
  Object.assign(mutationsLabel.style, { fontSize: "11px", opacity: "0.7", fontWeight: "600" });

  text.append(titleRow, mutationsLabel, mutationList(row), summary);
  cell.append(weatherIcon(row), text);
  return cell;
}

function showLastSeen(el: HTMLElement, row: WeatherRow): void {
  const { label, title } = formatLastSeen(row.lastSeen, row.isCurrent);
  el.textContent = label;
  el.title = title;
  el.style.opacity = label === "Never" ? "0.7" : "1";
}

export function renderWeatherTab(view: HTMLElement): void {
  view.replaceChildren();

  const wrap = h("div");
  Object.assign(wrap.style, { display: "grid", gridTemplateRows: "1fr", height: "54vh", overflow: "hidden", minHeight: "0" });
  view.appendChild(wrap);

  const grid = new AlertGrid(["Weather", "Last seen", "Notify", "Custom rules"], "240px", "No weather entries.");
  wrap.appendChild(grid.root);

  const lastSeenLabels = new Map<string, HTMLDivElement>();
  let state: WeatherState | null = null;
  let stateSig = "";

  const refreshLastSeen = () => {
    for (const row of state?.rows ?? []) {
      const el = lastSeenLabels.get(row.id);
      if (el) showLastSeen(el, row);
    }
  };

  const rebuild = () => {
    lastSeenLabels.clear();
    grid.setRows(
      (state?.rows ?? []).map((row) => {
        const summary = ruleSummaryLine();
        const lastSeen = h("div");
        Object.assign(lastSeen.style, { fontWeight: "600", whiteSpace: "nowrap" });
        showLastSeen(lastSeen, row);
        lastSeenLabels.set(row.id, lastSeen);
        return {
          id: row.id,
          name: row.name,
          type: row.type,
          context: "weather" as const,
          item: itemCell(row, summary),
          summary,
          detail: lastSeen,
          alertOn: row.notify,
          onAlertChange: (on: boolean) => WeatherAlerts.setNotify(row.id, on),
        };
      }),
    );
  };

  const show = (next: WeatherState) => {
    const sig = weatherStateSignature(next.rows);
    const changed = sig !== stateSig;
    state = next;
    stateSig = sig;
    if (changed) rebuild();
    else refreshLastSeen();
  };

  void (async () => {
    await NotifierService.onWeatherChangeNow((next) => {
      state = next;
      stateSig = weatherStateSignature(next.rows);
      rebuild();
    });
    NotifierRules.onChange(() => grid.refreshRules());
  })();

  // "3 mins ago" ages, and the state is re-read in case a change was missed.
  window.setInterval(refreshLastSeen, LAST_SEEN_REFRESH_MS);
  window.setInterval(() => {
    NotifierService.getWeatherState()
      .then(show)
      .catch(() => {});
  }, STATE_REFRESH_MS);
}
