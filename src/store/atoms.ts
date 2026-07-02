// src/store/atoms.ts
import { makeAtom, makeView, HubEq } from "./hub";

/* ============================================================================
 * Types
 * ==========================================================================*/
export type XY = { x: number; y: number };

export type GardenState = {
  tileObjects: Record<string, any>;
  boardwalkTileObjects: Record<string, any>;
};

export type GardenWithBackfill = {
  garden?: GardenState | null;
  slotIndex?: number;
  [key: string]: any;
};

export type GardensWithBackfillsState = GardenWithBackfill[] | null;

export type PlantSlotTiming = {
  species: string;
  startTime: number;
  endTime: number;
  targetScale?: number;
  mutations?: string[];
};

export type PlantTimingDerived = {
  startTime?: number;
  endTime?: number;
  totalMs?: number;
  remainingMs?: number;
  progress: number;
  status: "growing" | "ready" | "unknown";
  species?: string;
  mutations: string[];
};

export type CurrentGardenObject =
  | {
      objectType: "plant";
      species: string;
      slots: PlantSlotTiming[];
      plantedAt?: number;
      maturedAt?: number;
    }
  | Record<string, unknown>
  | null;

export type PetSlot = {
  id: string;
  petSpecies: string;
  name?: string | null;
  xp?: number;
  hunger?: number;
  mutations?: string[];
  targetScale?: number;
  abilities?: string[];
};

export type ToolItem = {
    toolId: string,
    itemType: string,
    quantity: number
}

export type DecorItem = {
  decorId: string;
  itemType: "Decor";
  quantity: number;
};

export type PetInfo = { slot: PetSlot; position?: XY | null };
export type PetState = PetInfo[] | null;

export type CropItem = {
  id: string;
  species?: string;
  itemType?: string;
  scale?: number;
  mutations?: string[];
};
export type CropInventoryState = CropItem[] | null;

export type SeedItem = {
  species: string;
  itemType: "Seed";
  quantity: number;
};
export type SeedInventoryState = SeedItem[] | null;
export type ToolInventoryState = ToolItem[] | null;
export type DecorInventoryState = DecorItem[] | null;

export type AvatarTriggerAnimation = {
  playerId: string;
  animation: string;
};

/* ============================================================================
 * Root atoms
 * ==========================================================================*/
export const position = makeAtom<XY>("positionAtom");
export const state = makeAtom<any>("stateAtom");
export const map = makeAtom<any>("mapAtom");
export const player = makeAtom<any>("playerAtom")
export const action = makeAtom<any | null>("actionAtom")

export const myData = makeAtom<any>("myDataAtom");
export const myInventory = makeAtom<any>("myInventoryAtom");
export const gardensWithBackfills = makeAtom<GardensWithBackfillsState>("gardensWithBackfillsAtom");

export const myCropInventory = makeAtom<CropInventoryState>("myCropInventoryAtom");
export const mySeedInventory = makeAtom<SeedInventoryState>("mySeedInventoryAtom");
export const myToolInventory = makeAtom<ToolInventoryState>("myToolInventoryAtom");
export const myEggInventory = makeAtom<ToolInventoryState>("myEggInventoryAtom");
export const myDecorInventory = makeAtom<DecorInventoryState>("myDecorInventoryAtom");
export const mySeedSiloItems = makeAtom<SeedInventoryState>("mySeedSiloItemsAtom");
export const myDecorShedItems = makeAtom<DecorInventoryState>("myDecorShedItemsAtom");
export const myFeedingTroughItems = makeAtom<CropInventoryState>("myFeedingTroughItemsAtom");
export const myPetInfos = makeAtom<PetState>("myPetInfosAtom");
export const myPetSlotInfos = makeAtom<any>("myPetSlotInfosAtom");
export const myPrimitivePetSlots = makeAtom<any[]>("myPrimitivePetSlotsAtom");
export const myPetIdOnSameTile = makeAtom<string | null>("myPetIdOnSameTileAtom");
export const totalPetSellPrice = makeAtom<number>("totalPetSellPriceAtom")
export const myCropItemsToSell = makeAtom<any>("myCropItemsToSellAtom")
export const myPetHutchPetItems = makeAtom<any>("myPetHutchPetItemsAtom")
export const isMyInventoryAtMaxLength = makeAtom<any>("isMyInventoryAtMaxLengthAtom")
export const myNumPetHutchItems = makeAtom<any>("myNumPetHutchItemsAtom")
export const myPetHutchCapacitySlots = makeAtom<number>("myPetHutchCapacitySlotsAtom")

