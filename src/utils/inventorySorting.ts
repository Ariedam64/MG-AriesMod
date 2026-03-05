// inventorySorting.ts
// Inventory Sorting helpers + UI (TypeScript, vanilla DOM)

import { Atoms, myPetHutchPetItems } from "../store/atoms";
import {
  coin,
  decorCatalog,
  eggCatalog,
  petAbilities,
  petCatalog,
  plantCatalog,
  rarity as rarityMap,
  toolCatalog,
} from "../data";
import {
  computeInventoryItemValue,
  ensureInventoryValueWatcher,
  getInventoryValueSnapshot,
  onInventoryValueChange,
} from "./inventoryValue";
import { readAriesPath, writeAriesPath } from "./localStorage";

export type SortKey =
  | 'none'
  | 'alpha'
  | 'qty'
  | 'rarity'
  | 'size'
  | 'mutations'
  | 'strength'
  | 'value';

export type SortDirection = 'asc' | 'desc';

export type FilterKey =
  | 'seed'
  | 'crop'
  | 'plant'
  | 'pet'
  | 'tool'
  | 'decor'
  | string; // autorise d'autres clés au besoin

export interface SortOption {
  value: SortKey;
  label: string;
}

export interface InventorySortingConfig {
  gridSelector: string;
  filtersBlockSelector: string;
  closeButtonSelector: string;
  checkboxSelector: string;
  checkboxLabelSelector: string; // texte du label d’un filtre (ex: '.chakra-checkbox__label')
  injectDarkStyles?: boolean;
  mapExtraByFilter?: Partial<Record<FilterKey, SortKey[]>>;
  labelByValue?: Partial<Record<SortKey, string>>;
  directionLabel?: string;
  directionLabelByValue?: Partial<Record<SortDirection, string>>;
  defaultDirectionBySortKey?: Partial<Record<SortKey, SortDirection>>;
  onSortChange?: (sortKey: SortKey, direction: SortDirection) => void; // callback global en plus du tri appliqué
  applySorting?: (grid: Element, sortKey: SortKey, direction: SortDirection) => void; // hook tri métier
}

export interface InventorySortingController {
  destroy(): void;
  update(): void; // recalcule options selon filtres actifs
  getActiveFilters(): string[];
  getCurrentSortKey(): SortKey | null;
  getCurrentSortDirection(): SortDirection | null;
  setSortKey(k: SortKey): void;
  setSortDirection(direction: SortDirection): void;
  getSortOptions(): SortOption[];
  getGrid(): Element | null;
}

// -------------------- Defaults --------------------

const DEFAULTS: Required<Pick<
  InventorySortingConfig,
  | 'gridSelector'
  | 'filtersBlockSelector'
  | 'closeButtonSelector'
  | 'checkboxSelector'
  | 'checkboxLabelSelector'
  | 'injectDarkStyles'
>> = {
  // Updated to new Inventory root grid container (game UI update)
  gridSelector: 'div.McGrid.css-1kv58ap',
  filtersBlockSelector: '.McGrid.css-o1vp12',
  closeButtonSelector: 'button.css-vuqwsg',
  checkboxSelector: 'label.chakra-checkbox.css-1v6h4z7',
  checkboxLabelSelector: '.chakra-checkbox__label',
  injectDarkStyles: true,
};

const INVENTORY_SEARCH_INPUT_SELECTOR = 'input.chakra-input.css-8e1l1i';

const ALWAYS: SortKey[] = ['none'];
const BASE_SORT: SortKey[] = ['alpha', 'qty', 'rarity', 'value']; // Rarity par défaut
const ORDER: SortKey[] = [
  'none',
  'alpha',
  'qty',
  'rarity',
  'value',
  'size',
  'mutations',
  'strength',
];

const SORT_KEY_PATH = 'inventory.sortKey';
const SORT_KEY_SET = new Set<SortKey>(ORDER);

const SORT_DIRECTION_PATH = 'inventory.sortDirection';
const SORT_DIRECTION_SET = new Set<SortDirection>(['asc', 'desc']);

const DEFAULT_DIRECTION_LABEL = 'Order:';
const DIRECTION_LABELS_DEFAULT: Record<SortDirection, string> = {
  asc: 'Ascending',
  desc: 'Descending',
};

const getPetAbilityDisplayName = (abilityId: unknown): string | null => {
  if (typeof abilityId !== 'string') return null;

  const trimmedId = abilityId.trim();
  if (!trimmedId) return null;

  const ability = (petAbilities as Record<string, { name?: string }>)[trimmedId] ?? null;
  const name = ability?.name;

  if (typeof name !== 'string') return null;

  const trimmedName = name.trim();
  return trimmedName ? trimmedName : null;
};

const INVENTORY_VALUE_VISIBILITY_PATH = 'inventory.showValues';

const resolveVisibilityFromStoredValue = (value: unknown): boolean | null => {
  if (value === true || value === false) return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return null;
};

const loadPersistedInventoryValueVisibility = (): boolean | null => {
  try {
    const stored = readAriesPath<unknown>(INVENTORY_VALUE_VISIBILITY_PATH);
    return resolveVisibilityFromStoredValue(stored);
  } catch (error) {
    console.warn(
      "[InventorySorting] Impossible de lire la préférence d'affichage des valeurs d'inventaire",
      error
    );
    return null;
  }
};

const persistInventoryValueVisibility = (visible: boolean) => {
  try {
    writeAriesPath(INVENTORY_VALUE_VISIBILITY_PATH, visible);
  } catch (error) {
    console.warn(
      "[InventorySorting] Impossible de sauvegarder la préférence d'affichage des valeurs d'inventaire",
      error
    );
  }
};

let shouldDisplayInventoryValues = true;

const setShouldDisplayInventoryValues = (visible: boolean) => {
  shouldDisplayInventoryValues = visible;
};

const getShouldDisplayInventoryValues = (): boolean => shouldDisplayInventoryValues;

const DEFAULT_DIRECTION_BY_SORT_KEY: Record<SortKey, SortDirection> = {
  none: 'asc',
  alpha: 'asc',
  qty: 'desc',
  rarity: 'asc',
  value: 'desc',
  size: 'desc',
  mutations: 'desc',
  strength: 'desc',
};

const DIRECTION_ORDER: SortDirection[] = ['asc', 'desc'];

const isPersistedSortKey = (value: unknown): value is SortKey =>
  typeof value === 'string' && SORT_KEY_SET.has(value as SortKey);

const isPersistedSortDirection = (value: unknown): value is SortDirection =>
  typeof value === 'string' && SORT_DIRECTION_SET.has(value as SortDirection);

const loadPersistedSortKey = (): SortKey | null => {
  try {
    const stored = readAriesPath<unknown>(SORT_KEY_PATH);
    return isPersistedSortKey(stored) ? stored : null;
  } catch (error) {
    console.warn('[InventorySorting] Impossible de lire la valeur de tri persistée', error);
    return null;
  }
};

const persistSortKey = (value: SortKey) => {
  try {
    writeAriesPath(SORT_KEY_PATH, value);
  } catch (error) {
    console.warn('[InventorySorting] Impossible de sauvegarder la valeur de tri', error);
  }
};

const loadPersistedSortDirection = (): SortDirection | null => {
  try {
    const stored = readAriesPath<unknown>(SORT_DIRECTION_PATH);
    return isPersistedSortDirection(stored) ? stored : null;
  } catch (error) {
    console.warn('[InventorySorting] Impossible de lire l\'ordre de tri persisté', error);
    return null;
  }
};

const persistSortDirection = (value: SortDirection) => {
  try {
    writeAriesPath(SORT_DIRECTION_PATH, value);
  } catch (error) {
    console.warn("[InventorySorting] Impossible de sauvegarder l'ordre de tri", error);
  }
};

const MAP_EXTRA_BY_FILTER_DEFAULT: Record<FilterKey, SortKey[]> = {
  // seed/tool/ decor = tri de base
  seed: [],
  tool: [],
  decor: [],
  // crop/plant = base + size/mutations
  crop: ['size', 'mutations'],
  produce: ['size', 'mutations'],
  plant: [],
  // pet = base + size/mutations/strength
  pet: ['mutations', 'strength'],
};

type FilterContextListener = (contextKey: string) => void;

const FILTER_CONTEXT_ITEM_TYPES_CACHE = new Map<string, ReadonlySet<string>>();
const FILTER_CONTEXT_LISTENERS = new Set<FilterContextListener>();

const addFilterContextListener = (listener: FilterContextListener): (() => void) => {
  FILTER_CONTEXT_LISTENERS.add(listener);
  return () => {
    FILTER_CONTEXT_LISTENERS.delete(listener);
  };
};

const notifyFilterContextListeners = (contextKey: string) => {
  FILTER_CONTEXT_LISTENERS.forEach((listener) => {
    try {
      listener(contextKey);
    } catch (error) {
      console.warn('[InventorySorting] Listener de contexte de filtre en erreur', error);
    }
  });
};

const LABEL_BY_VALUE_DEFAULT: Record<SortKey, string> = {
  none: 'None',
  alpha: 'A–Z',
  qty: 'Quantity',
  rarity: 'Rarity',
  value: 'Values',
  size: 'Size',
  mutations: 'Mutations',
  strength: 'Strength',
};

const INVENTORY_BASE_INDEX_DATASET_KEY = 'tmInventoryBaseIndex';
// Updated items container to match new inventory DOM (inside the main content area)
const INVENTORY_ITEM_CARD_SELECTORS = ['.css-vmnhaw', '.css-1avy1fz'];
const INVENTORY_ITEMS_CONTAINER_SELECTOR = '.McFlex.css-zo8r2v';
const INVENTORY_NOISE_SELECTOR =
  '.McFlex.css-1tkifdd, .chakra-text.css-glp3xv, .chakra-text.css-repqgl, .chakra-text.css-ah6ymv';
const INVENTORY_STRENGTH_WRAPPER_SELECTOR = '.McFlex.css-15lpbqz';
const INVENTORY_STRENGTH_TEXT_SELECTOR = '.chakra-text.css-wqvsdi';
const INVENTORY_FAVORITE_BUTTON_SELECTOR = 'button.chakra-button.css-1iytwn1';
const INVENTORY_ITEM_CARD_SELECTOR = INVENTORY_ITEM_CARD_SELECTORS.join(', ');
const INVENTORY_VALUE_CONTAINER_SELECTOR = '.McFlex.css-1p00rng';
const INVENTORY_VALUE_ELEMENT_CLASS = 'tm-inventory-item-value';
const INVENTORY_VALUE_TEXT_CLASS = `${INVENTORY_VALUE_ELEMENT_CLASS}__text`;
const INVENTORY_VALUE_DATASET_KEY = 'tmInventoryValue';
const FILTERED_VALUE_LOADING = '…';
const FILTERED_VALUE_UNKNOWN = '—';
const VALUE_SUMMARY_ICON_CLASS = 'tm-value-toggle__summary-icon';
const VALUE_SUMMARY_TEXT_CLASS = 'tm-value-toggle__summary-text';
const VALUE_SUMMARY_ICON_SRC = (() => {
  const src = (coin as { img64?: string } | undefined)?.img64 ?? '';
  if (typeof src !== 'string' || !src) {
    return '';
  }
  return src.startsWith('data:') ? src : `data:image/png;base64,${src}`;
})();
const VALUE_SUMMARY_ICON_BACKGROUND = VALUE_SUMMARY_ICON_SRC
  ? `url("${VALUE_SUMMARY_ICON_SRC}")`
  : '';

interface InventoryDomEntry {
  wrapper: HTMLElement;
  card: HTMLElement;
}

type InventoryDomSnapshot = HTMLElement[];

function createDomSnapshot(entries: InventoryDomEntry[]): InventoryDomSnapshot {
  return entries.map((entry) => entry.wrapper);
}

function haveDomEntriesChanged(
  previous: InventoryDomSnapshot | null,
  nextEntries: InventoryDomEntry[]
): boolean {
  if (!previous) return true;
  if (previous.length !== nextEntries.length) return true;
  for (let i = 0; i < nextEntries.length; i++) {
    if (previous[i] !== nextEntries[i].wrapper) {
      return true;
    }
  }
  return false;
}

interface InventoryDomSortState {
  filtersKey: string;
  searchQuery: string;
  entryCount: number;
  baseItems: any[];
  entryByBaseIndex: Map<number, InventoryDomEntry>;
  lastSortKey: SortKey | null;
}

// -------------------- Utils (exportés quand utiles) --------------------

export const debounce = <T extends (...args: any[]) => void>(fn: T, wait = 120) => {
  let t: number | undefined;
  return (...args: Parameters<T>) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), wait);
  };
};

export function isVisible(el: Element | null): el is Element {
  if (!el || !document.contains(el)) return false;
  const r = (el as HTMLElement).getBoundingClientRect();
  const cs = getComputedStyle(el as HTMLElement);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  return r.width > 0 && r.height > 0;
}

const labelIsChecked = (el: Element): boolean =>
  el.matches('[data-checked]') || !!el.querySelector('[data-checked]');

const normalize = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

const createFilterContextKey = (filters: readonly string[], search: string): string => {
  const normalizedFilters = filters
    .map((value) => normalize(value))
    .filter((value) => value && value !== 'all');
  normalizedFilters.sort();
  const normalizedSearch = normalize(search);
  return `${normalizedFilters.join('|')}::${normalizedSearch}`;
};

