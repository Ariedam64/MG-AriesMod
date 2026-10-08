// The mod's own activity log history: up to 500 entries kept in storage, so
// the log reaches further back than the game's short list.
//
// Every change to the game's list is diffed against the previous snapshot and
// the new or changed entries are merged in, keyed by timestamp, action and the
// id the entry is about.

import { readAriesPath, writeAriesPath } from "../../platform/storage";

export type ActivityLogEntry = {
  timestamp: number;
  action?: string | null;
  parameters?: any;
  [key: string]: any;
};

const HISTORY_STORAGE_KEY = "activityLog.history";
const HISTORY_LIMIT = 500;

/** Flat parameter fields that name what an entry is about, after `id` and `pet.id`. */
const IDENTITY_FIELDS = [
  "petId",
  "playerId",
  "userId",
  "objectId",
  "slotId",
  "itemId",
  "cropId",
  "seedId",
  "decorId",
  "toolId",
  "targetId",
  "abilityId",
] as const;

function normalizeEntry(raw: any): ActivityLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const ts = Number(raw.timestamp);
  if (!Number.isFinite(ts)) return null;

  // Pet entries carry the pet as an object; copying its id up lets the
  // identity key find it.
  let parameters = raw.parameters;
  if (parameters && typeof parameters === "object") {
    const petId = typeof parameters.pet?.id === "string" ? parameters.pet.id : null;
    if (petId && !parameters.petId) parameters = { ...parameters, petId };
  }

  const entry: ActivityLogEntry = { ...raw, timestamp: ts, parameters };
  if (typeof raw.action === "string" && raw.action.trim()) entry.action = String(raw.action);
  return entry;
}

export function normalizeEntries(logs: unknown): ActivityLogEntry[] {
  if (!Array.isArray(logs)) return [];
  const out: ActivityLogEntry[] = [];
  for (const raw of logs) {
    const entry = normalizeEntry(raw);
    if (entry) out.push(entry);
  }
  return out;
}

/** JSON with sorted keys, so two equal entries always compare equal. */
function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (val: any): any => {
    if (val === null || typeof val !== "object") return val;
    if (seen.has(val)) return "__CYCLE__";
    seen.add(val);
    if (Array.isArray(val)) return val.map(walk);
    const obj: Record<string, any> = {};
    for (const k of Object.keys(val).sort()) obj[k] = walk(val[k]);
    return obj;
  };
  try {
    return JSON.stringify(walk(value));
  } catch {
    return "";
  }
}

function entryIdentity(entry: ActivityLogEntry): string | null {
  const p = entry?.parameters;
  if (!p) return null;
  const pick = (c: unknown) => (typeof c === "string" && c.trim() ? c : null);
  const direct = pick(p.id) ?? pick(p.pet?.id);
  if (direct) return direct;
  for (const field of IDENTITY_FIELDS) {
    const value = pick(p[field]);
    if (value) return value;
  }
  return null;
}

function entryKey(entry: ActivityLogEntry): string {
  const action = typeof entry.action === "string" ? entry.action : "";
  return `${entry.timestamp}|${action}|${entryIdentity(entry) ?? "__noid__"}`;
}

const entriesEqual = (a: ActivityLogEntry, b: ActivityLogEntry) => stableStringify(a) === stableStringify(b);

export function getActivityLogHistory(): ActivityLogEntry[] {
  try {
    return normalizeEntries(readAriesPath<unknown>(HISTORY_STORAGE_KEY));
  } catch {
    return [];
  }
}

function saveHistory(entries: ActivityLogEntry[]): void {
  const sorted = entries.slice().sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  if (sorted.length > HISTORY_LIMIT) sorted.splice(0, sorted.length - HISTORY_LIMIT);
  try {
    writeAriesPath(HISTORY_STORAGE_KEY, sorted);
  } catch {}
}

/** Entries of `next` that `prev` did not have, and those whose content changed. */
function diffSnapshots(prev: ActivityLogEntry[], next: ActivityLogEntry[]) {
  const prevBuckets = new Map<string, ActivityLogEntry[]>();
  for (const entry of prev) {
    const key = entryKey(entry);
    const bucket = prevBuckets.get(key);
    if (bucket) bucket.push(entry);
    else prevBuckets.set(key, [entry]);
  }

  const added: ActivityLogEntry[] = [];
  const updated: ActivityLogEntry[] = [];
  for (const entry of next) {
    const key = entryKey(entry);
    const bucket = prevBuckets.get(key);
    const prevEntry = bucket?.shift();
    if (!prevEntry) added.push(entry);
    else if (!entriesEqual(prevEntry, entry)) updated.push(entry);
    if (bucket && bucket.length === 0) prevBuckets.delete(key);
  }
  return { added, updated };
}

/** Merges what changed between two snapshots of the game's list into the stored history. */
export function syncHistory(prevSnapshot: ActivityLogEntry[], nextSnapshot: ActivityLogEntry[]): void {
  const { added, updated } = diffSnapshots(prevSnapshot, nextSnapshot);
  if (!added.length && !updated.length) return;

  const byKey = new Map<string, ActivityLogEntry>();
  for (const entry of getActivityLogHistory()) byKey.set(entryKey(entry), entry);

  let changed = false;
  for (const entry of [...updated, ...added]) {
    const key = entryKey(entry);
    const cur = byKey.get(key);
    if (!cur || !entriesEqual(cur, entry)) {
      byKey.set(key, entry);
      changed = true;
    }
  }
  if (changed) saveHistory(Array.from(byKey.values()));
}
