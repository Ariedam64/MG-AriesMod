// Shared types for the skin system (custom sprite replacement).

/**
 * One replaceable frame — the atomic unit of skinning.
 *
 * `logicalSize` is the sprite's own (unrotated) size, and the box a custom
 * image gets contained into. `occupiedRect` is the region the frame occupies in
 * the atlas image: for a rotated frame the sprite is stored turned 90°, so its
 * width and height are swapped there. It identifies a frame's texture even when
 * the game derived an unlabelled instance of it.
 */
export interface SkinTarget {
  frameKey: string;
  logicalSize: { w: number; h: number };
  occupiedRect: { x: number; y: number; w: number; h: number };
  rotated: boolean;
  skinnable: boolean;
  /** Why this frame cannot be skinned; only set when `skinnable` is false. */
  blockedReason?: string;
}

/** A game object grouping one or more skinnable frames (growth stages, animation frames). */
export interface SkinnableObject {
  key: string;
  category: string;
  label: string;
  slots: SkinTarget[];
}

/** A user-imported skin, as persisted. */
export interface SkinEntry {
  frameKey: string;
  blob: Blob;
}

/** Outcome of applying one skin, surfaced in the UI. */
export interface SkinApplyResult {
  frameKey: string;
  applied: boolean;
  /** Human-readable cause when `applied` is false. */
  error?: string;
}
