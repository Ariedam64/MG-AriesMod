// The Editor window: the editor mode switch, saving and clearing the current
// garden, and the saved garden list with its file import.

import { downloadJSONFile } from "../../lib/download";
import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { textInput } from "../../ui/kit/fields";
import { switchInput } from "../../ui/kit/toggles";
import { toastSimple } from "../../ui/toast";
import { EditorService } from "./editor";
import { makeEmptyGarden } from "./gardenModel";
import { setCurrentGarden } from "./plannedGarden";
import {
  deleteSavedGarden,
  exportSavedGarden,
  importGarden,
  listSavedGardens,
  loadSavedGarden,
  saveCurrentGarden,
  type SavedGarden,
} from "./savedGardens";
import { ensureEditorStyles } from "./ui/styles";

const STATUS_CLEAR_MS = 4000;

type StatusTone = "ok" | "warn" | "err";

/** A one-line status message that fades back to empty. The full text is its tooltip. */
function statusLine(): { el: HTMLDivElement; set(msg: string, tone?: StatusTone): void } {
  const el = h("div", "qws-ed-status");
  el.setAttribute("role", "status");
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    el,
    set(msg, tone = "ok") {
      el.textContent = el.title = msg;
      el.className = `qws-ed-status is-${tone}`;
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.textContent = el.title = "";
        el.className = "qws-ed-status";
      }, STATUS_CLEAR_MS);
    },
  };
}

function tip(key: string, action: string): HTMLElement {
  const el = h("span", "qws-ed-tip");
  el.append(h("b", undefined, key), action);
  return el;
}

function modeCard(): { root: HTMLElement; modeSwitch: ReturnType<typeof switchInput> } {
  const modeSwitch = switchInput(EditorService.isEnabled(), (on) => EditorService.setEnabled(on));
  modeSwitch.setAttribute("aria-label", "Editor mode");
  const section = card("Editor mode", {
    subtitle: "A sandbox garden with every plant and decor unlocked.",
    actions: [modeSwitch],
  });
  const tips = h("div", "qws-ed-tips");
  tips.append(tip("Left click", "place"), tip("Right click", "remove"), tip("Drag", "paint"));
  section.body.appendChild(tips);
  return { root: section.root, modeSwitch };
}

/** The dashed area that takes garden files, dropped or browsed. */
function dropZone(onFiles: (files: FileList | null | undefined) => void): HTMLElement {
  const fileInput = h("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json,text/plain";
  fileInput.multiple = true;
  fileInput.hidden = true;

  const zone = h("div", "qws-ed-drop");
  zone.tabIndex = 0;
  zone.setAttribute("role", "button");
  zone.setAttribute("aria-label", "Import garden files");
  zone.append(h("div", "qws-ed-drop__title", "Import a garden file"), h("div", "qws-ed-drop__hint", "Drop JSON files here, or click to browse."));

  const setActive = (active: boolean) => zone.classList.toggle("is-active", active);
  zone.onclick = () => fileInput.click();
  zone.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    fileInput.click();
  });
  fileInput.onchange = () => {
    onFiles(fileInput.files);
    fileInput.value = "";
  };
  zone.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setActive(true);
  });
  zone.addEventListener("dragleave", () => setActive(false));
  zone.addEventListener("drop", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setActive(false);
    onFiles(ev.dataTransfer?.files);
  });

  const wrap = h("div");
  wrap.append(fileInput, zone);
  return wrap;
}