const areSetsEqual = (a?: ReadonlySet<string> | null, b?: ReadonlySet<string> | null): boolean => {
  if (a === b) return true;
  if (!a || !b || a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
};

const getCachedItemTypesForKey = (contextKey: string): ReadonlySet<string> | null => {
  return FILTER_CONTEXT_ITEM_TYPES_CACHE.get(contextKey) ?? null;
};

const getCachedItemTypesForContext = (
  filters: readonly string[],
  search: string
): ReadonlySet<string> | null => {
  const key = createFilterContextKey(filters, search);
  return getCachedItemTypesForKey(key);
};

const setCachedItemTypesForKey = (contextKey: string, types: Set<string>): void => {
  const normalizedTypes = new Set<string>();
  types.forEach((type) => {
    const normalizedType = normalize(type);
    if (normalizedType) {
      normalizedTypes.add(normalizedType);
    }
  });

  const previous = FILTER_CONTEXT_ITEM_TYPES_CACHE.get(contextKey) ?? null;
  if (previous && areSetsEqual(previous, normalizedTypes)) {
    return;
  }

  FILTER_CONTEXT_ITEM_TYPES_CACHE.set(contextKey, normalizedTypes);
  notifyFilterContextListeners(contextKey);
};

const getInventorySearchInput = (grid: Element | null): HTMLInputElement | null => {
  if (!grid) return null;
  const input = grid.querySelector<HTMLInputElement>(INVENTORY_SEARCH_INPUT_SELECTOR);
  return input ?? null;
};

const getInventorySearchQuery = (grid: Element | null): string => {
  const input = getInventorySearchInput(grid);
  return typeof input?.value === 'string' ? input.value : '';
};

const getNormalizedInventorySearchQuery = (grid: Element | null): string =>
  normalize(getInventorySearchQuery(grid));

const logFilteredInventorySearchResults = async (
  grid: Element | null,
  filters: string[],
  searchQuery: string
): Promise<void> => {
  if (!grid) return;

  try {
    const inventory = await Atoms.inventory.myInventory.get();
    if (!inventory || typeof inventory !== "object") {
      console.log("[InventorySorting] Inventaire introuvable pour le log de recherche.");
      return;
    }

    const items = Array.isArray((inventory as any).items) ? (inventory as any).items : [];
    const { filteredItems } = filterInventoryItems(items, filters, searchQuery);
    const container = getInventoryItemsContainer(grid);
    const entries = container ? getInventoryDomEntries(container) : [];

    console.log("[InventorySorting] Résultats filtrés (recherche) :", filteredItems);
    console.log(
      "[InventorySorting] Nombre d'éléments DOM pour la recherche :",
      entries.length
    );
  } catch (error) {
    console.warn(
      "[InventorySorting] Impossible de journaliser les résultats filtrés de la recherche",
      error
    );
  }
};

const RARITY_ORDER = [
  rarityMap.Common,
  rarityMap.Uncommon,
  rarityMap.Rare,
  rarityMap.Legendary,
  rarityMap.Mythic,
  rarityMap.Divine,
  rarityMap.Celestial,
].filter(Boolean);

const RARITY_RANK = (() => {
  const entries = new Map<string, number>();
  RARITY_ORDER.forEach((label, index) => {
    const key = normalize(label);
    if (key) {
      entries.set(key, index);
    }
  });
  // Handle possible alternate spellings the game might emit.
  const mythicIndex = entries.get(normalize(rarityMap.Mythic));
  if (typeof mythicIndex === "number") {
    entries.set(normalize("Mythic"), mythicIndex);
  }
  return entries;
})();

const getRarityRank = (value: string | null | undefined): number => {
  const key = normalize(value);
  if (!key) return RARITY_ORDER.length;
  return RARITY_RANK.get(key) ?? RARITY_ORDER.length;
};

const SPECIES_FIELDS = [
  "species",
  "seedSpecies",
  "plantSpecies",
  "cropSpecies",
  "baseSpecies",
  "seedKey",
];

const normalizeSpeciesKey = (value: string): string =>
  value
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/(seed|plant|baby|fruit|crop)$/i, "");

const MAX_SCALE_BY_SPECIES = (() => {
  const map = new Map<string, number>();
  const register = (key: unknown, value: number) => {
    if (typeof key !== "string") return;
    const normalized = normalizeSpeciesKey(key.trim());
    if (!normalized || map.has(normalized)) return;
    map.set(normalized, value);
  };

  for (const [species, entry] of Object.entries(plantCatalog as Record<string, any>)) {
    const maxScale = Number(entry?.crop?.maxScale);
    if (!Number.isFinite(maxScale) || maxScale <= 0) continue;
    register(species, maxScale);
    register(entry?.seed?.name, maxScale);
    register(entry?.plant?.name, maxScale);
    register(entry?.crop?.name, maxScale);
  }

  return map;
})();

const lookupMaxScale = (species: unknown): number | null => {
  if (typeof species !== "string") return null;
  const normalized = normalizeSpeciesKey(species.trim());
  if (!normalized) return null;
  const value = MAX_SCALE_BY_SPECIES.get(normalized);
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const scaleToPercent = (scale: number, maxScale: number | null): number => {
  if (!Number.isFinite(scale)) return 50;

  const MIN_PERCENT = 50;
  const MAX_PERCENT = 100;
  const MIN_SCALE = 1;
  const safeScale = Math.max(MIN_SCALE, scale);

  if (typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > MIN_SCALE) {
    const limited = Math.min(maxScale, safeScale);
    const ratio = (limited - MIN_SCALE) / (maxScale - MIN_SCALE);
    const pct = MIN_PERCENT + ratio * (MAX_PERCENT - MIN_PERCENT);
    return clampNumber(Math.round(pct), MIN_PERCENT, MAX_PERCENT);
  }

  const FALLBACK_MAX_SCALE = 2;
  const limited = Math.min(FALLBACK_MAX_SCALE, safeScale);
  const ratio = (limited - MIN_SCALE) / (FALLBACK_MAX_SCALE - MIN_SCALE);
  const pct = MIN_PERCENT + ratio * (MAX_PERCENT - MIN_PERCENT);
  return clampNumber(Math.round(pct), MIN_PERCENT, MAX_PERCENT);
};

const collectSpeciesCandidates = (source: any, out: Set<string>): void => {
  if (!source || typeof source !== "object") return;
  for (const field of SPECIES_FIELDS) {
    const raw = (source as Record<string, unknown>)[field];
    if (typeof raw === "string") {
      const value = raw.trim();
      if (value) out.add(value);
    }
  }
};

const computeSizePercentFromScale = (speciesCandidates: Iterable<string>, scale: number): number | null => {
  if (!Number.isFinite(scale)) return null;

  let maxScale: number | null = null;
  for (const candidate of speciesCandidates) {
    maxScale = lookupMaxScale(candidate);
    if (maxScale != null) break;
  }

  return scaleToPercent(scale, maxScale);
};

const getInventoryItemSizePercent = (item: any): number | null => {
  if (!item || typeof item !== "object") return null;

  const candidates = new Set<string>();
  collectSpeciesCandidates(item, candidates);
  collectSpeciesCandidates((item as any).item, candidates);
  collectSpeciesCandidates((item as any).data, candidates);

  const rawType = typeof item.itemType === "string" ? item.itemType : "";
  const type = rawType.trim();

  if (type === "Crop" || type === "Produce") {
    const scale = Number((item as Record<string, unknown>).scale);
    return computeSizePercentFromScale(candidates, scale);
  }

  return null;
};

const collectMutations = (source: unknown, out: string[]): void => {
  if (!source || typeof source !== "object") return;

  const rawMutations = (source as Record<string, unknown>).mutations;
  if (Array.isArray(rawMutations)) {
    for (const mutation of rawMutations) {
      if (typeof mutation === "string" && mutation.trim()) {
        out.push(mutation.trim());
      }
    }
  }

  const slots = (source as Record<string, unknown>).slots;
  if (Array.isArray(slots)) {
    for (const slot of slots) {
      collectMutations(slot, out);
    }
  }
};

const getInventoryItemMutations = (item: any): string[] => {
  if (!item || typeof item !== "object") return [];

  const mutations: string[] = [];
  collectMutations(item, mutations);
  collectMutations((item as any).item, mutations);
  collectMutations((item as any).data, mutations);

  return mutations;
};

const FILTER_LABEL_TO_ITEM_TYPES: Record<string, string[]> = {
  crop: ["Produce"],
  crops: ["Produce"],
  produce: ["Produce"],
  seed: ["Seed"],
  seeds: ["Seed"],
  plant: ["Plant"],
  plants: ["Plant"],
  pet: ["Pet"],
  pets: ["Pet"],
  tool: ["Tool"],
  tools: ["Tool"],
  decor: ["Decor"],
  decors: ["Decor"],
  decoration: ["Decor"],
  decorations: ["Decor"],
  egg: ["Egg"],
  eggs: ["Egg"],
};

const ITEM_TYPE_TO_FILTER_KEYS: Record<string, string[]> = (() => {
  const mapping = new Map<string, Set<string>>();
  for (const [filterKey, itemTypes] of Object.entries(FILTER_LABEL_TO_ITEM_TYPES)) {
    for (const itemType of itemTypes) {
      const normalizedType = normalize(itemType);
      if (!normalizedType) continue;
      const set = mapping.get(normalizedType) ?? new Set<string>();
      set.add(filterKey);
      mapping.set(normalizedType, set);
    }
  }
  const result: Record<string, string[]> = {};
  mapping.forEach((value, key) => {
    result[key] = Array.from(value);
  });
  return result;
})();

const getExtrasForFilterKey = (
  filterKey: string,
  mapExtraByFilter: Readonly<Partial<Record<string, SortKey[]>>>
): SortKey[] => {
  if (!filterKey) return [];
  const direct = mapExtraByFilter[filterKey];
  if (Array.isArray(direct) && direct.length) {
    return direct;
  }
  if (filterKey.endsWith('s')) {
    const singular = filterKey.slice(0, -1);
    if (singular) {
      const singularMatch = mapExtraByFilter[singular];
      if (Array.isArray(singularMatch) && singularMatch.length) {
        return singularMatch;
      }
    }
  }
  return [];
};

const getExtrasForItemType = (
  itemType: string,
  mapExtraByFilter: Readonly<Partial<Record<string, SortKey[]>>>
): SortKey[] => {
  const normalizedType = normalize(itemType);
  if (!normalizedType) return [];
  const extras = new Set<SortKey>();

  const direct = mapExtraByFilter[normalizedType];
  if (Array.isArray(direct)) {
    direct.forEach((value) => extras.add(value));
  }

  const relatedFilterKeys = ITEM_TYPE_TO_FILTER_KEYS[normalizedType] ?? [];
  for (const filterKey of relatedFilterKeys) {
    const values = mapExtraByFilter[filterKey];
    if (Array.isArray(values)) {
      values.forEach((value) => extras.add(value));
    }
  }

  return Array.from(extras);
};

function filterLabelToItemTypes(filter: string): string[] {
  const key = normalize(filter);
  if (!key || key === "all") return [];
  const mapped = FILTER_LABEL_TO_ITEM_TYPES[key];
  if (mapped) return mapped;
  const singular = key.endsWith("s") ? key.slice(0, -1) : key;
  if (!singular) return [];
  const itemType = singular.charAt(0).toUpperCase() + singular.slice(1);
  return itemType ? [itemType] : [];
}

interface FilterInventoryResult {
  filteredItems: any[];
  keepAll: boolean;
  itemTypes: Set<string>;
  detectedItemTypes: Set<string>;
}

function inventoryItemMatchesSearchQuery(item: any, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;

  const visited = new Set<any>();

  const matchesValue = (value: any): boolean => {
    if (value == null) return false;

    if (typeof value === 'string') {
      return normalize(value).includes(normalizedQuery);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return normalize(String(value)).includes(normalizedQuery);
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (matchesValue(entry)) {
          return true;
        }
      }
      return false;
    }

    if (typeof value === 'object') {
      if (visited.has(value)) {
        return false;
      }
      visited.add(value);
      for (const [key, entry] of Object.entries(value)) {
        if (key === 'itemType') {
          continue;
        }
        if (key === 'abilities') {
          if (Array.isArray(entry)) {
            for (const abilityId of entry) {
              const abilityName = getPetAbilityDisplayName(abilityId);
              if (abilityName && matchesValue(abilityName)) {
                return true;
              }
            }
          }
          continue;
        }
        if (matchesValue(entry)) {
          return true;
        }
      }
    }

    return false;
  };

  const abilityNames = Array.isArray(item?.abilities)
    ? item.abilities
        .map((abilityId: unknown) => getPetAbilityDisplayName(abilityId))
        .filter((name: string | null): name is string => typeof name === 'string' && !!name)
    : [];

  const candidates: Array<any> = [
    getInventoryItemName(item),
    typeof item?.species === 'string' ? item.species : null,
    typeof item?.seedSpecies === 'string' ? item.seedSpecies : null,
    typeof item?.plantSpecies === 'string' ? item.plantSpecies : null,
    typeof item?.petSpecies === 'string' ? item.petSpecies : null,
    typeof item?.eggId === 'string' ? item.eggId : null,
    typeof item?.decorId === 'string' ? item.decorId : null,
    typeof item?.toolId === 'string' ? item.toolId : null,
    typeof item?.id === 'string' ? item.id : null,
    ...abilityNames,
  ];

  for (const candidate of candidates) {
    if (matchesValue(candidate)) {
      return true;
    }
  }

  return matchesValue(item);
}

function attachItemValues(items: any[]): void {
  const snapshot = getInventoryValueSnapshot();
  const playersInRoom = snapshot?.plants?.playersInRoom ?? null;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;

    const value = computeInventoryItemValue(item, { playersInRoom });
    (item as Record<string, any>).value = value ?? null;
  }
}

function filterInventoryItems(
  items: any[],
  filters: string[],
  searchQuery?: string
): FilterInventoryResult {
  const normalizedFilters = filters.map((f) => normalize(f)).filter(Boolean);
  const itemTypes = new Set<string>();
  let recognized = false;

  for (const filter of normalizedFilters) {
    const mappedTypes = filterLabelToItemTypes(filter);
    if (mappedTypes.length) {
      recognized = true;
      for (const type of mappedTypes) {
        if (type) itemTypes.add(type);
      }
    }
  }

  const keepAll = !recognized;
  const filteredByType = keepAll
    ? items.slice()
    : items.filter((item: any) => {
        const type = typeof item?.itemType === "string" ? item.itemType.trim() : "";
        return type ? itemTypes.has(type) : false;
      });

  const normalizedSearch = normalize(searchQuery);
  const filteredItems = normalizedSearch
    ? filteredByType.filter((item: any) => inventoryItemMatchesSearchQuery(item, normalizedSearch))
    : filteredByType;

  attachItemValues(filteredItems);

  const detectedItemTypes = new Set<string>();
  for (const item of filteredItems) {
    const type = typeof item?.itemType === 'string' ? item.itemType.trim() : '';
    if (type) {
      detectedItemTypes.add(type);
    }
  }

  const contextKey = createFilterContextKey(filters, normalizedSearch);
  setCachedItemTypesForKey(contextKey, detectedItemTypes);

  return { filteredItems, keepAll, itemTypes, detectedItemTypes };
}

function getInventoryItemsContainer(grid: Element): HTMLElement | null {
  // Prefer container scoped to the grid; fall back to document-level (new UI places
  // the items list outside the header grid).
  return (
    grid.querySelector<HTMLElement>(INVENTORY_ITEMS_CONTAINER_SELECTOR) ||
    document.querySelector<HTMLElement>(INVENTORY_ITEMS_CONTAINER_SELECTOR)
  );
}

const getInventoryCardElement = (element: HTMLElement): HTMLElement | null => {
  for (const selector of INVENTORY_ITEM_CARD_SELECTORS) {
    if (element.matches(selector)) {
      return element;
    }
  }
  return element.querySelector<HTMLElement>(INVENTORY_ITEM_CARD_SELECTOR);
};

const clearInventoryNoiseText = (container: Element): void => {
  if (!(container instanceof HTMLElement)) return;
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(INVENTORY_NOISE_SELECTOR));
  for (const node of nodes) {
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode) {
      if (textNode.textContent) {
        textNode.textContent = '';
      }
      textNode = walker.nextNode();
    }
  }
};

const findAncestorWithDescendant = (
  start: HTMLElement,
  selector: string
): HTMLElement | null => {
  let current: HTMLElement | null = start;
  while (current) {
    if (current.querySelector(selector)) return current;
    current = current.parentElement;
  }
  return null;
};

