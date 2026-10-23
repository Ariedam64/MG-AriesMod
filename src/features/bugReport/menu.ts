// The Report a bug window: New report and My reports.

import { Menu } from "../../ui/kit/menu";
import { MY_REPORTS_TAB, renderMyReportsTab } from "./myReportsTab";
import { renderReportTab } from "./reportTab";

export const BUG_REPORT_PANEL_ID = "bug-report";
const NEW_REPORT_TAB = "bug-new";

export function renderBugReportMenu(container: HTMLElement): void {
  const ui = new Menu({ id: BUG_REPORT_PANEL_ID, compact: true });
  ui.mount(container);
  ui.addTabs([
    { id: NEW_REPORT_TAB, title: "New report", render: (view, api) => renderReportTab(view, api) },
    { id: MY_REPORTS_TAB, title: "My reports", render: (view) => renderMyReportsTab(view) },
  ]);
  // Opening the window is almost always to report something.
  ui.switchTo(NEW_REPORT_TAB);
}
