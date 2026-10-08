import type { MutationName, SpriteConfig } from '../settings';
import type { SpriteItem, SpriteState, SpriteTexture, VariantSignature } from '../types';
import { buildVariantFromMutations, renderMutatedTexture } from '../mutations/variantBuilder';

type Category =
  | 'plant'
  | 'tallplant'
  | 'crop'
  | 'decor'
  | 'item'
  | 'pet'
  | 'seed'
  | 'mutation'
  | 'mutation-overlay'
  | 'ui'
  | 'any';

const normalizeKey = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const categoryAlias: Record<Category, string[]> = {
  plant: ['plant'],
  tallplant: ['tallplant'],
  crop: ['crop'],
  decor: ['decor'],
  item: ['item'],
  pet: ['pet'],
  seed: ['seed'],
  mutation: ['mutation'],
  'mutation-overlay': ['mutation-overlay'],
  ui: ['ui'],
  any: [],
};

const keyCategoryOf = (key: string): string => {
  const parts = key.split('/').filter(Boolean);
  if (parts[0] === 'sprite' || parts[0] === 'sprites') return parts[1] ?? '';
  return parts[0] ?? '';
};

const matchesCategory = (keyCat: string, requested: Category) => {
  if (requested === 'any') return true;
  const aliases = categoryAlias[requested] || [];
  return aliases.some(a => normalizeKey(keyCat) === normalizeKey(a));
};

const baseNameOf = (key: string) => {
  const parts = key.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
};

function findItem(state: SpriteState, category: Category, id: string): SpriteItem | null {
  const normId = normalizeKey(id);
  for (const it of state.items) {
    const keyCat = keyCategoryOf(it.key);
    if (!matchesCategory(keyCat, category)) continue;
    const base = normalizeKey(baseNameOf(it.key));
    if (base === normId) return it;
  }
  return null;
}

export function listItemsByCategory(state: SpriteState, category: Category = 'any'): SpriteItem[] {
  return state.items.filter(it => matchesCategory(keyCategoryOf(it.key), category));
}

export function buildVariant(mutations: MutationName[]): VariantSignature {
  return buildVariantFromMutations(mutations);
}

export function getSpriteWithMutations(
  params: {
    category: Category;
    id: string;
    mutations: MutationName[];
  },
  state: SpriteState,
  cfg: SpriteConfig
): SpriteTexture | null {
  const it = findItem(state, params.category, params.id);
  if (!it) return null;
  const tex = it.isAnim ? it.frames?.[0] : it.first;
  if (!tex) return null;
  const V = buildVariantFromMutations(params.mutations);
  return renderMutatedTexture(tex as any, it.key, V, state, cfg);
}

export function getBaseSprite(params: { category: Category; id: string }, state: SpriteState): SpriteTexture | null {
  const it = findItem(state, params.category, params.id);
  if (!it) return null;
  return it.isAnim ? it.frames?.[0] ?? null : it.first;
}