const alignInventoryStrengthText = (card: HTMLElement): void => {
  const strengthWrap = card.querySelector<HTMLElement>(INVENTORY_STRENGTH_WRAPPER_SELECTOR);
  if (!strengthWrap) return;

  const baseTransformKey = 'tmStrengthBaseTransform';
  const existingBase = strengthWrap.dataset[baseTransformKey];
  if (existingBase == null) {
    strengthWrap.dataset[baseTransformKey] = strengthWrap.style.transform ?? '';
  }

  const baseTransform = strengthWrap.dataset[baseTransformKey] ?? '';
  strengthWrap.style.transform = baseTransform;

  const textEl = strengthWrap.querySelector<HTMLElement>(INVENTORY_STRENGTH_TEXT_SELECTOR);
  if (!textEl) return;

  const datasetIsMax = strengthWrap.dataset[TM_STRENGTH_IS_MAX_DATASET_KEY];
  const shouldAlign =
    datasetIsMax === '0' ||
    datasetIsMax === '1' ||
    (datasetIsMax == null && !!textEl.textContent && textEl.textContent.includes('/'));

  if (!shouldAlign) {
    if (strengthWrap.style.pointerEvents) {
      strengthWrap.style.pointerEvents = '';
    }
    return;
  }

  const container =
    findAncestorWithDescendant(strengthWrap, INVENTORY_FAVORITE_BUTTON_SELECTOR) ??
    findAncestorWithDescendant(card, INVENTORY_FAVORITE_BUTTON_SELECTOR);
  if (!container) return;

  const favoriteButton = container.querySelector<HTMLElement>(INVENTORY_FAVORITE_BUTTON_SELECTOR);
  if (!favoriteButton) return;

  const anchor =
    favoriteButton.querySelector<HTMLElement>('svg') ??
    favoriteButton.querySelector<HTMLElement>('.chakra-icon') ??
    favoriteButton;

  const containerRect = container.getBoundingClientRect();
  if (!containerRect.width) return;

  // Align max badge to the left border of the card row.
  const GAP_PX_NON_MAX = 7;
  const GAP_PX_MAX = 5;
  let deltaX: number | null = null;
  if (datasetIsMax === '1') {
    const badge = textEl.querySelector<HTMLElement>(`.${TM_STRENGTH_BADGE_CLASS}`);
    const badgeRect = badge?.getBoundingClientRect();
    if (badgeRect && badgeRect.width) {
      deltaX = containerRect.left + GAP_PX_MAX - badgeRect.left;
    }
  }

  if (deltaX == null) {
    const anchorRect = anchor.getBoundingClientRect();
    const textRect = textEl.getBoundingClientRect();
    if (!anchorRect.width || !textRect.width) return;
    // Align the right edge of the STR text to the left edge of the favorite icon.
    deltaX = anchorRect.left - textRect.right - GAP_PX_NON_MAX;
  }
  if (!Number.isFinite(deltaX)) return;

  strengthWrap.style.transform = baseTransform
    ? `${baseTransform} translateX(${Math.round(deltaX)}px)`
    : `translateX(${Math.round(deltaX)}px)`;

  textEl.style.margin = '0';

  if (strengthWrap.style.pointerEvents) {
    strengthWrap.style.pointerEvents = '';
  }
};

function getInventoryDomEntries(container: Element): InventoryDomEntry[] {
  clearInventoryNoiseText(container);
  const entries: InventoryDomEntry[] = [];
  const children = Array.from(container.children) as Element[];

  for (const child of children) {
    if (!(child instanceof HTMLElement)) continue;

    const card = getInventoryCardElement(child);
    if (card) {
      alignInventoryStrengthText(card);
      entries.push({ wrapper: child, card });
    }
  }

  return entries;
}

const INVENTORY_COMPACT_VALUE_UNITS: Array<{ threshold: number; suffix: string }> = [
  { threshold: 1e12, suffix: 'T' },
  { threshold: 1e9, suffix: 'B' },
  { threshold: 1e6, suffix: 'M' },
  { threshold: 1e3, suffix: 'K' },
];

const INVENTORY_FULL_VALUE_FORMATTER =
  typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function'
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 })
    : null;

const formatInventoryItemCompactValue = (value: number): string => {
  const abs = Math.abs(value);
  for (const { threshold, suffix } of INVENTORY_COMPACT_VALUE_UNITS) {
    if (abs >= threshold) {
      const scaled = value / threshold;
      const formatted = scaled.toFixed(1).replace(/\.0$/, '');
      return `${formatted}${suffix}`;
    }
  }
  return INVENTORY_FULL_VALUE_FORMATTER
    ? INVENTORY_FULL_VALUE_FORMATTER.format(value)
    : String(value);
};

const formatInventoryItemFullValue = (value: number): string =>
  INVENTORY_FULL_VALUE_FORMATTER ? INVENTORY_FULL_VALUE_FORMATTER.format(value) : String(value);

