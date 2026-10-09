import type { SpriteConfig } from './settings';

// Minimal PIXI-like texture types to keep compilation light without hard PIXI dependency.
export interface SpriteTexture {
  label?: string;
  frame?: { x: number; y: number; width: number; height: number };
  orig?: { width: number; height: number };
  trim?: { x: number; y: number; width: number; height: number };
  defaultAnchor?: { x: number; y: number };
  rotate?: number | boolean;
  baseTexture?: unknown;
  source?: { baseTexture?: unknown };
  _frame?: { x: number; y: number; width: number; height: number };
  _orig?: { width: number; height: number };
  _trim?: { x: number; y: number; width: number; height: number };
}

export interface SpriteState {
  started: boolean;
  loaded: boolean;
  version: string | null;
  base: string | null;
  ctors: any | null;
  app: any | null;
  renderer: any | null;
  /** Every atlas frame, by frame key, built on the game's own base textures. */
  tex: Map<string, SpriteTexture>;
  atlasBases: Set<unknown>;
}

export interface SpriteContext {
  cfg: SpriteConfig;
  state: SpriteState;
}

/**
 * One entry of an asset's `src` list: a bare path, or a resolution variant.
 *
 * The game used to list plain paths and now lists `{ src, resolution }` objects
 * (the same atlas packed at 1x and 2x). Both forms are accepted so the mod
 * keeps working across the change.
 */
export type ManifestSrc = string | { src?: string; resolution?: number };

export interface ManifestBundle {
  bundles?: { name?: string; assets?: { alias?: string[]; src?: ManifestSrc[]; data?: Record<string, unknown> }[] }[];
}
