// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// The reports sent from this browser, as each mod keeps them in its own
// storage. The follow token is what lets the player read the status and
// reply later; the backend only keeps its hash, so a lost token cannot be
// recovered.

import { BUG_REPORT_LIMITS } from "./limits";
import type { CreatedBugReport } from "./types";

export type SentReport = {
  id: number;
  ref: string;
  followToken: string;
  title: string;
  /** ISO date. */
  createdAt: string;
};

const TOKEN_RE = /^[0-9a-f]{16,128}$/i;

function readEntry(raw: unknown): SentReport | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "number" ? r.id : Number(r.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (typeof r.followToken !== "string" || !TOKEN_RE.test(r.followToken)) return null;
  return {
    id,
    ref: typeof r.ref === "string" && r.ref ? r.ref : `BR-${id}`,
    followToken: r.followToken,
    title: typeof r.title === "string" ? r.title.slice(0, BUG_REPORT_LIMITS.title.max) : "",
    createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
  };
}

/** What storage held, keeping only well-formed entries, newest first, at most `max`. */
export function parseSentReports(raw: unknown, max: number = BUG_REPORT_LIMITS.sentReports): SentReport[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: SentReport[] = [];
  for (const item of raw) {
    const entry = readEntry(item);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= max) break;
  }
  return out;
}

/** The list with `entry` first (replacing an older copy of it) and the oldest past `max` dropped. */
export function addSentReport(list: readonly SentReport[], entry: SentReport, max: number = BUG_REPORT_LIMITS.sentReports): SentReport[] {
  return [entry, ...list.filter((item) => item.id !== entry.id)].slice(0, max);
}

export function sentReportFrom(created: CreatedBugReport, title: string, now: number = Date.now()): SentReport {
  return {
    id: created.id,
    ref: created.ref,
    followToken: created.followToken,
    title: title.slice(0, BUG_REPORT_LIMITS.title.max),
    createdAt: new Date(now).toISOString(),
  };
}
