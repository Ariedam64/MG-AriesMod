// The pet ability log: every ability proc the game's activity log reports,
// kept across sessions and fed into the ability stats.

import { myActivityLog } from "../../game/store/atoms";
import { Emitter } from "../../lib/emitter";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { StatsService } from "../stats/stats";
import { abilityName, isLoggableAbility } from "./abilityNames";
import { abilityLogText, abilityLogValue } from "./abilityLogText";
import { ensureInventoryWatchers, findCachedPet } from "./inventoryPets";

export type AbilityLogEntry = {
  petId: string;
  species?: string;
  name?: string | null;
  mutations?: string[];
  abilityId: string;
  abilityName: string;
  data?: unknown;
  performedAt: number;
  time12: string;
};

const STORAGE_PATH = "pets.abilityLogs";
const MAX_ENTRIES = 500;
/** Entries a little older than a Clear still count, to absorb clock skew with the server. */
const CUTOFF_SKEW_MS = 1500;

let logs: AbilityLogEntry[] = [];
/**
 * `abilityId|petId|performedAt` of every entry already ingested, so a
 * reconnect that resends the same history cannot log it twice.
 */
const seenKeys = new Set<string>();
/** Entries older than this were cleared by the player and stay out. */
let cutoffMs = 0;
const sessionStart = Date.now();
const changes = new Emitter<AbilityLogEntry[]>();

const entryKey = (e: { abilityId: string; petId: string; performedAt: number }) =>
  `${e.abilityId}|${e.petId}|${e.performedAt}`;

const time12 = (ms: number) =>
  new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

/* --------------------------------- storage -------------------------------- */

function persist(): void {
  try {
    writeAriesPath(STORAGE_PATH, {
      version: 1,
      cutoff: cutoffMs,
      logs: logs.map((entry) => ({
        ...entry,
        species: entry.species ?? null,
        name: entry.name ?? null,
        mutations: entry.mutations?.slice(),
      })),
    });
  } catch {}
}

const optionalString = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Loads the entries saved by the last session. */
export function restoreAbilityLogs(): void {
  try {
    const saved = readAriesPath<{ logs?: any[]; cutoff?: unknown }>(STORAGE_PATH);
    if (!saved || typeof saved !== "object") return;
    const restored: AbilityLogEntry[] = [];
    for (const item of Array.isArray(saved.logs) ? saved.logs : []) {
      if (!item || typeof item !== "object") continue;
      const abilityId = typeof item.abilityId === "string" ? item.abilityId : "";
      const performedAt = Number(item.performedAt) || 0;
      if (!abilityId || !performedAt) continue;
      const mutations = Array.isArray(item.mutations)
        ? item.mutations.map((m: unknown) => String(m ?? "").trim()).filter(Boolean)
        : [];
      restored.push({
        petId: typeof item.petId === "string" ? item.petId : "",
        species: optionalString(item.species),
        name: optionalString(item.name),
        mutations: mutations.length ? mutations : undefined,
        abilityId,
        abilityName: optionalString(item.abilityName) ?? abilityId,
        data: item.data,
        performedAt,
        time12: optionalString(item.time12) ?? time12(performedAt),
      });
    }

    restored.sort((a, b) => a.performedAt - b.performedAt);
    logs = restored.slice(-MAX_ENTRIES);
    seenKeys.clear();
    for (const entry of logs) seenKeys.add(entryKey(entry));

    const cutoff = Number(saved.cutoff);
    if (Number.isFinite(cutoff) && cutoff > 0) cutoffMs = cutoff;
  } catch {}
}

/* -------------------------------- ingestion ------------------------------- */

function push(entry: AbilityLogEntry): void {
  logs.push(entry);
  if (logs.length > MAX_ENTRIES) logs.splice(0, logs.length - MAX_ENTRIES);
  changes.emit(getAbilityLogs());
  persist();
}

/** One myActivityLog entry. Anything that is not a loggable ability proc is skipped. */
function ingestActivityLogEntry(raw: any): void {
  if (!raw || typeof raw !== "object") return;

  const abilityId = typeof raw.action === "string" ? raw.action : "";
  if (!abilityId || !isLoggableAbility(abilityId)) return;

  const performedAt = Number(raw.timestamp);
  if (!Number.isFinite(performedAt) || performedAt <= 0) return;

  const params: Record<string, unknown> = raw.parameters && typeof raw.parameters === "object" ? raw.parameters : {};
  const petParam = params.pet as Record<string, unknown> | undefined;
  const petId = typeof petParam?.id === "string" ? petParam.id : "";
  if (!petId) return;

  const key = entryKey({ abilityId, petId, performedAt });
  if (seenKeys.has(key)) return;
  seenKeys.add(key);

  if (cutoffMs && performedAt < cutoffMs - CUTOFF_SKEW_MS) return;

  const details = abilityLogText(abilityId, params);
  if (details === null) return;

  const cached = findCachedPet(petId);
  const mutationsRaw = Array.isArray(petParam?.mutations) ? petParam.mutations : cached?.mutations;
  const mutations = Array.isArray(mutationsRaw)
    ? mutationsRaw.map((m: unknown) => String(m ?? "").trim()).filter(Boolean)
    : [];

  try {
    StatsService.incrementAbilityStat(abilityId, "triggers");
    const value = abilityLogValue(abilityId, params);
    if (value > 0) StatsService.incrementAbilityStat(abilityId, "totalValue", value);
  } catch {}

  push({
    petId,
    species: optionalString(petParam?.petSpecies) ?? (cached?.petSpecies || undefined),
    name: optionalString(petParam?.name) ?? (cached?.name || undefined),
    mutations: mutations.length ? mutations : undefined,
    abilityId,
    abilityName: abilityName(abilityId),
    data: details,
    performedAt,
    time12: time12(performedAt),
  });
}

/**
 * Follows the game's own activity log, the feed behind the in-game Activity
 * Log. Each entry is an immutable fact, unlike the pet slots' "last trigger"
 * snapshot this used to read, which a forced reconnect could resend with a
 * bumped time and log twice.
 */
export async function startAbilityLogsWatcher(): Promise<() => void> {
  try { await ensureInventoryWatchers(); } catch {}

  const ingest = (rawLogs: unknown) => {
    for (const raw of Array.isArray(rawLogs) ? rawLogs : []) {
      try { ingestActivityLogEntry(raw); } catch {}
    }
  };

  try { ingest(await myActivityLog.get()); } catch {}

  let stop: (() => void) | null = null;
  try {
    const res = await myActivityLog.onChange((next: unknown) => ingest(next));
    if (typeof res === "function") stop = res;
  } catch {}

  return () => {
    try { stop?.(); } catch {}
  };
}

/* ---------------------------------- reads --------------------------------- */

/** Newest first. */
function getAbilityLogs(): AbilityLogEntry[] {
  return logs.slice().sort((a, b) => b.performedAt - a.performedAt);
}

/** When this session started: entries after it are highlighted in the Logs tab. */
export function getAbilityLogsSessionStart(): number {
  return sessionStart;
}

/** Calls back at once with the current logs, then on every change. */
export function onAbilityLogs(cb: (all: AbilityLogEntry[]) => void): () => void {
  const off = changes.on(cb);
  try { cb(getAbilityLogs()); } catch {}
  return off;
}

export function getSeenAbilityIds(): string[] {
  return Array.from(new Set(logs.map((e) => e.abilityId))).sort();
}

/** Empties the log. Entries the game resends from before this moment stay out. */
export function clearAbilityLogs(): void {
  logs = [];
  seenKeys.clear();
  cutoffMs = Date.now();
  changes.emit(getAbilityLogs());
  persist();
}
