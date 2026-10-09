// The left panel: plants or decor, a search box, the grid of entries, and the
// selected entry's brush settings underneath.

import { h } from "../../../ui/kit/dom";
import { textInput } from "../../../ui/kit/fields";
import { segmented } from "../../../ui/kit/segmented";
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
    title: "Items",
    style: { height: "min(720px, calc(86vh / var(--qmm-scale, 1)))" },
  });

  // Stacked: mode, search, the grid to pick from, then the settings to edit.
  panel.body.style.gridTemplateRows = "auto auto minmax(120px, 0.7fr) minmax(0, 1fr)";

  const search = textInput("Search", picker.query, { small: true });
  search.style.width = "100%";
  search.style.boxSizing = "border-box";
  search.oninput = () => {
    picker.query = search.value;
    renderEntryGrid();
  };

  const mode = segmented<PickerMode>(
    [
      { value: "plants", label: "Plants" },
      { value: "decor", label: "Decor" },
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
  listWrap.classList.add("qws-ed-scroll", "qmm-scroll");

  detailsWrap = panelSection();
  detailsWrap.id = "qws-editor-side-details";
  detailsWrap.classList.add("qws-ed-scroll", "qmm-scroll");

  panel.body.append(mode, search, listWrap, detailsWrap);
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

function markSelected(btn: HTMLButtonElement, selected: boolean): void {
  btn.classList.toggle("is-selected", selected);
  btn.setAttribute("aria-pressed", selected ? "true" : "false");
}

function entryButton(id: string, label: string, selected: boolean): HTMLButtonElement {
  const btn = h("button", "qws-ed-entry");
  btn.type = "button";
  btn.dataset.id = id;
  btn.title = label;
  btn.setAttribute("aria-label", label);
  markSelected(btn, selected);
  btn.onclick = () => {
    setSelectedId(id);
    renderEntryGrid();
    renderDetails();
  };
  btn.appendChild(entryIcon(picker.mode === "decor" ? "decor" : "plant", id, label, 28));
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
      markSelected(btn, btn.dataset.id === selectedId);
    });
    return;
  }

  if (!entries.length) {
    const empty = hint(picker.query ? "Nothing matches this search." : "Nothing to place here yet.");
    empty.style.padding = "var(--qmm-space-xl) var(--qmm-space-lg)";
    listWrap.replaceChildren(empty);
    return;
  }

  const grid = h("div", "qws-ed-grid");
  grid.dataset.editorSideList = "list";
  grid.dataset.sig = signature;
  for (const entry of entries) grid.appendChild(entryButton(entry.id, entry.label, entry.id === selectedId));
  listWrap.replaceChildren(grid);
}
