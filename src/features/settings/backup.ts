// Settings export, import and named backups.
//
// Export and import go through the `aries_mod` blob in platform/storage. The
// backups do not: they are kept under their own `aries_backups` key, in GM
// storage when the manager grants it and localStorage otherwise. Inside the
// blob, each backup would carry every earlier backup with it, and the blob is
// parsed and rewritten on every setting change. The key and its format stay
// as they are so backups saved by earlier builds still load.
//
// A bug report's follow token reads its replies and answers in the player's
// name, so none ever leaves in a file or a backup: the pending one stays out
// of every copy, and an import or a restore keeps this browser's own instead
// of taking the file's. The sent list lives outside the blob; earlier builds
// of the bug report form kept it in there, so it is treated the same way.

import { type AriesStorage, getAriesStorage, saveAriesStorage } from "../../platform/storage";

declare const GM_getValue:
  | ((name: string, defaultValue?: string) => string | undefined)
  | undefined;
declare const GM_setValue: ((name: string, value: string) => void) | undefined;

export interface SettingsImportResult {
  success: boolean;
  message: string;
}

export interface AriesBackup {
  id: string;
  name: string;
  timestamp: number;
  data: AriesStorage;
}

interface BackupResult extends SettingsImportResult {
  backup?: AriesBackup;
}

const STORAGE_KEY = "aries_backups";
const MAX_BACKUPS = 25;
const DEFAULT_VERSION = 1;

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Keys of the blob's `bugReport` section that stay in this browser. */
const LOCAL_ONLY_BUG_REPORT_KEYS = ["pendingToken", "sent"];

function bugReportSection(snapshot: AriesStorage): Record<string, unknown> | null {
  const section: unknown = snapshot.bugReport;
  return section && typeof section === "object" && !Array.isArray(section) ? (section as Record<string, unknown>) : null;
}

/** A copy of `snapshot` without the follow tokens, for a file or a backup. `snapshot` is not changed. */
function withoutLocalOnly(snapshot: AriesStorage): AriesStorage {
  const section = bugReportSection(snapshot);
  if (!section || !LOCAL_ONLY_BUG_REPORT_KEYS.some((key) => key in section)) return snapshot;
  const kept = { ...section };
  for (const key of LOCAL_ONLY_BUG_REPORT_KEYS) delete kept[key];
  return { ...snapshot, bugReport: kept as AriesStorage["bugReport"] };
}

/** `incoming` with this browser's follow tokens in place of any the file brought. */
function keepLocalOnly(incoming: AriesStorage): AriesStorage {
  const next = withoutLocalOnly(incoming);
  const current = bugReportSection(getAriesStorage());
  const own = LOCAL_ONLY_BUG_REPORT_KEYS.filter((key) => current?.[key] !== undefined);
  if (!current || !own.length) return next;
  const section = { ...(bugReportSection(next) ?? {}) };
  for (const key of own) section[key] = current[key];
  return { ...next, bugReport: section as AriesStorage["bugReport"] };
}

function ensureVersion(snapshot: AriesStorage): AriesStorage {
  const next: AriesStorage = { ...snapshot };
  if (!Number.isFinite(next.version)) {
    next.version = DEFAULT_VERSION;
  }
  return next;
}

function readRawStorage(): string {
  try {
    if (typeof GM_getValue === "function") {
      return GM_getValue(STORAGE_KEY, "[]") ?? "[]";
    }
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      return window.localStorage.getItem(STORAGE_KEY) ?? "[]";
    }
  } catch {}
  return "[]";
}

function writeRawStorage(payload: string): void {
  try {
    if (typeof GM_setValue === "function") {
      GM_setValue(STORAGE_KEY, payload);
      return;
    }
    if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, payload);
    }
  } catch {}
}

function readBackups(): AriesBackup[] {
  const raw = readRawStorage();
  try {
    const parsed = JSON.parse(raw);
    // A backup saved by an earlier build may still hold follow tokens.
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => (entry && typeof entry === "object" && entry.data ? { ...entry, data: withoutLocalOnly(entry.data) } : entry));
    }
  } catch {}
  return [];
}

function persistBackups(backups: AriesBackup[]): void {
  writeRawStorage(JSON.stringify(backups));
}

export function listBackups(): AriesBackup[] {
  const entries = readBackups();
  return [...entries].sort((a, b) => b.timestamp - a.timestamp);
}

export function saveBackup(name: string): BackupResult {
  const normalizedName = name.trim() || `Backup ${new Date().toLocaleString()}`;
  const current = withoutLocalOnly(ensureVersion(getAriesStorage()));
  const entry: AriesBackup = {
    id: generateId(),
    name: normalizedName,
    timestamp: Date.now(),
    data: current,
  };
  const next = [entry, ...readBackups()].slice(0, MAX_BACKUPS);
  persistBackups(next);
  return { success: true, message: "Backup saved.", backup: entry };
}

export function loadBackup(id: string): SettingsImportResult {
  const entry = readBackups().find((backup) => backup.id === id);
  if (!entry) {
    return { success: false, message: "Backup not found." };
  }
  try {
    saveAriesStorage(keepLocalOnly(entry.data));
    return { success: true, message: "Backup loaded. Reload the game to apply the changes." };
  } catch (error) {
    return {
      success: false,
      message: `Failed to load backup (${error instanceof Error ? error.message : "unknown error"}).`,
    };
  }
}

export function deleteBackup(id: string): SettingsImportResult {
  const backups = readBackups();
  const next = backups.filter((backup) => backup.id !== id);
  if (next.length === backups.length) {
    return { success: false, message: "Backup not found." };
  }
  persistBackups(next);
  return { success: true, message: "Backup deleted." };
}

export function exportAllSettings(): string {
  const current = withoutLocalOnly(ensureVersion(getAriesStorage()));
  return JSON.stringify(current, null, 2);
}

/**
 * Files exported through GM_download data-URIs may have been saved still
 * percent-encoded by some download managers (the whole file starts with
 * "%7B" instead of "{"). Decode them so the import still works.
 */
function tryDecodePercentEncodedJson(text: string): string | null {
  if (!/^%(?:7B|5B)/i.test(text)) return null;
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}

export function importSettings(payload: string): SettingsImportResult {
  const trimmed = payload.trim();
  if (!trimmed) {
    return { success: false, message: "Payload is empty." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    let rescued: unknown;
    const decoded = tryDecodePercentEncodedJson(trimmed);
    if (decoded != null) {
      try { rescued = JSON.parse(decoded.trim()); } catch { /* keep original error */ }
    }
    if (rescued === undefined) {
      return {
        success: false,
        message: `Invalid JSON (${error instanceof Error ? error.message : "unknown error"}).`,
      };
    }
    parsed = rescued;
  }

  if (!parsed || typeof parsed !== "object") {
    return { success: false, message: "JSON payload must be an object." };
  }

  try {
    const normalized = keepLocalOnly(ensureVersion(parsed as AriesStorage));
    saveAriesStorage(normalized);
    return { success: true, message: "Settings applied. Reload the game to apply the changes." };
  } catch (error) {
    return {
      success: false,
      message: `Failed to import settings (${error instanceof Error ? error.message : "unknown error"}).`,
    };
  }
}
