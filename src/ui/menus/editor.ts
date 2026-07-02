// src/ui/menus/editor.ts
import { toastSimple } from "../toast";
import { EditorService } from "../../services/editor";
import { downloadJSONFile } from "../../utils/download";

/* ─────────────────────────────────────────────────────────────────────────────
 * Constants & style injection
 * ───────────────────────────────────────────────────────────────────────────*/

const STYLE_ID = "qws-editor-menu-css";
const TEAL        = "#5eead4";
const TEAL_DIM    = "rgba(94,234,212,0.12)";
const TEAL_MID    = "rgba(94,234,212,0.22)";
const TEAL_BORDER = "rgba(94,234,212,0.3)";
const TEAL_BRD_HI = "rgba(94,234,212,0.55)";
const BORDER      = "rgba(255,255,255,0.08)";
const BORDER_HI   = "rgba(255,255,255,0.16)";
const CARD_BG     = "rgba(255,255,255,0.03)";
const CARD_BG_HI  = "rgba(255,255,255,0.06)";
const TEXT        = "#e7eef7";
const TEXT_DIM    = "rgba(226,232,240,0.45)";
const DANGER      = "#ef4444";
const DANGER_DIM  = "rgba(239,68,68,0.12)";
const DANGER_BRD  = "rgba(239,68,68,0.3)";
const DANGER_HI   = "rgba(239,68,68,0.2)";
const DANGER_BRD_HI = "rgba(239,68,68,0.55)";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const st = document.createElement("style");
  st.id = STYLE_ID;
  st.textContent = `
.qws-ed-scroll::-webkit-scrollbar { width: 6px; }
.qws-ed-scroll::-webkit-scrollbar-track { background: transparent; }
.qws-ed-scroll::-webkit-scrollbar-thumb { background: rgba(94,234,212,0.2); border-radius: 3px; }
.qws-ed-scroll::-webkit-scrollbar-thumb:hover { background: rgba(94,234,212,0.35); }
.qws-ed-scroll { scrollbar-width: thin; scrollbar-color: rgba(94,234,212,0.2) transparent; }

/* Toggle switch */
.qws-ed-toggle { position:relative; display:inline-block; width:36px; height:20px; cursor:pointer; flex-shrink:0; }
.qws-ed-toggle input { opacity:0; width:0; height:0; position:absolute; }
.qws-ed-track {
  position:absolute; inset:0; border-radius:10px;
  background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.12);
  transition:background 150ms ease, border-color 150ms ease;
}
.qws-ed-toggle input:checked ~ .qws-ed-track {
  background:rgba(94,234,212,0.25); border-color:rgba(94,234,212,0.5);
}
.qws-ed-thumb {
  position:absolute; top:3px; left:3px;
  width:12px; height:12px; border-radius:50%;
  background:rgba(226,232,240,0.5);
  transition:transform 150ms ease, background 150ms ease;
}
.qws-ed-toggle input:checked ~ .qws-ed-track .qws-ed-thumb {
  transform:translateX(16px); background:${TEAL};
}
`;
  document.head.appendChild(st);
}

const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);

/* ─────────────────────────────────────────────────────────────────────────────
 * UI atoms
 * ───────────────────────────────────────────────────────────────────────────*/

function sectionLabel(text: string): HTMLElement {
  const el = document.createElement("div");
  css(el, {
    fontSize: "10px",
    fontWeight: "700",
    letterSpacing: "0.08em",
    color: TEXT_DIM,
    textTransform: "uppercase",
    paddingBottom: "7px",
  });
  el.textContent = text;
  return el;
}

function card(children: HTMLElement[]): HTMLElement {
  const el = document.createElement("div");
  css(el, {
    padding: "14px",
    background: CARD_BG,
    borderRadius: "12px",
    border: `1px solid ${BORDER}`,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  });
  el.append(...children);
  return el;
}

function primaryBtn(label: string, onClick: () => void | Promise<void>): HTMLElement {
  const btn = document.createElement("button");
  css(btn, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "10px 14px",
    border: `1px solid ${TEAL_BORDER}`,
    borderRadius: "10px",
    background: TEAL_DIM,
    color: TEAL,
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
    flex: "1",
  });
  btn.textContent = label;
  btn.onmouseenter = () => css(btn, { background: TEAL_MID, borderColor: TEAL_BRD_HI });
  btn.onmouseleave = () => css(btn, { background: TEAL_DIM, borderColor: TEAL_BORDER });
  btn.onclick = async () => {
    css(btn, { opacity: "0.6", pointerEvents: "none" });
    try { await onClick(); } finally { css(btn, { opacity: "1", pointerEvents: "auto" }); }
  };
  return btn;
}

