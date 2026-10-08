import { DEFAULT_CFG } from './settings';
import type { SpriteContext, SpriteState } from './types';

function createInitialState(): SpriteState {
  return {
    started: false,
    open: false,
    loaded: false,
    version: null,
    base: null,
    ctors: null,
    app: null,
    renderer: null,
    cat: '__all__',
    q: '',
    f: '',
    mutOn: false,
    mutations: [],
    scroll: 0,
    items: [],
    filtered: [],
    cats: new Map(),
    tex: new Map(),
    lru: new Map(),
    cost: 0,
    jobs: [],
    jobMap: new Set(),
    srcCan: new Map(),
    atlasBases: new Set(),
    dbgCount: {},
    sig: '',
    changedAt: 0,
    needsLayout: false,
    overlay: null,
    bg: null,
    grid: null,
    dom: null,
    selCat: null,
    count: null,
    pool: [],
    active: new Map(),
    anim: new Set(),
  };
}

export function createSpriteContext(): SpriteContext {
  return {
    cfg: { ...DEFAULT_CFG },
    state: createInitialState(),
  };
}
