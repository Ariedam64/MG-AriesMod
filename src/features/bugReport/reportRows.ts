// Which reports the My reports tab lists, and what a reply on each is sent
// with. Apart from the tab so the check suite can hold it without a DOM.

import type { FollowedReport } from "../../lib/bugReport/client";
import type { SentReport } from "../../lib/bugReport/sentReports";
import type { MyBugReport } from "../../lib/bugReport/types";

export type ReportRow = { id: number; local: SentReport | null; remote: MyBugReport | null };

/**
 * The reports sent from this browser, then the player's verified reports that
 * came back through the API key without a token kept here. The key belongs to
 * the player, not to this mod, so it also brings the reports sent from the
 * other mods (Community Hub, MG-mod): only `project`'s are listed, since a
 * report's "fixed in" version is compared with this mod's own.
 */
export function reportRows(local: readonly SentReport[], remote: ReadonlyMap<number, MyBugReport>, project: string): ReportRow[] {
  const rows: ReportRow[] = local.map((entry) => ({ id: entry.id, local: entry, remote: remote.get(entry.id) ?? null }));
  const extra = [...remote.values()].filter((report) => report.project === project && !local.some((entry) => entry.id === report.id));
  for (const report of extra.sort((a, b) => b.id - a.id)) rows.push({ id: report.id, local: null, remote: report });
  return rows;
}

/**
 * What a reply is sent with: the follow token kept here, or for a verified
 * report this browser has no token for (mod reinstalled, another device) no
 * token at all, the API key alone, which the backend accepts from the
 * report's verified author. Null when there is neither.
 */
export function replyTarget(row: ReportRow, hasApiKey: boolean): FollowedReport | null {
  if (row.local) return { id: row.local.id, followToken: row.local.followToken };
  return hasApiKey ? { id: row.id, followToken: "" } : null;
}
