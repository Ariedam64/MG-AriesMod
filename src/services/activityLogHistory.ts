// src/services/activityLogHistory.ts
import { ACTIVITY_LOG_MODAL_ID, fakeActivityLogShow } from "./fakeModal";
import { Atoms, myActivityLog } from "../store/atoms";
import { readAriesPath, writeAriesPath } from "../utils/localStorage";
import { pageWindow } from "../utils/page-context";

// Shared with the standalone Community Hub: when it opens a FRIEND's activity
// log it sets this page global so our history watcher skips one reopen.
const SKIP_NEXT_ACTIVITY_LOG_REOPEN_GLOBAL = "__MG_SKIP_NEXT_ACTIVITY_LOG_REOPEN__";

type ActivityLogEntry = {
  timestamp: number;
  action?: string | null;
  parameters?: any;
  [key: string]: any;
};

const HISTORY_STORAGE_KEY = "activityLog.history";
const HISTORY_LIMIT = 500;
let skipNextHistoryReopen = false;

export function skipNextActivityLogHistoryReopen(): void {
  skipNextHistoryReopen = true;
}

function normalizeEntry(raw: any): ActivityLogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const ts = Number((raw as any).timestamp);
  if (!Number.isFinite(ts)) return null;

  const parameters = (() => {
    const p = (raw as any).parameters;
    if (!p || typeof p !== "object") return p;
    const petId = typeof (p as any)?.pet?.id === "string" ? (p as any).pet.id : null;
    if (petId && !p.petId) {
      return { ...p, petId };
    }
    return p;
  })();

  const action =
    typeof (raw as any).action === "string" && (raw as any).action.trim()
      ? String((raw as any).action)
      : null;
  const entry: ActivityLogEntry = {
    ...raw,
    timestamp: ts,
    parameters,
  };
  if (action !== null) entry.action = action;
  return entry;
}

function normalizeList(logs: any): ActivityLogEntry[] {
  const out: ActivityLogEntry[] = [];
  if (!Array.isArray(logs)) return out;
  for (const raw of logs) {
    const norm = normalizeEntry(raw);
    if (norm) out.push(norm);
  }
  return out;
}

function stableStringify(value: any): string {
  const seen = new WeakSet();
  const walk = (val: any): any => {
    if (val === null) return null;
    if (typeof val !== "object") return val;
    if (seen.has(val)) return "__CYCLE__";
    seen.add(val);
    if (Array.isArray(val)) return val.map(walk);
    const obj: Record<string, any> = {};
    const keys = Object.keys(val).sort();
    for (const k of keys) obj[k] = walk((val as any)[k]);
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
  const candidates = [
    p?.id,
    p?.pet?.id,
    p?.petId,
    p?.playerId,
    p?.userId,
    p?.objectId,
    p?.slotId,
    p?.itemId,
    p?.cropId,
    p?.seedId,
    p?.decorId,
    p?.toolId,
    p?.targetId,
    p?.abilityId,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
  }
  return null;
}

function entryKey(entry: ActivityLogEntry): string {
  const ts = Number(entry.timestamp);
  const action = typeof entry.action === "string" ? entry.action : "";
  const identity = entryIdentity(entry) ?? "__noid__";
  const tsPart = Number.isFinite(ts) ? String(ts) : `t:${stableStringify({ timestamp: entry.timestamp ?? null })}`;
  return `${tsPart}|${action}|${identity}`;
}

function entriesEqual(a: ActivityLogEntry, b: ActivityLogEntry): boolean {
  return stableStringify(a) === stableStringify(b);
}

function loadHistory(): ActivityLogEntry[] {
  try {
    const parsed = readAriesPath<any>(HISTORY_STORAGE_KEY);
    if (!Array.isArray(parsed)) return [];
    const out: ActivityLogEntry[] = [];
    for (const item of parsed) {
      const norm = normalizeEntry(item);
      if (norm) out.push(norm);
    }
    return out;
  } catch {
    return [];
  }
}

function saveHistory(entries: ActivityLogEntry[]) {
  const sorted = entries
    .slice()
    .sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0));
  if (sorted.length > HISTORY_LIMIT) {
    sorted.splice(0, sorted.length - HISTORY_LIMIT);
  }
  try {
    writeAriesPath(HISTORY_STORAGE_KEY, sorted);
  } catch {
  }
}

