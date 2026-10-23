// The New report tab: the form, its screenshots and attached data, and what
// happens on Send. A report that cannot be sent is never lost: the draft
// stays, and it can be saved to a file to share by hand.

import { submitBugReport, describeBugReportError, type BugReportAttachment, type BugReportError, type SubmitProgress } from "../../lib/bugReport/client";
import { descriptionProblem, prepareBugReport, prepareContext, titleProblem } from "../../lib/bugReport/prepare";
import { sentReportFrom } from "../../lib/bugReport/sentReports";
import type { BugReportPayload } from "../../lib/bugReport/types";
import { waitUntil } from "../../lib/async";
import { downloadJSONFile } from "../../lib/download";
import { bugReportClient } from "../../platform/ariesApi/bugReports";
import { button } from "../../ui/kit/button";
import { card, errorBar } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import type { Menu } from "../../ui/kit/menu";
import { openLink } from "../tools/openLink";
import { buildAttachedData, showPreviewModal } from "./attachedData";
import { collectAutoFields, latestVersion, type AutoFields } from "./context";
import { clearDraft, draftHasText, openDraft, pendingReport, rememberContact, saveDraftSoon, type Draft } from "./draft";
import { buildReportFields, type FormValues } from "./formFields";
import { MY_REPORTS_TAB } from "./myReportsTab";
import { BUG_REPORT_PROJECT } from "./project";
import { buildScreenshotStrip } from "./screenshots";
import { rememberSentReport } from "./sentStore";
import { ensureBugReportStyles } from "./styles";
import { showSentView } from "./sentView";

/** Errors after which the report is worth keeping in a file. */
const SAVE_WORTHY: ReadonlySet<BugReportError["kind"]> = new Set(["offline", "timeout", "server", "rate_limited", "too_large", "bad_response"]);

function toPayload(values: FormValues, auto: AutoFields, attachments: number): BugReportPayload {
  return {
    ...auto,
    contact: values.contact || null,
    category: values.category,
    title: values.title,
    description: values.description,
    steps: values.steps || null,
    expected: values.expected || null,
    actual: values.actual || null,
    frequency: values.frequency,
    withoutMod: values.withoutMod,
    feature: values.feature || null,
    attachmentsExpected: attachments,
  };
}

const toDraft = (values: FormValues): Draft => ({ ...values });

function progressText(progress: SubmitProgress): string {
  if (progress.stage === "report") return "Sending report...";
  return `Uploading screenshot ${progress.index + 1}/${progress.total}...`;
}

/** A banner with a sentence and optional buttons, hidden until `show`. */
function notice(tone: "warn" | "info") {
  const el = h("div", tone === "info" ? "qws-bug-notice qws-bug-notice--info" : "qws-bug-notice");
  el.hidden = true;
  el.setAttribute("role", "status");
  return {
    el,
    show(text: string, ...actions: HTMLElement[]) {
      el.replaceChildren(h("span", undefined, text), ...actions);
      el.hidden = false;
    },
    hide: () => (el.hidden = true),
  };
}

