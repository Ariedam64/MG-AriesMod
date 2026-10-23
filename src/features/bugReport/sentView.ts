// What the New report tab shows once a report went through: its reference to
// copy, a word on screenshots that did not make it, and the way on.

import { describeBugReportError, type SubmitResult } from "../../lib/bugReport/client";
import { copyTextToClipboard } from "../../lib/download";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";

type Sent = Extract<SubmitResult, { ok: true }>;

export function showSentView(
  container: HTMLElement,
  result: Sent,
  actions: { onMyReports: () => void; onNewReport: () => void },
): void {
  const { report, attachmentFailures } = result;
  const root = h("div", "qws-bug-success");
  root.appendChild(h("div", "qws-bug-success__title", "Thanks, your report was sent."));

  const ref = h("div", "qws-bug-success__ref");
  const setCopyLabel = (text: string) => {
    const label = copy.querySelector(".label");
    if (label) label.textContent = text;
  };
  const copy = button("Copy", {
    size: "sm",
    title: "Copy the reference",
    onClick: () => {
      try {
        copyTextToClipboard(report.ref);
        setCopyLabel("Copied");
      } catch {
        setCopyLabel("Copy failed");
      }
    },
  });
  ref.append(h("span", "qws-bug-success__code", report.ref), copy);
  root.append(
    ref,
    h(
      "p",
      "qws-bug-note",
      "Mention this reference if you talk about it on Discord. Its status, and any reply, show up in My reports.",
    ),
  );

  if (attachmentFailures.length) {
    const count = attachmentFailures.length;
    const reason = describeBugReportError(attachmentFailures[0].error);
    const warning = h("div", "qws-bug-notice");
    warning.appendChild(
      h("span", undefined, `${count} screenshot${count > 1 ? "s" : ""} could not be uploaded, but the report itself arrived. ${reason}`),
    );
    root.appendChild(warning);
  }

  const buttons = h("div", "qws-bug-actions");
  buttons.append(
    button("See my reports", { variant: "ghost", onClick: actions.onMyReports }),
    button("New report", { variant: "primary", onClick: actions.onNewReport }),
  );
  root.appendChild(buttons);
  container.replaceChildren(root);
}
