// The garden seen from above: one cell per tile, the sprite of what grows on
// it.
//
// In game, a tall plant hides the ones behind it. Here every cell is the same
// size, so nothing hides. It is read only, with the same geometry as the
// auto-plant grid (two squares of ten columns) and nothing to paint.
//
// Cells are built once and updated in place, or every garden change would
// reload two hundred sprites.

import { addStyle } from "../../lib/dom";
import { cropName, decorLabel, eggName } from "../../data/names";
import { Atoms } from "../../game/store/atoms";
import { h } from "../../ui/kit/dom";
import { textInput } from "../../ui/kit/fields";
import { openModal } from "../../ui/kit/modal";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import { GARDEN_COLS, GARDEN_ROWS, GARDEN_TILE_COUNT } from "../companion/chat/plant";
import { readOwnedTiles } from "../companion/chat/plantRead";
import { speciesIcon } from "../companion/menu/harvestChips";
import { plantItemIcon } from "../companion/menu/plantChips";

const HALF_GAP_PX = 12;
const CELL_ICON_PX = 30;

const GARDEN_VIEW_CSS = `
.qws-gv-toolbar { display: flex; align-items: center; gap: 10px; }
.qws-gv-search { flex: 1; }
.qws-gv-summary { font-size: var(--qmm-fs-sm); color: var(--qmm-text-dim); white-space: nowrap; }
.qws-gv-hint { font-size: 10.5px; line-height: 1.45; color: var(--qmm-text-dim); }
.qws-gv-grid {
  display: grid; gap: 2px; width: 100%; padding: 6px; box-sizing: border-box;
  border-radius: var(--qmm-radius-lg); border: 1px solid var(--qmm-border); background: var(--qmm-field-bg);
}
.qws-gv-cell {
  display: flex; align-items: center; justify-content: center; min-width: 0; min-height: 0; overflow: hidden;
  border-radius: 4px; border: 1px solid transparent; transition: opacity 90ms ease, background 90ms ease;
}
.qws-gv-cell.is-free { background: var(--qmm-hover-bg); border-color: var(--qmm-border); }
.qws-gv-cell.is-used { background: var(--qmm-accent-soft); border-color: var(--qmm-accent-border); }
.qws-gv-cell.is-hit { border-color: var(--qmm-accent); }
.qws-gv-cell.is-dimmed { opacity: 0.25; }
.qws-gv-cell > * { pointer-events: none; max-width: 100%; max-height: 100%; }
.qws-gv-decor { display: flex; align-items: center; justify-content: center; }
`;

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  addStyle(GARDEN_VIEW_CSS);
}

type TileContent = { kind: "plant" | "egg" | "decor"; id: string; name: string };

/** What sits on a tile, read from `garden.tileObjects`. */
function readContent(raw: unknown): TileContent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const type = String(obj.objectType ?? "");
  if (type === "plant" && typeof obj.species === "string") {
    return { kind: "plant", id: obj.species, name: cropName(obj.species) };
  }
  if (type === "egg") {
    const id = String(obj.eggId ?? obj.id ?? "");
    if (!id) return null;
    return { kind: "egg", id, name: eggName(id) };
  }
  if (type === "decor" && typeof obj.decorId === "string") {
    return { kind: "decor", id: obj.decorId, name: decorLabel(obj.decorId) };
  }
  return null;
}

function contentIcon(content: TileContent, sizePx: number): HTMLElement {
  if (content.kind === "plant") return speciesIcon(content.id, sizePx);
  if (content.kind === "egg") return plantItemIcon({ kind: "egg", id: content.id, name: content.name }, sizePx);
  const box = h("div", "qws-gv-decor");
  box.style.width = `${sizePx}px`;
  box.style.height = `${sizePx}px`;
  attachSpriteIcon(box, ["decor"], [content.id, content.name.replace(/\s+/g, "")], sizePx, "garden-view");
  return box;
}

type Cell = { el: HTMLDivElement; shown: string | null; content: TileContent | null };

