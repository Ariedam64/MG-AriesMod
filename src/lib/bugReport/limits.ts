// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// The backend's size limits. nginx and Express both stop a request at 1 MB,
// which is why the report and each screenshot travel separately.

export const BUG_REPORT_LIMITS = {
  title: { min: 3, max: 140 },
  description: { min: 10, max: 4000 },
  steps: 2000,
  expected: 2000,
  actual: 2000,
  contact: 100,
  feature: 80,
  playerName: 64,
  playerId: 64,
  modName: 80,
  modVersion: 40,
  gameVersion: 40,
  /** `context` once serialized. */
  contextChars: 300_000,
  logEntries: 200,
  logMessage: 500,
  breadcrumbEntries: 200,
  breadcrumbMessage: 500,
  attachments: 3,
  /** Decoded bytes the backend accepts for one screenshot. */
  attachmentBytes: 750_000,
  /** What the client aims for, to leave room under the hard limit. */
  attachmentTargetBytes: 600_000,
  /** Longest side of a screenshot before any further shrinking. */
  imageMaxSide: 1920,
  commentMessage: 2000,
  /** Follow tokens sent to `POST /bug-reports/mine` at once. */
  mineReports: 50,
  /** Sent reports a mod remembers locally. */
  sentReports: 50,
} as const;

const NUL = /\u0000/g;

/** `value` as a string of at most `max` characters, NUL characters removed (Postgres refuses them). */
export function clipText(value: unknown, max: number): string {
  const text = typeof value === "string" ? value : value == null ? "" : String(value);
  const clean = text.indexOf("\u0000") === -1 ? text : text.replace(NUL, "");
  return clean.length > max ? clean.slice(0, max) : clean;
}

/** Like `clipText`, but trimmed, and null when nothing is left. */
export function optionalText(value: unknown, max: number): string | null {
  if (value == null) return null;
  const text = clipText(value, Number.MAX_SAFE_INTEGER).trim();
  return text ? text.slice(0, max) : null;
}

/** A title as the backend measures it: runs of whitespace become one space. */
export function normalizeTitle(value: unknown): string {
  return clipText(value, Number.MAX_SAFE_INTEGER).replace(/\s+/g, " ").trim();
}

/** A log line kept to `max` characters, ending with an ellipsis when it was cut. */
export function clipLine(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}
