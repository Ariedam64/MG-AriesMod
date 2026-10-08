// Mouse placement for the garden editor: left click places or selects, right
// click removes, and holding either button while dragging repeats the action
// tile by tile.

import { tos } from "../../game/pixi/tileObjects";
import { EditorService } from "./editor";
import { readMapData, readUserSlotIdx } from "./liveGarden";
import { placeBrushAtCurrentTile, readTileObjectAt, removeGardenObjectAtCurrentTile } from "./planEdits";
import { setCurrentEditorTile } from "./session";
import { ownTileAt, type EditorTileTarget } from "./tileMap";

let installed = false;

type DragMode = "place" | "remove" | null;
let dragMode: DragMode = null;
let lastTileKey: string | null = null;

const tileKeyOf = (target: EditorTileTarget): string => `${target.tileType}|${target.localTileIndex}`;

/** The player's own garden tile at a map position, or null. */
async function resolveOwnTile(tx: number, ty: number): Promise<EditorTileTarget | null> {
  try {
    const [mapData, ownSlotIdx] = await Promise.all([readMapData(), readUserSlotIdx()]);
    return ownTileAt(mapData, tx, ty, ownSlotIdx);
  } catch {
    return null;
  }
}

// A native event's target is the topmost element under the pointer, so it
// already accounts for HUD windows and editor panels over the canvas (Pixi's
// own event system does not dispatch here at all). A click only counts as a
// tile click when it lands on the game canvas itself.
function hitTestTile(ev: PointerEvent): { tx: number; ty: number } | null {
  if (!tos.isReady()) return null;
  const canvas = tos.getCanvas();
  if (!canvas || ev.target !== canvas) return null;
  const info = tos.pointerToFarmTile(ev);
  return info ? { tx: info.tx, ty: info.ty } : null;
}

async function handlePrimary(target: EditorTileTarget, tx: number, ty: number): Promise<void> {
  const occupied = readTileObjectAt(target);
  setCurrentEditorTile(target);
  if (occupied) {
    // Never overwrite a plant or decor, just select it. The flash is lighter
    // than the placement one since the sprite is already there.
    tos.flashTileGreen(tx, ty, { startAlpha: 0.55, durationMs: 400 });
    return;
  }
  await placeBrushAtCurrentTile();
}

async function handleRemove(target: EditorTileTarget): Promise<void> {
  if (!readTileObjectAt(target)) return;
  setCurrentEditorTile(target);
  await removeGardenObjectAtCurrentTile();
}

async function handlePointerDown(ev: PointerEvent): Promise<void> {
  if (!EditorService.isEnabled() || (ev.button !== 0 && ev.button !== 2)) return;
  const hit = hitTestTile(ev);
  if (!hit) return;
  const target = await resolveOwnTile(hit.tx, hit.ty);
  if (!target) return;

  ev.preventDefault();
  ev.stopPropagation();
  lastTileKey = tileKeyOf(target);

  if (ev.button === 2) {
    dragMode = "remove";
    await handleRemove(target);
  } else {
    dragMode = "place";
    await handlePrimary(target, hit.tx, hit.ty);
  }
}

async function handlePointerMove(ev: PointerEvent): Promise<void> {
  if (!dragMode || !EditorService.isEnabled()) return;
  const hit = hitTestTile(ev);
  if (!hit) return;
  const target = await resolveOwnTile(hit.tx, hit.ty);
  if (!target) return;

  // Only act again on entering a new tile.
  const key = tileKeyOf(target);
  if (key === lastTileKey) return;
  lastTileKey = key;

  if (dragMode === "remove") await handleRemove(target);
  else await handlePrimary(target, hit.tx, hit.ty);
}

function handlePointerUp(): void {
  dragMode = null;
  lastTileKey = null;
}

function handleContextMenu(ev: MouseEvent): void {
  if (!EditorService.isEnabled() || !tos.isReady()) return;
  const canvas = tos.getCanvas();
  if (!canvas || ev.target !== canvas) return;
  if (!tos.pointerToFarmTile(ev as unknown as PointerEvent)) return;
  ev.preventDefault();
}

export function installEditorPointerControls(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("pointerdown", (ev) => void handlePointerDown(ev), true);
  window.addEventListener("pointermove", (ev) => void handlePointerMove(ev), true);
  window.addEventListener("pointerup", handlePointerUp, true);
  window.addEventListener("pointercancel", handlePointerUp, true);
  window.addEventListener("contextmenu", handleContextMenu, true);
}