export const shops = makeView<any, any>("stateAtom", { path: "child.data.shops" });
export const myShopPurchases = makeView<any, any>("myDataAtom", { path: "shopPurchases" });

export const numPlayers = makeAtom<number>("numPlayersAtom");
export const totalCropSellPrice = makeAtom<number>("totalCropSellPriceAtom");

export const myValidatedSelectedItemIndex = makeAtom<number | null>("myValidatedSelectedItemIndexAtom");
export const setSelectedIndexToEnd = makeAtom<number | null>("setSelectedIndexToEndAtom");
export const mySelectedItemName = makeAtom<any>("mySelectedItemNameAtom");
export const mySelectedItemId = makeAtom<any>("mySelectedItemIdAtom");
export const myPossiblyNoLongerValidSelectedItemIndex = makeAtom<number | null>("myPossiblyNoLongerValidSelectedItemIndexAtom");

export const myCurrentGardenObject = makeAtom<CurrentGardenObject>("myCurrentGardenObjectAtom");
export const myCurrentSortedGrowSlotIndices = makeAtom<number[] | null>("myCurrentSortedGrowSlotIndicesAtom");
export const myCurrentGrowSlotIndex = makeAtom<number | null>("mySelectedSlotIdAtom");

export const myOwnCurrentGardenObject = makeAtom<any>("myOwnCurrentGardenObjectAtom")
export const isCurrentGrowSlotMature = makeAtom<any>("isCurrentGrowSlotMatureAtom")
export const myOwnCurrentDirtTileIndex = makeAtom<any>("myOwnCurrentDirtTileIndexAtom")
export const mySelectedItemRotation = makeAtom<any>("mySelectedItemRotationAtom")

export const weather = makeAtom<string | null>("weatherAtom")

export const activeModal = makeAtom<string | null>("activeModalAtom");
export const inventoryModalIsActive = makeAtom<boolean>("inventoryModalIsActiveAtom");
export const avatarTriggerAnimationAtom = makeAtom<AvatarTriggerAnimation | null>("avatarTriggerAnimationAtom")

export const friendBonusMultiplier = makeAtom<any>("friendBonusMultiplierAtom")

/* ============================================================================
 * Derived views
 * ==========================================================================*/
export const garden = makeView<any, GardenState | null>("myDataAtom", { path: "garden" });
export const gardenTileObjects = makeView<any, Record<string, any>>("myDataAtom", { path: "garden.tileObjects" });
export const favoriteIds = makeView<any, string[]>("myInventoryAtom", { path: "favoritedItemIds" });
export const playerId = makeView<any, string | null>("playerAtom", { path: "id" });
export const playerDatabaseUserId = makeView<any, string | null>("playerAtom", { path: "databaseUserId" });
export const myOwnCurrentGardenObjectType = makeView<any, string | null>("myOwnCurrentGardenObjectAtom", { path: "objectType" });

/* stateAtom sub-views (optionnel) */
export const stateChild = makeView<any, any>("stateAtom", { path: "child" });
export const stateChildData = makeView<any, any>("stateAtom", { path: "child.data" });
export const stateShops = makeView<any, any>("stateAtom", { path: "child.data.shops" });
export const stateUserSlots = makeView<any, any>("stateAtom", { path: "child.data.userSlots" });
export const statePlayers = makeView<any, any[] | undefined>("stateAtom", { path: "data.players" });
export const myActivityLog = makeView<any>("myDataAtom", { path: "activityLogs"});

/* Shops view (derived from stateAtom — shopsAtom removed from game) */
export const seedShop  = makeView<any, any>("stateAtom", { path: "child.data.shops.seed"  });
export const toolShop  = makeView<any, any>("stateAtom", { path: "child.data.shops.tool"  });
export const eggShop   = makeView<any, any>("stateAtom", { path: "child.data.shops.egg"   });
export const decorShop = makeView<any, any>("stateAtom", { path: "child.data.shops.decor" });