const getInventoryItemValue = (item: any): number | null => {
  if (!item || typeof item !== 'object') return null;
  const raw = (item as Record<string, unknown>).value;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseStrengthValue = (value: string): number | null => {
  const match = value.match(/(\d+)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

// ✅ MODIF: structure DOM stable pour STR (label + current + max)
const TM_STRENGTH_LABEL_CLASS = 'tm-strength__label';
const TM_STRENGTH_CURRENT_CLASS = 'tm-strength__current';
const TM_STRENGTH_MAX_CLASS = 'tm-strength__max';
const TM_STRENGTH_BADGE_CLASS = 'tm-strength__badge';
const TM_STRENGTH_IS_MAX_DATASET_KEY = 'tmStrengthIsMax';
const PET_HUTCH_HEADER_TEXT = 'Pets in Hutch';
const PET_INVENTORY_HEADER_TEXT = 'Pets in Inventory';
const PET_NAME_SELECTOR = '.McFlex.css-1lpag07 .chakra-text';
const PET_HUTCH_ROOT_SELECTOR = '.McGrid.css-3c49ba';
const PET_HUTCH_LIST_SELECTOR = '.McGrid.css-1nv2ym8 .McFlex.css-1tgchvv';
const PET_HUTCH_INVENTORY_LIST_SELECTOR = '.McGrid.css-1nv2ym8 .McFlex.css-gui45t';
const PET_HUTCH_VISIBILITY_STYLE = 'visibility';

interface StrengthTextParts {
  label: HTMLSpanElement;
  current: HTMLSpanElement;
  max: HTMLSpanElement;
}

type StrengthBadgeTone = 'normal' | 'gold' | 'rainbow';
const RAINBOW_BADGE_TEXT_GRADIENT =
  'linear-gradient(90deg, #ff6b6b 0%, #ffd86f 25%, #6bff8f 50%, #6bc7ff 75%, #b86bff 100%)';
const getPetMutationTone = (item: any): StrengthBadgeTone => {
  const mutations = getInventoryItemMutations(item);
  if (!mutations.length) return 'normal';
  const seen = new Set(mutations.map((mutation) => mutation.toLowerCase()));
  if (seen.has('rainbow')) return 'rainbow';
  if (seen.has('gold') || seen.has('golden')) return 'gold';
  return 'normal';
};

const applyStrengthBadgeTone = (badge: HTMLSpanElement, tone: StrengthBadgeTone): void => {
  if (badge.dataset.tmStrengthTone === tone) return;
  badge.dataset.tmStrengthTone = tone;
  badge.style.backgroundImage = '';
  badge.style.backgroundColor = '';
  badge.style.color = '';
  badge.style.backgroundClip = '';
  badge.style.webkitBackgroundClip = '';
  badge.style.backgroundOrigin = '';
  badge.style.webkitTextFillColor = '';
  badge.style.fontWeight = '700';

  switch (tone) {
    case 'rainbow':
      badge.style.color = 'transparent';
      badge.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.25)), ${RAINBOW_BADGE_TEXT_GRADIENT}`;
      badge.style.backgroundClip = 'padding-box, text';
      badge.style.webkitBackgroundClip = 'padding-box, text';
      badge.style.backgroundOrigin = 'padding-box, text';
      badge.style.webkitTextFillColor = 'transparent';
      break;
    case 'gold':
      badge.style.color = 'var(--chakra-colors-Yellow-Magic, #F3D32B)';
      badge.style.backgroundColor = 'rgba(243, 211, 43, 0.25)';
      break;
    default:
      badge.style.color = '#8fd3ff';
      badge.style.backgroundColor = 'rgba(79, 166, 255, 0.28)';
      break;
  }
};


const ensureStrengthBadge = (textEl: HTMLElement, beforeEl: HTMLElement): HTMLSpanElement => {
  let badge = textEl.querySelector<HTMLSpanElement>(`.${TM_STRENGTH_BADGE_CLASS}`);
  if (!badge) {
    badge = document.createElement('span');
    badge.className = TM_STRENGTH_BADGE_CLASS;
    badge.textContent = 'MAX';
    Object.assign(badge.style, {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 3px',
      marginRight: '0',
      borderRadius: '3px',
      fontSize: '0.5rem',
      lineHeight: '1',
      fontWeight: '700',
      color: 'var(--chakra-colors-Yellow-Magic, #F3D32B)',
      backgroundColor: 'rgba(243, 211, 43, 0.25)',
    });
  }
  if (badge.parentElement !== textEl) {
    textEl.insertBefore(badge, beforeEl);
  }
  return badge;
};

const ensureStrengthTextParts = (textEl: HTMLElement): StrengthTextParts => {
  let label = textEl.querySelector<HTMLSpanElement>(`.${TM_STRENGTH_LABEL_CLASS}`);
  let current = textEl.querySelector<HTMLSpanElement>(`.${TM_STRENGTH_CURRENT_CLASS}`);
  let max = textEl.querySelector<HTMLSpanElement>(`.${TM_STRENGTH_MAX_CLASS}`);

  if (!label || !current || !max) {
    textEl.textContent = '';

    label = document.createElement('span');
    label.className = TM_STRENGTH_LABEL_CLASS;

    current = document.createElement('span');
    current.className = TM_STRENGTH_CURRENT_CLASS;

    max = document.createElement('span');
    max.className = TM_STRENGTH_MAX_CLASS;

    textEl.append(label, current, max);
  }

  return { label, current, max };
};

// ✅ MODIF: STR max = "STR 85" visuellement, sans shift
function updateInventoryCardStrengthText(card: HTMLElement, item: any): void {
  const strengthWrap = card.querySelector<HTMLElement>(INVENTORY_STRENGTH_WRAPPER_SELECTOR);
  if (!strengthWrap) return;

  const textEl = strengthWrap.querySelector<HTMLElement>(INVENTORY_STRENGTH_TEXT_SELECTOR);
  if (!textEl) return;

  

  const info = getPetStrengthInfo(item);
  if (!info) return;

  const { strength, maxStrength } = info;
  if (!Number.isFinite(maxStrength) || maxStrength <= 0) return;

  const existingText = textEl.textContent ?? "";
  const currentStrength =
    parseStrengthValue(existingText) ??
    (Number.isFinite(strength) ? Math.round(strength) : null);
  if (currentStrength == null) return;

  const roundedMax = Math.round(maxStrength);
  if (!Number.isFinite(roundedMax) || roundedMax <= 0) return;

  const safeCurrent = clampNumber(currentStrength, 0, roundedMax);
  const isMax = safeCurrent >= roundedMax;
  const mutationTone = getPetMutationTone(item);

  const parts = ensureStrengthTextParts(textEl);

  if (parts.label.textContent !== "STR ") {
    parts.label.textContent = "STR ";
  }

  const nextCurrent = String(safeCurrent);
  if (parts.current.textContent !== nextCurrent) {
    parts.current.textContent = nextCurrent;
  }
  parts.current.style.setProperty('color', '#ffffff', 'important');
  parts.current.style.setProperty('font-weight', '700', 'important');

  if (isMax) {
    const badge = ensureStrengthBadge(textEl, parts.label);
    applyStrengthBadgeTone(badge, mutationTone);
    if (parts.max.textContent) {
      parts.max.textContent = '';
    }
    parts.max.style.display = 'none';
    parts.max.style.visibility = '';
  } else {
    textEl.querySelector(`.${TM_STRENGTH_BADGE_CLASS}`)?.remove();
    const nextMax = `/${roundedMax}`;
    if (parts.max.textContent !== nextMax) {
      parts.max.textContent = nextMax;
    }
    parts.max.style.display = '';
    parts.max.style.visibility = '';
    parts.max.style.setProperty('font-weight', '700', 'important');
  }

  parts.max.style.setProperty('color', '#ffffff', 'important');

  strengthWrap.dataset[TM_STRENGTH_IS_MAX_DATASET_KEY] = isMax ? '1' : '0';
}

const getValueSummaryElement = (wrap: HTMLElement | null): HTMLSpanElement | null => {
  if (!wrap) return null;
  const summary = ((wrap as any).__valueSummary ?? null) as HTMLSpanElement | null;
  return summary ?? wrap.querySelector('.tm-value-toggle__summary');
};

const ensureValueSummaryContent = (summary: HTMLSpanElement): HTMLSpanElement => {
  if (!summary.style.gap) {
    summary.style.gap = '0.25rem';
  }

  if (VALUE_SUMMARY_ICON_BACKGROUND) {
    let iconEl = summary.querySelector<HTMLElement>(`.${VALUE_SUMMARY_ICON_CLASS}`);
    if (iconEl && iconEl.tagName !== 'SPAN') {
      iconEl.remove();
      iconEl = null;
    }
    if (!iconEl) {
      iconEl = document.createElement('span');
      iconEl.className = VALUE_SUMMARY_ICON_CLASS;
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.style.width = '1.2rem';
      iconEl.style.height = '1.2rem';
      iconEl.style.flexShrink = '0';
      iconEl.style.display = 'inline-block';
      iconEl.style.backgroundSize = 'contain';
      iconEl.style.backgroundRepeat = 'no-repeat';
      iconEl.style.backgroundPosition = 'center';
      iconEl.style.pointerEvents = 'none';
      iconEl.style.userSelect = 'none';
      summary.insertBefore(iconEl, summary.firstChild);
    }
    if (iconEl && iconEl.style.backgroundImage !== VALUE_SUMMARY_ICON_BACKGROUND) {
      iconEl.style.backgroundImage = VALUE_SUMMARY_ICON_BACKGROUND;
    }
  } else {
    summary.querySelector(`.${VALUE_SUMMARY_ICON_CLASS}`)?.remove();
  }

  let textEl = summary.querySelector<HTMLSpanElement>(`.${VALUE_SUMMARY_TEXT_CLASS}`);
  if (!textEl) {
    textEl = document.createElement('span');
    textEl.className = VALUE_SUMMARY_TEXT_CLASS;
    textEl.style.fontWeight = '700';
    textEl.style.color = 'inherit';
    summary.appendChild(textEl);
  }

  return textEl;
};

const setValueSummaryText = (summary: HTMLSpanElement | null, text: string, title?: string) => {
  if (!summary) return;
  const textEl = ensureValueSummaryContent(summary);
  textEl.textContent = text;
  if (title) {
    summary.title = title;
  } else {
    summary.removeAttribute('title');
  }
};

async function updateFilteredInventoryValueSummary(
  wrap: HTMLElement | null,
  filters: string[],
  searchQuery: string
): Promise<void> {
  if (!wrap) return;
  const summary = getValueSummaryElement(wrap);
  if (!summary) return;

  const token = Symbol('value-summary');
  (wrap as any).__valueSummaryToken = token;
  setValueSummaryText(summary, FILTERED_VALUE_LOADING);

  try {
    const inventory = await Atoms.inventory.myInventory.get();
    if ((wrap as any).__valueSummaryToken !== token) {
      return;
    }

    if (!inventory || typeof inventory !== 'object') {
      setValueSummaryText(summary, FILTERED_VALUE_UNKNOWN);
      return;
    }

    const items = Array.isArray((inventory as any).items) ? (inventory as any).items : [];
    const { filteredItems } = filterInventoryItems(items, filters, searchQuery);

    if (!filteredItems.length) {
      setValueSummaryText(summary, '0', '0');
      return;
    }

    let totalValue = 0;
    let hasValue = false;
    for (const item of filteredItems) {
      const value = getInventoryItemValue(item);
      if (typeof value === 'number' && Number.isFinite(value)) {
        totalValue += value;
        hasValue = true;
      }
    }

    if (!hasValue) {
      setValueSummaryText(summary, FILTERED_VALUE_UNKNOWN);
      return;
    }

    const compact = formatInventoryItemCompactValue(totalValue);
    const full = formatInventoryItemFullValue(totalValue);
    setValueSummaryText(summary, compact, full);
  } catch (error) {
    console.warn('[InventorySorting] Impossible de calculer la valeur filtrée', error);
    if ((wrap as any).__valueSummaryToken !== token) {
      return;
    }
    setValueSummaryText(summary, FILTERED_VALUE_UNKNOWN);
  }
}

function updateInventoryCardValue(card: HTMLElement, rawValue: number | null): void {
  const container = card.querySelector<HTMLElement>(INVENTORY_VALUE_CONTAINER_SELECTOR);
  const existing = card.dataset[INVENTORY_VALUE_DATASET_KEY];

  if (!container) {
    if (existing != null) {
      delete card.dataset[INVENTORY_VALUE_DATASET_KEY];
    }
    return;
  }

  const currentEl = container.querySelector<HTMLElement>(`.${INVENTORY_VALUE_ELEMENT_CLASS}`);

  if (!getShouldDisplayInventoryValues()) {
    if (currentEl?.parentElement) {
      currentEl.parentElement.removeChild(currentEl);
    }
    if (existing != null) {
      delete card.dataset[INVENTORY_VALUE_DATASET_KEY];
    }
    return;
  }

  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    if (currentEl?.parentElement) {
      currentEl.parentElement.removeChild(currentEl);
    }
    if (existing != null) {
      delete card.dataset[INVENTORY_VALUE_DATASET_KEY];
    }
    return;
  }

  const compactValue = formatInventoryItemCompactValue(rawValue);
  const fullValue = formatInventoryItemFullValue(rawValue);

  let target = currentEl;
  if (!target) {
    target = document.createElement('div');
    target.className = INVENTORY_VALUE_ELEMENT_CLASS;
  }

  Object.assign(target.style, {
    fontSynthesis: 'none',
    WebkitFontSmoothing: 'antialiased',
    WebkitTextSizeAdjust: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '0.15rem',
    marginTop: '3px',
    fontFamily: 'var(--chakra-fonts-body, "GreyCliff CF", sans-serif)',
    fontWeight: '700',
    fontSize: '0.65rem',
    lineHeight: '1',
    textTransform: 'none',
    color: 'var(--chakra-colors-Yellow-Magic, #F3D32B)',
  });

  let textEl = target.querySelector<HTMLElement>(`.${INVENTORY_VALUE_TEXT_CLASS}`);

  if (!textEl) {
    target.textContent = '';
    textEl = document.createElement('span');
    textEl.className = INVENTORY_VALUE_TEXT_CLASS;
    textEl.style.display = 'inline-flex';
    textEl.style.alignItems = 'center';
    textEl.style.color = 'inherit';
    target.appendChild(textEl);
  }

  textEl.textContent = compactValue;
  target.title = fullValue;

  card.dataset[INVENTORY_VALUE_DATASET_KEY] = String(rawValue);

  if (target.parentElement !== container || target !== container.lastElementChild) {
    container.appendChild(target);
  }
}

function assignBaseIndexesToEntries(entries: InventoryDomEntry[]): void {
  entries.forEach((entry, index) => {
    entry.wrapper.dataset[INVENTORY_BASE_INDEX_DATASET_KEY] = String(index);
    entry.card.dataset[INVENTORY_BASE_INDEX_DATASET_KEY] = String(index);
  });
}

function readBaseIndex(entry: InventoryDomEntry): number | null {
  const raw =
    entry.wrapper.dataset[INVENTORY_BASE_INDEX_DATASET_KEY] ??
    entry.card.dataset[INVENTORY_BASE_INDEX_DATASET_KEY];
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

const stringOrEmpty = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

type NestedKeys = readonly string[];

const pickNestedString = (source: any, path: NestedKeys): string => {
  let current: any = source;
  for (const key of path) {
    if (!current || typeof current !== "object") {
      return "";
    }
    current = current[key as keyof typeof current];
  }
  return stringOrEmpty(current);
};

const pickFirstNestedString = (source: any, paths: readonly NestedKeys[]): string => {
  for (const path of paths) {
    const value = pickNestedString(source, path);
    if (value) return value;
  }
  return "";
};

interface CatalogLookup {
  identifierField: string;
  getEntry(identifier: string): any;
  getNamePaths?: readonly NestedKeys[];
  getRarityPaths?: readonly NestedKeys[];
}

const plantCatalogEntry = (identifier: string) =>
  (plantCatalog as Record<string, any>)[identifier];
const petCatalogEntry = (identifier: string) =>
  (petCatalog as Record<string, any>)[identifier];
const eggCatalogEntry = (identifier: string) =>
  (eggCatalog as Record<string, any>)[identifier];
const toolCatalogEntry = (identifier: string) =>
  (toolCatalog as Record<string, any>)[identifier];
const decorCatalogEntry = (identifier: string) =>
  (decorCatalog as Record<string, any>)[identifier];

const SEED_NAME_PATHS: readonly NestedKeys[] = [
  ["seed", "name"],
  ["plant", "name"],
  ["crop", "name"],
];

const SEED_RARITY_PATHS: readonly NestedKeys[] = [
  ["seed", "rarity"],
  ["crop", "rarity"],
  ["plant", "rarity"],
];

const CROP_NAME_PATHS: readonly NestedKeys[] = [
  ["crop", "name"],
  ["plant", "name"],
  ["seed", "name"],
];

const CROP_RARITY_PATHS: readonly NestedKeys[] = [
  ["crop", "rarity"],
  ["plant", "rarity"],
  ["seed", "rarity"],
];

const PLANT_NAME_PATHS: readonly NestedKeys[] = [
  ["plant", "name"],
  ["crop", "name"],
  ["seed", "name"],
];

const PLANT_RARITY_PATHS: readonly NestedKeys[] = [
  ["plant", "rarity"],
  ["crop", "rarity"],
  ["seed", "rarity"],
];

const createPlantLookup = (
  identifierField: string,
  namePaths: readonly NestedKeys[],
  rarityPaths: readonly NestedKeys[]
): CatalogLookup => ({
  identifierField,
  getEntry: plantCatalogEntry,
  getNamePaths: namePaths,
  getRarityPaths: rarityPaths,
});

const CATALOG_LOOKUPS: Record<string, CatalogLookup> = {
  Seed: createPlantLookup("species", SEED_NAME_PATHS, SEED_RARITY_PATHS),
  Crop: createPlantLookup("species", CROP_NAME_PATHS, CROP_RARITY_PATHS),
  Produce: createPlantLookup("species", CROP_NAME_PATHS, CROP_RARITY_PATHS),
  Plant: createPlantLookup("species", PLANT_NAME_PATHS, PLANT_RARITY_PATHS),
  Pet: {
    identifierField: "petSpecies",
    getEntry: petCatalogEntry,
    getNamePaths: [["name"]],
    getRarityPaths: [["rarity"]],
  },
  Egg: {
    identifierField: "eggId",
    getEntry: eggCatalogEntry,
    getNamePaths: [["name"]],
    getRarityPaths: [["rarity"]],
  },
  Tool: {
    identifierField: "toolId",
    getEntry: toolCatalogEntry,
    getNamePaths: [["name"]],
    getRarityPaths: [["rarity"]],
  },
  Decor: {
    identifierField: "decorId",
    getEntry: decorCatalogEntry,
    getNamePaths: [["name"]],
    getRarityPaths: [["rarity"]],
  },
};

const getCatalogLookup = (type: string): CatalogLookup | null =>
  CATALOG_LOOKUPS[type] ?? null;

const getInventoryItemName = (item: any): string => {
  if (!item || typeof item !== "object") return "";

  const type = stringOrEmpty((item as Record<string, unknown>).itemType);
  const lookup = getCatalogLookup(type);

  if (lookup) {
    const identifier = readNestedStringField(item, lookup.identifierField) ?? "";

    if (identifier) {
      const entry = lookup.getEntry(identifier);
      const catalogName = lookup.getNamePaths
        ? pickFirstNestedString(entry, lookup.getNamePaths)
        : "";

      if (catalogName) {
        return catalogName;
      }

      return identifier;
    }
  }

  const fallbackName = stringOrEmpty((item as Record<string, unknown>).name);
  if (fallbackName) return fallbackName;

  const fallbackId = stringOrEmpty((item as Record<string, unknown>).id);
  if (fallbackId) return fallbackId;

  return type;
};

const QUANTITY_ONE_TYPES = new Set(["Produce", "Crop", "Plant", "Pet"]);

const getInventoryItemQuantity = (item: any): number => {
  if (!item || typeof item !== "object") return 0;

  const rawType = typeof item.itemType === "string" ? item.itemType : "";
  const type = rawType.trim();

  if (QUANTITY_ONE_TYPES.has(type)) {
    return 1;
  }

  const rawQuantity = (item as Record<string, unknown>).quantity;
  const quantity = Number(rawQuantity);
  if (Number.isFinite(quantity) && quantity >= 0) {
    return quantity;
  }

  return 0;
};

const getInventoryItemRarity = (item: any): string => {
  if (!item || typeof item !== "object") return "";

  const type = stringOrEmpty((item as Record<string, unknown>).itemType);
  const lookup = getCatalogLookup(type);
  if (!lookup || !lookup.getRarityPaths?.length) {
    return "";
  }

  const identifier = readNestedStringField(item, lookup.identifierField) ?? "";
  if (!identifier) return "";

  const entry = lookup.getEntry(identifier);
  return pickFirstNestedString(entry, lookup.getRarityPaths);
};

const readNestedValue = <T>(
  item: any,
  field: string,
  parser: (value: unknown) => T | null
): T | null => {
  if (!item || typeof item !== "object") return null;
  const sources: unknown[] = [item, (item as any).item, (item as any).data];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;
    const raw = (source as Record<string, unknown>)[field];
    const parsed = parser(raw);
    if (parsed != null) return parsed;
  }
  return null;
};

const readNestedStringField = (item: any, field: string): string | null =>
  readNestedValue<string>(item, field, (value) => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  });

const readNestedNumberField = (item: any, field: string): number | null =>
  readNestedValue<number>(item, field, (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  });

const findSectionContainerByHeaderText = (headerText: string): HTMLElement | null => {
  if (typeof document === "undefined") return null;
  const headers = Array.from(document.querySelectorAll<HTMLElement>("p.chakra-text"));
  const header = headers.find((el) => (el.textContent ?? "").trim() === headerText) ?? null;
  if (!header) return null;

  let current: HTMLElement | null = header;
  while (current && current !== document.body) {
    const next = current.nextElementSibling as HTMLElement | null;
    if (next && next.querySelector(INVENTORY_ITEM_CARD_SELECTOR)) {
      return next;
    }
    current = current.parentElement;
  }
  return null;
};

const getPetCardName = (card: HTMLElement): string =>
  normalize(card.querySelector<HTMLElement>(PET_NAME_SELECTOR)?.textContent ?? "");

const getPetNameCandidates = (item: any): string[] => {
  const candidates = new Set<string>();
  const name = readNestedStringField(item, "name");
  if (name) candidates.add(normalize(name));
  const species =
    readNestedStringField(item, "petSpecies") ?? readNestedStringField(item, "species");
  if (species) candidates.add(normalize(species));
  return Array.from(candidates);
};

const isPetItem = (item: any): boolean => {
  const rawType = typeof item?.itemType === "string" ? item.itemType : "";
  if (rawType.trim().toLowerCase() === "pet") return true;
  const species =
    readNestedStringField(item, "petSpecies") ?? readNestedStringField(item, "species");
  return !!species;
};

const applyPetItemsToContainer = (container: HTMLElement | null, items: any[]): void => {
  if (!container) return;
  const entries = getInventoryDomEntries(container);
  if (!entries.length) return;

  const petItems = (Array.isArray(items) ? items : []).filter(isPetItem);
  if (!petItems.length) return;
  console.log(
    "[InventorySorting] Hutch apply",
    { container: container.className, entries: entries.length, items: petItems.length }
  );

  const used = new Set<number>();
  for (const entry of entries) {
    const cardName = getPetCardName(entry.card);
    let matchIndex = -1;

    if (cardName) {
      for (let i = 0; i < petItems.length; i += 1) {
        if (used.has(i)) continue;
        const candidates = getPetNameCandidates(petItems[i]);
        if (candidates.includes(cardName)) {
          matchIndex = i;
          break;
        }
      }
    }

    if (matchIndex < 0) {
      for (let i = 0; i < petItems.length; i += 1) {
        if (!used.has(i)) {
          matchIndex = i;
          break;
        }
      }
    }

    if (matchIndex < 0) continue;
    used.add(matchIndex);
    updateInventoryCardStrengthText(entry.card, petItems[matchIndex]);
    alignInventoryStrengthText(entry.card);
  }
};

const setPetHutchContainersHidden = (containers: Array<HTMLElement | null>, hidden: boolean): void => {
  for (const container of containers) {
    if (!container) continue;
    if (hidden) {
      container.style.setProperty(PET_HUTCH_VISIBILITY_STYLE, 'hidden');
    } else {
      container.style.removeProperty(PET_HUTCH_VISIBILITY_STYLE);
    }
  }
};

const updatePetHutchSections = async (
  options: { hideDuringUpdate?: boolean } = {}
): Promise<boolean> => {
  const hideDuringUpdate = options.hideDuringUpdate === true;
  const root =
    document.querySelector<HTMLElement>(PET_HUTCH_ROOT_SELECTOR) ?? document.body;
  const hutchContainer =
    root.querySelector<HTMLElement>(PET_HUTCH_LIST_SELECTOR) ??
    findSectionContainerByHeaderText(PET_HUTCH_HEADER_TEXT);
  const inventoryContainer =
    root.querySelector<HTMLElement>(PET_HUTCH_INVENTORY_LIST_SELECTOR) ??
    findSectionContainerByHeaderText(PET_INVENTORY_HEADER_TEXT);
  const containers = [hutchContainer, inventoryContainer];
  if (!hutchContainer && !inventoryContainer) return false;

  if (hideDuringUpdate) {
    setPetHutchContainersHidden(containers, true);
  }

  try {
    console.log("[InventorySorting] Hutch detect", {
      root: root.className,
      hutchContainer: hutchContainer?.className ?? null,
      inventoryContainer: inventoryContainer?.className ?? null,
    });

    const [hutchItemsRaw, inventoryRaw] = await Promise.all([
      myPetHutchPetItems.get().catch(() => []),
      Atoms.inventory.myInventory.get().catch(() => null),
    ]);

    const hutchItems = Array.isArray(hutchItemsRaw) ? hutchItemsRaw : [];
    const inventoryItems = Array.isArray((inventoryRaw as any)?.items)
      ? (inventoryRaw as any).items
      : Array.isArray(inventoryRaw)
      ? inventoryRaw
      : [];
    console.log("[InventorySorting] Hutch data", {
      hutchItems: hutchItems.length,
      inventoryItems: inventoryItems.length,
    });

    applyPetItemsToContainer(hutchContainer, hutchItems);
    applyPetItemsToContainer(inventoryContainer, inventoryItems);
    return true;
  } catch (error) {
    console.warn("[InventorySorting] Impossible de mettre a jour les pets du hutch", error);
    return false;
  } finally {
    if (hideDuringUpdate) {
      setPetHutchContainersHidden(containers, false);
    }
  }
};

const PET_STATS_BY_SPECIES = (() => {
  const map = new Map<string, { maxScale: number; hoursToMature: number }>();
  const register = (key: unknown, maxScale: number, hoursToMature: number) => {
    if (typeof key !== "string") return;
    const normalized = normalizeSpeciesKey(key);
    if (!normalized || map.has(normalized)) return;
    map.set(normalized, { maxScale, hoursToMature });
  };

  for (const [species, entry] of Object.entries(petCatalog as Record<string, any>)) {
    const maxScale = Number(entry?.maxScale);
    const hoursToMature = Number(entry?.hoursToMature);
    if (!Number.isFinite(maxScale) || maxScale <= 1) continue;
    if (!Number.isFinite(hoursToMature) || hoursToMature <= 0) continue;
    register(species, maxScale, hoursToMature);
    register((entry as any)?.name, maxScale, hoursToMature);
  }

  return map;
})();

const lookupPetStats = (
  species: unknown
): { maxScale: number; hoursToMature: number } | null => {
  if (typeof species !== "string") return null;
  const normalized = normalizeSpeciesKey(species);
  if (!normalized) return null;
  return PET_STATS_BY_SPECIES.get(normalized) ?? null;
};

const getPetStrengthInfo = (
  item: any
): { strength: number; maxStrength: number } | null => {
  if (!item || typeof item !== "object") return null;

  const rawType = typeof item.itemType === "string" ? item.itemType : "";
  const type = rawType.trim();
  if (type !== "Pet") return null;

  const rawXp = readNestedNumberField(item, "xp");
  const xp = typeof rawXp === "number" && Number.isFinite(rawXp) ? rawXp : 0;
  const rawTargetScale = readNestedNumberField(item, "targetScale");
  const targetScale =
    typeof rawTargetScale === "number" && Number.isFinite(rawTargetScale)
      ? rawTargetScale
      : 1;

  const speciesCandidates = new Set<string>();
  const maybePetSpecies = readNestedStringField(item, "petSpecies");
  if (maybePetSpecies) speciesCandidates.add(maybePetSpecies);
  const maybeSpecies = readNestedStringField(item, "species");
  if (maybeSpecies) speciesCandidates.add(maybeSpecies);
  const maybeName = readNestedStringField(item, "name");
  if (maybeName) speciesCandidates.add(maybeName);

  let stats: { maxScale: number; hoursToMature: number } | null = null;
  for (const candidate of speciesCandidates) {
    stats = lookupPetStats(candidate);
    if (stats) break;
  }

  if (!stats) return null;

  const { maxScale, hoursToMature } = stats;
  if (!Number.isFinite(maxScale) || maxScale <= 1) return null;
  if (!Number.isFinite(hoursToMature) || hoursToMature <= 0) return null;

  const safeXp = Math.max(0, xp);
  const xpDenominator = hoursToMature * 3600;
  const xpComponent =
    xpDenominator > 0 ? Math.min(Math.floor((safeXp / xpDenominator) * 30), 30) : 0;

  const minScale = 1;
  const clampedScale = clampNumber(targetScale, minScale, maxScale);
  const scaleDenominator = maxScale - minScale;
  const scaleComponent =
    scaleDenominator > 0
      ? Math.floor(((clampedScale - minScale) / scaleDenominator) * 20 + 80)
      : 80;

  const maxStrength = clampNumber(scaleComponent, 0, 100);
  const combined = xpComponent + maxStrength - 30;
  const strength = clampNumber(combined, 0, maxStrength);
  return { strength, maxStrength };
};

const getPetStrength = (item: any): number | null => {
  const info = getPetStrengthInfo(item);
  return info ? info.strength : null;
};

const compareByNameThenTypeThenId = (a: any, b: any): number => {
  const nameA = getInventoryItemName(a);
  const nameB = getInventoryItemName(b);
  if (nameA && nameB) {
    const cmp = nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    if (cmp !== 0) return cmp;
  }

  if (!nameA && nameB) return 1;
  if (nameA && !nameB) return -1;

  const typeA = typeof a?.itemType === "string" ? a.itemType : "";
  const typeB = typeof b?.itemType === "string" ? b.itemType : "";
  const typeCmp = typeA.localeCompare(typeB, undefined, { sensitivity: "base" });
  if (typeCmp !== 0) return typeCmp;

  const idA = typeof (a as Record<string, unknown>).id === "string"
    ? (a as Record<string, string>).id
    : "";
  const idB = typeof (b as Record<string, unknown>).id === "string"
    ? (b as Record<string, string>).id
    : "";
  return idA.localeCompare(idB, undefined, { sensitivity: "base" });
};

function sortInventoryItems(items: any[], sortKey: SortKey, direction: SortDirection): any[] {
  const sorted = items.slice();
  const isDesc = direction === 'desc';

  switch (sortKey) {
    case "alpha":
      sorted.sort((a, b) => {
        const cmp = compareByNameThenTypeThenId(a, b);
        return isDesc ? -cmp : cmp;
      });
      break;
    case "qty":
      sorted.sort((a: any, b: any) => {
        const qtyA = getInventoryItemQuantity(a);
        const qtyB = getInventoryItemQuantity(b);
        if (qtyA !== qtyB) {
          const cmp = qtyA - qtyB;
          return isDesc ? -cmp : cmp;
        }
        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "rarity":
      sorted.sort((a: any, b: any) => {
        const rarityA = getInventoryItemRarity(a);
        const rarityB = getInventoryItemRarity(b);
        const rankA = getRarityRank(rarityA);
        const rankB = getRarityRank(rarityB);
        if (rankA !== rankB) {
          const cmp = rankA - rankB;
          return isDesc ? -cmp : cmp;
        }

        const cmpRarity = rarityA.localeCompare(rarityB, undefined, { sensitivity: "base" });
        if (cmpRarity !== 0) return cmpRarity;

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "value":
      sorted.sort((a: any, b: any) => {
        const rawValueA = (a as Record<string, unknown>)?.value;
        const rawValueB = (b as Record<string, unknown>)?.value;

        const hasA = typeof rawValueA === "number" && Number.isFinite(rawValueA);
        const hasB = typeof rawValueB === "number" && Number.isFinite(rawValueB);

        if (hasA && hasB && rawValueA !== rawValueB) {
          const cmp = (rawValueA as number) - (rawValueB as number);
          return isDesc ? -cmp : cmp;
        }
        if (hasA && !hasB) return isDesc ? -1 : 1;
        if (!hasA && hasB) return isDesc ? 1 : -1;

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "size":
      sorted.sort((a: any, b: any) => {
        const sizeA = getInventoryItemSizePercent(a);
        const sizeB = getInventoryItemSizePercent(b);

        const hasA = typeof sizeA === "number" && Number.isFinite(sizeA);
        const hasB = typeof sizeB === "number" && Number.isFinite(sizeB);

        if (hasA && hasB && sizeA !== sizeB) {
          const cmp = (sizeA as number) - (sizeB as number);
          return isDesc ? -cmp : cmp;
        }
        if (hasA && !hasB) return isDesc ? -1 : 1;
        if (!hasA && hasB) return isDesc ? 1 : -1;

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "mutations":
      sorted.sort((a: any, b: any) => {
        const mutationsA = getInventoryItemMutations(a);
        const mutationsB = getInventoryItemMutations(b);

        const countA = mutationsA.length;
        const countB = mutationsB.length;

        if (countA !== countB) {
          const cmp = countA - countB;
          return isDesc ? -cmp : cmp;
        }

        if (countA > 0 && countB > 0) {
          const labelA = mutationsA
            .slice()
            .sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base" }))
            .join("\u0000");
          const labelB = mutationsB
            .slice()
            .sort((x, y) => x.localeCompare(y, undefined, { sensitivity: "base" }))
            .join("\u0000");
          const cmp = labelA.localeCompare(labelB, undefined, { sensitivity: "base" });
          if (cmp !== 0) return cmp;
        }

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    case "strength":
      sorted.sort((a: any, b: any) => {
        const strengthA = getPetStrength(a);
        const strengthB = getPetStrength(b);

        const hasA = typeof strengthA === "number" && Number.isFinite(strengthA);
        const hasB = typeof strengthB === "number" && Number.isFinite(strengthB);

        if (hasA && hasB && strengthA !== strengthB) {
          const cmp = (strengthA as number) - (strengthB as number);
          return isDesc ? -cmp : cmp;
        }
        if (hasA && !hasB) return isDesc ? -1 : 1;
        if (!hasA && hasB) return isDesc ? 1 : -1;

        return compareByNameThenTypeThenId(a, b);
      });
      break;
    default:
      break;
  }

  return sorted;
}

async function logInventoryForFilters(
  filters: string[],
  sortKey?: SortKey,
  direction?: SortDirection,
  searchQuery?: string
): Promise<void> {
  try {
    const inventory = await Atoms.inventory.myInventory.get();
    if (!inventory || typeof inventory !== "object") {
      console.log("[InventorySorting] Inventaire introuvable pour le log des filtres.");
      return;
    }

    const items = Array.isArray((inventory as any).items) ? (inventory as any).items : [];
    const { filteredItems, keepAll, itemTypes } = filterInventoryItems(items, filters, searchQuery);
    const resolvedDirection: SortDirection = sortKey
      ? (direction && DIRECTION_ORDER.includes(direction) ? direction : DEFAULT_DIRECTION_BY_SORT_KEY[sortKey]) ?? 'asc'
      : direction && DIRECTION_ORDER.includes(direction)
      ? direction
      : 'asc';
    const itemsForLog = sortKey
      ? sortInventoryItems(filteredItems, sortKey, resolvedDirection)
      : filteredItems.slice();

    const descriptor = keepAll
      ? "toutes catégories"
      : `types: ${Array.from(itemTypes).join(", ") || "(aucun)"}`;
    const sortDescriptor = sortKey
      ? `tri: ${sortKey} (${resolvedDirection})`
      : "tri: (non spécifié)";
    const searchDescriptor = searchQuery ? `recherche: "${searchQuery}"` : "recherche: (vide)";
    console.log(
      `[InventorySorting] myInventory filtré (${descriptor}, ${sortDescriptor}, ${searchDescriptor}).`
    );
  } catch (error) {
    console.warn("[InventorySorting] Impossible de récupérer myInventory pour le log", error);
  }
}

function createDefaultApplySorting(
  cfg: InventorySortingConfig & Required<typeof DEFAULTS>
): (grid: Element, sortKey: SortKey, direction: SortDirection) => Promise<void> {
  const stateByGrid = new WeakMap<Element, InventoryDomSortState>();

  const ensureState = async (
    grid: Element,
    filters: string[],
    entries: InventoryDomEntry[],
    searchQuery: string
  ): Promise<InventoryDomSortState | null> => {
    const filtersKey = JSON.stringify({ filters });
    const state = stateByGrid.get(grid);

    // on calcule séparément pour éviter d'utiliser state quand il est undefined
    const hasAllBaseIndexes = entries.every((e) => readBaseIndex(e) != null);
    const searchChanged = state ? state.searchQuery !== searchQuery : false;
    const entryCountChanged = state ? state.entryCount !== entries.length : false;
    const filtersChanged = state ? state.filtersKey !== filtersKey : false;
    const baseLengthChanged = state ? state.baseItems.length !== entries.length : false;

    const needsRebuild =
      !state ||
      filtersChanged ||
      entryCountChanged ||
      baseLengthChanged ||
      !hasAllBaseIndexes ||
      searchChanged;

    // 🔒 Ici on ne touche à state que s'il existe ET qu'on ne reconstruit pas
    if (state && !needsRebuild) {
      state.entryByBaseIndex.clear();
      for (const entry of entries) {
        const baseIndex = readBaseIndex(entry);
        if (baseIndex != null) {
          state.entryByBaseIndex.set(baseIndex, entry);
        }
      }

      state.filtersKey = filtersKey;
      state.searchQuery = searchQuery;
      state.entryCount = entries.length;

      return state;
    }

    // sinon, on reconstruit
    try {
      const inventory = await Atoms.inventory.myInventory.get();
      if (!inventory || typeof inventory !== "object") {
        console.log("[InventorySorting] Inventaire introuvable pour le tri DOM.");
        return null;
      }

      const items = Array.isArray((inventory as any).items) ? (inventory as any).items : [];
      const { filteredItems } = filterInventoryItems(items, filters, searchQuery);

      if (filteredItems.length !== entries.length) {
        console.warn(
          `[InventorySorting] Nombre d'éléments filtrés (${filteredItems.length}) différent du DOM (${entries.length}). Réorganisation annulée.`
        );
        return null;
      }

      assignBaseIndexesToEntries(entries);

      const newState: InventoryDomSortState = {
        filtersKey,
        searchQuery,
        entryCount: entries.length,
        baseItems: filteredItems.slice(),
        entryByBaseIndex: new Map<number, InventoryDomEntry>(),
        lastSortKey: state?.lastSortKey ?? null,
      };

      entries.forEach((entry, index) => {
        newState.entryByBaseIndex.set(index, entry);
      });

      stateByGrid.set(grid, newState);
      return newState;
    } catch (error) {
      console.warn("[InventorySorting] Impossible de récupérer myInventory pour le tri DOM", error);
      return null;
    }
  };

  const rebaseStateToDomOrder = (
    state: InventoryDomSortState,
    entries: InventoryDomEntry[]
  ): boolean => {
    if (entries.length !== state.baseItems.length) return false;

    const reordered: any[] = [];
    const used = new Set<number>();

    for (const entry of entries) {
      const baseIndex = readBaseIndex(entry);
      if (baseIndex == null || baseIndex < 0 || baseIndex >= state.baseItems.length) {
        return false;
      }
      if (used.has(baseIndex)) {
        return false;
      }
      used.add(baseIndex);
      reordered.push(state.baseItems[baseIndex]);
    }

    if (reordered.length !== state.baseItems.length) return false;

    let changed = false;
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i] !== state.baseItems[i]) {
        changed = true;
        break;
      }
    }
    if (!changed) return false;

    state.baseItems = reordered;
    assignBaseIndexesToEntries(entries);
    state.entryByBaseIndex.clear();
    entries.forEach((entry, index) => {
      state.entryByBaseIndex.set(index, entry);
    });
    state.entryCount = entries.length;
    return true;
  };


  return async (grid: Element, sortKey: SortKey, direction: SortDirection) => {
    if (typeof document === "undefined") return;

    const container = getInventoryItemsContainer(grid);
    if (!container) return;

    const entries = getInventoryDomEntries(container);
    if (!entries.length) return;

    const filters = getActiveFiltersFromGrid(
      grid,
      cfg.checkboxSelector,
      cfg.checkboxLabelSelector
    );
    const searchQuery = getNormalizedInventorySearchQuery(grid);

    const state = await ensureState(grid, filters, entries, searchQuery);
    if (!state) return;

    const previousSortKey = state.lastSortKey;
    if ((!sortKey || sortKey === "none") && previousSortKey === "none") {
      rebaseStateToDomOrder(state, entries);
    }

    const baseIndexByItem = new Map<any, number>();
    state.baseItems.forEach((item, index) => {
      baseIndexByItem.set(item, index);
    });

    const effectiveDirection: SortDirection =
      direction && DIRECTION_ORDER.includes(direction)
        ? direction
        : DEFAULT_DIRECTION_BY_SORT_KEY[sortKey] ?? 'asc';
    const desiredItems =
      !sortKey || sortKey === "none"
        ? state.baseItems.slice()
        : sortInventoryItems(state.baseItems, sortKey, effectiveDirection);

    const desiredEntries: InventoryDomEntry[] = [];
    const usedEntries = new Set<InventoryDomEntry>();

    for (const item of desiredItems) {
      const baseIndex = baseIndexByItem.get(item);
      if (baseIndex == null) continue;
      const entry = state.entryByBaseIndex.get(baseIndex);
      if (!entry || usedEntries.has(entry)) continue;
      const value = getInventoryItemValue(item);
      updateInventoryCardValue(entry.card, value);
      updateInventoryCardStrengthText(entry.card, item);
      alignInventoryStrengthText(entry.card);
      desiredEntries.push(entry);
      usedEntries.add(entry);
    }

    if (desiredEntries.length !== entries.length) {
      console.warn(
        `[InventorySorting] Impossible de réordonner l'inventaire : correspondances insuffisantes (${desiredEntries.length}/${entries.length}).`
      );
      return;
    }

    const alreadyOrdered = desiredEntries.every(
      (entry, index) => entry.wrapper === entries[index]?.wrapper
    );

    if (!alreadyOrdered) {
      const fragment = document.createDocumentFragment();
      desiredEntries.forEach((entry) => {
        fragment.appendChild(entry.wrapper);
      });
      container.appendChild(fragment);
    }

    state.entryByBaseIndex.clear();
    desiredEntries.forEach((entry) => {
      const baseIndex = readBaseIndex(entry);
      if (baseIndex != null) {
        state.entryByBaseIndex.set(baseIndex, entry);
      }
    });
    state.lastSortKey = sortKey;
  };
}

