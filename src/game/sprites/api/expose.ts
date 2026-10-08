export interface HudHandles {
  open: () => void;
  close: () => void;
  toggle: () => void;
  layout: () => void;
  root?: any;
}
import type { SpriteState } from '../types';
import type { MutationName } from '../settings';
import { curVariant, clearVariantCache } from '../mutations/variantBuilder';

export function exposeApi(state: SpriteState, hud: HudHandles) {
  const root: any = (globalThis as any).unsafeWindow || globalThis;
  const api = {
    open() {
      hud.root?.style && (hud.root.style.display = 'block');
      state.open = true;
    },
    close() {
      hud.root?.style && (hud.root.style.display = 'none');
      state.open = false;
    },
    toggle() {
      state.open ? api.close() : api.open();
    },
    setCategory(cat: string) {
      state.cat = cat || '__all__';
    },
    setFilterText(text: string) {
      state.q = String(text || '').trim();
    },
    setSpriteFilter(name: string) {
      state.f = name as any;
      state.mutOn = false;
    },
    setMutation(on: boolean, ...muts: (string | undefined)[]) {
      state.mutOn = !!on;
      state.f = '';
      state.mutations = state.mutOn
        ? muts.filter(Boolean).map(name => name as MutationName)
        : [];
    },
    filters() {
      return [];
    },
    categories() {
      return [...state.cats.keys()].sort((a, b) => a.localeCompare(b));
    },
    cacheStats() {
      return { entries: state.lru.size, cost: state.cost };
    },
    clearCache() {
      clearVariantCache(state);
    },
    curVariant: () => curVariant(state),
  };
  root.MGSpriteCatalog = api;
  return api;
}