/* ============================================================================
 * Signatures / Channels de diff
 * ==========================================================================*/
function slotSig(o: any): string {
  if (!o) return "∅";
  return [
    o.objectType ?? o.type ?? "",
    o.species ?? o.seedSpecies ?? o.plantSpecies ?? o.eggId ?? o.decorId ?? "",
    o.plantedAt ?? o.startTime ?? 0,
    o.maturedAt ?? o.endTime ?? 0,
  ].join("|");
}

export const GardenSlotsSig = gardenTileObjects.asSignature<number>({
  mode: "record",
  key: (_item, key) => Number(key as string),
  sig: (item) => slotSig(item),
});

/** Signature "live" d’un pet (inclut xp/hunger/position -> bruyant) */
function activePetSig(p: PetInfo): string {
  const s = p?.slot ?? ({} as PetSlot);
  const muts = Array.isArray(s.mutations) ? s.mutations.slice().sort().join(",") : "";
  const ab = Array.isArray(s.abilities) ? s.abilities.slice().sort().join(",") : "";
  const name = s.name ?? "";
  const species = s.petSpecies ?? "";
  const xp = Number.isFinite(s.xp as number) ? Math.round(s.xp as number) : 0;
  const hunger = Number.isFinite(s.hunger as number) ? Math.round((s.hunger as number) * 1000) : 0;
  const scale = Number.isFinite(s.targetScale as number) ? Math.round((s.targetScale as number) * 1000) : 0;
  const x = Number.isFinite(p?.position?.x as number) ? Math.round(p!.position!.x as number) : 0;
  const y = Number.isFinite(p?.position?.y as number) ? Math.round(p!.position!.y as number) : 0;
  return `${species}|${name}|xp:${xp}|hg:${hunger}|sc:${scale}|m:${muts}|a:${ab}|pos:${x},${y}`;
}

/** Signature STABLE (ignore xp/hunger/position) -> idéale pour l’UI Manager */
function activePetStableSig(p: PetInfo): string {
  const s = p?.slot ?? ({} as PetSlot);
  const muts = Array.isArray(s.mutations) ? s.mutations.slice().sort().join(",") : "";
  const ab = Array.isArray(s.abilities) ? s.abilities.slice().sort().join(",") : "";
  const name = s.name ?? "";
  const species = s.petSpecies ?? "";
  const scale = Number.isFinite(s.targetScale as number) ? Math.round((s.targetScale as number) * 1000) : 0;
  return `${species}|${name}|sc:${scale}|m:${muts}|a:${ab}`;
}

export const PetsByIdSig = myPetInfos.asSignature<string>({
  mode: "array",
  key: (p) => String(p?.slot?.id ?? ""),
  sig: (p) => activePetSig(p as PetInfo),
});

export const PetsByIdStableSig = myPetInfos.asSignature<string>({
  mode: "array",
  key: (p) => String(p?.slot?.id ?? ""),
  sig: (p) => activePetStableSig(p as PetInfo),
});

export const FavoriteIdsSig = favoriteIds.asSignature<string>({
  mode: "array",
  key: (id) => String(id),
  sig: () => "1",
});

/* ============================================================================
 * Abilities triggers (flatten)
 * ==========================================================================*/
export type PetAbilityTrigger =
  | {
      petId: string;
      abilityId: string | null;
      performedAt: number | null;
      data: any;
      position?: XY | null;
    }
  | null;
type TriggersByPet = Record<string, PetAbilityTrigger>;

function _abilitySig(a: any): string {
  if (!a) return "null";
  const id = typeof a?.abilityId === "string" ? a.abilityId : "";
  const ts = Number.isFinite(a?.performedAt) ? String(a.performedAt) : "";
  let data = "";
  try {
    data = JSON.stringify(a?.data ?? null);
  } catch {
    data = "";
  }
  return `${id}|${ts}|${data}`;
}

