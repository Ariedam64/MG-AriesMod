import { Atoms } from "../store/atoms";
import {
  decorCatalog,
  eggCatalog,
  plantCatalog,
  toolCatalog,
} from "../data";
import type { Unsubscribe } from "../store/api";
import { getPetInfo } from "./petCalcul";
import { estimateProduceValue, valueFromInventoryProduce } from "./calculators";
import type { InventoryProduce } from "./calculators";

export type InventoryValueLogKey = "seeds" | "tools" | "eggs" | "decors";

export interface PetInventoryValueEntry {
  id: string | null;
  name: string | null;
  petSpecies: string | null;
  value: number | null;
  strength: number | null;
  maxStrength: number | null;
  coinMultiplier: number | null;
}

export interface PetInventoryValueSummary {
  totalValue: number;
  pets: PetInventoryValueEntry[];
}

export interface PlantSlotInventoryValueEntry {
  species: string | null;
  targetScale: number | null;
  mutations: string[];
  value: number | null;
}

export interface PlantInventoryValueEntry {
  id: string | null;
  species: string | null;
  plantedAt: number | null;
  maturedAt: number | null;
  value: number;
  slots: PlantSlotInventoryValueEntry[];
}

export interface PlantInventoryValueSummary {
  totalValue: number;
  playersInRoom: number | null;
  plants: PlantInventoryValueEntry[];
}

export interface CropInventoryValueEntry {
  id: string | null;
  species: string | null;
  scale: number | null;
  mutations: string[];
  value: number | null;
}

export interface CropInventoryValueSummary {
  totalValue: number;
  crops: CropInventoryValueEntry[];
}

export type InventoryValueLogEntry = {
  quantity: number | null;
  coinPrice: number | null;
  value: number | null;
} & (
  | { species: string | null }
  | { toolId: string | null }
  | { eggId: string | null }
  | { decorId: string | null }
);

export interface InventoryValueLogSummary {
  totalValue: number;
  items: InventoryValueLogEntry[];
}

export interface InventoryValueSnapshot {
  pets: PetInventoryValueSummary;
  plants: PlantInventoryValueSummary;
  crops: CropInventoryValueSummary;
  misc: Record<InventoryValueLogKey, InventoryValueLogSummary>;
}

interface InventoryValueCategoryConfig<IdentifierKey extends string> {
  itemType: string;
  identifierKey: IdentifierKey;
  resolveCoinPrice: (identifier: string | null) => number | null;
  logKey: InventoryValueLogKey;
  emptyLogMessage: string;
  createEntry(
    identifier: string | null,
    quantity: number | null,
    coinPrice: number | null,
    value: number | null
  ): InventoryValueLogEntry;
}

const INVENTORY_VALUE_CATEGORIES: InventoryValueCategoryConfig<any>[] = [
  {
    itemType: "Seed",
    identifierKey: "species",
    resolveCoinPrice: (identifier: string | null) => {
      if (!identifier) return null;
      const entry = (plantCatalog as Record<string, any>)[identifier];
      const price = entry?.seed?.coinPrice;
      return getFiniteNumber(price);
    },
    logKey: "seeds",
    emptyLogMessage:
      "[InventorySorting] Aucune seed trouvée dans l'inventaire pour le calcul de valeur.",
    createEntry: (identifier, quantity, coinPrice, value) => ({
      species: identifier,
      quantity,
      coinPrice,
      value,
    }),
  },
  {
    itemType: "Tool",
    identifierKey: "toolId",
    resolveCoinPrice: (identifier: string | null) => {
      if (!identifier) return null;
      const entry = (toolCatalog as Record<string, any>)[identifier];
      const price = entry?.coinPrice;
      return getFiniteNumber(price);
    },
    logKey: "tools",
    emptyLogMessage:
      "[InventorySorting] Aucun tool trouvé dans l'inventaire pour le calcul de valeur.",
    createEntry: (identifier, quantity, coinPrice, value) => ({
      toolId: identifier,
      quantity,
      coinPrice,
      value,
    }),
  },
  {
    itemType: "Egg",
    identifierKey: "eggId",
    resolveCoinPrice: (identifier: string | null) => {
      if (!identifier) return null;
      const entry = (eggCatalog as Record<string, any>)[identifier];
      const price = entry?.coinPrice;
      return getFiniteNumber(price);
    },
    logKey: "eggs",
    emptyLogMessage:
      "[InventorySorting] Aucun egg trouvé dans l'inventaire pour le calcul de valeur.",
    createEntry: (identifier, quantity, coinPrice, value) => ({
      eggId: identifier,
      quantity,
      coinPrice,
      value,
    }),
  },
  {
    itemType: "Decor",
    identifierKey: "decorId",
    resolveCoinPrice: (identifier: string | null) => {
      if (!identifier) return null;
      const entry = (decorCatalog as Record<string, any>)[identifier];
      const price = entry?.coinPrice;
      return getFiniteNumber(price);
    },
    logKey: "decors",
    emptyLogMessage:
      "[InventorySorting] Aucun decor trouvé dans l'inventaire pour le calcul de valeur.",
    createEntry: (identifier, quantity, coinPrice, value) => ({
      decorId: identifier,
      quantity,
      coinPrice,
      value,
    }),
  },
];