function secondaryBtn(label: string, onClick: () => void | Promise<void>): HTMLElement {
  const btn = document.createElement("button");
  css(btn, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "10px 14px",
    border: `1px solid ${BORDER}`,
    borderRadius: "10px",
    background: CARD_BG,
    color: TEXT,
    fontSize: "12px",
    fontWeight: "500",
    cursor: "pointer",
    transition: "all 120ms ease",
    flex: "1",
  });
  btn.textContent = label;
  btn.onmouseenter = () => css(btn, { background: CARD_BG_HI, borderColor: BORDER_HI });
  btn.onmouseleave = () => css(btn, { background: CARD_BG, borderColor: BORDER });
  btn.onclick = async () => {
    css(btn, { opacity: "0.6", pointerEvents: "none" });
    try { await onClick(); } finally { css(btn, { opacity: "1", pointerEvents: "auto" }); }
  };
  return btn;
}

function dangerBtn(label: string, onClick: () => void | Promise<void>): HTMLElement {
  const btn = document.createElement("button");
  css(btn, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 11px",
    border: `1px solid ${DANGER_BRD}`,
    borderRadius: "8px",
    background: DANGER_DIM,
    color: DANGER,
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
    flexShrink: "0",
  });
  btn.textContent = label;
  btn.onmouseenter = () => css(btn, { background: DANGER_HI, borderColor: DANGER_BRD_HI });
  btn.onmouseleave = () => css(btn, { background: DANGER_DIM, borderColor: DANGER_BRD });
  btn.onclick = async () => {
    css(btn, { opacity: "0.6", pointerEvents: "none" });
    try { await onClick(); } finally { css(btn, { opacity: "1", pointerEvents: "auto" }); }
  };
  return btn;
}

function smallBtn(label: string, teal: boolean, onClick: () => void | Promise<void>): HTMLButtonElement {
  const btn = document.createElement("button");
  css(btn, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "7px 11px",
    border: `1px solid ${teal ? TEAL_BORDER : BORDER}`,
    borderRadius: "8px",
    background: teal ? TEAL_DIM : CARD_BG,
    color: teal ? TEAL : TEXT,
    fontSize: "11px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
    flexShrink: "0",
  });
  btn.textContent = label;
  btn.onmouseenter = () => css(btn, { background: teal ? TEAL_MID : CARD_BG_HI, borderColor: teal ? TEAL_BRD_HI : BORDER_HI });
  btn.onmouseleave = () => css(btn, { background: teal ? TEAL_DIM : CARD_BG, borderColor: teal ? TEAL_BORDER : BORDER });
  btn.onclick = async () => {
    css(btn, { opacity: "0.6", pointerEvents: "none" });
    try { await onClick(); } finally { css(btn, { opacity: "1", pointerEvents: "auto" }); }
  };
  return btn;
}

function styledInput(placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  css(input, {
    width: "100%",
    padding: "9px 12px",
    border: `1px solid ${BORDER}`,
    borderRadius: "10px",
    background: "rgba(255,255,255,0.06)",
    color: TEXT,
    fontSize: "12px",
    outline: "none",
    transition: "border-color 150ms ease",
    boxSizing: "border-box",
  });
  input.addEventListener("focus", () => css(input, { borderColor: TEAL_BORDER }));
  input.addEventListener("blur",  () => css(input, { borderColor: BORDER }));
  return input;
}

function createToggle(checked: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "qws-ed-toggle";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));

  const track = document.createElement("div");
  track.className = "qws-ed-track";
  const thumb = document.createElement("div");
  thumb.className = "qws-ed-thumb";
  track.appendChild(thumb);

  label.append(input, track);
  return label;
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Main render
 * ───────────────────────────────────────────────────────────────────────────*/

