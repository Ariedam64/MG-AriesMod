import { pill } from "../../../ui/kit/badges";
import { h, refreshWhileVisible } from "../../../ui/kit/dom";
import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import { NotifierService } from "../notifier";
import { NotifierRules } from "../rules";
import { formatLastSeen, formatWeatherMutation } from "../weather";
import { WeatherAlerts, weatherStateSignature, type WeatherRow, type WeatherState } from "../weatherAlerts";
import { AlertList } from "./alertList";
import { ensureMenuStyles } from "./styles";

/** Every weather, when it was last seen, and its alert switch and custom rule. */

const LAST_SEEN_REFRESH_MS = 30_000;
const STATE_REFRESH_MS = 60_000;
const ICON_SIZE = 40;

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

/** The weather's sprite, showing its initial until it loads. */
function weatherIcon(row: WeatherRow): HTMLDivElement {
  const wrap = h("div");
  const glyph = h("span", undefined, row.name.trim().charAt(0) || "🌦");
  glyph.setAttribute("aria-hidden", "true");
  wrap.appendChild(glyph);
  attachSpriteIcon(wrap, ["ui", "weather", "mutation"], weatherSpriteCandidates(row), ICON_SIZE, "alerts-weather");
  return wrap;
}

function mutationChips(row: WeatherRow): HTMLDivElement {
  const list = h("div", "qws-al-meta");
  if (!row.mutations.length) {
    list.appendChild(h("span", undefined, "No mutation effects"));
    return list;
  }
  for (const mutation of row.mutations) list.appendChild(h("span", "qws-al-chip", formatWeatherMutation(mutation)));
  return list;
}

/** "Seen 3 mins ago", "Active now" or "Never seen", with the exact time on hover. */
function showLastSeen(el: HTMLElement, row: WeatherRow): void {
  const { label, title } = formatLastSeen(row.lastSeen, row.isCurrent);
  if (label === "Now") el.textContent = "Active now";
  else if (label === "Never") el.textContent = "Never seen";
  else el.textContent = `Seen ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  el.title = title;
}

export function renderWeatherTab(view: HTMLElement): void {
  ensureMenuStyles();
  const tab = h("div", "qws-al-tab");
  view.replaceChildren(tab);

  const list = new AlertList("No weather to show yet.");
  tab.appendChild(list.root);

  const lastSeenLabels = new Map<string, HTMLElement>();
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
    list.setRows(
      (state?.rows ?? []).map((row) => {
        const lastSeen = h("div", "qws-al-meta");
        showLastSeen(lastSeen, row);
        lastSeenLabels.set(row.id, lastSeen);
        return {
          id: row.id,
          name: row.name,
          type: row.type,
          context: "weather" as const,
          icon: weatherIcon(row),
          badge: row.isCurrent ? pill("Current", "ok") : undefined,
          details: [lastSeen, mutationChips(row)],
          highlight: row.isCurrent,
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
    NotifierRules.onChange(() => list.refreshRules());
  })();

  // "3 mins ago" ages, and the state is re-read in case a change was missed,
  // both only while the tab shows.
  refreshWhileVisible(tab, refreshLastSeen, LAST_SEEN_REFRESH_MS);
  refreshWhileVisible(
    tab,
    () => {
      NotifierService.getWeatherState()
        .then(show)
        .catch(() => {});
    },
    STATE_REFRESH_MS,
  );
}
