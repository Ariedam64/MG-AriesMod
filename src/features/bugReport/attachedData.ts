// "Attached data": what goes with the report besides the player's words, each
// part with its own switch and a sentence saying what it is. Technical info
// always goes, and says so. The preview shows the exact body before sending.

import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { settingRow } from "../../ui/kit/layout";
import { openModal } from "../../ui/kit/modal";
import { switchInput } from "../../ui/kit/toggles";
import type { AttachedData } from "./context";
import { BUG_REPORT_PROJECT } from "./project";

export type AttachedDataSection = {
  root: HTMLElement;
  read(): AttachedData;
  reset(): void;
};

export function buildAttachedData(onPreview: () => Promise<void>): AttachedDataSection {
  const logs = switchInput(true);
  const settings = switchInput(true);
  const accountState = switchInput(true);
  const technical = switchInput(true);
  technical.disabled = true;
  technical.title = "Always included";

  const section = card("Attached data", { subtitle: "Sent with your report, only to the mod's developer." });
  const rows = h("div", "qws-bug-stack qws-bug-data");
  rows.append(
    settingRow(
      "Recent console errors",
      "The last errors and warnings in this tab, and which menus you opened just before.",
      logs,
    ).row,
    settingRow("Mod settings", "Which features are switched on, like ghost mode or auto store. Never your saved data or keys.", settings).row,
    settingRow(
      "Account state",
      `Lets Romann see the garden and inventory ${BUG_REPORT_PROJECT.name} already syncs, as they are when you send this.`,
      accountState,
    ).row,
    settingRow(
      "Technical info",
      "Mod and game versions, browser and screen size, room and player count. Always included.",
      technical,
    ).row,
  );
  const previewRow = h("div", "qws-bug-actions");
  previewRow.appendChild(button("Preview what will be sent", { size: "sm", variant: "ghost", lockWhilePending: true, onClick: onPreview }));
  section.body.append(rows, previewRow);

  return {
    root: section.root,
    read: () => ({ logs: logs.checked, settings: settings.checked, accountState: accountState.checked }),
    reset() {
      logs.checked = true;
      settings.checked = true;
      accountState.checked = true;
    },
  };
}

/** The exact JSON body, and what the screenshots that follow it weigh. */
export function showPreviewModal(
  host: HTMLElement,
  body: unknown,
  screenshots: Array<{ kind: string; width: number; height: number; bytes: number }>,
  note: string | null,
): void {
  const modal = openModal({ host, title: "What will be sent", widthPx: 620, maxHeightPx: 720 });
  modal.body.appendChild(
    h(
      "p",
      "qws-bug-note",
      "This is the report exactly as it goes to the server, with anything that looks like a password or a key already hidden.",
    ),
  );
  if (note) modal.body.appendChild(h("p", "qws-bug-hint", note));
  const pre = h("pre", "qws-bug-json");
  // textContent, never markup: the player's text is shown as typed.
  pre.textContent = JSON.stringify(body, null, 2);
  modal.body.appendChild(pre);
  const shots = screenshots.length
    ? `Then ${screenshots.length} screenshot${screenshots.length > 1 ? "s" : ""}, one request each: ${screenshots
        .map((shot) => `${shot.kind} ${shot.width} x ${shot.height}, ${Math.round(shot.bytes / 1024)} KB`)
        .join("; ")}.`
    : "No screenshot.";
  modal.body.appendChild(h("p", "qws-bug-hint", shots));
  modal.footer.appendChild(button("Close", { variant: "primary", onClick: () => modal.close() }));
}