export function renderEditorMenu(container: HTMLElement) {
  ensureStyles();

  css(container, { padding: "0", overflow: "hidden" });

  // Outer scrollable wrapper
  const wrap = document.createElement("div");
  wrap.className = "qws-ed-scroll";
  css(wrap, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    padding: "14px",
    overflowY: "auto",
    height: "100%",
    boxSizing: "border-box",
    background: "linear-gradient(160deg, rgba(15,20,30,0.95) 0%, rgba(10,14,20,0.95) 60%, rgba(8,12,18,0.96) 100%)",
  });
  container.appendChild(wrap);

  /* ── Status bar (shared across sections) ─────────────────────────────────*/
  const statusEl = document.createElement("div");
  css(statusEl, {
    fontSize: "11px",
    color: TEXT_DIM,
    minHeight: "16px",
    paddingLeft: "2px",
    transition: "opacity 200ms ease",
  });

  function setStatus(msg: string, tone: "ok" | "warn" | "err" = "ok") {
    statusEl.textContent = msg;
    statusEl.style.color = tone === "err" ? DANGER : tone === "warn" ? "#fbbf24" : TEAL;
    clearTimeout((statusEl as any).__t);
    (statusEl as any).__t = setTimeout(() => {
      statusEl.textContent = "";
      statusEl.style.color = TEXT_DIM;
    }, 4000);
  }

  /* ── Editor mode toggle ───────────────────────────────────────────────────*/
  const toggleRow = document.createElement("div");
  css(toggleRow, { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" });

  const toggleLabel = document.createElement("div");
  css(toggleLabel, { fontSize: "13px", fontWeight: "600", color: TEXT });
  toggleLabel.textContent = "Editor mode";

  const toggle = createToggle(EditorService.isEnabled(), (on) => {
    EditorService.setEnabled(on);
  });

  toggleRow.append(toggleLabel, toggle);

  const desc = document.createElement("div");
  css(desc, { fontSize: "11px", color: TEXT_DIM, lineHeight: "1.5" });
  desc.textContent = "Sandbox garden editor with every plant and decor unlocked. Place/Remove uses your action key · Toggle overlays with U · Edit keybinds in Keybinds › Editor.";

  wrap.appendChild(card([toggleRow, desc]));

  /* ── Current garden ───────────────────────────────────────────────────────*/
  const nameInput = styledInput("Garden name…");

  const actRow = document.createElement("div");
  css(actRow, { display: "flex", gap: "8px" });

  actRow.append(
    primaryBtn("Save current garden", async () => {
      const fn = (window as any).qwsEditorSaveGarden;
      if (typeof fn !== "function") return;
      const saved = await fn(nameInput.value);
      if (!saved) { setStatus("Save failed (no garden state found).", "err"); return; }
      setStatus(`Saved "${saved.name}".`);
    }),
    secondaryBtn("Clear garden", async () => {
      const fn = (window as any).qwsEditorClearGarden;
      if (typeof fn !== "function") return;
      const ok = await fn();
      setStatus(ok ? "Garden cleared." : "Clear failed.", ok ? "ok" : "err");
    }),
  );

  wrap.appendChild(
    card([sectionLabel("Current garden"), nameInput, actRow])
  );

  /* ── Import (drag & drop) ─────────────────────────────────────────────────*/
  const dropZone = document.createElement("div");
  css(dropZone, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    padding: "22px 12px",
    border: `2px dashed ${BORDER_HI}`,
    borderRadius: "10px",
    background: "rgba(255,255,255,0.03)",
    color: TEXT_DIM,
    fontSize: "11px",
    textAlign: "center",
    cursor: "pointer",
    transition: "border-color 150ms ease, background 150ms ease",
  });

  const dropTitle = document.createElement("div");
  css(dropTitle, { fontWeight: "600", fontSize: "12px", color: TEXT });
  dropTitle.textContent = "Drop a garden JSON file here";

  const dropHint = document.createElement("div");
  dropHint.textContent = "…or click to browse";

  dropZone.append(dropTitle, dropHint);

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json,text/plain";
  fileInput.multiple = true;
  css(fileInput, { display: "none" });

  const setDropActive = (active: boolean) => {
    css(dropZone, {
      borderColor: active ? TEAL_BRD_HI : BORDER_HI,
      background: active ? TEAL_DIM : "rgba(255,255,255,0.03)",
    });
  };

  const importFiles = async (files: FileList | null | undefined) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const fn = (window as any).qwsEditorImportGarden;
    if (typeof fn !== "function") { setStatus("Import unavailable.", "err"); return; }
    let importedCount = 0;
    let lastName = "";
    for (const file of list) {
      try {
        const text = await file.text();
        const fallbackName = file.name.replace(/\.[^.]+$/, "").trim() || "Imported garden";
        const saved = await fn(nameInput.value.trim() || fallbackName, text);
        if (saved) { importedCount++; lastName = saved.name; }
      } catch {
        /* unreadable file: counts as failure */
      }
    }
    if (!importedCount) { setStatus("Import failed (invalid JSON).", "err"); return; }
    setStatus(importedCount === 1 ? `Imported "${lastName}".` : `Imported ${importedCount} gardens.`);
  };

  dropZone.onclick = () => fileInput.click();
  fileInput.onchange = () => {
    void importFiles(fileInput.files);
    fileInput.value = "";
  };
  dropZone.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setDropActive(true);
  });
  dropZone.addEventListener("dragleave", () => setDropActive(false));
  dropZone.addEventListener("drop", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setDropActive(false);
    void importFiles(ev.dataTransfer?.files);
  });

  wrap.appendChild(
    card([sectionLabel("Import"), dropZone, fileInput])
  );

  /* ── Saved gardens ────────────────────────────────────────────────────────*/
  const listWrap = document.createElement("div");
  css(listWrap, { display: "flex", flexDirection: "column", gap: "6px" });

  const renderSavedList = () => {
    const listFn = (window as any).qwsEditorListSavedGardens;
    const loadFn = (window as any).qwsEditorLoadGarden;
    const delFn  = (window as any).qwsEditorDeleteGarden;
    const expFn  = (window as any).qwsEditorExportGarden;

    listWrap.innerHTML = "";

    const items: any[] = typeof listFn === "function" ? listFn() : [];
    if (!items.length) {
      const empty = document.createElement("div");
      css(empty, { fontSize: "12px", color: TEXT_DIM, padding: "4px 0" });
      empty.textContent = "No saved gardens yet.";
      listWrap.appendChild(empty);
      return;
    }

    const editorOn = EditorService.isEnabled();

    for (const g of items) {
      const row = document.createElement("div");
      css(row, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "10px 12px",
        background: CARD_BG,
        borderRadius: "10px",
        border: `1px solid ${BORDER}`,
        transition: "border-color 120ms ease",
      });
      row.onmouseenter = () => css(row, { borderColor: BORDER_HI });
      row.onmouseleave = () => css(row, { borderColor: BORDER });

      const nameEl = document.createElement("div");
      css(nameEl, {
        flex: "1",
        fontSize: "12px",
        fontWeight: "600",
        color: TEXT,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        minWidth: "0",
      });
      nameEl.textContent = g.name || "Untitled";
      nameEl.title = g.name || "Untitled";

      const loadBtn = smallBtn("Load", true, async () => {
        if (!EditorService.isEnabled()) {
          setStatus("Enable editor mode first.", "warn");
          return;
        }
        if (typeof loadFn !== "function") return;
        const ok = await loadFn(g.id);
        setStatus(ok ? `Loaded "${g.name}".` : "Load failed.", ok ? "ok" : "err");
      });
      loadBtn.disabled = !editorOn;
      if (!editorOn) {
        css(loadBtn, { opacity: "0.4", cursor: "not-allowed" });
        loadBtn.title = "Enable editor mode to load";
      }

      const expBtn = smallBtn("Export", false, async () => {
        if (typeof expFn !== "function") return;
        const json = expFn(g.id);
        if (!json) { setStatus("Export failed.", "err"); return; }
        const safeName =
          String(g.name || "garden").replace(/[\\/:*?"<>|]+/g, "").trim() || "garden";
        downloadJSONFile(`${safeName}.json`, json);
        setStatus(`Exported "${g.name}" as file.`);
        await toastSimple("Editor", `Exported "${g.name}" as file`, "success");
      });

      const delBtn = dangerBtn("Delete", () => {
        if (typeof delFn !== "function") return;
        const ok = delFn(g.id);
        if (ok) { setStatus(`Deleted "${g.name}".`); renderSavedList(); }
      });

      row.append(nameEl, loadBtn, expBtn, delBtn);
      listWrap.appendChild(row);
    }
  };

  renderSavedList();

  wrap.appendChild(
    card([sectionLabel("Saved gardens"), statusEl, listWrap])
  );

  /* ── Subscriptions & cleanup ──────────────────────────────────────────────*/
  const unsubChange = EditorService.onChange((enabled) => {
    toggle.querySelector("input")!.checked = enabled;
    renderSavedList();
  });
  const unsubSaved = EditorService.onSavedGardensChange(renderSavedList);

  (container as any).__cleanup__ = () => {
    try { unsubChange(); } catch {}
    try { unsubSaved(); } catch {}
  };
}
