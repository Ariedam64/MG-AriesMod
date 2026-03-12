import type { MutationName, SpriteConfig } from './settings';

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

export interface AnimFrameGroup {
  key: string;
  isAnim: true;
  frames: SpriteTexture[];
  first: SpriteTexture;
  count: number;
}

export interface SingleSpriteItem {
  key: string;
  isAnim: false;
  first: SpriteTexture;
}

export type SpriteItem = AnimFrameGroup | SingleSpriteItem;

export interface SpriteState {
  started: boolean;
  open: boolean;
  loaded: boolean;
  version: string | null;
  base: string | null;
  ctors: any | null;
  app: any | null;
  renderer: any | null;
  cat: string;
  q: string;
  f: MutationName | '' | null;
  mutOn: boolean;
  mutations: MutationName[];
  scroll: number;
  items: SpriteItem[];
  filtered: SpriteItem[];
  cats: Map<string, SpriteItem[]>;
  tex: Map<string, SpriteTexture>;
  lru: Map<string, CacheEntry>;
  cost: number;
  jobs: SpriteJob[];
  jobMap: Set<string>;
  srcCan: Map<string, HTMLCanvasElement>;
  atlasBases: Set<unknown>;
  dbgCount: Record<string, number>;
  sig: string;
  changedAt: number;
  needsLayout: boolean;
  overlay: any;
  bg: any;
  grid: any;
  dom: HTMLElement | null;
  selCat: HTMLSelectElement | null;
  count: HTMLElement | null;
  pool: any[];
  active: Map<number, any>;
  anim: Set<any>;
}

export interface VariantSignature {
  mode: 'F' | 'M';
  muts: MutationName[];
  overlayMuts: MutationName[];
  selectedMuts: MutationName[];
  sig: string;
}

export interface CacheEntry {
  tex?: SpriteTexture;
  frames?: SpriteTexture[];
  isAnim?: boolean;
}

export interface SpriteJob {
  k: string;
  sig: string;
  itKey: string;
  isAnim: boolean;
  src: SpriteTexture[];
  i: number;
  out: SpriteTexture[];
  V: VariantSignature;
}

export interface SpriteContext {
  cfg: SpriteConfig;
  state: SpriteState;
}

export interface ManifestBundle {
  bundles?: { name?: string; assets?: { alias?: string[]; src?: string[]; data?: Record<string, unknown> }[] }[];
}
