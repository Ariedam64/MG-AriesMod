import { petAbilities, petCatalog, weatherCatalog } from "../../data";
import { Emitter } from "../../lib/emitter";
import { readAriesPath, writeAriesPath } from "../../platform/storage";

/**
 * The player's lifetime stats (garden, shops, hatches, abilities, weathers),
 * kept in storage under `stats`. Every change is saved at once and pushed to
 * the listeners as a fresh copy.
 */

type GardenStats = {
  totalPlanted: number;
  totalHarvested: number;
  totalDestroyed: number;
  watercanUsed: number;
  waterTimeSavedMs: number;
};

type ShopStats = {
  seedsBought: number;
  decorBought: number;
  eggsBought: number;
  toolsBought: number;
  cropsSoldCount: number;
  cropsSoldValue: number;
  petsSoldCount: number;
  petsSoldValue: number;
};

type HatchedCounts = {
  normal: number;
  gold: number;
  rainbow: number;
};

type AbilityStats = {
  triggers: number;
  totalValue: number;
};

type WeatherStats = {
  triggers: number;
};

export type StatsSnapshot = {
  createdAt: number;
  garden: GardenStats;
  shops: ShopStats;
  pets: { hatchedByType: Record<string, HatchedCounts> };
  abilities: Record<string, AbilityStats>;
  weather: Record<string, WeatherStats>;
};

export type PetHatchRarity = keyof HatchedCounts;

const STORAGE_PATH = "stats";

/** Which stats count whole things; the others are sums (coins) and may have decimals. */
const GARDEN_INT_KEYS: Record<keyof GardenStats, boolean> = {
  totalPlanted: true,
  totalHarvested: true,
  totalDestroyed: true,
  watercanUsed: true,
  waterTimeSavedMs: true,
};

const SHOP_INT_KEYS: Record<keyof ShopStats, boolean> = {
  seedsBought: true,
  decorBought: true,
  eggsBought: true,
  toolsBought: true,
  cropsSoldCount: true,
  cropsSoldValue: false,
  petsSoldCount: true,
  petsSoldValue: false,
};

const ABILITY_INT_KEYS: Record<keyof AbilityStats, boolean> = {
  triggers: true,
  totalValue: false,
};

let memoryStore: StatsSnapshot | null = null;
const changed = new Emitter<StatsSnapshot>();

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** A finite value at or above zero, else `fallback`; floored when `integer`. */
function readCount(value: unknown, fallback: number, integer: boolean): number {
  const num = Number(value);
  const positive = Math.max(0, Number.isFinite(num) ? num : fallback);
  return integer ? Math.floor(positive) : positive;
}

const zeroHatched = (): HatchedCounts => ({ normal: 0, gold: 0, rainbow: 0 });

const cloneStats = (stats: StatsSnapshot): StatsSnapshot => ({
  createdAt: stats.createdAt,
  garden: { ...stats.garden },
  shops: { ...stats.shops },
  pets: {
    hatchedByType: Object.fromEntries(Object.entries(stats.pets.hatchedByType).map(([key, counts]) => [key, { ...counts }])),
  },
  abilities: Object.fromEntries(Object.entries(stats.abilities).map(([key, value]) => [key, { ...value }])),
  weather: Object.fromEntries(Object.entries(stats.weather).map(([key, value]) => [key, { ...value }])),
});

/** Older builds stored the stats wrapped in `{ snapshot: ... }`, sometimes several times. */
function unwrapNestedSnapshot(raw: unknown): unknown {
  let cur: unknown = raw;
  for (let guard = 0; guard < 10 && isRecord(cur) && isRecord(cur.snapshot); guard++) cur = cur.snapshot;
  return cur;
}

/** Zeroed stats, with an entry for every pet, ability and weather the catalogs know. */
function createDefaultStats(createdAt = Date.now()): StatsSnapshot {
  const hatchedByType: Record<string, HatchedCounts> = {};
  for (const species of Object.keys(petCatalog)) hatchedByType[species.toLowerCase()] = zeroHatched();

  const abilities: Record<string, AbilityStats> = {};
  for (const abilityId of Object.keys(petAbilities)) abilities[abilityId] = { triggers: 0, totalValue: 0 };

  const weather: Record<string, WeatherStats> = {};
  for (const key of Object.keys(weatherCatalog)) weather[key.toLowerCase()] = { triggers: 0 };

  const garden = Object.fromEntries(Object.keys(GARDEN_INT_KEYS).map((k) => [k, 0])) as GardenStats;
  const shops = Object.fromEntries(Object.keys(SHOP_INT_KEYS).map((k) => [k, 0])) as ShopStats;
  return { createdAt, garden, shops, pets: { hatchedByType }, abilities, weather };
}

/** Reads every known field of a stored group, keeping the defaults for the rest. */
function readGroup<T extends Record<string, number>>(raw: unknown, base: T, intKeys: Record<keyof T, boolean>): T {
  if (!isRecord(raw)) return base;
  const out = { ...base };
  for (const key of Object.keys(intKeys) as Array<keyof T & string>) {
    (out as Record<string, number>)[key] = readCount(raw[key], base[key], intKeys[key]);
  }
  return out;
}

