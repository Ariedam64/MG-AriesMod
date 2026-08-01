// src/services/editorPointerControls.ts
// Mouse-driven placement for the garden editor: left click places/selects, right click
// removes, and holding either button while dragging repeats the action tile by tile.
import { tos } from "../utils/tileObjectSystemApi";
import {
  EditorService,
  resolveOwnTile,
  readTileObjectAt,
  setCurrentEditorTile,
  placeSelectedItemInGardenAtCurrentTile,
  removeGardenObjectAtCurrentTile,
  type EditorTileTarget,
} from "./editor";

let installed = false;

type DragMode = "place" | "remove" | null;
let dragMode: DragMode = null;
let lastTileKey: string | null = null;

function tileKeyOf(target: EditorTileTarget): string {
  return `${target.tileType}|${target.localTileIndex}`;
}

// Native DOM events' ev.target is the real topmost element under the pointer, respecting
// stacking - so it correctly reflects HUD windows/editor panels sitting on top of the canvas
// (unlike Pixi's own internal event system, which doesn't dispatch here at all). Gate on it
// directly: a click only counts as a tile click when it actually lands on the game canvas.
function hitTestOwnTile(ev: PointerEvent): { tx: number; ty: number } | null {
  if (!tos.isReady()) return null;
  const canvas = tos.getCanvas();
  if (!canvas || ev.target !== canvas) return null;
  const info = tos.pointerToFarmTile(ev);
  if (!info) return null;
  return { tx: info.tx, ty: info.ty };
}

async function handlePrimary(target: EditorTileTarget, tx: number, ty: number): Promise<void> {
  const occupied = await readTileObjectAt(target);
  setCurrentEditorTile(target);
  if (occupied) {
    // never overwrite an existing plant/decor - just select it, with a lighter flash
    // than the placement one since the sprite is already visible.
    tos.flashTileGreen(tx, ty, { startAlpha: 0.55, durationMs: 400 });
    return;
  }
  await placeSelectedItemInGardenAtCurrentTile(); // no-ops if no brush is selected
}

async function handleRemove(target: EditorTileTarget): Promise<void> {
  const occupied = await readTileObjectAt(target);
  if (!occupied) return;
  setCurrentEditorTile(target);
  await removeGardenObjectAtCurrentTile();
}

async function handlePointerDown(ev: PointerEvent): Promise<void> {
  if (!EditorService.isEnabled() || (ev.button !== 0 && ev.button !== 2)) return;
  const hit = hitTestOwnTile(ev);
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
  const hit = hitTestOwnTile(ev);
  if (!hit) return;
  const target = await resolveOwnTile(hit.tx, hit.ty);
  if (!target) return;

  const key = tileKeyOf(target);
  if (key === lastTileKey) return; // only re-trigger on entering a new tile
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

  window.addEventListener("pointerdown", (ev) => { void handlePointerDown(ev); }, true);
  window.addEventListener("pointermove", (ev) => { void handlePointerMove(ev); }, true);
  window.addEventListener("pointerup", handlePointerUp, true);
  window.addEventListener("pointercancel", handlePointerUp, true);
  window.addEventListener("contextmenu", handleContextMenu, true);
}