let currentSnapshot: InventoryValueSnapshot | null = null;
let watcherPromise: Promise<void> | null = null;
let unsubscribe: Unsubscribe | null = null;
let computeCounter = 0;
const listeners = new Set<(snapshot: InventoryValueSnapshot | null) => void>();

function getFiniteNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function extractItems(inventory: any): any[] | null {
  if (!inventory || typeof inventory !== "object") return null;
  const items = (inventory as any).items;
  if (!Array.isArray(items)) return [];
  return items;
}

function toNormalizedIdentifier(raw: unknown): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? String(raw) : null;
  }
  return null;
}

function getInventoryValueCategoryByItemType(
  itemType: string
): InventoryValueCategoryConfig<any> | undefined {
  return INVENTORY_VALUE_CATEGORIES.find((config) => config.itemType === itemType);
}

export interface InventoryItemValueContext {
  playersInRoom?: number | null;
}

export function computeInventoryItemValue(
  item: any,
  context: InventoryItemValueContext = {}
): number | null {
  if (!item || typeof item !== "object") return null;

  const rawType = typeof item?.itemType === "string" ? item.itemType.trim() : "";
  if (!rawType) return null;

  switch (rawType) {
    case "Pet": {
      const info = getPetInfo(item);
      const value = info.value;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    case "Plant": {
      const slots = Array.isArray(item?.slots) ? item.slots : [];
      const playersInRoom = context.playersInRoom ?? undefined;
      let total = 0;

      for (const slot of slots) {
        const slotSpecies = typeof slot?.species === "string" ? slot.species : null;
        const rawTarget = slot?.targetScale;
        const target = Number.isFinite(rawTarget) ? (rawTarget as number) : Number(rawTarget);
        const targetScale = Number.isFinite(target) ? target : null;
        const mutations = Array.isArray(slot?.mutations)
          ? slot.mutations.filter((m: unknown): m is string => typeof m === "string")
          : [];

        if (!slotSpecies || targetScale == null) continue;

        const value = estimateProduceValue(slotSpecies, targetScale, mutations, {
          friendPlayers: playersInRoom,
        });

        if (typeof value === "number" && Number.isFinite(value)) {
          total += value;
        }
      }

      return total;
    }
    case "Produce": {
      const playersInRoom = context.playersInRoom ?? undefined;
      const value = valueFromInventoryProduce(item as InventoryProduce, undefined, playersInRoom);
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    default: {
      const category = getInventoryValueCategoryByItemType(rawType);
      if (!category) return null;

      const identifier = toNormalizedIdentifier(item?.[category.identifierKey]);
      const quantity = getFiniteNumber(item?.quantity);
      const coinPrice = category.resolveCoinPrice(identifier);

      if (quantity == null || coinPrice == null) return null;

      const value = coinPrice * quantity;
      return Number.isFinite(value) ? value : null;
    }
  }
}

function computePetValues(items: any[]): PetInventoryValueSummary {
  const pets = items.filter((item: any) => {
    const type = typeof item?.itemType === "string" ? item.itemType.trim() : "";
    return type === "Pet";
  });

  const entries: PetInventoryValueEntry[] = pets.map((pet: any) => {
    const info = getPetInfo(pet);
    const id = typeof pet?.id === "string" ? pet.id : null;
    const name = typeof pet?.name === "string" && pet.name.trim() ? pet.name : null;
    const species = typeof pet?.petSpecies === "string" ? pet.petSpecies : null;

    return {
      id,
      name,
      petSpecies: species,
      value: info.value,
      strength: info.strength,
      maxStrength: info.maxStrength,
      coinMultiplier: info.coinMultiplier,
    };
  });

  const totalValue = entries.reduce(
    (acc, entry) => acc + (Number.isFinite(entry.value) ? (entry.value as number) : 0),
    0
  );

  return { totalValue, pets: entries };
}

function computePlantValues(
  items: any[],
  playersInRoom: number | undefined
): PlantInventoryValueSummary {
  const plants = items.filter((item: any) => {
    const type = typeof item?.itemType === "string" ? item.itemType.trim() : "";
    return type === "Plant";
  });

  const entries: PlantInventoryValueEntry[] = plants.map((plant: any) => {
    const id = typeof plant?.id === "string" ? plant.id : null;
    const species = typeof plant?.species === "string" ? plant.species : null;
    const plantedAt = Number.isFinite(plant?.plantedAt) ? (plant.plantedAt as number) : null;
    const maturedAt = Number.isFinite(plant?.maturedAt) ? (plant.maturedAt as number) : null;
    const slots = Array.isArray(plant?.slots) ? plant.slots : [];

    const slotEntries: PlantSlotInventoryValueEntry[] = slots.map((slot: any) => {
      const slotSpecies = typeof slot?.species === "string" ? slot.species : null;
      const targetScaleRaw = slot?.targetScale;
      const targetScale = Number.isFinite(targetScaleRaw)
        ? (targetScaleRaw as number)
        : Number(targetScaleRaw);
      const scaleValue = Number.isFinite(targetScale) ? targetScale : null;
      const mutations = Array.isArray(slot?.mutations)
        ? slot.mutations.filter((m: unknown): m is string => typeof m === "string")
        : [];

      const value =
        slotSpecies && scaleValue != null
          ? estimateProduceValue(slotSpecies, scaleValue, mutations, {
              friendPlayers: playersInRoom,
            })
          : 0;

      return {
        species: slotSpecies,
        targetScale: scaleValue,
        mutations,
        value,
      };
    });

    const value = slotEntries.reduce(
      (acc: number, entry: PlantSlotInventoryValueEntry) =>
        acc + (Number.isFinite(entry.value) ? (entry.value as number) : 0),
      0
    );

    return {
      id,
      species,
      plantedAt,
      maturedAt,
      value,
      slots: slotEntries,
    };
  });

  const totalValue = entries.reduce(
    (acc: number, entry: PlantInventoryValueEntry) => acc + (Number.isFinite(entry.value) ? entry.value : 0),
    0
  );

  return {
    totalValue,
    playersInRoom: Number.isFinite(playersInRoom as number) ? (playersInRoom as number) : null,
    plants: entries,
  };
}

function computeCropValues(
  items: any[],
  playersInRoom: number | undefined
): CropInventoryValueSummary {
  const crops = items.filter((item: any) => {
    const type = typeof item?.itemType === "string" ? item.itemType.trim() : "";
    return type === "Produce";
  });

  const entries: CropInventoryValueEntry[] = crops.map((crop: any) => {
    const id = typeof crop?.id === "string" ? crop.id : null;
    const species = typeof crop?.species === "string" ? crop.species : null;
    const rawScale = crop?.scale;
    const scale = Number.isFinite(rawScale) ? (rawScale as number) : Number(rawScale);
    const scaleValue = Number.isFinite(scale) ? scale : null;
    const mutations = Array.isArray(crop?.mutations)
      ? crop.mutations.filter((m: unknown): m is string => typeof m === "string")
      : [];

    const value = valueFromInventoryProduce(crop as InventoryProduce, undefined, playersInRoom);

    return {
      id,
      species,
      scale: scaleValue,
      mutations,
      value,
    };
  });

  const totalValue = entries.reduce(
    (acc: number, entry: CropInventoryValueEntry) =>
      acc + (Number.isFinite(entry.value) ? (entry.value as number) : 0),
    0
  );

  return { totalValue, crops: entries };
}

function computeMiscValues(items: any[]): Record<InventoryValueLogKey, InventoryValueLogSummary> {
  const aggregated: Record<InventoryValueLogKey, InventoryValueLogSummary> = {
    seeds: { totalValue: 0, items: [] },
    tools: { totalValue: 0, items: [] },
    eggs: { totalValue: 0, items: [] },
    decors: { totalValue: 0, items: [] },
  };

  for (const config of INVENTORY_VALUE_CATEGORIES) {
    const filteredItems = items.filter((item: any) => {
      const type = typeof item?.itemType === "string" ? item.itemType.trim() : "";
      return type === config.itemType;
    });

    const entries: InventoryValueLogEntry[] = filteredItems.map((item: any) => {
      const rawIdentifier = item?.[config.identifierKey];
      const identifier = toNormalizedIdentifier(rawIdentifier);
      const rawQuantity = item?.quantity;
      const quantity = getFiniteNumber(rawQuantity);
      const coinPrice = config.resolveCoinPrice(identifier);
      const value = quantity != null && coinPrice != null ? coinPrice * quantity : null;
      return config.createEntry(identifier, quantity, coinPrice, value);
    });

    const totalValue = entries.reduce((acc: number, entry: InventoryValueLogEntry) => {
      const entryValue = (entry as { value?: number | null }).value;
      return typeof entryValue === "number" && Number.isFinite(entryValue)
        ? acc + entryValue
        : acc;
    }, 0);

    aggregated[config.logKey] = { totalValue, items: entries };
  }

  return aggregated;
}

async function resolvePlayersInRoom(): Promise<number | undefined> {
  try {
    const rawPlayers = await Atoms.server.numPlayers.get();
    return Number.isFinite(rawPlayers as number) ? (rawPlayers as number) : undefined;
  } catch {
    return undefined;
  }
}

async function computeSnapshotFromInventory(
  inventory: any
): Promise<InventoryValueSnapshot | null> {
  const items = extractItems(inventory);
  if (items === null) return null;

  const safeItems = items ?? [];
  const playersInRoom = await resolvePlayersInRoom();

  return {
    pets: computePetValues(safeItems),
    plants: computePlantValues(safeItems, playersInRoom),
    crops: computeCropValues(safeItems, playersInRoom),
    misc: computeMiscValues(safeItems),
  };
}

function notifyListeners(snapshot: InventoryValueSnapshot | null) {
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.warn("[InventoryValue] Listener error", error);
    }
  }
}