function _extractAbilityTriggers(obj: any): { value: TriggersByPet; sig: Map<string, string> } {
  const value: TriggersByPet = {};
  const sig = new Map<string, string>();
  if (obj && typeof obj === "object") {
    for (const petId of Object.keys(obj)) {
      const entry = obj[petId] ?? {};
      const lat = entry.lastAbilityTrigger ?? null;
      const pos = entry.position ?? null;
      value[petId] = {
        petId,
        abilityId: lat?.abilityId ?? null,
        performedAt: Number.isFinite(lat?.performedAt) ? lat.performedAt : null,
        data: lat?.data ?? null,
        position: pos ?? null,
      };
      sig.set(petId, _abilitySig(lat));
    }
  }
  return { value, sig };
}

function _mapEqual(a: Map<string, string> | null, b: Map<string, string>): boolean {
  if (!a) return false;
  if (a.size !== b.size) return false;
  for (const [k, v] of b) if (a.get(k) !== v) return false;
  return true;
}

export const myPetsAbilitiesTrigger = {
  async get(): Promise<TriggersByPet> {
    const src = await myPetSlotInfos.get();
    return _extractAbilityTriggers(src).value;
  },
  onChange(cb: (v: TriggersByPet) => void) {
    let prevSig: Map<string, string> | null = null;
    return myPetSlotInfos.onChange((src) => {
      const { value, sig } = _extractAbilityTriggers(src);
      if (!_mapEqual(prevSig, sig)) {
        prevSig = sig;
        cb(value);
      }
    });
  },
  async onChangeNow(cb: (v: TriggersByPet) => void) {
    cb(await this.get());
    return this.onChange(cb);
  },
};

/* ============================================================================
 * Registry (lecture seule)
 * ==========================================================================*/
export const Atoms = {
  ui: { activeModal, inventoryModalIsActive },
  server: { numPlayers, friendBonusMultiplier },
  player: { 
    position, 
    avatarTriggerAnimationAtom, 
    player,
    action,
    playerId
  },
  garden:{
    myOwnCurrentGardenObject,
    isCurrentGrowSlotMature,
    myOwnCurrentGardenObjectType,
    myOwnCurrentDirtTileIndex,
    myCurrentGrowSlotIndex
  },
  root: { state, map },
  data: {
    myData,
    garden,
    gardensWithBackfills,
    gardenTileObjects,
    myCurrentGardenObject,
    myCurrentSortedGrowSlotIndices,
    myCurrentGrowSlotIndex,
    weather
  },
    inventory: {
    myInventory,
    myCropInventory,
    mySeedInventory,
    myToolInventory,
    myEggInventory,
    myDecorInventory,
    mySeedSiloItems,
    myDecorShedItems,
    myFeedingTroughItems,
    favoriteIds,
    mySelectedItemId,
    mySelectedItemName,
    mySelectedItemRotation,
    myPossiblyNoLongerValidSelectedItemIndex,
    myValidatedSelectedItemIndex,
    setSelectedIndexToEnd,
    myCropItemsToSell
  },

  pets: {
    myPetInfos,
    myPetSlotInfos,
    myPrimitivePetSlots,
    myPetIdOnSameTile,
    totalPetSellPrice,
  },
  shop: {
    shops,
    myShopPurchases,
    totalCropSellPrice,
    seedShop,
    toolShop,
    eggShop,
    decorShop
  },
} as const;

/* ============================================================================
 * Hooks / helpers (abonnements pratiques)
 * ==========================================================================*/
export function onFavoriteIds(cb: (ids: string[]) => void) {
  return favoriteIds.onChange((next) => cb(Array.isArray(next) ? next : []), HubEq.idSet);
}
export async function onFavoriteIdsNow(cb: (ids: string[]) => void) {
  cb(Array.isArray(await favoriteIds.get()) ? await favoriteIds.get() : []);
  return onFavoriteIds(cb);
}

export const favoriteIdSet = {
  async get(): Promise<Set<string>> {
    const arr = await favoriteIds.get();
    return new Set(Array.isArray(arr) ? arr : []);
  },
  onChange(cb: (s: Set<string>) => void) {
    return favoriteIds.onChange((ids) => cb(new Set(Array.isArray(ids) ? ids : [])), HubEq.idSet);
  },
  async onChangeNow(cb: (s: Set<string>) => void) {
    cb(await this.get());
    return this.onChange(cb);
  },
};

