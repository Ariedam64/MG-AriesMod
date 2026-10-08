import { memoOnCatalogs, mutationCatalog, weatherCatalog } from "../../data";
import { spaceWords } from "../../lib/format";

/**
 * The weathers an alert can follow, read from the weather catalog, and the
 * small formatters the Weather tab shows them with.
 */

type WeatherCycleMeta = {
  kind: "weather" | "lunar" | "base" | "unknown";
  rawKind?: string;
  startWindowMin?: number;
  startWindowMax?: number;
  durationMinutes?: number;
  periodMinutes?: number;
};

export type WeatherMutation = {
  name: string;
  multiplier?: number | null;
  conditional?: string | null;
};

export type WeatherDef = {
  /** `Weather:<catalog key>`, the id rules and prefs are stored under. */
  id: string;
  name: string;
  /** What `weatherAtom` holds during this weather; empty for the base weather. */
  atomValue: string;
  type: string;
  description: string | null;
  cycle: WeatherCycleMeta | null;
  weightInCycle: number | null;
  mutations: WeatherMutation[];
};

export const WEATHER_ID_PREFIX = "Weather:";

const finiteNumber = (value: unknown): number | undefined => {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const trimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

function readCycle(raw: unknown): WeatherCycleMeta | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const rawKind = trimmedString(entry.kind);
  const kindLc = rawKind.toLowerCase();
  const kind = kindLc === "weather" || kindLc === "lunar" || kindLc === "base" ? kindLc : "unknown";
  const meta: WeatherCycleMeta = { kind, rawKind: rawKind || undefined };
  for (const field of ["startWindowMin", "startWindowMax", "durationMinutes", "periodMinutes"] as const) {
    const value = finiteNumber(entry[field]);
    if (value !== undefined) meta[field] = value;
  }
  return meta;
}

/** The bundled catalog's `mutations` list. */
function readMutations(raw: unknown): WeatherMutation[] {
  if (!Array.isArray(raw)) return [];
  const items: WeatherMutation[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const name = trimmedString(entry.name);
    if (!name) continue;
    const mutation: WeatherMutation = { name };
    const multiplier = finiteNumber(entry.multiplier);
    if (multiplier !== undefined) mutation.multiplier = multiplier;
    const conditional = trimmedString(entry.conditional);
    if (conditional) mutation.conditional = conditional;
    items.push(mutation);
  }
  return items;
}

/** The live catalog gives a weather one `mutator`; its multiplier comes from the mutation catalog. */
function readMutator(mutator: unknown): WeatherMutation[] {
  const id = trimmedString((mutator as { mutation?: unknown } | null)?.mutation);
  if (!id) return [];
  const entry = (mutationCatalog as Record<string, any>)[id];
  const mutation: WeatherMutation = { name: typeof entry?.name === "string" && entry.name ? entry.name : id };
  const multiplier = finiteNumber(entry?.coinMultiplier);
  if (multiplier !== undefined) mutation.multiplier = multiplier;
  return [mutation];
}

function readWeather(key: string, value: unknown): WeatherDef | null {
  const entry = (value ?? {}) as Record<string, unknown>;
  const safeName = String(key || "").trim();
  if (!safeName) return null;
  const rawDisplayName = trimmedString(entry.displayName) || trimmedString(entry.name);
  const displayName = spaceWords(rawDisplayName || safeName)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // The base weather (Sunny) has no atom value: the game reports no weather.
  const atomValue = "atomValue" in entry ? trimmedString(entry.atomValue) : entry.mutator ? safeName : "";
  return {
    id: `${WEATHER_ID_PREFIX}${safeName}`,
    name: displayName || safeName,
    atomValue,
    type: atomValue || displayName,
    description: trimmedString(entry.description) || null,
    cycle: readCycle(entry.cycle),
    weightInCycle: finiteNumber(entry.weightInCycle) ?? null,
    mutations: Array.isArray(entry.mutations) ? readMutations(entry.mutations) : readMutator(entry.mutator),
  };
}

// Built on demand: the live catalog replaces the bundled entries a moment
// after boot. Live entries carry `name` and a single `mutator` where bundled
// ones carry `displayName`, `atomValue` and a `mutations` list.
const weatherIndex = memoOnCatalogs(() => {
  const defs: WeatherDef[] = [];
  for (const [key, value] of Object.entries(weatherCatalog ?? {})) {
    const def = readWeather(key, value);
    if (def) defs.push(def);
  }

  const byId = new Map<string, WeatherDef>();
  const byAtom = new Map<string, WeatherDef>();
  const byName = new Map<string, WeatherDef>();
  for (const def of defs) {
    byId.set(def.id, def);
    byName.set(def.name.toLowerCase(), def);
    byAtom.set(def.atomValue.toLowerCase(), def);
    byName.set(def.id.slice(WEATHER_ID_PREFIX.length).toLowerCase(), def);
  }
  return { defs, byId, byAtom, byName };
});

export function weatherDefs(): WeatherDef[] {
  return weatherIndex().defs;
}

export function weatherById(id: string): WeatherDef | undefined {
  return weatherIndex().byId.get(id);
}

/** The weather for a `weatherAtom` value. Null and "" are the base weather. */
export function weatherForAtomValue(value: string): WeatherDef | undefined {
  const key = value.toLowerCase();
  const { byAtom, byName } = weatherIndex();
  return byAtom.get(key) || byName.get(key) || (key ? byName.get(key.replace(/\s+/g, "")) : undefined);
}

/** "Wet ×2" from a mutation and its coin multiplier. */
export function formatWeatherMutation(mutation: WeatherMutation): string {
  const raw = Number(mutation.multiplier);
  if (mutation.multiplier == null || !Number.isFinite(raw)) return mutation.name;
  const rounded = Math.abs(raw - Math.round(raw)) < 0.01 ? Math.round(raw) : Math.round(raw * 100) / 100;
  return `${mutation.name} ×${rounded}`;
}

/** "Now", "3 mins ago", "Never"... and the full date as a tooltip. */
export function formatLastSeen(timestamp: number | null, isCurrent: boolean): { label: string; title: string } {
  if (isCurrent) {
    return { label: "Now", title: timestamp ? new Date(timestamp).toLocaleString() : "Currently active" };
  }
  if (!timestamp) return { label: "Never", title: "Never seen" };

  const diff = Math.max(0, Date.now() - timestamp);
  const plural = (n: number, unit: string) => `${n} ${unit}${n > 1 ? "s" : ""} ago`;
  let label: string;
  if (diff < 45_000) label = "Just now";
  else if (diff < 90_000) label = "1 min ago";
  else if (diff < 3_600_000) label = plural(Math.round(diff / 60_000), "min");
  else if (diff < 36 * 3_600_000) label = plural(Math.round(diff / 3_600_000), "hour");
  else label = plural(Math.round(diff / 86_400_000), "day");

  return { label, title: new Date(timestamp).toLocaleString() };
}
