// Sprite Catalog configuration and mutation metadata

export const DEFAULT_CFG = {
  origin: 'https://magicgarden.gg',
  jobOn: true,
  jobBudgetMs: 5,
  jobBurstMs: 12,
  jobBurstWindowMs: 400,
  jobCapPerTick: 20,
  cacheOn: true,
  cacheMaxEntries: 1200,
  cacheMaxCost: 5000,
  keepCacheOnClose: true,
  srcCanvasMax: 450,
  debugLog: true,
  debugLimitDefault: 25,
} as const;

export type SpriteConfig = typeof DEFAULT_CFG;

export type MutationName =
  | 'Gold'
  | 'Rainbow'
  | 'Wet'
  | 'Chilled'
  | 'Frozen'
  | 'Thunderstruck'
  | 'Thundercharged'
  | 'Dawnlit'
  | 'Ambershine'
  | 'Dawncharged'
  | 'Ambercharged';

export interface MutationMeta {
  overlayTall: string | null;
  tallIconOverride: string | null;
  angle?: number;
  angleTall?: number;
}

export const MUT_META: Record<MutationName, MutationMeta> = {
  Gold: { overlayTall: null, tallIconOverride: null },
  Rainbow: { overlayTall: null, tallIconOverride: null, angle: 130, angleTall: 0 },
  Wet: { overlayTall: 'sprite/mutation-overlay/WetTallPlant', tallIconOverride: 'sprite/mutation/Puddle' },
  Chilled: { overlayTall: 'sprite/mutation-overlay/ChilledTallPlant', tallIconOverride: null },
  Frozen: { overlayTall: 'sprite/mutation-overlay/FrozenTallPlant', tallIconOverride: null },
  Thunderstruck: { overlayTall: 'sprite/mutation-overlay/ThunderstruckTallPlant', tallIconOverride: 'sprite/mutation/ThunderstruckGround' },
  Thundercharged: { overlayTall: null, tallIconOverride: null },
  Dawnlit: { overlayTall: null, tallIconOverride: null },
  Ambershine: { overlayTall: null, tallIconOverride: null },
  Dawncharged: { overlayTall: null, tallIconOverride: null },
  Ambercharged: { overlayTall: null, tallIconOverride: null },
};

export const MUT_NAMES: MutationName[] = Object.keys(MUT_META) as MutationName[];
export const MUT_G1: MutationName[] = ['', 'Gold', 'Rainbow'].filter(Boolean) as MutationName[];
export const MUT_G2: MutationName[] = ['', 'Wet', 'Chilled', 'Frozen', 'Thunderstruck', 'Thundercharged'].filter(Boolean) as MutationName[];
export const MUT_G3: MutationName[] = ['', 'Dawnlit', 'Ambershine', 'Dawncharged', 'Ambercharged'].filter(Boolean) as MutationName[];