/** Stored stats, repaired: every count a finite number at or above zero, keys in lower case where they should be. */
function normalizeStats(raw: unknown): StatsSnapshot {
  const now = Date.now();
  const base = createDefaultStats(now);
  if (!isRecord(raw)) return base;

  if (Object.prototype.hasOwnProperty.call(raw, "createdAt")) {
    const createdAt = Number(raw.createdAt);
    base.createdAt = Number.isFinite(createdAt) && createdAt > 0 ? Math.floor(createdAt) : now;
  }
  base.garden = readGroup(raw.garden, base.garden, GARDEN_INT_KEYS);
  base.shops = readGroup(raw.shops, base.shops, SHOP_INT_KEYS);

  if (isRecord(raw.pets) && isRecord(raw.pets.hatchedByType)) {
    for (const [key, counts] of Object.entries(raw.pets.hatchedByType)) {
      const species = key.toLowerCase();
      const fallback = base.pets.hatchedByType[species] ?? zeroHatched();
      base.pets.hatchedByType[species] = isRecord(counts)
        ? {
            normal: readCount(counts.normal, fallback.normal, true),
            gold: readCount(counts.gold, fallback.gold, true),
            rainbow: readCount(counts.rainbow, fallback.rainbow, true),
          }
        : { ...fallback };
    }
  }

  if (isRecord(raw.abilities)) {
    for (const [key, value] of Object.entries(raw.abilities)) {
      if (!isRecord(value)) continue;
      base.abilities[key] = {
        triggers: readCount(value.triggers, base.abilities[key]?.triggers ?? 0, true),
        totalValue: readCount(value.totalValue, base.abilities[key]?.totalValue ?? 0, false),
      };
    }
  }

  if (isRecord(raw.weather)) {
    for (const [key, value] of Object.entries(raw.weather)) {
      if (!isRecord(value)) continue;
      const weather = key.toLowerCase();
      base.weather[weather] = { triggers: readCount(value.triggers, base.weather[weather]?.triggers ?? 0, true) };
    }
  }

  return base;
}

function writeToStorage(stats: StatsSnapshot): StatsSnapshot {
  memoryStore = cloneStats(stats);
  writeAriesPath(STORAGE_PATH, memoryStore);
  return memoryStore;
}

function readFromStorage(): StatsSnapshot {
  if (memoryStore) return cloneStats(memoryStore);

  const stored = readAriesPath<unknown>(STORAGE_PATH);
  const raw = unwrapNestedSnapshot(stored);
  if (!raw) {
    const fresh = createDefaultStats();
    writeToStorage(fresh);
    return fresh;
  }
  const normalized = normalizeStats(raw);
  memoryStore = cloneStats(normalized);
  // Flatten a legacy `{ snapshot }` wrapper in storage.
  if (stored !== raw) writeAriesPath(STORAGE_PATH, memoryStore);
  return normalized;
}

/** `current + delta`, never below zero, floored for whole-number stats. */
function adjustValue(current: number, delta: number, integer: boolean): number {
  const a = Number(current);
  const b = Number(delta);
  const next = Math.max(0, (Number.isFinite(a) ? a : 0) + (Number.isFinite(b) ? b : 0));
  return integer ? Math.floor(next) : next;
}

function updateStats(mutator: (draft: StatsSnapshot) => void): StatsSnapshot {
  const current = readFromStorage();
  const draft = cloneStats(current);
  mutator(draft);
  if (JSON.stringify(current) === JSON.stringify(draft)) return current;
  const stored = writeToStorage(draft);
  changed.emit(cloneStats(stored));
  return stored;
}

function entryOf<T>(table: Record<string, T>, key: string, fresh: () => T): T {
  if (!table[key]) table[key] = fresh();
  return table[key];
}

export const StatsService = {
  getSnapshot(): StatsSnapshot {
    return readFromStorage();
  },

  update(mutator: (draft: StatsSnapshot) => void): StatsSnapshot {
    return updateStats(mutator);
  },

  incrementGardenStat(key: keyof GardenStats, amount = 1): StatsSnapshot {
    return updateStats((draft) => {
      draft.garden[key] = adjustValue(draft.garden[key], amount, GARDEN_INT_KEYS[key]);
    });
  },

  incrementShopStat(key: keyof ShopStats, amount = 1): StatsSnapshot {
    return updateStats((draft) => {
      draft.shops[key] = adjustValue(draft.shops[key], amount, SHOP_INT_KEYS[key]);
    });
  },

  incrementPetHatched(species: string, rarityKey: PetHatchRarity = "normal", amount = 1): StatsSnapshot {
    return updateStats((draft) => {
      const entry = entryOf(draft.pets.hatchedByType, species.toLowerCase(), zeroHatched);
      entry[rarityKey] = adjustValue(entry[rarityKey], amount, true);
    });
  },

  incrementAbilityStat(abilityId: string, key: keyof AbilityStats, amount = 1): StatsSnapshot {
    return updateStats((draft) => {
      const entry = entryOf(draft.abilities, abilityId, () => ({ triggers: 0, totalValue: 0 }));
      entry[key] = adjustValue(entry[key], amount, ABILITY_INT_KEYS[key]);
    });
  },

  incrementWeatherStat(weatherId: string, amount = 1): StatsSnapshot {
    return updateStats((draft) => {
      const entry = entryOf(draft.weather, weatherId.toLowerCase(), () => ({ triggers: 0 }));
      entry.triggers = adjustValue(entry.triggers, amount, true);
    });
  },

  subscribe(listener: (stats: StatsSnapshot) => void): () => void {
    return changed.on(listener);
  },
};
