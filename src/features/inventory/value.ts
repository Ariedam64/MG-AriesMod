// Coin value of one inventory item: a pet's sell value, a crop's or plant's
// price with the friend bonus, and catalog price times quantity for the rest.

import { Atoms } from "../../game/store/atoms";
import { Emitter } from "../../lib/emitter";
import { decorCatalog, eggCatalog, plantCatalog, toolCatalog } from "../../data";
import { getPetInfo } from "../../data/rules/petValue";
import { estimateProduceValue, valueFromInventoryProduce, type InventoryProduce } from "../../data/rules/cropValue";
import { readCropSize } from "../../data/rules/cropSize";

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function identifier(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim() || null;
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : null;
  return null;
}

/** Items priced at catalog `coinPrice` times quantity: the field holding their id, and their price. */
const PRICED_BY_QUANTITY: Record<string, { idField: string; coinPrice(id: string): unknown }> = {
  Seed: { idField: "species", coinPrice: (id) => (plantCatalog as Record<string, any>)[id]?.seed?.coinPrice },
  Tool: { idField: "toolId", coinPrice: (id) => (toolCatalog as Record<string, any>)[id]?.coinPrice },
  Egg: { idField: "eggId", coinPrice: (id) => (eggCatalog as Record<string, any>)[id]?.coinPrice },
  Decor: { idField: "decorId", coinPrice: (id) => (decorCatalog as Record<string, any>)[id]?.coinPrice },
};

const stringMutations = (slot: any): string[] =>
  Array.isArray(slot?.mutations) ? slot.mutations.filter((m: unknown): m is string => typeof m === "string") : [];

export interface InventoryItemValueContext {
  playersInRoom?: number | null;
}

export function computeInventoryItemValue(item: any, context: InventoryItemValueContext = {}): number | null {
  if (!item || typeof item !== "object") return null;
  const type = typeof item.itemType === "string" ? item.itemType.trim() : "";
  const playersInRoom = context.playersInRoom ?? undefined;

  switch (type) {
    case "":
      return null;
    case "Pet": {
      const value = getPetInfo(item).value;
      return typeof value === "number" && Number.isFinite(value) ? value : null;
    }
    case "Plant": {
      let total = 0;
      for (const slot of Array.isArray(item.slots) ? item.slots : []) {
        const species = typeof slot?.species === "string" ? slot.species : null;
        const size = readCropSize(slot);
        if (!species || size == null) continue;
        const value = estimateProduceValue(species, size, stringMutations(slot), { friendPlayers: playersInRoom });
        if (Number.isFinite(value)) total += value;
      }
      return total;
    }
    case "Produce": {
      const value = valueFromInventoryProduce(item as InventoryProduce, undefined, playersInRoom);
      return Number.isFinite(value) ? value : null;
    }
    default: {
      const priced = PRICED_BY_QUANTITY[type];
      if (!priced) return null;
      const id = identifier(item[priced.idField]);
      const quantity = finiteNumber(item.quantity);
      const coinPrice = id ? finiteNumber(priced.coinPrice(id)) : null;
      if (quantity == null || coinPrice == null) return null;
      const value = coinPrice * quantity;
      return Number.isFinite(value) ? value : null;
    }
  }
}

// The friend bonus the inventory badges use. It is read once, the first time
// the inventory shows, and kept for the session.
let playersInRoom: number | null = null;
let playersInRoomLoad: Promise<void> | null = null;
const playersInRoomLoaded = new Emitter<void>();

export const playersInRoomForValues = (): number | null => playersInRoom;

export const onPlayersInRoomLoaded = (listener: () => void) => playersInRoomLoaded.on(listener);

export function loadPlayersInRoomForValues(): Promise<void> {
  playersInRoomLoad ??= (async () => {
    try {
      const raw = await Atoms.server.numPlayers.get();
      playersInRoom = Number.isFinite(raw) ? raw : null;
    } catch {
      playersInRoom = null;
    }
    playersInRoomLoaded.emit();
  })();
  return playersInRoomLoad;
}