function diffSnapshots(prev: ActivityLogEntry[], next: ActivityLogEntry[]): {
  added: ActivityLogEntry[];
  updated: ActivityLogEntry[];
} {
  const prevBuckets = new Map<string, ActivityLogEntry[]>();
  const bucketPush = (k: string, entry: ActivityLogEntry) => {
    const arr = prevBuckets.get(k);
    if (arr) arr.push(entry);
    else prevBuckets.set(k, [entry]);
  };
  for (const entry of prev) bucketPush(entryKey(entry), entry);

  const added: ActivityLogEntry[] = [];
  const updated: ActivityLogEntry[] = [];

  for (const entry of next) {
    const key = entryKey(entry);
    const bucket = prevBuckets.get(key);
    const prevEntry = bucket?.shift();
    if (!prevEntry) {
      added.push(entry);
    } else if (!entriesEqual(prevEntry, entry)) {
      updated.push(entry);
    }
    if (bucket && bucket.length === 0) prevBuckets.delete(key);
  }

  return { added, updated };
}

function syncHistory(prevSnapshot: ActivityLogEntry[], nextSnapshot: ActivityLogEntry[]): ActivityLogEntry[] {
  const history = loadHistory();
  const { added, updated } = diffSnapshots(prevSnapshot, nextSnapshot);
  if (!added.length && !updated.length) return history;

  const map = new Map<string, ActivityLogEntry>();
  for (const h of history) map.set(entryKey(h), h);

  let changed = false;
  const upsert = (entry: ActivityLogEntry) => {
    const key = entryKey(entry);
    const cur = map.get(key);
    if (!cur || !entriesEqual(cur, entry)) {
      map.set(key, entry);
      changed = true;
    }
  };

  updated.forEach(upsert);
  added.forEach(upsert);

  if (!changed) return history;
  const merged = Array.from(map.values());
  saveHistory(merged);
  return merged;
}

async function reopenFakeActivityLogFromHistory() {
  try {
    const history = loadHistory();
    await fakeActivityLogShow(history, { open: true });
  } catch {
  }
}

export function getActivityLogHistory(): ActivityLogEntry[] {
  return loadHistory();
}

export async function startActivityLogHistoryWatcher(): Promise<() => void> {
  const stops: Array<() => void | Promise<void>> = [];
  let lastSnapshot: ActivityLogEntry[] = [];

  const ingest = async (logs: any, prev?: any) => {
    try {
      const prevSnapshot = typeof prev !== "undefined" ? normalizeList(prev) : lastSnapshot;
      const nextSnapshot = normalizeList(logs);
      syncHistory(prevSnapshot, nextSnapshot);
      lastSnapshot = nextSnapshot;
    } catch {
    }
  };

  try {
    const initial = normalizeList(await myActivityLog.get());
    await ingest(initial);
  } catch {
  }

  try {
    const unsub = await myActivityLog.onChange((next, prev) => { void ingest(next, prev); });
    stops.push(() => { try { unsub(); } catch {} });
  } catch {
  }

  let lastModal: string | null = null;
  try {
    const cur = await Atoms.ui.activeModal.get();
    lastModal = cur ?? null;
  } catch {
  }

  const consumeHistoryReopenSkip = () => {
    const w = pageWindow as unknown as Record<string, unknown>;
    const sharedSkip = w[SKIP_NEXT_ACTIVITY_LOG_REOPEN_GLOBAL] === true;
    if (!skipNextHistoryReopen && !sharedSkip) return false;
    skipNextHistoryReopen = false;
    if (sharedSkip) delete w[SKIP_NEXT_ACTIVITY_LOG_REOPEN_GLOBAL];
    return true;
  };

  const onModalChange = async (modalId: string | null) => {
    const cur = modalId ?? null;
    if (cur === ACTIVITY_LOG_MODAL_ID && lastModal !== ACTIVITY_LOG_MODAL_ID) {
      if (!consumeHistoryReopenSkip()) {
        await reopenFakeActivityLogFromHistory();
      }
    }
    lastModal = cur;
  };

  try {
    const unsubModal = await Atoms.ui.activeModal.onChange(onModalChange);
    stops.push(() => { try { unsubModal(); } catch {} });
  } catch {
  }

  return async () => {
    for (const stop of stops) {
      try { await stop(); } catch {}
    }
  };
}
