// src/services/stats.ts
// Gestion de l'état des statistiques utilisateur et persistance dans localStorage.

import {
  petAbilities,
  petCatalog,
  rarity,
  weatherCatalog,
} from "../data";
import { readAriesPath, writeAriesPath } from "../utils/localStorage";

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

const WEATHER_INT_KEYS: Record<keyof WeatherStats, boolean> = {
  triggers: true,
};

let memoryStore: StatsSnapshot | null = null;
type StatsListener = (stats: StatsSnapshot) => void;
const listeners = new Set<StatsListener>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toNumber = (value: unknown, fallback = 0): number => {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return num;
};

const toPositiveNumber = (value: unknown, fallback = 0): number => {
  const num = toNumber(value, fallback);
  return Math.max(0, num);
};

const toPositiveInt = (value: unknown, fallback = 0): number => {
  const num = toPositiveNumber(value, fallback);
  return Math.floor(num);
};

const toPositiveTimestamp = (value: unknown, fallback: number): number => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.floor(num);
};

const cloneStats = (stats: StatsSnapshot): StatsSnapshot => ({
  createdAt: stats.createdAt,
  garden: { ...stats.garden },
  shops: { ...stats.shops },
  pets: {
    hatchedByType: Object.fromEntries(
      Object.entries(stats.pets.hatchedByType).map(([key, counts]) => [key, { ...counts }]),
    ),
  },
  abilities: Object.fromEntries(
    Object.entries(stats.abilities).map(([key, value]) => [key, { ...value }]),
  ),
  weather: Object.fromEntries(
    Object.entries(stats.weather).map(([key, value]) => [key, { ...value }]),
  ),
});

const unwrapMaybeNestedSnapshot = (raw: unknown): unknown => {
  let cur: unknown = raw;
  let guard = 0;
  while (guard++ < 10 && isRecord(cur) && "snapshot" in cur && isRecord((cur as any).snapshot)) {
    cur = (cur as any).snapshot;
  }
  return cur;
};

function createDefaultStats(createdAt = Date.now()): StatsSnapshot {
  const hatchedByType: Record<string, HatchedCounts> = {};
  for (const species of Object.keys(petCatalog)) {
    hatchedByType[species.toLowerCase()] = { normal: 0, gold: 0, rainbow: 0 };
  }

  const abilities: Record<string, AbilityStats> = {};
  for (const abilityId of Object.keys(petAbilities)) {
    abilities[abilityId] = { triggers: 0, totalValue: 0 };
  }

  const weather: Record<string, WeatherStats> = {};
  for (const key of Object.keys(weatherCatalog)) {
    weather[key.toLowerCase()] = { triggers: 0 };
  }

  return {
    createdAt,
    garden: {
      totalPlanted: 0,
      totalHarvested: 0,
      totalDestroyed: 0,
      watercanUsed: 0,
      waterTimeSavedMs: 0,
    },
    shops: {
      seedsBought: 0,
      decorBought: 0,
      eggsBought: 0,
      toolsBought: 0,
      cropsSoldCount: 0,
      cropsSoldValue: 0,
      petsSoldCount: 0,
      petsSoldValue: 0,
    },
    pets: { hatchedByType },
    abilities,
    weather,
  };
}

function normalizeHatchedCounts(value: unknown, fallback: HatchedCounts): HatchedCounts {
  if (!isRecord(value)) return { ...fallback };
  return {
    normal: toPositiveInt(value.normal, fallback.normal),
    gold: toPositiveInt(value.gold, fallback.gold),
    rainbow: toPositiveInt(value.rainbow, fallback.rainbow),
  };
}

function normalizeStats(raw: unknown): StatsSnapshot {
  const fallbackCreatedAt = Date.now();
  const base = createDefaultStats(fallbackCreatedAt);
  if (!isRecord(raw)) return base;

  if (Object.prototype.hasOwnProperty.call(raw, "createdAt")) {
    base.createdAt = toPositiveTimestamp(raw.createdAt, fallbackCreatedAt);
  }

  if (isRecord(raw.garden)) {
    base.garden = {
      totalPlanted: toPositiveInt(raw.garden.totalPlanted, base.garden.totalPlanted),
      totalHarvested: toPositiveInt(raw.garden.totalHarvested, base.garden.totalHarvested),
      totalDestroyed: toPositiveInt(raw.garden.totalDestroyed, base.garden.totalDestroyed),
      watercanUsed: toPositiveInt(raw.garden.watercanUsed, base.garden.watercanUsed),
      waterTimeSavedMs: toPositiveInt(raw.garden.waterTimeSavedMs, base.garden.waterTimeSavedMs),
    };
  }

  if (isRecord(raw.shops)) {
    base.shops = {
      seedsBought: toPositiveInt(raw.shops.seedsBought, base.shops.seedsBought),
      decorBought: toPositiveInt(raw.shops.decorBought, base.shops.decorBought),
      eggsBought: toPositiveInt(raw.shops.eggsBought, base.shops.eggsBought),
      toolsBought: toPositiveInt(raw.shops.toolsBought, base.shops.toolsBought),
      cropsSoldCount: toPositiveInt(raw.shops.cropsSoldCount, base.shops.cropsSoldCount),
      cropsSoldValue: toPositiveNumber(raw.shops.cropsSoldValue, base.shops.cropsSoldValue),
      petsSoldCount: toPositiveInt(raw.shops.petsSoldCount, base.shops.petsSoldCount),
      petsSoldValue: toPositiveNumber(raw.shops.petsSoldValue, base.shops.petsSoldValue),
    };
  }

  if (isRecord(raw.pets) && isRecord(raw.pets.hatchedByType)) {
    for (const [key, counts] of Object.entries(raw.pets.hatchedByType)) {
      if (typeof key !== "string") continue;
      const normalizedKey = key.toLowerCase();
      const fallback = base.pets.hatchedByType[normalizedKey] ?? { normal: 0, gold: 0, rainbow: 0 };
      base.pets.hatchedByType[normalizedKey] = normalizeHatchedCounts(counts, fallback);
    }
  }

  if (isRecord(raw.abilities)) {
    for (const [key, value] of Object.entries(raw.abilities)) {
      if (typeof key !== "string" || !isRecord(value)) continue;
      base.abilities[key] = {
        triggers: toPositiveInt(value.triggers, base.abilities[key]?.triggers ?? 0),
        totalValue: toPositiveNumber(value.totalValue, base.abilities[key]?.totalValue ?? 0),
      };
    }
  }

  if (isRecord(raw.weather)) {
    for (const [key, value] of Object.entries(raw.weather)) {
      if (typeof key !== "string" || !isRecord(value)) continue;
      const normalizedKey = key.toLowerCase();
      const fallback = base.weather[normalizedKey] ?? { triggers: 0 };
      base.weather[normalizedKey] = {
        triggers: toPositiveInt(value.triggers, fallback.triggers),
      };
    }
  }

  return base;
}