async function refreshSnapshot(nextInventory: any) {
  const computeId = ++computeCounter;
  try {
    const snapshot = await computeSnapshotFromInventory(nextInventory);
    if (computeId !== computeCounter) return;
    currentSnapshot = snapshot;
    notifyListeners(currentSnapshot);
  } catch (error) {
    if (computeId !== computeCounter) return;
    currentSnapshot = null;
    console.warn("[InventoryValue] Impossible de calculer la valeur de l'inventaire", error);
  }
}

export async function ensureInventoryValueWatcher(): Promise<void> {
  if (watcherPromise) return watcherPromise;

  watcherPromise = (async () => {
    try {
      const inventory = await Atoms.inventory.myInventory.get();
      await refreshSnapshot(inventory);
    } catch (error) {
      currentSnapshot = null;
      console.warn("[InventoryValue] Impossible de récupérer l'inventaire initial", error);
    }

    try {
      unsubscribe = await Atoms.inventory.myInventory.onChange((next) => {
        void refreshSnapshot(next);
      });
    } catch (error) {
      console.warn("[InventoryValue] Impossible de s'abonner à myInventory", error);
    }
  })();

  return watcherPromise;
}

export function getInventoryValueSnapshot(): InventoryValueSnapshot | null {
  return currentSnapshot;
}

export function onInventoryValueChange(
  listener: (snapshot: InventoryValueSnapshot | null) => void
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function stopInventoryValueWatcher(): void {
  watcherPromise = null;
  computeCounter++;
  if (unsubscribe) {
    try {
      unsubscribe();
    } catch (error) {
      console.warn("[InventoryValue] Impossible de stopper l'abonnement myInventory", error);
    }
    unsubscribe = null;
  }
}
