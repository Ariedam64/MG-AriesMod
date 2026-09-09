// src/ui/menus/companion/plant-grid.ts
// La parcelle, dessinée : deux carrés de dix cases, comme dans l'onglet Garden.
//
// C'est la même géométrie que la grille d'auto-plant, à dessein — c'est celle
// que le joueur a déjà en tête, et l'index d'une case y est déjà le `slot` que
// le protocole attend. On peint à la souris, bouton droit pour effacer.
//
// Les cases sont construites une fois et mises à jour en place. Les reconstruire
// à chaque rafraîchissement, c'est deux cents sprites rechargés toutes les
// quelques secondes, et le dessin qui clignote sous la main.

import {
  GARDEN_COLS,
  GARDEN_ROWS,
  GARDEN_TILE_COUNT,
  type PlantAssignment,
} from "../../../services/companion/chat/plant";
import { BORDER, DANGER, TEAL_BORDER, TEAL_DIM, css } from "../panel-ui";

/** Assez grand pour viser à la souris, assez petit pour que la parcelle tienne. */
const MAX_GRID_HEIGHT_PX = 300;
const CELL_ICON_PX = 20;
/** Sépare visuellement les deux moitiés de la parcelle, comme en jeu. */
const HALF_GAP_PX = 12;

export type PaintMode = "assign" | "erase";

export type PlantGridOptions = {
  /** Tuiles que le joueur possède. Les autres restent inertes. */
  owned(): Set<number>;
  /** Tuiles déjà prises : on ne peut rien y poser. */
  occupied(): Set<number>;
  assignmentAt(tileIndex: number): PlantAssignment | null;
  /**
   * Fabrique la vignette d'une case assignée, à la taille demandée.
   *
   * La grille impose la taille plutôt que de redimensionner après coup : le
   * chargeur de sprites choisit sa résolution à la construction, et le corriger
   * ensuite en CSS ne ferait qu'étirer une image déjà rendue.
   */
  iconFor(assignment: PlantAssignment, sizePx: number): HTMLElement;
  onPaint(tileIndex: number, mode: PaintMode): void;
};

export type PlantGrid = {
  root: HTMLElement;
  /** Redessine depuis l'état courant. Sans effet sur les cases inchangées. */
  update(): void;
  /** Coupe l'écoute globale de la souris. */
  destroy(): void;
};

type Cell = {
  el: HTMLDivElement;
  /** Ce que la case montre en ce moment, pour ne redessiner que si ça change. */
  shown: string | null;
};

export function plantGrid(options: PlantGridOptions): PlantGrid {
  const root = document.createElement("div");
  css(root, {
    display: "grid",
    gridTemplateColumns: `repeat(${GARDEN_COLS / 2}, 1fr) ${HALF_GAP_PX}px repeat(${GARDEN_COLS / 2}, 1fr)`,
    gridTemplateRows: `repeat(${GARDEN_ROWS}, 1fr)`,
    gap: "2px",
    height: `min(38vh, ${MAX_GRID_HEIGHT_PX}px)`,
    aspectRatio: `${GARDEN_COLS} / ${GARDEN_ROWS}`,
    width: "auto",
    margin: "0 auto",
    padding: "6px",
    borderRadius: "12px",
    border: `1px solid ${BORDER}`,
    background: "rgba(0,0,0,0.28)",
    boxSizing: "border-box",
    flex: "0 0 auto",
  });
  // Le bouton droit sert à effacer : son menu n'a rien à faire là.
  root.addEventListener("contextmenu", (event) => event.preventDefault());

  const cells = new Map<number, Cell>();

  let painting = false;
  let mode: PaintMode = "assign";

  const stopPainting = (): void => {
    painting = false;
  };
  window.addEventListener("mouseup", stopPainting);

  function buildCell(tileIndex: number): HTMLDivElement {
    const cell = document.createElement("div");
    cell.dataset.tile = String(tileIndex);
    css(cell, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "4px",
      userSelect: "none",
      border: "1px solid transparent",
      transition: "background 90ms ease",
    });

    cell.addEventListener("mousedown", (event) => {
      event.preventDefault();
      painting = true;
      mode = event.button === 2 ? "erase" : "assign";
      options.onPaint(tileIndex, mode);
    });
    // Entrer dans une case en gardant le bouton enfoncé la peint aussi : c'est
    // ce qui permet de tracer une rangée d'un seul geste.
    cell.addEventListener("mouseenter", () => {
      if (painting) options.onPaint(tileIndex, mode);
    });

    return cell;
  }

  // Deux moitiés de dix colonnes, séparées par une colonne inerte.
  for (let row = 0; row < GARDEN_ROWS; row++) {
    for (let col = 0; col < GARDEN_COLS; col++) {
      if (col === GARDEN_COLS / 2) {
        const spacer = document.createElement("div");
        css(spacer, { pointerEvents: "none" });
        root.append(spacer);
      }
      const tileIndex = row * GARDEN_COLS + col;
      const el = buildCell(tileIndex);
      cells.set(tileIndex, { el, shown: null });
      root.append(el);
    }
  }

  /** Ce que la case doit montrer, en une chaîne : si elle ne bouge pas, on ne touche à rien. */
  function stateKey(tileIndex: number, owned: Set<number>, occupied: Set<number>): string {
    if (!owned.has(tileIndex)) return "absent";
    if (occupied.has(tileIndex)) return "occupied";
    const assignment = options.assignmentAt(tileIndex);
    return assignment ? `set:${assignment.kind}:${assignment.id}` : "free";
  }

  function paintCell(cell: Cell, tileIndex: number, key: string): void {
    cell.shown = key;
    cell.el.replaceChildren();

    if (key === "absent") {
      css(cell.el, { background: "transparent", borderColor: "transparent", cursor: "default" });
      cell.el.title = "";
      return;
    }
    if (key === "occupied") {
      // Rouge, et rien d'autre : la case dit qu'elle est prise, pas par quoi.
      css(cell.el, {
        background: "rgba(239,68,68,0.22)",
        borderColor: DANGER,
        cursor: "not-allowed",
      });
      cell.el.title = "Something is already growing here";
      return;
    }
    if (key === "free") {
      css(cell.el, { background: "rgba(255,255,255,0.05)", borderColor: BORDER, cursor: "pointer" });
      cell.el.title = "";
      return;
    }

    const assignment = options.assignmentAt(tileIndex);
    css(cell.el, { background: TEAL_DIM, borderColor: TEAL_BORDER, cursor: "pointer" });
    cell.el.title = assignment?.name ?? "";
    if (assignment) {
      const icon = options.iconFor(assignment, CELL_ICON_PX);
      css(icon, { pointerEvents: "none" });
      cell.el.append(icon);
    }
  }

  return {
    root,
    update() {
      const owned = options.owned();
      const occupied = options.occupied();
      for (let tileIndex = 0; tileIndex < GARDEN_TILE_COUNT; tileIndex++) {
        const cell = cells.get(tileIndex);
        if (!cell) continue;
        const key = stateKey(tileIndex, owned, occupied);
        if (key !== cell.shown) paintCell(cell, tileIndex, key);
      }
    },
    destroy() {
      window.removeEventListener("mouseup", stopPainting);
    },
  };
}
