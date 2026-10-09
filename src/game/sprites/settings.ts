// Sprite catalog configuration, and the mutation groups the debug sprite tab offers.

export const DEFAULT_CFG = {
  origin: 'https://magicgarden.gg',
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

export const MUT_G1: MutationName[] = ['', 'Gold', 'Rainbow'].filter(Boolean) as MutationName[];
export const MUT_G2: MutationName[] = ['', 'Wet', 'Chilled', 'Frozen', 'Thunderstruck', 'Thundercharged'].filter(Boolean) as MutationName[];
export const MUT_G3: MutationName[] = ['', 'Dawnlit', 'Ambershine', 'Dawncharged', 'Ambercharged'].filter(Boolean) as MutationName[];