function readFromStorage(): StatsSnapshot {
  if (memoryStore) return cloneStats(memoryStore);

  const rawWrapped = readAriesPath<unknown>("stats");
  const raw = unwrapMaybeNestedSnapshot(rawWrapped);
  if (!raw) {
    const fresh = createDefaultStats();
    memoryStore = cloneStats(fresh);
    writeAriesPath("stats", memoryStore);
    return fresh;
  }
  const normalized = normalizeStats(raw);
  memoryStore = cloneStats(normalized);
  if (rawWrapped !== raw) {
    // Clean up legacy nested { snapshot: { ... } } structure by persisting the flattened payload.
    writeAriesPath("stats", memoryStore);
  }
  return normalized;
}

function emitUpdate(stats: StatsSnapshot) {
  const snapshot = cloneStats(stats);
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error("[StatsService] Listener error", error);
    }
  }
}

function writeToStorage(stats: StatsSnapshot): StatsSnapshot {
  const snapshot = cloneStats(stats);
  memoryStore = snapshot;
  writeAriesPath("stats", snapshot);
  return snapshot;
}

function adjustValue(current: number, delta: number, integer: boolean): number {
  const a = Number(current);
  const b = Number(delta);
  const sum = Number.isFinite(a) ? a : 0;
  const next = sum + (Number.isFinite(b) ? b : 0);
  const clamped = Math.max(0, next);
  return integer ? Math.floor(clamped) : clamped;
}

function updateStats(mutator: (draft: StatsSnapshot) => void): StatsSnapshot {
  const current = readFromStorage();
  const before = JSON.stringify(current);
  const draft = cloneStats(current);
  mutator(draft);
  const after = JSON.stringify(draft);
  if (before === after) return current;
  const stored = writeToStorage(draft);
  emitUpdate(stored);
  return stored;
}

function requireAbilityEntry(stats: StatsSnapshot, abilityId: string): AbilityStats {
  if (!stats.abilities[abilityId]) {
    stats.abilities[abilityId] = { triggers: 0, totalValue: 0 };
  }
  return stats.abilities[abilityId];
}

function requireWeatherEntry(stats: StatsSnapshot, weatherId: string): WeatherStats {
  const key = weatherId.toLowerCase();
  if (!stats.weather[key]) {
    stats.weather[key] = { triggers: 0 };
  }
  return stats.weather[key];
}

function requirePetEntry(stats: StatsSnapshot, species: string): HatchedCounts {
  const key = species.toLowerCase();
  if (!stats.pets.hatchedByType[key]) {
    stats.pets.hatchedByType[key] = { normal: 0, gold: 0, rainbow: 0 };
  }
  return stats.pets.hatchedByType[key];
}

export const StatsService = {
  storageKey: "stats",

  getSnapshot(): StatsSnapshot {
    return readFromStorage();
  },

  setSnapshot(snapshot: StatsSnapshot): StatsSnapshot {
    const normalized = normalizeStats(unwrapMaybeNestedSnapshot(snapshot));
    const stored = writeToStorage(normalized);
    emitUpdate(stored);
    return stored;
  },

  reset(): StatsSnapshot {
    const fresh = createDefaultStats();
    const stored = writeToStorage(fresh);
    emitUpdate(stored);
    return stored;
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
      const entry = requirePetEntry(draft, species);
      entry[rarityKey] = adjustValue(entry[rarityKey], amount, true);
    });
  },

  incrementAbilityStat(
    abilityId: string,
    key: keyof AbilityStats,
    amount = 1,
  ): StatsSnapshot {
    return updateStats((draft) => {
      const entry = requireAbilityEntry(draft, abilityId);
      entry[key] = adjustValue(entry[key], amount, ABILITY_INT_KEYS[key]);
    });
  },

  incrementWeatherStat(weatherId: string, key: keyof WeatherStats = "triggers", amount = 1): StatsSnapshot {
    return updateStats((draft) => {
      const entry = requireWeatherEntry(draft, weatherId);
      entry[key] = adjustValue(entry[key], amount, WEATHER_INT_KEYS[key]);
    });
  },

  subscribe(listener: StatsListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export const StatsDefaults = {
  rarityOrder: [
    rarity.Common,
    rarity.Uncommon,
    rarity.Rare,
    rarity.Legendary,
    rarity.Mythic,
    rarity.Divine,
    rarity.Celestial,
  ] as const,
  createEmpty(): StatsSnapshot {
    return createDefaultStats();
  },
};

