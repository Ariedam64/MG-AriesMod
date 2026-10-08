// State shared by the editor's logic and its panels: whether editor mode is
// on, and which garden tile the current-item panel is showing.

import { Emitter } from "../../lib/emitter";
import type { EditorTileTarget } from "./tileMap";

/** Written only by `EditorService`. */
export const editorSession = { enabled: false };

let currentTile: EditorTileTarget | null = null;

export const getCurrentEditorTile = (): EditorTileTarget | null => currentTile;

/** Fired when the current-item panel has to redraw: another tile was picked, or its object changed. */
export const currentItemChanged = new Emitter<void>();

/** Points the current-item panel at a tile (a mouse click picks it) and redraws the panel. */
export function setCurrentEditorTile(target: EditorTileTarget | null): void {
  currentTile = target;
  currentItemChanged.emit();
}

/** Forgets the current tile without redrawing, for when editor mode starts. */
export function forgetCurrentEditorTile(): void {
  currentTile = null;
}
