// The Backups tab: named backups kept inside the mod, and the whole settings
// blob imported or exported as a JSON file.

import { downloadJSONFile } from "../../lib/download";
import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { textInput } from "../../ui/kit/fields";
import { settingRow } from "../../ui/kit/layout";
import {
  deleteBackup,
  exportAllSettings,
  importSettings,
  listBackups,
  loadBackup,
  saveBackup,
  type AriesBackup,
  type SettingsImportResult,
} from "./backup";
import { ensureSettingsStyles } from "./styles";

const DROP_HINT = "Drop a JSON file here, or click to pick one.";

const errorText = (error: unknown) => (error instanceof Error ? error.message : "unknown error");

/** A one-line result note, hidden until there is something to say. */
function statusLine(): { el: HTMLElement; show(result: SettingsImportResult): void } {
  const el = h("div", "qws-set-status");
  el.hidden = true;
  el.setAttribute("role", "status");
  return {
    el,
    show(result) {
      el.textContent = result.message;
      el.hidden = false;
      el.classList.toggle("is-ok", result.success);
      el.classList.toggle("is-error", !result.success);
    },
  };
}

function exportBackupData(entry: AriesBackup): void {
  downloadJSONFile(`${entry.name || "aries-backup"}-${entry.id}.json`, JSON.stringify(entry.data, null, 2));
}

/** The dashed drop zone that reads a settings file and applies it. */
function importDropZone(onResult: (result: SettingsImportResult) => void): HTMLElement {
  const fileInput = h("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json,text/plain";
  fileInput.hidden = true;

  const hint = h("div", "qws-set-drop__hint", DROP_HINT);
  const zone = h("div", "qws-set-drop");
  zone.tabIndex = 0;
  zone.setAttribute("role", "button");
  zone.setAttribute("aria-label", "Import settings JSON");
  zone.append(h("div", "qws-set-drop__title", "Import a file"), hint);

  const setActive = (active: boolean) => zone.classList.toggle("is-active", active);
  const settle = () => setActive(document.activeElement === zone);

  const showSelection = (files: FileList | null | undefined) => {
    if (!files || !files.length) hint.textContent = DROP_HINT;
    else hint.textContent = files.length === 1 ? files[0].name : `${files.length} files selected`;
  };

  const importFiles = async (files: FileList | null) => {
    showSelection(files);
    if (files?.length) {
      try {
        onResult(importSettings(await files[0].text()));
      } catch (error) {
        onResult({ success: false, message: `Failed to read file (${errorText(error)}).` });
      } finally {
        fileInput.value = "";
      }
    }
    showSelection(null);
    settle();
  };

  zone.addEventListener("mouseenter", () => setActive(true));
  zone.addEventListener("mouseleave", settle);
  zone.addEventListener("click", () => fileInput.click());
  zone.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      fileInput.click();
    }
  });
  zone.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    setActive(true);
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", settle);
  zone.addEventListener("drop", (ev) => {
    ev.preventDefault();
    void importFiles(ev.dataTransfer?.files ?? null);
  });
  fileInput.onchange = () => void importFiles(fileInput.files);

  const wrap = h("div");
  wrap.append(fileInput, zone);
  return wrap;
}

function backupCard(): HTMLElement {
  const section = card("Backups", { subtitle: "Snapshots of your settings, kept inside the mod." });
  section.body.classList.add("qws-set-stack");

  const status = statusLine();
  const list = h("div", "qws-set-backups");

  const backupRow = (entry: AriesBackup): HTMLElement => {
    const actions = h("div", "qws-set-backup__actions");
    actions.append(
      button("Load", { size: "sm", onClick: () => status.show(loadBackup(entry.id)) }),
      button("Export", {
        size: "sm",
        variant: "ghost",
        onClick: () => {
          exportBackupData(entry);
          status.show({ success: true, message: "Backup exported." });
        },
      }),
      button("Delete", {
        size: "sm",
        variant: "ghost",
        onClick: () => {
          status.show(deleteBackup(entry.id));
          refresh();
        },
      }),
    );
    const saved = `Saved ${new Date(entry.timestamp).toLocaleDateString()}`;
    const { row } = settingRow(entry.name, saved, actions);
    row.classList.add("qws-set-backup");
    return row;
  };

  function refresh(): void {
    const backups = listBackups();
    if (!backups.length) {
      list.replaceChildren(h("div", "qws-set-empty", "No backups yet. Name one above and save it."));
    } else {
      list.replaceChildren(...backups.map(backupRow));
    }
  }

  const nameInput = textInput("Backup name");
  nameInput.setAttribute("aria-label", "Backup name");
  const saveButton = button("Save backup", {
    variant: "primary",
    onClick: () => {
      const result = saveBackup(nameInput.value);
      status.show(result);
      if (result.success) {
        nameInput.value = "";
        refresh();
      }
    },
  });
  const controls = h("div", "qws-set-save");
  controls.append(nameInput, saveButton);

  section.body.append(controls, status.el, list);
  refresh();
  return section.root;
}

function fileCard(): HTMLElement {
  const section = card("Import and export", { subtitle: "Move your settings to another browser as a JSON file." });
  section.body.classList.add("qws-set-stack");

  const status = statusLine();
  const exportButton = button("Export to file", {
    variant: "primary",
    onClick: () => {
      downloadJSONFile(`aries-settings-${Date.now()}.json`, exportAllSettings());
      status.show({ success: true, message: "Settings exported as JSON file." });
    },
  });
  const exportRow = h("div", "qws-set-end");
  exportRow.appendChild(exportButton);

  section.body.append(importDropZone(status.show), status.el, exportRow);
  return section.root;
}

export function renderDataTab(view: HTMLElement): void {
  ensureSettingsStyles();
  const layout = h("div", "qws-set-tab");
  layout.append(backupCard(), fileCard());
  view.replaceChildren(layout);
}