export function renderReportTab(view: HTMLElement, menu: Menu): void {
  ensureBugReportStyles();

  const tab = h("div", "qws-bug-tab");
  // Focusable, so a click anywhere in the form lets Ctrl+V paste an image here.
  tab.tabIndex = -1;
  const form = h("div", "qws-bug-stack");
  const sent = h("div", "qws-bug-stack");
  sent.hidden = true;
  tab.append(form, sent);
  view.replaceChildren(tab);

  const updateNotice = notice("warn");
  const draftNotice = notice("info");
  const fields = buildReportFields();
  const shots = buildScreenshotStrip();
  const attached = buildAttachedData(preview);
  const errors = errorBar();
  const progress = h("span", "qws-bug-progress");
  progress.setAttribute("role", "status");

  const details = card("Your report", { subtitle: "In English or your own language, as you prefer." });
  details.body.appendChild(fields.root);
  const pictures = card("Screenshots", { subtitle: "The game view is added for you. Remove it if it shows something private." });
  pictures.body.appendChild(shots.root);

  let lastAttempt: { payload: BugReportPayload; attachments: BugReportAttachment[] } | null = null;
  const saveButton = button("Save report to a file", { variant: "ghost", onClick: () => saveToFile() });
  saveButton.hidden = true;
  const sendButton = button("Send report", { variant: "primary", lockWhilePending: true, onClick: () => send() });
  const actions = h("div", "qws-bug-actions");
  actions.append(progress, saveButton, sendButton);

  form.append(updateNotice.el, draftNotice.el, details.root, pictures.root, attached.root, errors.el, actions);

  // Newer release out: a gentle nudge, sending stays possible.
  void latestVersion().then((status) => {
    if (!status?.behind || !status.remote) return;
    const download = status.download;
    const update = download ? button("Update", { size: "sm", onClick: () => void openLink(download) }) : null;
    updateNotice.show(
      `You have v${status.local ?? "?"} and v${status.remote} is out. Please update first: the problem may already be fixed.`,
      ...(update ? [update] : []),
    );
  });

  const draft = openDraft();
  fields.fill(draft);
  if (draftHasText(draft)) {
    const discard = button("Discard", {
      size: "sm",
      variant: "ghost",
      onClick: () => {
        fields.reset(true);
        clearDraft();
        draftNotice.hide();
      },
    });
    draftNotice.show("Your unsent report was restored.", discard);
  }
  fields.onChange(() => {
    saveDraftSoon(toDraft(fields.read()));
    errors.clear();
  });

  tab.addEventListener("paste", (event) => shots.handlePaste(event));
  shots.takeAutoGameShot();
  watchReturns(tab, () => {
    if (!form.hidden) shots.refreshAutoGameShot();
  });

  function validate(values: FormValues): boolean {
    fields.markInvalid(null);
    if (titleProblem(values.title)) {
      fields.markInvalid("title", "Give it a short title, 3 to 140 characters.");
      fields.focus("title");
      return false;
    }
    if (descriptionProblem(values.description)) {
      fields.markInvalid("description", "Describe what happened in at least 10 characters.");
      fields.focus("description");
      return false;
    }
    return true;
  }

  async function send(): Promise<void> {
    errors.clear();
    saveButton.hidden = true;
    const values = fields.read();
    if (!validate(values)) return;
    try {
      if (shots.pending()) {
        progress.textContent = "Preparing screenshots...";
        await waitUntil(() => shots.pending() === 0, { timeoutMs: 15_000 });
      }
      progress.textContent = "Sending report...";
      const attachments = shots.attachments();
      const payload = toPayload(values, await collectAutoFields(attached.read()), attachments.length);
      lastAttempt = { payload, attachments };
      // The same token on every try of this report, until one goes through,
      // saved together with the text it sends.
      const pending = pendingReport(toDraft(values));
      const result = await submitBugReport(
        bugReportClient,
        payload,
        attachments,
        (step) => {
          progress.textContent = progressText(step);
        },
        pending,
      );
      progress.textContent = "";
      if (result.ok === false) {
        errors.show(describeBugReportError(result.error));
        saveButton.hidden = !SAVE_WORTHY.has(result.error.kind);
        return;
      }
      rememberSentReport(sentReportFrom(result.report, payload.title.trim()));
      rememberContact(values.contact);
      clearDraft();
      draftNotice.hide();
      form.hidden = true;
      sent.hidden = false;
      showSentView(sent, result, {
        onMyReports: () => menu.switchTo(MY_REPORTS_TAB),
        onNewReport: startOver,
      });
    } catch (error) {
      progress.textContent = "";
      errors.show(`Something went wrong while sending (${error instanceof Error ? error.message : String(error)}).`);
      saveButton.hidden = false;
    }
  }

  function startOver(): void {
    fields.reset(true);
    attached.reset();
    shots.clear();
    errors.clear();
    saveButton.hidden = true;
    lastAttempt = null;
    sent.hidden = true;
    form.hidden = false;
    shots.takeAutoGameShot();
    view.closest(".w-body")?.scrollTo({ top: 0 });
  }

  async function preview(): Promise<void> {
    const host = view.closest<HTMLElement>(".qws-win");
    if (!host) return;
    const values = fields.read();
    const attachments = shots.attachments();
    const payload = toPayload(values, await collectAutoFields(attached.read()), attachments.length);
    const prepared = prepareBugReport(payload);
    // Before the title and description are filled in, the rest is still worth seeing.
    const body = prepared.ok ? prepared.payload : { ...payload, context: prepareContext(payload.context) };
    const note = prepared.ok ? null : `The ${prepared.field} is not filled in yet: it is checked when you send.`;
    showPreviewModal(host, body, shots.summary(), note);
  }

  function saveToFile(): void {
    if (!lastAttempt) return;
    const prepared = prepareBugReport(lastAttempt.payload);
    const report = prepared.ok ? prepared.payload : lastAttempt.payload;
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    const file = { report, screenshots: lastAttempt.attachments };
    downloadJSONFile(`${BUG_REPORT_PROJECT.id}-bug-report-${stamp}.json`, JSON.stringify(file, null, 2));
    progress.textContent = "Saved. You can share the file on the mod's Discord, or try sending again later.";
  }
}

/** Calls `onReturn` each time `el` comes back on screen after being hidden (window closed, other tab). */
function watchReturns(el: HTMLElement, onReturn: () => void): void {
  if (typeof IntersectionObserver === "undefined") return;
  let shown = false;
  let visible = false;
  new IntersectionObserver((entries) => {
    const now = entries[entries.length - 1]?.isIntersecting ?? false;
    if (now && !visible && shown) onReturn();
    if (now) shown = true;
    visible = now;
  }).observe(el);
}