const fileSafeName = (name: string): string => String(name || "garden").replace(/[\\/:*?"<>|]+/g, "").trim() || "garden";

const savedOn = (ms: number): string =>
  new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function renderEditorMenu(container: HTMLElement) {
  ensureEditorStyles();
  const wrap = h("div", "qws-ed-menu");
  container.appendChild(wrap);

  const status = statusLine();
  const mode = modeCard();
  wrap.appendChild(mode.root);

  /* Current garden */
  const nameInput = textInput("Garden name");
  nameInput.setAttribute("aria-label", "Garden name");

  const save = button("Save", {
    variant: "primary",
    lockWhilePending: true,
    onClick: async () => {
      const saved = await saveCurrentGarden(nameInput.value || "Untitled");
      if (!saved) return status.set("Save failed (no garden state found).", "err");
      status.set(`Saved "${saved.name}".`);
    },
  });
  const clear = button("Clear garden", {
    size: "sm",
    lockWhilePending: true,
    onClick: async () => {
      const ok = await setCurrentGarden(makeEmptyGarden());
      status.set(ok ? "Garden cleared." : "Clear failed.", ok ? "ok" : "err");
    },
  });
  const saveRow = h("div", "qws-ed-save");
  saveRow.append(nameInput, save);

  const current = card("Current garden", {
    subtitle: "Saves your plan while editing, your real garden otherwise.",
    actions: [clear],
  });
  current.body.appendChild(saveRow);
  wrap.appendChild(current.root);

  /* Saved gardens, and the import that adds to them */
  const importFiles = async (files: FileList | null | undefined) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    let imported = 0;
    let lastName = "";
    for (const file of list) {
      try {
        const fallbackName = file.name.replace(/\.[^.]+$/, "").trim() || "Imported garden";
        const saved = await importGarden(nameInput.value.trim() || fallbackName, await file.text());
        if (saved) {
          imported++;
          lastName = saved.name;
        }
      } catch {
        // An unreadable file counts as a failure.
      }
    }
    if (!imported) return status.set("Import failed (invalid JSON).", "err");
    status.set(imported === 1 ? `Imported "${lastName}".` : `Imported ${imported} gardens.`);
  };

  const editorNote = h("div", "qws-ed-note", "Turn on editor mode to load a garden.");
  const listWrap = h("div", "qws-ed-list");

  const savedRow = (g: SavedGarden, editorOn: boolean): HTMLElement => {
    const name = g.name || "Untitled";
    const text = h("div", "qws-ed-row__text");
    const nameEl = h("div", "qws-ed-row__name", name);
    nameEl.title = name;
    text.append(nameEl, h("div", "qws-ed-row__date", savedOn(g.createdAt)));

    const load = button("Load", {
      size: "sm",
      lockWhilePending: true,
      disabled: !editorOn,
      tooltip: editorOn ? undefined : "Enable editor mode to load",
      onClick: async () => {
        if (!EditorService.isEnabled()) return status.set("Enable editor mode first.", "warn");
        const ok = await loadSavedGarden(g.id);
        status.set(ok ? `Loaded "${g.name}".` : "Load failed.", ok ? "ok" : "err");
      },
    });
    const exportBtn = button("Export", {
      variant: "ghost",
      size: "sm",
      lockWhilePending: true,
      onClick: async () => {
        const json = exportSavedGarden(g.id);
        if (!json) return status.set("Export failed.", "err");
        downloadJSONFile(`${fileSafeName(g.name)}.json`, json);
        status.set(`Exported "${g.name}" as file.`);
        await toastSimple("Editor", `Exported "${g.name}" as file`, "success");
      },
    });
    const remove = button("Delete", {
      variant: "ghost",
      size: "sm",
      onClick: () => {
        if (!deleteSavedGarden(g.id)) return;
        status.set(`Deleted "${g.name}".`);
        renderSavedList();
      },
    });
    remove.classList.add("qws-ed-delete");

    const actions = h("div", "qws-ed-row__actions");
    actions.append(load, exportBtn, remove);
    const row = h("div", "qws-ed-row");
    row.append(text, actions);
    return row;
  };

  const renderSavedList = () => {
    const items = listSavedGardens();
    const editorOn = EditorService.isEnabled();
    editorNote.hidden = editorOn || !items.length;
    if (!items.length) {
      listWrap.replaceChildren(h("div", "qws-ed-empty", "No saved gardens yet. Save the current one above, or import a file."));
      return;
    }
    listWrap.replaceChildren(...items.map((g) => savedRow(g, editorOn)));
  };

  renderSavedList();
  const saved = card("Saved gardens", { actions: [status.el] });
  saved.body.append(editorNote, listWrap, dropZone((files) => void importFiles(files)));
  wrap.appendChild(saved.root);

  EditorService.onChange((enabled) => {
    mode.modeSwitch.checked = enabled;
    renderSavedList();
  });
  EditorService.onSavedGardensChange(renderSavedList);
}
