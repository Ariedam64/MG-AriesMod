// The My reports tab: the reports sent from this browser, with their status,
// the version that fixes them, the developer's reply and the conversation,
// where the player can answer. Read with the follow tokens kept at sending
// time, so it works without any account. With an API key, the player's
// verified reports of this mod come too, even those sent from another device,
// and can be answered with the key alone.

import {
  addReportComment,
  describeBugReportError,
  listMyReports,
  type FollowedReport,
} from "../../lib/bugReport/client";
import { BUG_REPORT_LIMITS } from "../../lib/bugReport/limits";
import type { SentReport } from "../../lib/bugReport/sentReports";
import { acceptsComments, statusLabel } from "../../lib/bugReport/status";
import type { MyBugReport } from "../../lib/bugReport/types";
import { isVersionBelow } from "../../lib/bugReport/version";
import { bugReportClient } from "../../platform/ariesApi/bugReports";
import { getLocalVersion } from "../../platform/modVersion";
import { hasApiKey } from "../../platform/storage";
import { pill, type StatusTone } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { errorBar, plainCard } from "../../ui/kit/card";
import { h, refreshWhileVisible } from "../../ui/kit/dom";
import { openLink } from "../tools/openLink";
import { latestVersion } from "./context";
import { BUG_REPORT_PROJECT } from "./project";
import { replyTarget, reportRows, type ReportRow } from "./reportRows";
import { onSentReportsChange, readSentReports } from "./sentStore";
import { ensureBugReportStyles } from "./styles";

export const MY_REPORTS_TAB = "bug-mine";

/** Not more often than this unless asked, or a new report was sent. */
const MIN_REFRESH_MS = 30_000;
const AUTO_REFRESH_MS = 5 * 60_000;

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return date.toLocaleString();
  }
}

function toneOf(status: string): StatusTone | undefined {
  if (status === "fixed") return "ok";
  if (status === "needs_info") return "warn";
  return undefined;
}