// -------------------- Core helpers --------------------

/**
 * Récupère la liste des filtres actifs (texte du label).
 */
export function getActiveFiltersFromGrid(
  grid: Element,
  checkboxSelector: string,
  checkboxLabelSelector: string
): string[] {
  return Array.from(grid.querySelectorAll(checkboxSelector))
    .filter(labelIsChecked)
    .map((lbl) =>
      (lbl.querySelector(checkboxLabelSelector)?.textContent ?? '').trim()
    )
    .filter(Boolean);
}

/**
 * Calcule les options de tri à partir des filtres actifs (intersection logique).
 */
export function computeSortOptions(
  activeFilters: string[],
  labelByValue: Record<SortKey, string> = LABEL_BY_VALUE_DEFAULT,
  mapExtraByFilter: Readonly<Partial<Record<string, SortKey[]>>> = MAP_EXTRA_BY_FILTER_DEFAULT,
  searchQuery = ''
): SortOption[] {
  const normalizedFilters = activeFilters
    .map((value) => (value ?? '').trim().toLowerCase())
    .filter(Boolean);
  const normalizedSearch = normalize(searchQuery);

  const intersectSets = (sets: Array<Set<SortKey>>): Set<SortKey> | null => {
    if (!sets.length) return null;
    let intersection = new Set<SortKey>(sets[0]);
    for (let i = 1; i < sets.length; i++) {
      const current = sets[i];
      intersection = new Set([...intersection].filter((value) => current.has(value)));
    }
    return intersection;
  };

  const filterSets = normalizedFilters.map(
    (filterKey) => new Set<SortKey>([...BASE_SORT, ...getExtrasForFilterKey(filterKey, mapExtraByFilter)])
  );

  const detectedItemTypes = getCachedItemTypesForContext(activeFilters, normalizedSearch);
  const typeSets: Array<Set<SortKey>> = [];
  if (detectedItemTypes && detectedItemTypes.size) {
    detectedItemTypes.forEach((itemType) => {
      const extras = getExtrasForItemType(itemType, mapExtraByFilter);
      typeSets.push(new Set<SortKey>([...BASE_SORT, ...extras]));
    });
  }

  const allowedFromFilters = intersectSets(filterSets);
  const allowedFromTypes = intersectSets(typeSets);

  let allowed: Set<SortKey> | null = null;

  if (allowedFromFilters && allowedFromTypes) {
    allowed = new Set<SortKey>([...allowedFromFilters].filter((value) => allowedFromTypes.has(value)));
  } else if (allowedFromFilters) {
    allowed = new Set<SortKey>(allowedFromFilters);
  } else if (allowedFromTypes) {
    allowed = new Set<SortKey>(allowedFromTypes);
  }

  if (!allowed || !allowed.size) {
    allowed = new Set<SortKey>(BASE_SORT);
  }

  const values = ORDER.filter((value) => value === 'none' || allowed!.has(value));
  return values.map((value) => ({ value, label: labelByValue[value] || value }));
}


