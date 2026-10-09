import { DEFAULT_CFG } from './settings';
import type { SpriteContext, SpriteState } from './types';

function createInitialState(): SpriteState {
  return {
    started: false,
    loaded: false,
    version: null,
    base: null,
    ctors: null,
    app: null,
    renderer: null,
    tex: new Map(),
    atlasBases: new Set(),
  };
}

export function createSpriteContext(): SpriteContext {
  return {
    cfg: { ...DEFAULT_CFG },
    state: createInitialState(),
  };
}
