// src/ui/menus/misc/garden-view.ts
// Le jardin vu de haut : une case par tuile, le sprite de ce qui y pousse.
//
// En jeu, une grande plante masque celles qui sont derrière elle. Ici chaque
// case a la même taille, donc rien ne se cache. C'est une vue en lecture seule :
// la même géométrie que la grille d'auto-plant (deux carrés de dix colonnes),
// sans rien à peindre.
//
// Les cases sont construites une fois et mises à jour en place, sinon chaque
// changement du jardin rechargerait deux cents sprites.

import { Atoms } from "../../../store/atoms";
import { decorCatalog, eggCatalog, plantCatalog } from "../../../data";
import { readOwnedTiles } from "../../../services/companion/chat/plantRead";
import {
  GARDEN_COLS,
  GARDEN_ROWS,
  GARDEN_TILE_COUNT,
} from "../../../services/companion/chat/plant";
import { attachSpriteIcon } from "../../spriteIconCache";
import { openModal } from "../companion/modal";
import { speciesIcon } from "../companion/harvest-chips";
import { plantItemIcon } from "../companion/plant-chips";
import { BORDER, TEAL, TEAL_BORDER, TEAL_DIM, TEXT_DIM, css, textField } from "../panel-ui";

const HALF_GAP_PX = 12;
const CELL_ICON_PX = 30;

type TileContent = { kind: "plant" | "egg" | "decor"; id: string; name: string };

function nameOf(record: unknown, id: string, ...paths: string[][]): string {
  const entry = (record as Record<string, any> | undefined)?.[id];
  for (const path of paths) {
    let value: any = entry;
    for (const key of path) value = value?.[key];
    if (typeof value === "string" && value) return value;
  }
  return id;
}

/** Ce qu'il y a sur une tuile, lu dans `garden.tileObjects`. */
function readContent(raw: unknown): TileContent | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const type = String(obj.objectType ?? "");
  if (type === "plant" && typeof obj.species === "string") {
    const id = obj.species;
    return { kind: "plant", id, name: nameOf(plantCatalog, id, ["crop", "name"], ["plant", "name"], ["seed", "name"]) };
  }
  if (type === "egg") {
    const id = String(obj.eggId ?? obj.id ?? "");
    if (!id) return null;
    return { kind: "egg", id, name: nameOf(eggCatalog, id, ["name"]) };
  }
  if (type === "decor" && typeof obj.decorId === "string") {
    const id = obj.decorId;
    return { kind: "decor", id, name: nameOf(decorCatalog, id, ["name"]) };
  }
  return null;
}

function contentIcon(content: TileContent, sizePx: number): HTMLElement {
  if (content.kind === "plant") return speciesIcon(content.id, sizePx);
  if (content.kind === "egg") return plantItemIcon({ kind: "egg", id: content.id, name: content.name }, sizePx);
  const box = document.createElement("div");
  css(box, { width: `${sizePx}px`, height: `${sizePx}px`, display: "flex", alignItems: "center", justifyContent: "center" });
  attachSpriteIcon(box, ["decor"], [content.id, content.name.replace(/\s+/g, "")], sizePx, "garden-view");
  return box;
}

type Cell = { el: HTMLDivElement; shown: string | null; content: TileContent | null };

export function openGardenView(host: HTMLElement): void {
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

  const toolbar = document.createElement("div");
  css(toolbar, { display: "flex", alignItems: "center", gap: "10px" });
  const search = textField("Find a plant…");
  css(search, { flex: "1" });
  const summary = document.createElement("div");
  css(summary, { fontSize: "11px", color: TEXT_DIM, whiteSpace: "nowrap" });
  toolbar.append(search, summary);

  const grid = document.createElement("div");
  css(grid, {
    display: "grid",
    gridTemplateColumns: `repeat(${GARDEN_COLS / 2}, 1fr) ${HALF_GAP_PX}px repeat(${GARDEN_COLS / 2}, 1fr)`,
    gridTemplateRows: `repeat(${GARDEN_ROWS}, 1fr)`,
    gap: "2px",
    width: "100%",
    aspectRatio: `${GARDEN_COLS + 0.6} / ${GARDEN_ROWS}`,
    padding: "6px",
    borderRadius: "12px",
    border: `1px solid ${BORDER}`,
    background: "rgba(0,0,0,0.28)",
    boxSizing: "border-box",
  });

  const hint = document.createElement("div");
  css(hint, { fontSize: "10.5px", color: TEXT_DIM, lineHeight: "1.45" });
  hint.textContent = "Every tile gets the same space here, so nothing hides behind a taller plant. Hover a tile for its name.";

  modal.body.append(toolbar, grid, hint);

  const cells = new Map<number, Cell>();
  for (let row = 0; row < GARDEN_ROWS; row++) {
    for (let col = 0; col < GARDEN_COLS; col++) {
      if (col === GARDEN_COLS / 2) {
        const spacer = document.createElement("div");
        css(spacer, { pointerEvents: "none" });
        grid.append(spacer);
      }
      const el = document.createElement("div");
      css(el, {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        border: "1px solid transparent",
        minWidth: "0",
        minHeight: "0",
        overflow: "hidden",
        transition: "opacity 90ms ease, background 90ms ease",
      });
      const tileIndex = row * GARDEN_COLS + col;
      cells.set(tileIndex, { el, shown: null, content: null });
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
    for (const [tileIndex, cell] of cells) {
      if (!owned.has(tileIndex)) continue;
      const hit = !!query && matches(cell.content, query);
      if (hit) hits++;
      css(cell.el, {
        opacity: !query || hit ? "1" : "0.25",
        borderColor: hit ? TEAL : cell.content ? TEAL_BORDER : BORDER,
      });
    }
    const filled = [...cells.entries()].filter(([index, cell]) => owned.has(index) && cell.content).length;
    summary.textContent = query
      ? `${hits} match${hits === 1 ? "" : "es"}`
      : `${filled} / ${owned.size} tiles used`;
  }

  function render(): void {
    for (let tileIndex = 0; tileIndex < GARDEN_TILE_COUNT; tileIndex++) {
      const cell = cells.get(tileIndex);
      if (!cell) continue;
      const content = owned.has(tileIndex) ? readContent(tileObjects[String(tileIndex)]) : null;
      const key = !owned.has(tileIndex) ? "absent" : content ? `${content.kind}:${content.id}` : "free";
      cell.content = content;
      if (key === cell.shown) continue;
      cell.shown = key;
      cell.el.replaceChildren();

      if (key === "absent") {
        css(cell.el, { background: "transparent", borderColor: "transparent" });
        cell.el.title = "";
        continue;
      }
      if (!content) {
        css(cell.el, { background: "rgba(255,255,255,0.05)", borderColor: BORDER });
        cell.el.title = "Empty";
        continue;
      }
      css(cell.el, { background: TEAL_DIM, borderColor: TEAL_BORDER });
      cell.el.title = content.kind === "plant" ? content.name : `${content.name} (${content.kind})`;
      const icon = contentIcon(content, CELL_ICON_PX);
      css(icon, { pointerEvents: "none", maxWidth: "100%", maxHeight: "100%" });
      cell.el.append(icon);
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
