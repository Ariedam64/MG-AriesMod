// The Editor window: the editor mode switch, saving and clearing the current
// garden, importing garden files, and the saved garden list.

import { downloadJSONFile } from "../../lib/download";
import { Subscriptions } from "../../lib/emitter";
import { button } from "../../ui/kit/button";
import { plainCard, sectionLabel } from "../../ui/kit/card";
import { textInput } from "../../ui/kit/fields";
import { color } from "../../ui/kit/theme";
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

const STATUS_CLEAR_MS = 4000;

type StatusTone = "ok" | "warn" | "err";
const TONE_COLOR: Record<StatusTone, string> = { ok: color.accent, warn: color.warn, err: color.danger };

function card(...children: HTMLElement[]): HTMLDivElement {
  const el = plainCard();
  el.style.padding = "14px";
  el.append(...children);
  return el;
}

const row = (gap = "8px"): HTMLDivElement => {
  const el = document.createElement("div");
  Object.assign(el.style, { display: "flex", alignItems: "center", gap });
  return el;
};

/** A one-line status message that fades back to empty. */
function statusLine(): { el: HTMLDivElement; set(msg: string, tone?: StatusTone): void } {
  const el = document.createElement("div");
  Object.assign(el.style, { fontSize: "11px", color: color.textDim, minHeight: "16px", paddingLeft: "2px" });
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    el,
    set(msg, tone = "ok") {
      el.textContent = msg;
      el.style.color = TONE_COLOR[tone];
      clearTimeout(timer);
      timer = setTimeout(() => {
        el.textContent = "";
        el.style.color = color.textDim;
      }, STATUS_CLEAR_MS);
    },
  };
}

function modeCard(): { root: HTMLElement; modeSwitch: ReturnType<typeof switchInput> } {
  const head = row("12px");
  head.style.justifyContent = "space-between";
  const title = document.createElement("div");
  Object.assign(title.style, { fontSize: "13px", fontWeight: "600", color: color.text });
  title.textContent = "Editor mode";
  const modeSwitch = switchInput(EditorService.isEnabled(), (on) => EditorService.setEnabled(on));
  head.append(title, modeSwitch);

  const desc = document.createElement("div");
  Object.assign(desc.style, { fontSize: "11px", color: color.textDim, lineHeight: "1.5" });
  desc.textContent =
    "Sandbox garden with every plant and decor unlocked. Left click to place, right click to remove, drag to paint.";

  return { root: card(head, desc), modeSwitch };
}

function dropZone(onFiles: (files: FileList | null | undefined) => void): HTMLElement[] {
  const zone = document.createElement("div");
  const idle = { borderColor: color.borderHover, background: color.cardBg };
  Object.assign(zone.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    padding: "22px 12px",
    border: `2px dashed ${color.borderHover}`,
    borderRadius: "10px",
    background: color.cardBg,
    color: color.textDim,
    fontSize: "11px",
    textAlign: "center",
    cursor: "pointer",
    transition: "border-color 150ms ease, background 150ms ease",
  });
  const setActive = (active: boolean) =>
    Object.assign(zone.style, active ? { borderColor: color.accentBorderHover, background: color.accentSoft } : idle);

  const title = document.createElement("div");
  Object.assign(title.style, { fontWeight: "600", fontSize: "12px", color: color.text });
  title.textContent = "Drop a garden JSON file here";
  const sub = document.createElement("div");
  sub.textContent = "…or click to browse";
  zone.append(title, sub);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json,text/plain";
  fileInput.multiple = true;
  fileInput.style.display = "none";

  zone.onclick = () => fileInput.click();
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
  return [zone, fileInput];
}

const fileSafeName = (name: string): string => String(name || "garden").replace(/[\\/:*?"<>|]+/g, "").trim() || "garden";

export function renderEditorMenu(container: HTMLElement) {
  Object.assign(container.style, { padding: "0", overflow: "hidden" });

  const wrap = document.createElement("div");
  wrap.className = "qmm-scroll";
  Object.assign(wrap.style, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "14px",
    overflowY: "auto",
    height: "100%",
    width: "380px",
    boxSizing: "border-box",
    background: "var(--qmm-gradient-panel)",
  });
  container.appendChild(wrap);

  const status = statusLine();
  const mode = modeCard();
  wrap.appendChild(mode.root);

  /* Current garden */
  const nameInput = textInput("Garden name…");
  Object.assign(nameInput.style, { width: "100%", boxSizing: "border-box" });

  const actions = row();
  const grow = { flex: "1" };
  const save = button("Save current garden", {
    variant: "primary",
    lockWhilePending: true,
    onClick: async () => {
      const saved = await saveCurrentGarden(nameInput.value || "Untitled");
      if (!saved) return status.set("Save failed (no garden state found).", "err");
      status.set(`Saved "${saved.name}".`);
    },
  });
  const clear = button("Clear garden", {
    lockWhilePending: true,
    onClick: async () => {
      const ok = await setCurrentGarden(makeEmptyGarden());
      status.set(ok ? "Garden cleared." : "Clear failed.", ok ? "ok" : "err");
    },
  });
  Object.assign(save.style, grow);
  Object.assign(clear.style, grow);
  actions.append(save, clear);
  wrap.appendChild(card(sectionLabel("Current garden"), nameInput, actions));

  /* Import */
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
  wrap.appendChild(card(sectionLabel("Import"), ...dropZone((files) => void importFiles(files))));

  /* Saved gardens */
  const listWrap = document.createElement("div");
  Object.assign(listWrap.style, { display: "flex", flexDirection: "column", gap: "6px" });

  const savedRow = (g: SavedGarden, editorOn: boolean): HTMLElement => {
    const el = row();
    Object.assign(el.style, {
      padding: "10px 12px",
      background: color.cardBg,
      borderRadius: "10px",
      border: `1px solid ${color.border}`,
      transition: "border-color 120ms ease",
    });
    el.onmouseenter = () => (el.style.borderColor = color.borderHover);
    el.onmouseleave = () => (el.style.borderColor = color.border);

    const name = document.createElement("div");
    Object.assign(name.style, {
      flex: "1",
      fontSize: "12px",
      fontWeight: "600",
      color: color.text,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: "0",
    });
    name.textContent = name.title = g.name || "Untitled";

    const load = button("Load", {
      variant: "primary",
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
      variant: "danger",
      size: "sm",
      onClick: () => {
        if (!deleteSavedGarden(g.id)) return;
        status.set(`Deleted "${g.name}".`);
        renderSavedList();
      },
    });

    el.append(name, load, exportBtn, remove);
    return el;
  };

  const renderSavedList = () => {
    const items = listSavedGardens();
    if (!items.length) {
      const empty = document.createElement("div");
      Object.assign(empty.style, { fontSize: "12px", color: color.textDim, padding: "4px 0" });
      empty.textContent = "No saved gardens yet.";
      listWrap.replaceChildren(empty);
      return;
    }
    const editorOn = EditorService.isEnabled();
    listWrap.replaceChildren(...items.map((g) => savedRow(g, editorOn)));
  };

  renderSavedList();
  wrap.appendChild(card(sectionLabel("Saved gardens"), status.el, listWrap));

  const subs = new Subscriptions();
  subs.add(
    EditorService.onChange((enabled) => {
      mode.modeSwitch.checked = enabled;
      renderSavedList();
    }),
  );
  subs.add(EditorService.onSavedGardensChange(renderSavedList));
  (container as HTMLElement & { __cleanup__?: () => void }).__cleanup__ = () => subs.dispose();
}
