// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// Turns what a form gathered into the exact body `POST /bug-reports` gets:
// required fields checked the way the backend checks them, every other text
// cut to its limit, the context redacted and kept under its size. A report
// the backend would refuse is caught here, before the player waits on it.

import { BUG_REPORT_LIMITS as L, clipLine, clipText, normalizeTitle, optionalText } from "./limits";
import { redactValue } from "./redact";
import {
  BUG_REPORT_CATEGORIES,
  BUG_REPORT_FREQUENCIES,
  BUG_REPORT_PROJECTS,
  BUG_REPORT_WITHOUT_MOD,
  LOG_LEVELS,
  isFollowToken,
  type Breadcrumb,
  type BugReportContext,
  type BugReportPayload,
  type LogEntry,
} from "./types";

export type PreparedReport = { ok: true; payload: BugReportPayload } | { ok: false; field: string };

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : fallback;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** The title problem, if any, in the backend's terms. */
export function titleProblem(title: unknown): "title" | null {
  const length = normalizeTitle(title).length;
  return length < L.title.min || length > L.title.max ? "title" : null;
}

export function descriptionProblem(description: unknown): "description" | null {
  const length = clipText(description, Number.MAX_SAFE_INTEGER).trim().length;
  return length < L.description.min || length > L.description.max ? "description" : null;
}

/**
 * A form's data as the exact body to send, or the first field the backend
 * would refuse. A well-formed follow token is kept; any other is left out, and
 * the backend then makes one.
 */
export function prepareBugReport(input: BugReportPayload): PreparedReport {
  if (!(BUG_REPORT_PROJECTS as readonly string[]).includes(input.project)) return { ok: false, field: "project" };
  const titleField = titleProblem(input.title);
  if (titleField) return { ok: false, field: titleField };
  const descriptionField = descriptionProblem(input.description);
  if (descriptionField) return { ok: false, field: descriptionField };

  const attachments = Math.trunc(Number(input.attachmentsExpected) || 0);
  const payload: BugReportPayload = {
    project: input.project,
    modName: optionalText(input.modName, L.modName),
    modVersion: optionalText(input.modVersion, L.modVersion),
    gameVersion: optionalText(input.gameVersion, L.gameVersion),
    playerId: optionalText(input.playerId, L.playerId),
    playerName: optionalText(input.playerName, L.playerName),
    contact: optionalText(input.contact, L.contact),
    category: oneOf(BUG_REPORT_CATEGORIES, input.category, "other"),
    title: normalizeTitle(input.title),
    description: clipText(input.description, Number.MAX_SAFE_INTEGER).trim(),
    steps: optionalText(input.steps, L.steps),
    expected: optionalText(input.expected, L.expected),
    actual: optionalText(input.actual, L.actual),
    frequency: oneOf(BUG_REPORT_FREQUENCIES, input.frequency, "unknown"),
    withoutMod: oneOf(BUG_REPORT_WITHOUT_MOD, input.withoutMod, "unknown"),
    feature: optionalText(input.feature, L.feature),
    includeAccountState: input.includeAccountState === true,
    attachmentsExpected: Math.min(L.attachments, Math.max(0, attachments)),
    context: prepareContext(input.context),
  };
  if (isFollowToken(input.followToken)) payload.followToken = input.followToken;
  return { ok: true, payload };
}

/** The context redacted, its logs and breadcrumbs normalized, and the whole under the size limit. */
export function prepareContext(raw: unknown, maxChars: number = L.contextChars): BugReportContext {
  const redacted = redactValue(isRecord(raw) ? raw : {});
  const context = (isRecord(redacted) ? redacted : {}) as BugReportContext & Record<string, unknown>;
  if (context.logs !== undefined) context.logs = normalizeLogs(context.logs);
  if (context.breadcrumbs !== undefined) context.breadcrumbs = normalizeBreadcrumbs(context.breadcrumbs);
  return fitContext(context, maxChars);
}

/** The newest `max` entries, each message cut to the backend's length, levels it knows. */
export function normalizeLogs(list: unknown, max: number = L.logEntries): LogEntry[] {
  if (!Array.isArray(list)) return [];
  const out: LogEntry[] = [];
  for (const entry of list.slice(-max)) {
    if (!isRecord(entry)) continue;
    const item: LogEntry = {
      t: typeof entry.t === "number" && Number.isFinite(entry.t) ? entry.t : 0,
      level: oneOf(LOG_LEVELS, entry.level, "log"),
      msg: clipLine(clipText(entry.msg, Number.MAX_SAFE_INTEGER), L.logMessage),
    };
    if (typeof entry.repeat === "number" && entry.repeat > 0) item.repeat = Math.trunc(entry.repeat);
    out.push(item);
  }
  return out;
}

export function normalizeBreadcrumbs(list: unknown, max: number = L.breadcrumbEntries): Breadcrumb[] {
  if (!Array.isArray(list)) return [];
  const out: Breadcrumb[] = [];
  for (const entry of list.slice(-max)) {
    if (!isRecord(entry)) continue;
    const item: Breadcrumb = {
      t: typeof entry.t === "number" && Number.isFinite(entry.t) ? entry.t : 0,
      msg: clipLine(clipText(entry.msg, Number.MAX_SAFE_INTEGER), L.breadcrumbMessage),
    };
    if (typeof entry.repeat === "number" && entry.repeat > 0) item.repeat = Math.trunc(entry.repeat);
    out.push(item);
  }
  return out;
}

const sizeOf = (value: unknown) => JSON.stringify(value).length;

/**
 * Shrinks a context until it serializes under `maxChars`, dropping what helps
 * least first: the older half of the logs and breadcrumbs, then `extra`, then
 * the settings. The environment, mod and game parts are a few hundred bytes
 * and always stay, unless they alone are too big.
 */
export function fitContext(context: BugReportContext, maxChars: number = L.contextChars): BugReportContext {
  const out: BugReportContext = { ...context };
  for (let guard = 0; guard < 64 && sizeOf(out) > maxChars; guard++) {
    if (out.logs && out.logs.length > 1) out.logs = out.logs.slice(Math.ceil(out.logs.length / 2));
    else if (out.breadcrumbs && out.breadcrumbs.length > 1) out.breadcrumbs = out.breadcrumbs.slice(Math.ceil(out.breadcrumbs.length / 2));
    else if (out.extra !== undefined) delete out.extra;
    else if (out.logs?.length) delete out.logs;
    else if (out.breadcrumbs?.length) delete out.breadcrumbs;
    else if (out.settings !== undefined) delete out.settings;
    else return { extra: { contextTruncated: true } };
  }
  return out;
}
