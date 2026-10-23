// "Report a bug" in the userscript manager's own menu, for when the mod's
// dock is hidden, off screen, or broken: the case a report is most needed.
//
// It opens the HUD window like any other menu. If the HUD never mounted (the
// window does not show up), the form opens in a bare window of its own.

import { h } from "../../ui/kit/dom";
import { button } from "../../ui/kit/button";
import { layer } from "../../ui/kit/theme";
import { BUG_REPORT_PANEL_ID, renderBugReportMenu } from "./menu";

const OPEN_CHECK_MS = 500;

let standalone: HTMLElement | null = null;

/** True when a window holding the report form is on screen. */
function isOpen(): boolean {
  const win = document.querySelector(".qws-bug-tab")?.closest<HTMLElement>(".qws-win");
  return !!win && win.style.display !== "none" && !win.classList.contains("is-hidden");
}

function openStandalone(): void {
  if (standalone?.isConnected) {
    standalone.style.display = "";
    return;
  }
  const win = h("div", "qws-win");
  win.style.right = "16px";
  win.style.bottom = "16px";
  win.style.zIndex = String(layer.window + 1);
  const head = h("div", "w-head");
  const close = button("✕", {
    size: "xs",
    title: "Close",
    onClick: () => {
      win.style.display = "none";
    },
  });
  close.classList.add("w-btn");
  head.append(h("div", "w-title", "Report a bug"), h("div", "qmm-spacer"), close);
  const body = h("div", "w-body");
  win.append(head, body);
  (document.documentElement || document.body).appendChild(win);
  renderBugReportMenu(body);
  standalone = win;
}

export function openBugReportPanel(): void {
  window.dispatchEvent(new CustomEvent("qws:open-panel", { detail: { id: BUG_REPORT_PANEL_ID } }));
  setTimeout(() => {
    try {
      if (!isOpen()) openStandalone();
    } catch (error) {
      console.error("[BugReport] could not open the report window", error);
    }
  }, OPEN_CHECK_MS);
}

export function registerBugReportMenuCommand(): void {
  if (typeof GM_registerMenuCommand !== "function") return;
  try {
    GM_registerMenuCommand("Report a bug", openBugReportPanel);
  } catch {}
}