export function openGardenView(host: HTMLElement): void {
  ensureStyles();
  let unsubscribe: (() => void) | null = null;
  let disposed = false;

  const modal = openModal({
    host,
    title: "Garden view",
    widthPx: 960,
    maxHeightPx: 680,
    onClose: () => {
      disposed = true;
      try { unsubscribe?.(); } catch {}
    },
  });

  const search = textInput("Find a plant…", "", { small: true });
  search.classList.add("qws-gv-search");
  const summary = h("div", "qws-gv-summary");
  const toolbar = h("div", "qws-gv-toolbar");
  toolbar.append(search, summary);

  const grid = h("div", "qws-gv-grid");
  grid.style.gridTemplateColumns = `repeat(${GARDEN_COLS / 2}, 1fr) ${HALF_GAP_PX}px repeat(${GARDEN_COLS / 2}, 1fr)`;
  grid.style.gridTemplateRows = `repeat(${GARDEN_ROWS}, 1fr)`;
  grid.style.aspectRatio = `${GARDEN_COLS + 0.6} / ${GARDEN_ROWS}`;

  const hint = h(
    "div",
    "qws-gv-hint",
    "Every tile gets the same space here, so nothing hides behind a taller plant. Hover a tile for its name.",
  );

  modal.body.append(toolbar, grid, hint);

  const cells = new Map<number, Cell>();
  for (let row = 0; row < GARDEN_ROWS; row++) {
    for (let col = 0; col < GARDEN_COLS; col++) {
      // The walkway between the two squares.
      if (col === GARDEN_COLS / 2) grid.append(h("div"));
      const el = h("div", "qws-gv-cell");
      cells.set(row * GARDEN_COLS + col, { el, shown: null, content: null });
      grid.append(el);
    }
  }

  let owned = new Set<number>();
  let tileObjects: Record<string, unknown> = {};

  function matches(content: TileContent | null, query: string): boolean {
    if (!query) return true;
    if (!content) return false;
    return content.name.toLowerCase().includes(query) || content.id.toLowerCase().includes(query);
  }

  function applyFilter(): void {
    const query = search.value.trim().toLowerCase();
    let hits = 0;
    let filled = 0;
    for (const [tileIndex, cell] of cells) {
      if (!owned.has(tileIndex)) continue;
      if (cell.content) filled++;
      const hit = !!query && matches(cell.content, query);
      if (hit) hits++;
      cell.el.classList.toggle("is-hit", hit);
      cell.el.classList.toggle("is-dimmed", !!query && !hit);
    }
    summary.textContent = query
      ? `${hits} match${hits === 1 ? "" : "es"}`
      : `${filled} / ${owned.size} tiles used`;
  }

  function render(): void {
    for (let tileIndex = 0; tileIndex < GARDEN_TILE_COUNT; tileIndex++) {
      const cell = cells.get(tileIndex);
      if (!cell) continue;
      const isOwned = owned.has(tileIndex);
      const content = isOwned ? readContent(tileObjects[String(tileIndex)]) : null;
      const key = !isOwned ? "absent" : content ? `${content.kind}:${content.id}` : "free";
      cell.content = content;
      if (key === cell.shown) continue;
      cell.shown = key;
      cell.el.replaceChildren();
      cell.el.classList.toggle("is-free", key === "free");
      cell.el.classList.toggle("is-used", !!content);

      if (!content) {
        cell.el.title = key === "free" ? "Empty" : "";
        continue;
      }
      cell.el.title = content.kind === "plant" ? content.name : `${content.name} (${content.kind})`;
      cell.el.append(contentIcon(content, CELL_ICON_PX));
    }
    applyFilter();
  }

  search.addEventListener("input", applyFilter);

  void (async () => {
    try {
      owned = new Set(await readOwnedTiles());
    } catch {
      owned = new Set(Array.from({ length: GARDEN_TILE_COUNT }, (_, index) => index));
    }
    if (disposed) return;
    try {
      const unsub = await Atoms.data.gardenTileObjects.onChangeNow((next) => {
        tileObjects = next && typeof next === "object" ? (next as Record<string, unknown>) : {};
        render();
      });
      if (disposed) unsub?.();
      else unsubscribe = unsub;
    } catch {
      render();
    }
  })();

  search.focus();
}
