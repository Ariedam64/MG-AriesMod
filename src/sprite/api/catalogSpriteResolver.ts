import {
  decorCatalog,
  eggCatalog,
  mutationCatalog,
  petAbilities,
  petCatalog,
  plantCatalog,
  weatherCatalog,
} from '../../data';
import type { SpriteState } from '../types';

const hasTex = (state: SpriteState, key: string) => state.tex.has(key);

const resolveSpriteKey = (name: string, categories: string[], state: SpriteState): string | null => {
  for (const cat of categories) {
    const key = `sprite/${cat}/${name}`;
    if (hasTex(state, key)) return key;
  }
  return null;
};

const copyWithout = (obj: any, keys: string[]): Record<string, any> => {
  if (!obj || typeof obj !== 'object') return {};
  return Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
};

export function mapDecorCatalogToSprites(decorCatalog: any, state: SpriteState) {
  const out: Record<string, any> = {};
  for (const [name, data] of Object.entries(decorCatalog || {})) {
    const sprite = resolveSpriteKey(name, ['decor'], state);
    out[name] = { ...copyWithout(data, ['tileRef']), sprite };
  }
  return out;
}

export function mapMutationCatalogToSprites(mutationCatalog: any, state: SpriteState) {
  const out: Record<string, any> = {};
  for (const [name, data] of Object.entries(mutationCatalog || {})) {
    const sprite = resolveSpriteKey(name, ['mutation'], state);
    out[name] = { ...copyWithout(data, ['tileRef']), sprite };
  }
  return out;
}

export function mapPetCatalogToSprites(petCatalog: any, state: SpriteState) {
  const out: Record<string, any> = {};
  for (const [name, data] of Object.entries(petCatalog || {})) {
    const sprite = resolveSpriteKey(name, ['pet'], state);
    out[name] = { ...copyWithout(data, ['tileRef']), sprite };
  }
  return out;
}

export function mapPlantCatalogToSprites(plantCatalog: any, state: SpriteState) {
  const out: Record<string, any> = {};
  for (const [name, entry] of Object.entries(plantCatalog || {})) {
    const data: any = entry && typeof entry === 'object' ? entry : {};
    const seedSprite = data.seed ? resolveSpriteKey(name, ['seed'], state) : null;
    // Try tallplant first if it exists; fallback to plant/crop.
    const plantSprite = data.plant ? resolveSpriteKey(name, ['tallplant', 'plant'], state) : null;
    const cropSprite = data.crop ? resolveSpriteKey(name, ['crop', 'plant', 'tallplant'], state) : null;
    out[name] = {
      seed: data.seed ? { ...copyWithout(data.seed, ['tileRef']), sprite: seedSprite } : undefined,
      plant: data.plant ? { ...copyWithout(data.plant, ['tileRef']), sprite: plantSprite } : undefined,
      crop: data.crop ? { ...copyWithout(data.crop, ['tileRef']), sprite: cropSprite } : undefined,
    };
  }
  return out;
}

export function mapCatalogsToSpriteRefs(state: SpriteState) {
  return {
    decorCatalog: mapDecorCatalogToSprites(decorCatalog, state),
    mutationCatalog: mapMutationCatalogToSprites(mutationCatalog, state),
    eggCatalog: mapPetCatalogToSprites(eggCatalog, state), // eggs share pet sheet
    petCatalog: mapPetCatalogToSprites(petCatalog, state),
    petAbilities, // no sprite metadata needed
    plantCatalog: mapPlantCatalogToSprites(plantCatalog, state),
    weatherCatalog,
  };
}
