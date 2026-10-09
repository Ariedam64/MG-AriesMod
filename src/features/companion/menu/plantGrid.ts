// The plot, drawn: two squares of ten tiles, as in the Garden tab.
//
// The same shape as the auto-plant grid, on purpose: it is the one the player
// already knows, and a tile's index there is already the `slot` the protocol
// expects. Paint with the mouse, right button to erase.
//
// Tiles are built once and updated in place. Rebuilding them on every refresh
// would reload two hundred sprites every few seconds, with the drawing
// flickering under the hand.

import { GARDEN_COLS, GARDEN_ROWS, GARDEN_TILE_COUNT, type PlantAssignment } from "../chat/plant";
import { part } from "./dom";

/** Big enough to aim with the mouse, small enough for the plot to fit. */
const MAX_GRID_HEIGHT_PX = 300;
const CELL_ICON_PX = 20;
/** Sets the plot's two halves apart, as in the game. */
const HALF_GAP_PX = 12;

type PaintMode = "assign" | "erase";

type PlantGridOptions = {
  /** The tiles the player owns. The others stay inert. */
  owned(): Set<number>;
  /** The tiles already taken: nothing can go there. */
  occupied(): Set<number>;
  assignmentAt(tileIndex: number): PlantAssignment | null;
  /**
   * Makes a planned tile's thumbnail, at the size asked.
   *
   * The grid sets the size rather than resizing afterwards: the sprite loader
   * picks its resolution when built, and correcting it in CSS would only
   * stretch an image already drawn.
   */
  iconFor(assignment: PlantAssignment, sizePx: number): HTMLElement;
  onPaint(tileIndex: number, mode: PaintMode): void;
};

type PlantGrid = {
  root: HTMLElement;
  /** Redraws from the current state. Unchanged tiles are left alone. */
  update(): void;
  /** Stops the global mouse listener. */
  destroy(): void;
};

type Cell = {
  el: HTMLDivElement;
  /** What the tile shows right now, to redraw only when it changes. */
  shown: string | null;
};

export function plantGrid(options: PlantGridOptions): PlantGrid {
  const root = part("div", "qws-cmp-plot");
  Object.assign(root.style, {
    gridTemplateColumns: `repeat(${GARDEN_COLS / 2}, 1fr) ${HALF_GAP_PX}px repeat(${GARDEN_COLS / 2}, 1fr)`,
    gridTemplateRows: `repeat(${GARDEN_ROWS}, 1fr)`,
    aspectRatio: `${GARDEN_COLS} / ${GARDEN_ROWS}`,
    // As tall as fits, but never wider than the popup: a narrow window shrinks
    // the plot rather than cutting it.
    maxWidth: `calc(min(38vh, ${MAX_GRID_HEIGHT_PX}px) * ${GARDEN_COLS / GARDEN_ROWS})`,
  });
  // The right button erases: its menu has no business here.
  root.addEventListener("contextmenu", (event) => event.preventDefault());

  const cells = new Map<number, Cell>();

  let painting = false;
  let mode: PaintMode = "assign";

  const stopPainting = (): void => {
    painting = false;
  };
  window.addEventListener("mouseup", stopPainting);

  function buildCell(tileIndex: number): HTMLDivElement {
    const cell = part("div", "qws-cmp-plot__cell");
    cell.dataset.tile = String(tileIndex);

    cell.addEventListener("mousedown", (event) => {
      event.preventDefault();
      painting = true;
      mode = event.button === 2 ? "erase" : "assign";
      options.onPaint(tileIndex, mode);
    });
    // Entering a tile with the button held paints it too: that is what draws
    // a whole row in one stroke.
    cell.addEventListener("mouseenter", () => {
      if (painting) options.onPaint(tileIndex, mode);
    });

    return cell;
  }

  // Two halves of ten columns, split by an inert column.
  for (let row = 0; row < GARDEN_ROWS; row++) {
    for (let col = 0; col < GARDEN_COLS; col++) {
      if (col === GARDEN_COLS / 2) root.append(part("div", "qws-cmp-plot__aisle"));
      const tileIndex = row * GARDEN_COLS + col;
      const el = buildCell(tileIndex);
      cells.set(tileIndex, { el, shown: null });
      root.append(el);
    }
  }

  /** What the tile should show, as a string: when it does not change, nothing is touched. */
  function stateKey(tileIndex: number, owned: Set<number>, occupied: Set<number>): string {
    if (!owned.has(tileIndex)) return "absent";
    if (occupied.has(tileIndex)) return "occupied";
    const assignment = options.assignmentAt(tileIndex);
    return assignment ? `set:${assignment.kind}:${assignment.id}` : "free";
  }

  function paintCell(cell: Cell, tileIndex: number, key: string): void {
    cell.shown = key;
    cell.el.replaceChildren();

    if (key === "absent" || key === "occupied" || key === "free") {
      cell.el.dataset.state = key;
      // Red and nothing else when taken: the tile says it is taken, not by what.
      cell.el.title = key === "occupied" ? "Something is already growing here" : "";
      return;
    }

    const assignment = options.assignmentAt(tileIndex);
    cell.el.dataset.state = "set";
    cell.el.title = assignment?.name ?? "";
    if (assignment) cell.el.append(options.iconFor(assignment, CELL_ICON_PX));
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
