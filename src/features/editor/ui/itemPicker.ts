// The left panel: plants or decor, a search box, the grid of entries, and the
// selected entry's brush settings underneath.

import { textInput } from "../../../ui/kit/fields";
import { segmented } from "../../../ui/kit/segmented";
import { color } from "../../../ui/kit/theme";
import { getSelectedId, picker, pickerEntries, setSelectedId, type PickerMode } from "../brush";
import { renderBrushDetails } from "./brushDetails";
import { entryIcon } from "./entryIcon";
import { floatingPanel, hint, panelSection } from "./panelChrome";

let root: HTMLDivElement | null = null;
let listWrap: HTMLDivElement | null = null;
let detailsWrap: HTMLDivElement | null = null;

export function showItemPicker(): void {
  if (root && document.contains(root)) return;

  const panel = floatingPanel({
    id: "qws-editor-side",
    side: "left",
    title: "🌿 Item picker",
    style: { minHeight: "420px", height: "min(720px, 86vh)" },
  });
  panel.header.style.opacity = "0.85";

  // Stacked: mode, search, the grid to pick from, then the settings to edit.
  const content = document.createElement("div");
  Object.assign(content.style, {
    display: "grid",
    gridTemplateRows: "auto auto minmax(120px, 0.7fr) minmax(0, 1fr)",
    gap: "8px",
    minHeight: "0",
  });

  const search = textInput("Search…", picker.query, { small: true });
  Object.assign(search.style, { width: "100%", boxSizing: "border-box" });
  search.oninput = () => {
    picker.query = search.value;
    renderEntryGrid();
  };

  const mode = segmented<PickerMode>(
    [
      { value: "plants", label: "🌱 Plants" },
      { value: "decor", label: "🎨 Decor" },
    ],
    picker.mode,
    (next) => {
      if (picker.mode === next) return;
      picker.mode = next;
      picker.query = "";
      search.value = "";
      renderEntryGrid();
      renderDetails();
    },
    { fullWidth: true, ariaLabel: "Picker mode" },
  );

  listWrap = panelSection();
  listWrap.id = "qws-editor-side-list";
  Object.assign(listWrap.style, { overflow: "auto", padding: "6px" });

  detailsWrap = panelSection();
  detailsWrap.id = "qws-editor-side-details";
  Object.assign(detailsWrap.style, { display: "grid", gridTemplateRows: "minmax(0, 1fr)", padding: "10px", overflow: "hidden" });

  content.append(mode, search, listWrap, detailsWrap);
  panel.root.appendChild(content);
  root = panel.root;

  renderEntryGrid();
  renderDetails();
}

export function hideItemPicker(): void {
  root?.remove();
  root = listWrap = detailsWrap = null;
}

function renderDetails(): void {
  if (detailsWrap) renderBrushDetails(detailsWrap);
}

function styleEntry(btn: HTMLButtonElement, selected: boolean): void {
  Object.assign(btn.style, {
    border: `1px solid ${selected ? color.accent : color.borderStrong}`,
    background: selected ? color.accentSoft : color.cardBg,
    boxShadow: selected ? `0 0 0 1px ${color.accentBorder}` : "none",
    transform: selected ? "scale(1.06)" : "scale(1)",
  });
}

function entryButton(id: string, label: string, selected: boolean): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.id = id;
  btn.title = label;
  Object.assign(btn.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px",
    borderRadius: "8px",
    color: color.text,
    cursor: "pointer",
    transition: "background 120ms ease, border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease",
  });
  styleEntry(btn, selected);
  btn.onmouseenter = () => {
    if (id === getSelectedId()) return;
    btn.style.background = color.accentSoft;
    btn.style.borderColor = color.accentBorder;
  };
  btn.onmouseleave = () => styleEntry(btn, id === getSelectedId());
  btn.onclick = () => {
    setSelectedId(id);
    renderEntryGrid();
    renderDetails();
  };
  btn.appendChild(entryIcon(picker.mode === "decor" ? "decor" : "plant", id, label, 26));
  return btn;
}

function renderEntryGrid(): void {
  if (!listWrap) return;
  const selectedId = getSelectedId();
  const entries = pickerEntries();
  const signature = `${picker.mode}:${JSON.stringify(entries)}`;

  // Same entries as on screen: only restyle the selection, so the icons do not flicker.
  const existing = listWrap.querySelector<HTMLDivElement>('[data-editor-side-list="list"]');
  if (existing && existing.dataset.sig === signature) {
    existing.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((btn) => {
      styleEntry(btn, btn.dataset.id === selectedId);
    });
    return;
  }

  if (!entries.length) {
    listWrap.replaceChildren(hint("No entries."));
    return;
  }

  const grid = document.createElement("div");
  grid.dataset.editorSideList = "list";
  grid.dataset.sig = signature;
  Object.assign(grid.style, { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))", gap: "4px" });
  for (const entry of entries) grid.appendChild(entryButton(entry.id, entry.label, entry.id === selectedId));
  listWrap.replaceChildren(grid);
}
