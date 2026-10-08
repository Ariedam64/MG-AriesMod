import { Atoms } from "../../game/store/atoms";
import { Emitter, Subscriptions } from "../../lib/emitter";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { StatsService } from "../stats/stats";
import { audio, type TriggerOverrides } from "./audio";
import { NotifierRules } from "./rules";
import {
  WEATHER_ID_PREFIX,
  weatherById,
  weatherDefs,
  weatherForAtomValue,
  type WeatherDef,
} from "./weather";

/**
 * Follows the game's weather: remembers when each weather was last seen,
 * counts it in the stats, and rings the weather alerts the player turned on.
 */

export type WeatherRow = WeatherDef & {
  notify: boolean;
  lastSeen: number | null;
  isCurrent: boolean;
};

export type WeatherState = {
  updatedAt: number;
  currentId: string | null;
  rows: WeatherRow[];
};

type WeatherPref = { notify?: boolean; lastSeen?: number };

const PREFS_PATH = "notifier.weatherPrefs";

let prefs = new Map<string, WeatherPref>();
let prefsLoaded = false;

let state: WeatherState | null = null;
let stateSig: string | null = null;
let currentId: string | null = null;
/** The last `weatherAtom` value handled, null before the first. */
let currentValue: string | null = null;

const changed = new Emitter<WeatherState>();
const watchers = new Subscriptions();

/** What a redraw of the Weather tab depends on. */
export const weatherStateSignature = (rows: WeatherRow[]): string =>
  JSON.stringify(rows.map((r) => [r.id, r.notify ? 1 : 0, r.lastSeen || 0, r.isCurrent ? 1 : 0]));

function ensurePrefsLoaded(): void {
  if (prefsLoaded) return;
  prefsLoaded = true;
  prefs = new Map();
  const stored = readAriesPath<Record<string, any>>(PREFS_PATH);
  if (!stored || typeof stored !== "object") return;
  for (const [id, value] of Object.entries(stored)) {
    if (!id) continue;
    const pref: WeatherPref = {};
    if (typeof value?.notify === "boolean") pref.notify = value.notify;
    if (typeof value?.lastSeen === "number" && Number.isFinite(value.lastSeen)) pref.lastSeen = value.lastSeen;
    prefs.set(String(id), pref);
  }
}

function savePrefs(): void {
  const out: Record<string, WeatherPref> = {};
  for (const [id, pref] of prefs) {
    const entry: WeatherPref = {};
    if (pref.notify) entry.notify = true;
    if (typeof pref.lastSeen === "number" && Number.isFinite(pref.lastSeen)) entry.lastSeen = pref.lastSeen;
    if (entry.notify || entry.lastSeen != null) out[id] = entry;
  }
  writeAriesPath(PREFS_PATH, out);
}

function prefOf(id: string): WeatherPref {
  ensurePrefsLoaded();
  let pref = prefs.get(id);
  if (!pref) {
    pref = {};
    prefs.set(id, pref);
  }
  return pref;
}

function recomputeState(): void {
  const rows: WeatherRow[] = weatherDefs().map((def) => {
    const pref = prefOf(def.id);
    return {
      ...def,
      notify: !!pref.notify,
      lastSeen: typeof pref.lastSeen === "number" && Number.isFinite(pref.lastSeen) ? pref.lastSeen : null,
      isCurrent: def.id === currentId,
      cycle: def.cycle ? { ...def.cycle } : null,
      mutations: def.mutations.map((mutation) => ({ ...mutation })),
    };
  });
  const sig = weatherStateSignature(rows);
  const isNew = sig !== stateSig;
  stateSig = sig;
  state = { updatedAt: Date.now(), currentId, rows };
  if (isNew) changed.emit(state);
}

/** Weather alerts always play once, with the weather's own sound and volume if it has a rule. */
function ring(id: string): void {
  if (!weatherById(id)) return;
  const rule = NotifierRules.get(id);
  const overrides: TriggerOverrides = { mode: "oneshot" };
  if (rule?.sound) overrides.sound = rule.sound;
  if (rule?.volume != null) overrides.volume = rule.volume;
  audio.trigger(id, overrides, "weather").catch(() => {});
}

function onWeather(raw: unknown, force = false): void {
  const value = raw == null ? "" : String(raw).trim();
  if (!force && currentValue === value) return;

  const def = weatherForAtomValue(value);
  const prevId = currentId;
  if (def) prefOf(def.id).lastSeen = Date.now();
  currentId = def?.id ?? null;
  currentValue = value;

  if (currentId) StatsService.incrementWeatherStat(currentId.replace(WEATHER_ID_PREFIX, ""));
  if (prevId && prevId !== currentId) audio.stopLoop(prevId);
  if (def && prefOf(def.id).notify) ring(def.id);

  if (def) savePrefs();
  recomputeState();
}

export const WeatherAlerts = {
  /** Reads the weather once, then follows it. */
  async start(): Promise<void> {
    const view = Atoms.data.weather;
    try {
      onWeather(await view.get(), true);
    } catch {}
    try {
      watchers.add(
        await view.onChange((next) => {
          try {
            onWeather(next);
          } catch {}
        }),
      );
    } catch {}
  },

  stop(): void {
    watchers.dispose();
    if (currentId) audio.stopLoop(currentId);
    currentId = null;
    currentValue = null;
  },

  state(): WeatherState {
    if (!state) recomputeState();
    return state as WeatherState;
  },

  onChange(cb: (s: WeatherState) => void): () => void {
    return changed.on(cb);
  },

  setNotify(id: string, enabled: boolean): void {
    if (!id) return;
    const pref = prefOf(id);
    if (!!pref.notify === enabled) return;
    pref.notify = enabled;
    savePrefs();
    if (!enabled) audio.stopLoop(id);
    else if (currentId === id) ring(id);
    recomputeState();
  },
};