// -------------------- Styles (optionnels) --------------------

function isMacOsPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = nav.userAgentData?.platform || nav.platform || '';
  if (platform && /mac/i.test(platform)) {
    return true;
  }
  const userAgent = typeof nav.userAgent === 'string' ? nav.userAgent : '';
  return /mac os x/i.test(userAgent);
}

function shouldUseCustomSelectStyles(): boolean {
  return !isMacOsPlatform();
}

function injectDarkSelectStyles(id = 'inv-sort-dark-styles') {
  if (document.getElementById(id)) return;
  const css = `
    .tm-sort-select {
      color: #e7eef7 !important;
      background-color: rgba(17,17,17,0.98) !important;
      border: 1px solid rgba(255,255,255,0.25) !important;
      outline: none !important;
      -webkit-appearance: none;
      appearance: none;
      color-scheme: dark;
      padding-right: 28px !important;
    }
    .tm-sort-select:focus { box-shadow: 0 0 0 2px rgba(122,162,255,.35); }
    .tm-sort-select option { color: #e7eef7; background-color: #111; }
    .tm-sort-select option:checked { background-color: #222; }
    .tm-sort-select option:hover   { background-color: #1a1a1a; }
    .tm-select-wrap { position: relative; display: inline-flex; align-items: center; }
    .tm-select-arrow {
      position: absolute; right: 10px; top: 50%;
      transform: translateY(-50%);
      pointer-events: none; display: inline-flex; align-items: center; justify-content: center;
    }
    .tm-select-arrow svg { display: block; }
  `;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
}

// -------------------- UI factory --------------------

function createSortingBar(useCustomSelectStyles: boolean) {
  const wrap = document.createElement('div');
  wrap.className = 'tm-sort-wrap';
  Object.assign(wrap.style, {
    display: 'block',
    width: '100%',
    margin: '0',
    padding: '0',
    position: 'relative',
    flex: '0 0 auto',
    minHeight: '0',
    contain: 'layout style',
  } as CSSStyleDeclaration);

  const bar = document.createElement('div');
  bar.className = 'tm-sorting-bar';
  Object.assign(bar.style, {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    marginTop: '10px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(255,255,255,0.12)',
    width: '100%',
    boxSizing: 'border-box',
    position: 'relative',
    flex: '0 0 auto',
    height: 'auto',
    minHeight: '0',
    maxHeight: 'none',
    alignSelf: 'stretch',
  } as CSSStyleDeclaration);

  const label = document.createElement('span');
  label.textContent = 'Sort by:';
  Object.assign(label.style, { font: 'inherit', opacity: '0.8', flex: '0 0 auto' } as CSSStyleDeclaration);

  const selectWrap = document.createElement('div');
  selectWrap.className = 'tm-select-wrap';

  const select = document.createElement('select');
  select.className = 'tm-sort-select tm-sort-select--key';
  if (useCustomSelectStyles) {
    Object.assign(select.style, {
      padding: '6px 10px',
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '6px',
      background: 'rgba(17,17,17,0.98)',
      color: '#e7eef7',
      cursor: 'pointer',
      flex: '0 0 auto',
      width: 'auto',
      outline: 'none',
      appearance: 'none',
    } as CSSStyleDeclaration);
    select.style.setProperty('-webkit-appearance', 'none');
  }

  const arrow = document.createElement('span');
  arrow.className = 'tm-select-arrow';
  arrow.innerHTML = `
    <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
      <path d="M1 1l5 5 5-5" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  if (useCustomSelectStyles) {
    selectWrap.append(select, arrow);
  } else {
    selectWrap.append(select);
  }
  bar.append(label, selectWrap);

  const directionLabel = document.createElement('span');
  directionLabel.className = 'tm-direction-label';
  directionLabel.textContent = DEFAULT_DIRECTION_LABEL;
  Object.assign(directionLabel.style, {
    font: 'inherit',
    opacity: '0.8',
    flex: '0 0 auto',
  } as CSSStyleDeclaration);

  const directionWrap = document.createElement('div');
  directionWrap.className = 'tm-select-wrap';

  const directionSelect = document.createElement('select');
  directionSelect.className = 'tm-sort-select tm-direction-select';
  const canStyleDirectionSelect = useCustomSelectStyles && !isMacOsPlatform();
  if (canStyleDirectionSelect) {
    Object.assign(directionSelect.style, {
      padding: '6px 10px',
      border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: '6px',
      background: 'rgba(17,17,17,0.98)',
      color: '#e7eef7',
      cursor: 'pointer',
      flex: '0 0 auto',
      width: 'auto',
      outline: 'none',
      appearance: 'none',
    } as CSSStyleDeclaration);
    directionSelect.style.setProperty('-webkit-appearance', 'none');
  }

  const directionArrow = document.createElement('span');
  directionArrow.className = 'tm-select-arrow';
  directionArrow.innerHTML = `
    <svg width="12" height="8" viewBox="0 0 12 8" aria-hidden="true">
      <path d="M1 1l5 5 5-5" stroke="white" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  if (canStyleDirectionSelect) {
    directionWrap.append(directionSelect, directionArrow);
  } else {
    directionWrap.append(directionSelect);
  }
  bar.append(directionLabel, directionWrap);

  const divider = document.createElement('span');
  divider.className = 'tm-value-toggle__divider';
  Object.assign(divider.style, {
    alignSelf: 'stretch',
    width: '1px',
    minHeight: '24px',
    background: 'rgba(255,255,255,0.15)',
    flex: '0 0 auto',
    opacity: '0.5',
  } as CSSStyleDeclaration);

  const valueToggleLabel = document.createElement('label');
  valueToggleLabel.className = 'tm-value-toggle';
  Object.assign(valueToggleLabel.style, {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    font: 'inherit',
    opacity: '0.9',
    cursor: 'pointer',
    flex: '0 0 auto',
  } as CSSStyleDeclaration);

  const valueToggleControl = document.createElement('span');
  valueToggleControl.className = 'tm-value-toggle__control';
  Object.assign(valueToggleControl.style, {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '20px',
    flex: '0 0 auto',
  } as CSSStyleDeclaration);

  const valueToggleInput = document.createElement('input');
  valueToggleInput.type = 'checkbox';
  valueToggleInput.className = 'tm-value-toggle__checkbox';
  Object.assign(valueToggleInput.style, {
    position: 'absolute',
    inset: '0',
    margin: '0',
    opacity: '0',
    cursor: 'pointer',
  } as CSSStyleDeclaration);

  const switchTrack = document.createElement('span');
  switchTrack.className = 'tm-value-toggle__switch';
  Object.assign(switchTrack.style, {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    width: '100%',
    height: '100%',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.25)',
    transition: 'background 120ms ease',
    padding: '2px',
    boxSizing: 'border-box',
  } as CSSStyleDeclaration);

  const switchThumb = document.createElement('span');
  switchThumb.className = 'tm-value-toggle__thumb';
  Object.assign(switchThumb.style, {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#111',
    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
    transform: 'translateX(0)',
    transition: 'transform 120ms ease, background 120ms ease',
  } as CSSStyleDeclaration);

  switchTrack.appendChild(switchThumb);
  valueToggleControl.append(valueToggleInput, switchTrack);

  const valueToggleText = document.createElement('span');
  valueToggleText.className = 'tm-value-toggle__label';
  valueToggleText.textContent = 'Show values';
  Object.assign(valueToggleText.style, {
    font: 'inherit',
    color: 'inherit',
  } as CSSStyleDeclaration);

  valueToggleLabel.append(valueToggleControl, valueToggleText);

  const valueSummaryText = document.createElement('span');
  valueSummaryText.className = 'tm-value-toggle__summary';
  Object.assign(valueSummaryText.style, {
    font: 'inherit',
    color: 'var(--chakra-colors-Yellow-Magic, #F3D32B)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flex: '1 1 auto',
    whiteSpace: 'nowrap',
    marginLeft: 'auto',
    textAlign: 'right',
    gap: '0.25rem',
  } as CSSStyleDeclaration);

  setValueSummaryText(valueSummaryText, FILTERED_VALUE_LOADING);

  bar.append(divider, valueToggleLabel, valueSummaryText);

  const syncValueToggleVisual = (checked: boolean) => {
    switchTrack.style.background = checked
      ? 'var(--chakra-colors-Yellow-Magic, #F3D32B)'
      : 'rgba(255,255,255,0.25)';
    switchThumb.style.transform = checked ? 'translateX(16px)' : 'translateX(0)';
    valueToggleLabel.setAttribute('data-checked', checked ? 'true' : 'false');
    valueToggleLabel.setAttribute('role', 'switch');
    valueToggleLabel.setAttribute('aria-checked', checked ? 'true' : 'false');
  };

  valueToggleInput.addEventListener('change', () => {
    syncValueToggleVisual(valueToggleInput.checked);
  });

  (wrap as any).__syncValueToggle = syncValueToggleVisual;
  syncValueToggleVisual(valueToggleInput.checked);
  wrap.appendChild(bar);

  return {
    wrap,
    bar,
    select,
    directionSelect,
    directionLabel,
    valueToggleInput,
    valueToggleLabel,
    valueSummary: valueSummaryText,
  };
}