export function onPetsAbilityTriggers(cb: (map: Record<string, PetAbilityTrigger>) => void) {
  return myPetsAbilitiesTrigger.onChange(cb);
}
export async function onPetsAbilityTriggersNow(cb: (map: Record<string, PetAbilityTrigger>) => void) {
  cb(await myPetsAbilitiesTrigger.get());
  return myPetsAbilitiesTrigger.onChange(cb);
}

export async function buildFavoriteIdsDiff(next: string[]): Promise<{ add: string[]; remove: string[] }> {
  const cur = await favoriteIds.get();
  const prev = new Set(Array.isArray(cur) ? cur : []);
  const want = new Set(Array.isArray(next) ? next : []);
  const add: string[] = [];
  const remove: string[] = [];
  for (const id of want) if (!prev.has(id)) add.push(id);
  for (const id of prev) if (!want.has(id)) remove.push(id);
  return { add, remove };
}

export function onSelectedItemName(cb: (name: string | null) => void) {
  return mySelectedItemName.onChange(cb);
}
export async function onSelectedItemNameNow(cb: (name: string | null) => void) {
  cb(await mySelectedItemName.get());
  return mySelectedItemName.onChange(cb);
}

export function onCurrentGardenObject(cb: (obj: CurrentGardenObject) => void) {
  return myCurrentGardenObject.onChange(cb);
}
export async function onCurrentGardenObjectNow(cb: (obj: CurrentGardenObject) => void) {
  cb(await myCurrentGardenObject.get());
  return myCurrentGardenObject.onChange(cb);
}

export function onCurrentGrowSlotIndex(cb: (idx: number | null) => void) {
  return myCurrentGrowSlotIndex.onChange(cb);
}
export async function onCurrentGrowSlotIndexNow(cb: (idx: number | null) => void) {
  cb(await myCurrentGrowSlotIndex.get());
  return myCurrentGrowSlotIndex.onChange(cb);
}

/* Pets STRUCTUREL (stable) – Eq + hooks */
function activePetsStructuralEq(a: PetState, b: PetState): boolean {
  const snap = (st: PetState) => {
    const m = new Map<string, string>();
    const arr = Array.isArray(st) ? st : [];
    for (const it of arr) {
      const id = String(it?.slot?.id ?? "");
      if (id) m.set(id, activePetStableSig(it));
    }
    return m;
  };
  const A = snap(a);
  const B = snap(b);
  if (A.size !== B.size) return false;
  for (const [k, v] of A) if (B.get(k) !== v) return false;
  return true;
}

export function onActivePetsStructuralChange(cb: (pets: PetState) => void) {
  return myPetInfos.onChange(cb, activePetsStructuralEq);
}
export async function onActivePetsStructuralChangeNow(cb: (pets: PetState) => void) {
  cb(await myPetInfos.get());
  return myPetInfos.onChange(cb, activePetsStructuralEq);
}

/* ============================================================================
 * Utils format
 * ==========================================================================*/
export const pad2 = (n: number) => n.toString().padStart(2, "0");
export function fmtClock(date: Date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}
export function fmtDuration(ms: number) {
  ms = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(ms / 3600);
  const m = Math.floor((ms % 3600) / 60);
  const s = ms % 60;
  return (h ? `${h}h ` : "") + (m ? `${m}m ` : "") + `${s}s`;
}

/* ============================================================================
 * Getters simples
 * ==========================================================================*/
export async function getFavoriteIdSet(): Promise<Set<string>> {
  const arr = await favoriteIds.get();
  return new Set(Array.isArray(arr) ? arr : []);
}

/* ============================================================================
 * Channels lisibles
 * ==========================================================================*/
export const Channels = {
  inventory: { favorites: FavoriteIdsSig },
  garden: { slots: GardenSlotsSig },
  activePets: { byId: PetsByIdSig, byIdStable: PetsByIdStableSig },
} as const;
