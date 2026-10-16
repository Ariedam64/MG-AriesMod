// Where the notification bell goes on the game's `RightSideRail`, the column
// of round icons at the top right (weather, friends, logs, camera, chat,
// quests).
//
// Everything is read from what the game itself laid out, never from the
// rail's bounds. Each icon's hover tooltip and the chat preview bubble are
// drawn inside the rail, so `rail.width` swells whenever one of them is open,
// and a bell sized from it once covered half the screen.

/** The game's icon size on desktop, until an icon on the rail shows the real one. */
const DEFAULT_ICON_SIZE = 48;
/** The game's gap between two icons, until two icons show the real spacing. */
const ICON_GAP = 4;
/** The face the game draws each icon on, pivoted on its center. */
const FACE_LABEL = "ContentButtonFace";
/** An icon's hover tooltip, whose content can hold faces of its own. */
const TOOLTIP_POPUP_LABEL = "TooltipPopup";
// Weather and friends are always on the rail in normal play. With fewer icons
// the game has stripped it (cinematic mode keeps only the camera, a disabled
// player keeps nothing), and the bell steps aside the same way.
const MIN_ICONS_IN_NORMAL_PLAY = 2;
/** Below this the rail has faded out (the game fades it under its modals). */
const SHOWN_MIN_ALPHA = 0.05;
const MAX_ANCESTOR_HOPS = 64;
const FACE_SEARCH_LIMIT = 200;

export interface RailSlot {
  /** Top-left corner of the bell's cell, in the rail's coordinates. */
  x: number;
  y: number;
  /** Side of the cell, the size of the game's own icons. */
  size: number;
}

interface Cell {
  x: number;
  y: number;
}

/** An icon's button size, read from its face. Null when the icon has none. */
function iconSize(icon: any): number | null {
  const stack = [icon];
  let visited = 0;
  while (stack.length && visited++ < FACE_SEARCH_LIMIT) {
    const n = stack.pop();
    if (!n || n.label === TOOLTIP_POPUP_LABEL) continue;
    if (n.label === FACE_LABEL) {
      const half = Number(n.pivot?.x);
      if (Number.isFinite(half) && half > 0) return half * 2;
    }
    if (Array.isArray(n.children)) for (const child of n.children) stack.push(child);
  }
  return null;
}

/** The smallest distance between two distinct values, or null when they are all the same. */
function smallestStep(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  let best: number | null = null;
  for (let i = 1; i < sorted.length; i++) {
    const d = sorted[i] - sorted[i - 1];
    if (d > 0.5 && (best === null || d < best)) best = d;
  }
  return best;
}

function countDistinct(values: number[]): number {
  return new Set(values.map((v) => Math.round(v))).size;
}

/**
 * Cell `index` of the game's grid. In two columns the game fills the right
 * one first, so the first icon stays against the screen edge.
 */
function gridCell(index: number, columns: number, step: number): Cell {
  if (columns <= 1) return { x: 0, y: index * step };
  return { x: (columns - 1 - (index % columns)) * step, y: Math.floor(index / columns) * step };
}

/**
 * The cell the game would give one more icon: the first one of its grid,
 * in its own order, that no shown icon holds. Hidden icons keep their last
 * position, so only shown ones count.
 *
 * `screenBottom` is the bottom of the screen in the rail's coordinates. When
 * that cell would fall below it, the bell goes left of the column on the
 * lowest row that fits. Null when the game has stripped the rail.
 */
export function computeRailSlot(rail: any, bell: any, screenBottom: number | null): RailSlot | null {
  const icons: any[] = Array.isArray(rail?.children)
    ? rail.children.filter((c: any) => c && c !== bell && c.visible !== false)
    : [];
  if (icons.length < MIN_ICONS_IN_NORMAL_PLAY) return null;

  const cells: Cell[] = icons.map((c) => ({ x: Number(c.x) || 0, y: Number(c.y) || 0 }));
  let size: number | null = null;
  for (const icon of icons) {
    size = iconSize(icon);
    if (size !== null) break;
  }
  const step = smallestStep([...cells.map((c) => c.x), ...cells.map((c) => c.y)]) ?? (size ?? DEFAULT_ICON_SIZE) + ICON_GAP;
  const cellSize = size ?? step - ICON_GAP;
  const columns = countDistinct(cells.map((c) => c.x));

  const isTaken = (cell: Cell) =>
    cells.some((c) => Math.abs(c.x - cell.x) < step / 2 && Math.abs(c.y - cell.y) < step / 2);
  // n icons hold at most n of the first n + 1 cells, so one of them is free.
  let slot = gridCell(icons.length, columns, step);
  for (let i = 0; i <= icons.length; i++) {
    const cell = gridCell(i, columns, step);
    if (!isTaken(cell)) {
      slot = cell;
      break;
    }
  }

  if (screenBottom !== null && slot.y + cellSize > screenBottom) {
    const leftmost = Math.min(...cells.map((c) => c.x));
    const lowestRowThatFits = Math.floor((screenBottom - cellSize) / step);
    slot = { x: leftmost - step, y: Math.max(0, lowestRowThatFits * step) };
  }

  return { x: slot.x, y: slot.y, size: cellSize };
}

/**
 * Whether the node is actually on screen: it and every ancestor visible, and
 * none faded out. The game fades the rail out under its modals and slides it
 * away in cutscenes, leaving it in the tree.
 */
export function isShownOnStage(node: any): boolean {
  let cur = node;
  let hops = 0;
  while (cur && hops++ < MAX_ANCESTOR_HOPS) {
    if (cur.visible === false || cur.renderable === false) return false;
    const alpha = Number(cur.alpha);
    if (Number.isFinite(alpha) && alpha < SHOWN_MIN_ALPHA) return false;
    cur = cur.parent;
  }
  return true;
}