// -------------------- DOM wiring --------------------

function ensureSortingBar(
  grid: Element,
  cfg: Required<typeof DEFAULTS> & InventorySortingConfig,
  useCustomSelectStyles: boolean,
  labelByValue: Record<SortKey, string>,
  directionLabelText: string,
  onChange: (
    value: SortKey,
    direction: SortDirection,
    activeFilters: string[],
    searchQuery: string
  ) => void,
  showValues: boolean,
  onToggleValues: (visible: boolean) => void
) {
  void labelByValue;
  const filtersBlock = grid.querySelector(cfg.filtersBlockSelector);
  if (!filtersBlock) return null;

  // We no longer anchor to the close button, as the new UI places it
  // in a separate column. Always append as a full-width row at the end
  // of the filters block to avoid breaking layout.
  const closeBtn = null as unknown as Element | null;

  let wrap = filtersBlock.querySelector(':scope > .tm-sort-wrap') as HTMLElement | null;
  let select: HTMLSelectElement;
  let directionSelect: HTMLSelectElement;
  let directionLabelEl: HTMLSpanElement | null = null;
  let valueToggleInput: HTMLInputElement | null = null;
  let valueSummaryEl: HTMLSpanElement | null = null;

  if (!wrap) {
    const ui = createSortingBar(useCustomSelectStyles);
    wrap = ui.wrap;
    select = ui.select;
    directionSelect = ui.directionSelect;
    directionLabelEl = ui.directionLabel;
    valueToggleInput = ui.valueToggleInput;
    valueSummaryEl = ui.valueSummary;

    (wrap as any).__grid = grid;
    (wrap as any).__valueSummary = valueSummaryEl ?? null;

    // Make the bar span across grid columns in the filters block.
    (wrap.style as any).gridColumn = '1 / -1';
    filtersBlock.appendChild(wrap);

    if (directionLabelEl) {
      directionLabelEl.textContent = directionLabelText;
    }

    if (valueToggleInput) {
      valueToggleInput.checked = showValues;
      valueToggleInput.addEventListener('change', () => {
        const nextVisible = valueToggleInput ? valueToggleInput.checked : false;
        (wrap as any).__showValues = nextVisible;
        onToggleValues(nextVisible);
      });
    }

    select.addEventListener('change', () => {
      const value = select.value as SortKey;
      (wrap as any).__prevValue = value;
      const direction = (directionSelect?.value as SortDirection) || 'asc';
      const currentGrid = (wrap as any).__grid as Element | null;
      const activeFilters = currentGrid
        ? getActiveFiltersFromGrid(
            currentGrid,
            cfg.checkboxSelector,
            cfg.checkboxLabelSelector
          )
        : [];
      const searchQuery = getNormalizedInventorySearchQuery(currentGrid);
      console.log('[InventorySorting] Tri sélectionné :', value);
      void logInventoryForFilters(activeFilters, value, direction, searchQuery);
      onChange(value, direction, activeFilters, searchQuery);
    });

    directionSelect.addEventListener('change', () => {
      const direction = directionSelect.value as SortDirection;
      (wrap as any).__prevDirection = direction;
      const value = (select?.value as SortKey) || 'none';
      const currentGrid = (wrap as any).__grid as Element | null;
      const activeFilters = currentGrid
        ? getActiveFiltersFromGrid(
            currentGrid,
            cfg.checkboxSelector,
            cfg.checkboxLabelSelector
          )
        : [];
      const searchQuery = getNormalizedInventorySearchQuery(currentGrid);
      console.log('[InventorySorting] Ordre de tri sélectionné :', direction);
      void logInventoryForFilters(activeFilters, value, direction, searchQuery);
      onChange(value, direction, activeFilters, searchQuery);
    });
  } else {
    const maybeSelect = wrap.querySelector('select.tm-sort-select--key');
    const maybeDirectionSelect = wrap.querySelector('select.tm-direction-select');
    if (!maybeSelect || !maybeDirectionSelect) return null;
    select = maybeSelect as HTMLSelectElement;
    directionSelect = maybeDirectionSelect as HTMLSelectElement;
    directionLabelEl = wrap.querySelector('.tm-direction-label');
    valueToggleInput = wrap.querySelector('label.tm-value-toggle input[type="checkbox"]');
    valueSummaryEl = wrap.querySelector('.tm-value-toggle__summary');

    (wrap as any).__valueSummary = valueSummaryEl ?? null;

    if (directionLabelEl) {
      directionLabelEl.textContent = directionLabelText;
    }

    if (wrap.parentElement !== filtersBlock) {
      (wrap.style as any).gridColumn = '1 / -1';
      filtersBlock.appendChild(wrap);
    } else {
      // Ensure correct spanning each update
      (wrap.style as any).gridColumn = '1 / -1';
    }
  }

  if (valueToggleInput) {
    valueToggleInput.checked = showValues;
  }

  const syncValueToggle = (wrap as any).__syncValueToggle as
    | ((checked: boolean) => void)
    | undefined;
  if (syncValueToggle) {
    syncValueToggle(valueToggleInput?.checked ?? showValues);
  }

  (wrap as any).__grid = grid;
  (wrap as any).__showValues = valueToggleInput?.checked ?? showValues;

  return { wrap, select, directionSelect, valueToggleInput, valueSummary: valueSummaryEl };
}


function renderSelectOptions(
  select: HTMLSelectElement,
  options: SortOption[],
  prevValue: string | null
) {
  const prev = prevValue ?? select.value;
  select.innerHTML = '';
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }
  if (options.some((o) => o.value === 'none')) {
    select.value = 'none';
  }
  if (prev && options.some((o) => o.value === prev) && prev !== 'none') {
    select.value = prev;
  }
}

function renderDirectionOptions(
  select: HTMLSelectElement,
  labels: Record<SortDirection, string>,
  prevValue: SortDirection | null
) {
  const prev = prevValue ?? (select.value as SortDirection | undefined) ?? null;
  select.innerHTML = '';
  for (const value of DIRECTION_ORDER) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = labels[value] ?? value;
    select.appendChild(option);
  }

  if (prev && DIRECTION_ORDER.includes(prev)) {
    select.value = prev;
  } else {
    select.value = DIRECTION_ORDER[0];
  }
}

// -------------------- Public attach --------------------