export function renderMyReportsTab(view: HTMLElement): void {
  ensureBugReportStyles();

  const tab = h("div", "qws-bug-tab");
  const refreshButton = button("Refresh", { size: "sm", variant: "ghost", lockWhilePending: true, onClick: () => refresh(true) });
  const head = h("div", "qws-bug-list-head");
  head.append(h("p", "qws-bug-note", "Reports sent from this browser, with their status and any reply."), refreshButton);
  const errors = errorBar();
  const list = h("div", "qws-bug-list");
  tab.append(head, errors.el, list);
  view.replaceChildren(tab);

  let remote = new Map<number, MyBugReport>();
  let fetched = false;
  /** The last fetch failed: statuses shown are from before, or unknown. */
  let failed = false;
  let stale = true;
  let lastFetch = 0;
  let inFlight: Promise<void> | null = null;
  let download: string | null = null;
  /** Replies being typed, kept across refreshes. */
  const replyDrafts = new Map<number, string>();

  void latestVersion().then((status) => {
    download = status?.download ?? null;
  });
  onSentReportsChange(() => {
    stale = true;
  });
  refreshWhileVisible(tab, () => void refresh(false), AUTO_REFRESH_MS);

  function refresh(force: boolean): Promise<void> {
    if (inFlight) return inFlight;
    const local = readSentReports();
    const typing = list.contains(document.activeElement) && document.activeElement?.tagName === "TEXTAREA";
    if (!force && (typing || (!stale && Date.now() - lastFetch < MIN_REFRESH_MS))) {
      if (!typing) render(local);
      return Promise.resolve();
    }
    render(local);
    // Nothing to ask about: no token kept here, and no key for verified reports.
    if (!local.length && !hasApiKey()) return Promise.resolve();

    inFlight = (async () => {
      const result = await listMyReports(bugReportClient, local);
      lastFetch = Date.now();
      stale = false;
      if (result.ok) {
        remote = new Map(result.reports.map((report) => [report.id, report]));
        fetched = true;
        failed = false;
        errors.clear();
      } else {
        failed = true;
        errors.show(`Could not load the latest status. ${describeBugReportError(result.error)}`);
      }
      render(readSentReports());
    })().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  function render(local: SentReport[]): void {
    const rows = reportRows(local, remote, BUG_REPORT_PROJECT.id);
    if (!rows.length) {
      list.replaceChildren(emptyState());
      return;
    }
    list.replaceChildren(...rows.map(reportCard));
  }

  function reportCard(row: ReportRow): HTMLElement {
    const { local, remote: report } = row;
    const root = plainCard();
    const title = report?.title || local?.title || "Untitled report";
    const headLine = h("div", "qws-bug-report__head");
    headLine.append(h("div", "qws-bug-report__title", title), pill(report?.ref ?? local?.ref ?? `BR-${row.id}`));
    // Missing from an answer that came after it was sent: the server no longer has it.
    const gone = !report && fetched && !!local && Date.parse(local.createdAt) <= lastFetch;
    if (report) headLine.append(pill(statusLabel(report.status, report.statusLabel), toneOf(report.status)));
    else headLine.append(pill(gone ? "Not found" : failed ? "Status unavailable" : "Checking..."));
    root.appendChild(headLine);

    const sentAt = formatDate(report?.createdAt || local?.createdAt || "");
    const version = report?.modVersion ? ` with v${report.modVersion}` : "";
    if (sentAt || version) root.appendChild(h("div", "qws-bug-report__meta", `Sent ${sentAt}${version}`.trim()));

    if (!report) {
      if (gone) root.appendChild(h("p", "qws-bug-hint", "The server does not know this report any more. It may have been removed."));
      return root;
    }

    if (report.fixedInVersion) root.appendChild(fixLine(report.fixedInVersion));
    if (report.status === "needs_info") {
      const ask = h("div", "qws-bug-notice");
      ask.appendChild(h("span", undefined, "The developer needs a little more information. Please answer below."));
      root.appendChild(ask);
    }

    const thread = h("div", "qws-bug-thread");
    const reply = report.publicReply?.trim();
    // A published reply is also added to the comments; show it alone only when it is not there.
    if (reply && !report.comments.some((comment) => comment.author === "admin" && comment.message.trim() === reply)) {
      thread.appendChild(commentBubble("admin", reply, report.publicReplyAt ?? ""));
    }
    for (const comment of report.comments) thread.appendChild(commentBubble(comment.author, comment.message, comment.createdAt));
    if (thread.childElementCount) root.appendChild(thread);

    if (report.canComment && acceptsComments(report.status)) {
      const target = replyTarget(row, hasApiKey());
      root.appendChild(target ? replyBox(target) : h("p", "qws-bug-hint", "Reply from the browser you sent this report from."));
    }
    return root;
  }

  function fixLine(version: string): HTMLElement {
    const local = getLocalVersion();
    if (!isVersionBelow(local, version)) {
      return h("div", "qws-bug-fix", local ? `Fixed in v${version}, which you already have.` : `Fixed in v${version}.`);
    }
    const line = h("div", "qws-bug-fix is-update");
    line.appendChild(h("span", undefined, `Fixed in v${version}. Update to v${version} to get the fix.`));
    const link = download;
    if (link) line.appendChild(button("Update", { size: "sm", onClick: () => void openLink(link) }));
    return line;
  }

  function commentBubble(author: "admin" | "reporter", message: string, createdAt: string): HTMLElement {
    const bubble = h("div", `qws-bug-comment ${author === "admin" ? "is-admin" : "is-reporter"}`);
    const when = formatDate(createdAt);
    bubble.appendChild(h("span", "qws-bug-comment__who", `${author === "admin" ? "Developer" : "You"}${when ? `, ${when}` : ""}`));
    // Text nodes only: neither side's message is ever read as markup.
    bubble.appendChild(document.createTextNode(message));
    return bubble;
  }

  function replyBox(report: FollowedReport): HTMLElement {
    const box = h("div", "qws-bug-reply");
    const area = h("textarea", "qmm-input qws-bug-textarea qws-bug-textarea--short");
    area.placeholder = "Add a detail or answer a question";
    area.maxLength = BUG_REPORT_LIMITS.commentMessage;
    area.rows = 2;
    area.value = replyDrafts.get(report.id) ?? "";
    area.addEventListener("input", () => replyDrafts.set(report.id, area.value));
    const status = h("span", "qws-bug-progress");
    const sendReply = button("Send reply", {
      size: "sm",
      variant: "primary",
      lockWhilePending: true,
      onClick: async () => {
        if (!area.value.trim()) {
          status.textContent = "Write something first.";
          return;
        }
        status.textContent = "Sending...";
        const result = await addReportComment(bugReportClient, report, area.value);
        if (!result.ok) {
          status.textContent = describeBugReportError(result.error);
          return;
        }
        replyDrafts.delete(report.id);
        area.value = "";
        status.textContent = "";
        await refresh(true);
      },
    });
    const actions = h("div", "qws-bug-actions");
    actions.append(status, sendReply);
    box.append(area, actions);
    return box;
  }
}

function emptyState(): HTMLElement {
  const box = h("div", "qws-bug-empty");
  box.append(
    h("div", "qws-bug-empty__title", "No reports yet"),
    h(
      "div",
      undefined,
      "Reports you send from the New report tab show up here. Each one is read: you will see its status change as it is looked at, any question or reply from the developer, and the version that fixes it.",
    ),
  );
  return box;
}
