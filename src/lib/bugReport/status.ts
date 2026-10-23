// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// A report's life on the backend, and how each status reads for the player.

export const BUG_REPORT_STATUSES = [
  "new",
  "triaged",
  "needs_info",
  "confirmed",
  "in_progress",
  "fixed",
  "duplicate",
  "wont_fix",
  "not_a_bug",
  "spam",
  "closed",
] as const;

export type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

/** The label the player sees. Several closing statuses read the same on purpose. */
export const STATUS_LABELS: Record<BugReportStatus, string> = {
  new: "Received",
  triaged: "Under review",
  needs_info: "Need more info",
  confirmed: "Confirmed",
  in_progress: "Being fixed",
  fixed: "Fixed",
  duplicate: "Duplicate",
  wont_fix: "Closed",
  not_a_bug: "Closed",
  spam: "Closed",
  closed: "Closed",
};

export const OPEN_STATUSES: readonly BugReportStatus[] = ["new", "triaged", "needs_info", "confirmed", "in_progress"];

/** Statuses on which the backend refuses a player's comment (409). */
export const COMMENT_CLOSED_STATUSES: readonly BugReportStatus[] = ["closed", "spam", "duplicate", "wont_fix", "not_a_bug"];

export function isBugReportStatus(value: unknown): value is BugReportStatus {
  return typeof value === "string" && (BUG_REPORT_STATUSES as readonly string[]).includes(value);
}

/**
 * The player's label for a status. A status this copy does not know yet (the
 * backend added one) falls back on the label the server sent along with it.
 */
export function statusLabel(status: string, serverLabel?: string | null): string {
  if (isBugReportStatus(status)) return STATUS_LABELS[status];
  return serverLabel?.trim() || "Unknown";
}

export function isOpenStatus(status: string): boolean {
  return (OPEN_STATUSES as readonly string[]).includes(status);
}

/** Whether the player can still add a comment, as far as the status alone tells. */
export function acceptsComments(status: string): boolean {
  return !(COMMENT_CLOSED_STATUSES as readonly string[]).includes(status);
}