export function attachInventorySorting(userConfig: Partial<InventorySortingConfig> = {}): InventorySortingController {
  const cfg: InventorySortingConfig & Required<typeof DEFAULTS> = {
    ...DEFAULTS,
    ...userConfig,
  };

  const mapExtraByFilter = { ...MAP_EXTRA_BY_FILTER_DEFAULT, ...(cfg.mapExtraByFilter || {}) };
  const labelByValue: Record<SortKey, string> = { ...LABEL_BY_VALUE_DEFAULT, ...(cfg.labelByValue || {}) };
  const directionLabelText = cfg.directionLabel ?? DEFAULT_DIRECTION_LABEL;
  const directionLabelByValue: Record<SortDirection, string> = {
    ...DIRECTION_LABELS_DEFAULT,
    ...(cfg.directionLabelByValue || {}),
  };
  const defaultDirectionBySortKey: Record<SortKey, SortDirection> = {
    ...DEFAULT_DIRECTION_BY_SORT_KEY,
    ...(cfg.defaultDirectionBySortKey || {}),
  };

  const useCustomSelectStyles = shouldUseCustomSelectStyles();

  if (cfg.injectDarkStyles && useCustomSelectStyles) injectDarkSelectStyles();

  const applySorting = cfg.applySorting ?? createDefaultApplySorting(cfg);

  let showInventoryValues = loadPersistedInventoryValueVisibility() ?? true;
  setShouldDisplayInventoryValues(showInventoryValues);

  let grid: Element | null = null;
  let currentWrap: HTMLElement | null = null;
  let currentSelect: HTMLSelectElement | null = null;
  let currentDirectionSelect: HTMLSelectElement | null = null;
  let currentValueToggle: HTMLInputElement | null = null;
  let stopValueSummaryListener: (() => void) | null = null;
  let lastLoggedFilters: string | null = null;
  let lastAppliedFiltersKey: string | null = null;
  let lastAppliedSortKey: SortKey | null = null;
  let lastAppliedDirection: SortDirection | null = null;
  let shouldEnsureInventoryValueWatcherOnNextVisible = true;
  let lastSortedDomSnapshot: InventoryDomSnapshot | null = null;
  let lastComputedFilterContextKey: string | null = null;
  let stopFilterContextListener: (() => void) | null = null;
  let lastRenderedInventoryEntryCount: number | null = null;
  let noiseObserver: MutationObserver | null = null;
  let noiseObserverContainer: HTMLElement | null = null;
  let lastPetHutchRoot: HTMLElement | null = null;
  let petHutchNeedsInit = true;

  const updateDomSnapshotForGrid = (target: Element | null) => {
    if (!target) {
      lastSortedDomSnapshot = null;
      return;
    }
    const container = getInventoryItemsContainer(target);
    if (!container) {
      lastSortedDomSnapshot = null;
      return;
    }
    const entries = getInventoryDomEntries(container);
    lastSortedDomSnapshot = createDomSnapshot(entries);
  };

  const applySortingWithSnapshot = (
    target: Element,
    sortKey: SortKey,
    direction: SortDirection
  ) =>
    Promise.resolve(applySorting(target, sortKey, direction)).then(() => {
      updateDomSnapshotForGrid(target);
    });

  const ensureNoiseObserver = () => {
    if (noiseObserver) return;
    noiseObserver = new MutationObserver(() => {
      if (noiseObserverContainer) {
        clearInventoryNoiseText(noiseObserverContainer);
      }
    });
  };

  const observeNoiseContainer = (container: HTMLElement | null) => {
    if (noiseObserverContainer === container) return;
    if (noiseObserver) {
      noiseObserver.disconnect();
    }
    noiseObserverContainer = container;
    if (!container) return;
    ensureNoiseObserver();
    noiseObserver?.observe(container, {
      subtree: true,
      childList: true,
      characterData: true,
    });
    clearInventoryNoiseText(container);
  };

  const obs = new MutationObserver((muts) => {
    const relevant = muts.some((m) =>
      m.type === 'attributes'
        ? ['data-checked', 'style', 'class', 'hidden', 'aria-hidden'].includes(m.attributeName || '')
        : m.type === 'childList'
    );
    if (relevant) refresh();
  });

  const setGrid = (next: Element | null) => {
    if (grid === next) return;
    obs.disconnect();
    grid = next;
    lastLoggedFilters = null;
    lastAppliedFiltersKey = null;
    lastAppliedSortKey = null;
    lastSortedDomSnapshot = null;
    lastComputedFilterContextKey = null;
    lastRenderedInventoryEntryCount = null;
    shouldEnsureInventoryValueWatcherOnNextVisible = true;
    if (!grid && stopValueSummaryListener) {
      stopValueSummaryListener();
      stopValueSummaryListener = null;
    }
    if (!grid && stopFilterContextListener) {
      stopFilterContextListener();
      stopFilterContextListener = null;
    }
    if (!grid) {
      observeNoiseContainer(null);
    }
    if (grid) {
      obs.observe(grid, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['data-checked', 'style', 'class', 'hidden', 'aria-hidden'],
      });
    }
  };

  const bodyObserver = new MutationObserver(() => {
    const hasCurrent = !!(grid && document.contains(grid));
    if (!hasCurrent && grid) {
      setGrid(null);
    }

    const current = hasCurrent ? grid : null;
    const next = document.querySelector(cfg.gridSelector);
    if (next !== current) {
      setGrid(next);
      if (next) {
        update();
      }
    }
    maybeInitPetHutch();
    refreshPetHutch();
  });

  const resolveGrid = (): Element | null => {
    if (grid && document.contains(grid)) return grid;
    const next = document.querySelector(cfg.gridSelector);
    if (next !== grid) {
      setGrid(next);
    }
    return grid && document.contains(grid) ? grid : null;
  };

  const applyCurrentSorting = () => {
    const targetGrid = resolveGrid();
    if (!targetGrid) return;
    const sortKey = (currentSelect?.value as SortKey) ?? 'none';
    const fallbackDirection =
      defaultDirectionBySortKey[sortKey] ?? DEFAULT_DIRECTION_BY_SORT_KEY[sortKey] ?? 'asc';
    const direction = (currentDirectionSelect?.value as SortDirection) ?? fallbackDirection;
    void applySortingWithSnapshot(targetGrid, sortKey, direction);
  };

  const update = () => {
    const targetGrid = resolveGrid();
    if (!targetGrid || !isVisible(targetGrid)) {
      shouldEnsureInventoryValueWatcherOnNextVisible = true;
      return;
    }

    setShouldDisplayInventoryValues(showInventoryValues);

    if (shouldEnsureInventoryValueWatcherOnNextVisible) {
      shouldEnsureInventoryValueWatcherOnNextVisible = false;
      void ensureInventoryValueWatcher().catch((error) => {
        console.warn(
          "[InventorySorting] Impossible d'initialiser la surveillance de la valeur de l'inventaire",
          error
        );
      });
    }

    const mount = ensureSortingBar(
      targetGrid,
      cfg,
      useCustomSelectStyles,
      labelByValue,
      directionLabelText,
      (value, direction, filters, searchQuery) => {
        lastAppliedSortKey = value;
        lastAppliedDirection = direction;
        const filtersKey = JSON.stringify({ filters: filters ?? [], search: searchQuery ?? '' });
        lastAppliedFiltersKey = filtersKey;
        persistSortKey(value);
        persistSortDirection(direction);
        cfg.onSortChange?.(value, direction);
        void applySortingWithSnapshot(targetGrid, value, direction);
      },
      showInventoryValues,
      (visible) => {
        showInventoryValues = visible;
        setShouldDisplayInventoryValues(visible);
        persistInventoryValueVisibility(visible);
        if (currentValueToggle) {
          currentValueToggle.checked = visible;
        }
        applyCurrentSorting();
      }
    );
    if (!mount) return;

    currentWrap = mount.wrap;
    currentSelect = mount.select;
    currentDirectionSelect = mount.directionSelect;
    currentValueToggle = mount.valueToggleInput ?? null;

    if (!stopValueSummaryListener) {
      stopValueSummaryListener = onInventoryValueChange(() => {
        const sourceGrid = resolveGrid();
        if (!sourceGrid || !currentWrap) return;
        const filtersForSummary = getActiveFiltersFromGrid(
          sourceGrid,
          cfg.checkboxSelector,
          cfg.checkboxLabelSelector
        );
        const searchForSummary = getNormalizedInventorySearchQuery(sourceGrid);
        void updateFilteredInventoryValueSummary(
          currentWrap,
          filtersForSummary,
          searchForSummary
        );
      });
    }

    const activeFilters = getActiveFiltersFromGrid(
      targetGrid,
      cfg.checkboxSelector,
      cfg.checkboxLabelSelector
    );
    const container = getInventoryItemsContainer(targetGrid);
    observeNoiseContainer(container);
    const currentEntries = container ? getInventoryDomEntries(container) : [];
    const inventoryEntryCountChanged =
      lastRenderedInventoryEntryCount === null ||
      lastRenderedInventoryEntryCount !== currentEntries.length;
    const shouldRenderSelectOptions =
      inventoryEntryCountChanged || !currentSelect?.options?.length;
    const shouldRenderDirectionOptions =
      inventoryEntryCountChanged || !currentDirectionSelect?.options?.length;
    const domChangedSinceLastSort = haveDomEntriesChanged(lastSortedDomSnapshot, currentEntries);
    const currentDomSnapshot = createDomSnapshot(currentEntries);
    const searchQueryForGrid = getNormalizedInventorySearchQuery(targetGrid);
    lastComputedFilterContextKey = createFilterContextKey(activeFilters, searchQueryForGrid);
    if (!stopFilterContextListener) {
      stopFilterContextListener = addFilterContextListener((contextKey) => {
        if (contextKey === lastComputedFilterContextKey) {
          setTimeout(refresh, 0);
        }
      });
    }
    void updateFilteredInventoryValueSummary(currentWrap, activeFilters, searchQueryForGrid);
    const serializedFilters = JSON.stringify({
      filters: activeFilters,
      search: searchQueryForGrid,
    });
    const filtersChanged = serializedFilters !== lastAppliedFiltersKey;
    if (serializedFilters !== lastLoggedFilters) {
      lastLoggedFilters = serializedFilters;
      console.log('[InventorySorting] Filtres actifs :', activeFilters);
      const currentSortKey = (currentSelect?.value as SortKey) ?? undefined;
      const currentDirection = (currentDirectionSelect?.value as SortDirection) ?? undefined;
      void logInventoryForFilters(
        activeFilters,
        currentSortKey,
        currentDirection,
        searchQueryForGrid
      );
    }
    const options = computeSortOptions(
      activeFilters,
      labelByValue,
      mapExtraByFilter,
      searchQueryForGrid
    );
    const wrapPrevValue =
      typeof (currentWrap as any).__prevValue === 'string'
        ? ((currentWrap as any).__prevValue as string)
        : null;
    const persistedSortKey = loadPersistedSortKey();
    const preferredValue =
      (wrapPrevValue && options.some((o) => o.value === wrapPrevValue) ? wrapPrevValue : null) ||
      (persistedSortKey && options.some((o) => o.value === persistedSortKey) ? persistedSortKey : null);

    if (shouldRenderSelectOptions) {
      renderSelectOptions(currentSelect, options, preferredValue);
      lastRenderedInventoryEntryCount = currentEntries.length;
    }
    (currentWrap as any).__prevValue = currentSelect.value;

    const appliedSortKey = currentSelect.value as SortKey;
    const wrapPrevDirection =
      typeof (currentWrap as any).__prevDirection === 'string'
        ? ((currentWrap as any).__prevDirection as SortDirection)
        : null;
    const persistedDirection = loadPersistedSortDirection();
    const fallbackDirection =
      defaultDirectionBySortKey[appliedSortKey] ?? DEFAULT_DIRECTION_BY_SORT_KEY[appliedSortKey] ?? 'asc';
    const preferredDirection =
      (wrapPrevDirection && DIRECTION_ORDER.includes(wrapPrevDirection) ? wrapPrevDirection : null) ||
      (persistedDirection && DIRECTION_ORDER.includes(persistedDirection) ? persistedDirection : null) ||
      fallbackDirection;

    let appliedDirection: SortDirection;
    if (currentDirectionSelect) {
      if (shouldRenderDirectionOptions) {
        renderDirectionOptions(currentDirectionSelect, directionLabelByValue, preferredDirection);
      }
      if (
        preferredDirection &&
        DIRECTION_ORDER.includes(preferredDirection) &&
        currentDirectionSelect.value !== preferredDirection
      ) {
        currentDirectionSelect.value = preferredDirection;
      }
      appliedDirection = currentDirectionSelect.value as SortDirection;
      if (!DIRECTION_ORDER.includes(appliedDirection)) {
        appliedDirection = fallbackDirection;
        currentDirectionSelect.value = fallbackDirection;
      }
      (currentWrap as any).__prevDirection = appliedDirection;
    } else {
      appliedDirection = fallbackDirection;
    }

    const sortChanged =
      appliedSortKey !== lastAppliedSortKey || appliedDirection !== lastAppliedDirection;
    const shouldApplySorting = sortChanged || domChangedSinceLastSort;

    if (shouldApplySorting) {
      lastAppliedSortKey = appliedSortKey;
      lastAppliedDirection = appliedDirection;
      lastAppliedFiltersKey = serializedFilters;
      persistSortKey(appliedSortKey);
      persistSortDirection(appliedDirection);
      cfg.onSortChange?.(appliedSortKey, appliedDirection);
      void applySortingWithSnapshot(targetGrid, appliedSortKey, appliedDirection);
    } else {
      if (filtersChanged) {
        lastAppliedFiltersKey = serializedFilters;
        console.log(
          '[InventorySorting] Filtres modifiés mais la liste DOM est inchangée, tri non réappliqué.'
        );
      }
      lastSortedDomSnapshot = currentDomSnapshot;
    }
  };

  const refresh = debounce(update, 120);
  const refreshPetHutch = debounce(() => {
    void updatePetHutchSections();
  }, 120);
  const maybeInitPetHutch = () => {
    const root = document.querySelector<HTMLElement>(PET_HUTCH_ROOT_SELECTOR);
    if (!root) {
      lastPetHutchRoot = null;
      petHutchNeedsInit = true;
      return;
    }
    if (root !== lastPetHutchRoot) {
      lastPetHutchRoot = root;
      petHutchNeedsInit = true;
    }
    if (!petHutchNeedsInit) return;
    void updatePetHutchSections({ hideDuringUpdate: true }).then((applied) => {
      if (applied) petHutchNeedsInit = false;
    });
  };

  const changeHandler = (e: Event) => {
    const target = e.target as Element | null;
    if (!target) return;
    const within = target.closest(cfg.gridSelector);
    const currentGrid = resolveGrid();

    if (
      e.type === 'input' &&
      target instanceof HTMLInputElement &&
      target.matches(INVENTORY_SEARCH_INPUT_SELECTOR) &&
      within &&
      within === currentGrid
    ) {
      console.log('[InventorySorting] Texte de recherche modifié :', target.value);
      const activeFilters = getActiveFiltersFromGrid(
        currentGrid,
        cfg.checkboxSelector,
        cfg.checkboxLabelSelector
      );
      const normalizedSearch = getNormalizedInventorySearchQuery(currentGrid);
      void logFilteredInventorySearchResults(currentGrid, activeFilters, normalizedSearch);
    }

    if (within && within === currentGrid) {
      setTimeout(refresh, 0);
    }
  };

  const startObservers = () => {
    const root = document.body || document.documentElement;
    if (root) {
      bodyObserver.observe(root, { childList: true, subtree: true });
    }
    setGrid(document.querySelector(cfg.gridSelector));
    document.addEventListener('change', changeHandler, true);
    document.addEventListener('input', changeHandler, true);
    update();
    maybeInitPetHutch();
    refreshPetHutch();
  };

  startObservers();

  return {
    destroy() {
      obs.disconnect();
      bodyObserver.disconnect();
      noiseObserver?.disconnect();
      noiseObserver = null;
      noiseObserverContainer = null;
      document.removeEventListener('change', changeHandler, true);
      document.removeEventListener('input', changeHandler, true);
      if (stopValueSummaryListener) {
        stopValueSummaryListener();
        stopValueSummaryListener = null;
      }
      if (stopFilterContextListener) {
        stopFilterContextListener();
        stopFilterContextListener = null;
      }
      if (currentWrap && currentWrap.parentElement) {
        currentWrap.parentElement.removeChild(currentWrap);
      }
      currentWrap = null;
      currentSelect = null;
      currentDirectionSelect = null;
      currentValueToggle = null;
      grid = null;
      lastLoggedFilters = null;
      lastAppliedFiltersKey = null;
      lastAppliedSortKey = null;
      lastAppliedDirection = null;
      shouldEnsureInventoryValueWatcherOnNextVisible = true;
      lastSortedDomSnapshot = null;
    },
    update,
    getActiveFilters() {
      const targetGrid = resolveGrid();
      if (!targetGrid) return [];
      return getActiveFiltersFromGrid(targetGrid, cfg.checkboxSelector, cfg.checkboxLabelSelector);
    },
    getCurrentSortKey() {
      return (currentSelect?.value as SortKey) ?? null;
    },
    getCurrentSortDirection() {
      return (currentDirectionSelect?.value as SortDirection) ?? null;
    },
    setSortKey(k: SortKey) {
      if (!currentSelect) return;
      currentSelect.value = k;
      (currentWrap as any).__prevValue = k;
      const targetGrid = resolveGrid();
      if (targetGrid) {
        const filtersForLog = getActiveFiltersFromGrid(
          targetGrid,
          cfg.checkboxSelector,
          cfg.checkboxLabelSelector
        );
        const searchQuery = getNormalizedInventorySearchQuery(targetGrid);
        const filtersKey = JSON.stringify({ filters: filtersForLog, search: searchQuery });
        console.log('[InventorySorting] Tri sélectionné (programmatique) :', k);
        const directionToApply = (currentDirectionSelect?.value as SortDirection) ??
          defaultDirectionBySortKey[k] ??
          DEFAULT_DIRECTION_BY_SORT_KEY[k] ??
          'asc';
        if (currentDirectionSelect) {
          currentDirectionSelect.value = directionToApply;
          (currentWrap as any).__prevDirection = directionToApply;
        }
        void logInventoryForFilters(filtersForLog, k, directionToApply, searchQuery);
        lastAppliedFiltersKey = filtersKey;
        lastAppliedSortKey = k;
        lastAppliedDirection = directionToApply;
        persistSortKey(k);
        persistSortDirection(directionToApply);
        cfg.onSortChange?.(k, directionToApply);
        setShouldDisplayInventoryValues(showInventoryValues);
        void applySortingWithSnapshot(targetGrid, k, directionToApply);
      }
    },
    setSortDirection(direction: SortDirection) {
      if (!currentDirectionSelect) return;
      currentDirectionSelect.value = direction;
      (currentWrap as any).__prevDirection = direction;
      const targetGrid = resolveGrid();
      const sortKey = (currentSelect?.value as SortKey) ?? 'none';
      if (targetGrid) {
        const filtersForLog = getActiveFiltersFromGrid(
          targetGrid,
          cfg.checkboxSelector,
          cfg.checkboxLabelSelector
        );
        const searchQuery = getNormalizedInventorySearchQuery(targetGrid);
        const filtersKey = JSON.stringify({ filters: filtersForLog, search: searchQuery });
        console.log('[InventorySorting] Ordre de tri sélectionné (programmatique) :', direction);
        void logInventoryForFilters(filtersForLog, sortKey, direction, searchQuery);
        lastAppliedFiltersKey = filtersKey;
        lastAppliedSortKey = sortKey;
        lastAppliedDirection = direction;
        persistSortKey(sortKey);
        persistSortDirection(direction);
        cfg.onSortChange?.(sortKey, direction);
        setShouldDisplayInventoryValues(showInventoryValues);
        void applySortingWithSnapshot(targetGrid, sortKey, direction);
      }
    },
    getSortOptions() {
      const targetGrid = resolveGrid();
      const filters = targetGrid
        ? getActiveFiltersFromGrid(targetGrid, cfg.checkboxSelector, cfg.checkboxLabelSelector)
        : [];
      const search = getNormalizedInventorySearchQuery(targetGrid);
      return computeSortOptions(filters, labelByValue, mapExtraByFilter, search);
    },
    getGrid() {
      return resolveGrid();
    },
  };
}

// -------------------- Convenience named helpers --------------------

export interface StartInventorySortingOptions
  extends Partial<InventorySortingConfig> {
  waitForGrid?: boolean;
  log?: boolean | ((...args: unknown[]) => void);
}

export interface InventorySortingObserverHandle {
  stop(): void;
  refresh(): void;
  getController(): InventorySortingController | null;
}

export function startInventorySortingObserver(
  options: StartInventorySortingOptions = {}
): InventorySortingObserverHandle {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      stop() {},
      refresh() {},
      getController() {
        return null;
      },
    };
  }

  const { waitForGrid = true, log, ...config } = options;
  const cfg = config as Partial<InventorySortingConfig>;
  let controller: InventorySortingController | null = null;
  let observer: MutationObserver | null = null;
  let readyListener: (() => void) | null = null;

  const logger: (...args: unknown[]) => void =
    typeof log === 'function'
      ? log
      : log
      ? (...args: unknown[]) => console.debug('[InventorySorting]', ...args)
      : () => {};

  const attachIfPossible = () => {
    if (controller) return controller;
    if (waitForGrid) {
      const selector = cfg.gridSelector ?? DEFAULTS.gridSelector;
      const hasGrid = !!document.querySelector(selector);
      const hasHutch = !!document.querySelector(PET_HUTCH_ROOT_SELECTOR);
      if (!hasGrid && !hasHutch) {
        return null;
      }
    }
    controller = attachInventorySorting(cfg);
    logger('attached');
    return controller;
  };

  const ensureObserver = () => {
    if (controller || observer || !waitForGrid) return;
    const target = document.body || document.documentElement;
    if (!target) return;
    observer = new MutationObserver(() => {
      if (attachIfPossible()) {
        observer?.disconnect();
        observer = null;
        logger('attached via mutation');
      }
    });
    observer.observe(target, { childList: true, subtree: true });
  };

  const start = () => {
    if (!attachIfPossible()) {
      ensureObserver();
    }
  };

  if (document.readyState === 'loading') {
    readyListener = () => {
      readyListener = null;
      start();
    };
    document.addEventListener('DOMContentLoaded', readyListener, { once: true });
  } else {
    start();
  }

  return {
    stop() {
      if (readyListener) {
        document.removeEventListener('DOMContentLoaded', readyListener);
        readyListener = null;
      }
      observer?.disconnect();
      observer = null;
      controller?.destroy();
      controller = null;
    },
    refresh() {
      if (controller) {
        controller.update();
      } else {
        start();
      }
    },
    getController() {
      return controller;
    },
  };
}

/** Helper simple pour récupérer les filtres actifs depuis un conteneur spécifique. */
export function getActiveFilters(container: Element, config?: Partial<Pick<
  InventorySortingConfig, 'checkboxSelector' | 'checkboxLabelSelector'
>>) {
  const checkboxSelector = config?.checkboxSelector ?? DEFAULTS.checkboxSelector;
  const checkboxLabelSelector = config?.checkboxLabelSelector ?? DEFAULTS.checkboxLabelSelector;
  return getActiveFiltersFromGrid(container, checkboxSelector, checkboxLabelSelector);
}

/** Renvoie un mapping labels i18n par défaut (pratique si tu veux cloner et modifier). */
export function defaultSortLabels(): Record<SortKey, string> {
  return { ...LABEL_BY_VALUE_DEFAULT };
}

/** Mapping extra par filtre par défaut (modifiable côté appelant). */
export function defaultMapExtraByFilter(): Record<FilterKey, SortKey[]> {
  return { ...MAP_EXTRA_BY_FILTER_DEFAULT };
}
