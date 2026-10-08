// src/store/atoms.ts
import { makeAtom, makeAliasedAtom, makeView, HubEq, type View } from "./hub";
import { modalNameOf, nextModalState } from "../utils/modalState";

/* ============================================================================
 * Types
 * ==========================================================================*/
export type XY = { x: number; y: number };

export type GardenState = {
  tileObjects: Record<string, any>;
  boardwalkTileObjects: Record<string, any>;
};

type GardenWithBackfill = {
  garden?: GardenState | null;
  slotIndex?: number;
  [key: string]: any;
};

type GardensWithBackfillsState = GardenWithBackfill[] | null;

export type PlantSlotTiming = {
  species: string;
  startTime: number;
  endTime: number;
  /** Whole-number Crop Size in [50, 100]. */
  size?: number;
  /** Pre-rework fractional scale, still read when `size` is absent. */
  targetScale?: number;
  mutations?: string[];
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

type PetSlot = {
  id: string;
  petSpecies: string;
  name?: string | null;
  xp?: number;
  hunger?: number;
  mutations?: string[];
  targetScale?: number;
  abilities?: string[];
};

type ToolItem = {
    toolId: string,
    itemType: string,
    quantity: number
}

type DecorItem = {
  decorId: string;
  itemType: "Decor";
  quantity: number;
};

type PetInfo = { slot: PetSlot; position?: XY | null };
export type PetState = PetInfo[] | null;

type CropItem = {
  id: string;
  species?: string;
  itemType?: string;
  /** Whole-number Crop Size in [50, 100]. */
  size?: number;
  /** Pre-rework fractional scale, still read when `size` is absent. */
  scale?: number;
  mutations?: string[];
};
type CropInventoryState = CropItem[] | null;

type SeedItem = {
  species: string;
  itemType: "Seed";
  quantity: number;
};
export type SeedInventoryState = SeedItem[] | null;
export type ToolInventoryState = ToolItem[] | null;
export type DecorInventoryState = DecorItem[] | null;

type AvatarTriggerAnimation = {
  playerId: string;
  animation: string;
};

/* ============================================================================
 * Root atoms
 * ==========================================================================*/
const position = makeAtom<XY>("positionAtom");
const state = makeAtom<any>("stateAtom");
const map = makeAtom<any>("mapAtom");
export const player = makeAtom<any>("playerAtom")
const action = makeAtom<any | null>("actionAtom")

const myData = makeAtom<any>("myDataAtom");
export const myInventory = makeAtom<any>("myInventoryAtom");
const gardensWithBackfills = makeAtom<GardensWithBackfillsState>("gardensWithBackfillsAtom");

const myCropInventory = makeAtom<CropInventoryState>("myCropInventoryAtom");
const mySeedInventory = makeAtom<SeedInventoryState>("mySeedInventoryAtom");
const myToolInventory = makeAtom<ToolInventoryState>("myToolInventoryAtom");
const myEggInventory = makeAtom<ToolInventoryState>("myEggInventoryAtom");
const myDecorInventory = makeAtom<DecorInventoryState>("myDecorInventoryAtom");
export const mySeedSiloItems = makeAtom<SeedInventoryState>("mySeedSiloItemsAtom");
export const myDecorShedItems = makeAtom<DecorInventoryState>("myDecorShedItemsAtom");
export const myToolShackItems = makeAtom<ToolInventoryState>("myToolShackItemsAtom");
const myFeedingTroughItems = makeAtom<CropInventoryState>("myFeedingTroughItemsAtom");
// `myPetInfosAtom` no longer exists in the game (v1029). Nothing reads it
// directly: `normalizePetsState` prefers it but falls back to the pet slots
// below, which carry every field it needs, so pets keep resolving. Left in
// place — and deliberately not repointed at `petInfosAtom`, which is every pet
// in the room rather than ours.
export const myPetInfos = makeAtom<PetState>("myPetInfosAtom");
const myPetSlotInfos = makeAtom<any>("myPetSlotInfosAtom");
// Renommé `myPrimitivePetSlotsAtom` -> `myPredictedPetSlotsAtom` côté jeu, avec
// l'arrivée du système de prédiction/rollback : même tableau de slots, servi
// depuis `prediction/quinoaPredictionAtoms.ts` et enrichi des commandes encore
// en vol. L'ancien nom reste en repli le temps que les bundles en cache
// disparaissent.
const myPrimitivePetSlots = makeAliasedAtom<any[]>([
  "myPredictedPetSlotsAtom",
  "myPrimitivePetSlotsAtom",
]);
const myPetIdOnSameTile = makeAtom<string | null>("myPetIdOnSameTileAtom");
const totalPetSellPrice = makeAtom<number>("totalPetSellPriceAtom")
const myCropItemsToSell = makeAtom<any>("myCropItemsToSellAtom")
export const myPetHutchPetItems = makeAtom<any>("myPetHutchPetItemsAtom")
export const isMyInventoryAtMaxLength = makeAtom<any>("isMyInventoryAtMaxLengthAtom")
export const myNumPetHutchItems = makeAtom<any>("myNumPetHutchItemsAtom")
export const myPetHutchCapacitySlots = makeAtom<number>("myPetHutchCapacitySlotsAtom")

const shops = makeView<any, any>("stateAtom", { path: "child.data.shops" });
const myShopPurchases = makeView<any, any>("myDataAtom", { path: "shopPurchases" });
/** The local player's userSlot: `data` plus `customRestockInventories`, their personal restocks. */
const myUserSlot = makeAtom<any>("myUserSlotAtom");

export const numPlayers = makeAtom<number>("numPlayersAtom");
const totalCropSellPrice = makeAtom<number>("totalCropSellPriceAtom");

const myValidatedSelectedItemIndex = makeAtom<number | null>("myValidatedSelectedItemIndexAtom");
const setSelectedIndexToEnd = makeAtom<number | null>("setSelectedIndexToEndAtom");
const mySelectedItemName = makeAtom<any>("mySelectedItemNameAtom");
const mySelectedItemId = makeAtom<any>("mySelectedItemIdAtom");
const myPossiblyNoLongerValidSelectedItemIndex = makeAtom<number | null>("myPossiblyNoLongerValidSelectedItemIndexAtom");

export const myCurrentGardenObject = makeAtom<CurrentGardenObject>("myCurrentGardenObjectAtom");

/**
 * Cycle order of the current plant's slotIds.
 *
 * v1169 folded this into the unlabelled tile-source state, so neither name
 * resolves on a current client and this stays empty — callers must not depend
 * on it for correctness, only as an ordering hint when it happens to arrive.
 */
export const myCurrentSortedGrowSlotIndices = makeAliasedAtom<number[] | null>([
  "myCurrentSortedGrowSlotIdsAtom",
  "myCurrentSortedGrowSlotIndicesAtom",
]);

/**
 * slotId of the selected fruit — NOT its position in `slots[]`.
 *
 * v1169 moved crop selection into `data/tile/cropSelection.ts` and publishes
 * the already-resolved id as `selectedCropSlotIdAtom`; it defaults to the
 * first of the plant's sortedSlotIds and, when the stored pick was harvested
 * away, slides to the next id upwards (else the lowest).
 *
 * The older names behind it are the raw cursor, which starts at 0 and keeps
 * pointing at ids harvesting removed — those need `resolveGrowSlot` to land
 * on a slot, which is why the resolution stays in place downstream.
 */
export const myCurrentGrowSlotIndex = makeAliasedAtom<number | null>([
  "selectedCropSlotIdAtom",
  "myCurrentGrowSlotIdAtom",
  "mySelectedSlotIdAtom",
]);

const myOwnCurrentGardenObject = makeAtom<any>("myOwnCurrentGardenObjectAtom")
const isCurrentGrowSlotMature = makeAtom<any>("isCurrentGrowSlotMatureAtom")
const myOwnCurrentDirtTileIndex = makeAtom<any>("myOwnCurrentDirtTileIndexAtom")
const mySelectedItemRotation = makeAtom<any>("mySelectedItemRotationAtom")

const weather = makeAtom<string | null>("weatherAtom")

// Renommé `activeModalAtom` -> `activeModalStateAtom` côté jeu. Depuis v1342
// il vaut `{ modal, openId }` au lieu du nom, et `activeModalAtom` est devenu un
// atom dérivé en lecture seule : on écrit donc toujours dans l'atom d'état.
// Cette vue garde l'interface `string | null` pour tout le mod et traduit dans
// la forme que le build utilise (voir utils/modalState.ts).
const activeModalRaw = makeAliasedAtom<any>([
  "activeModalStateAtom",
  "activeModalAtom",
]);
const sameModal = (a: unknown, b: unknown) => modalNameOf(a) === modalNameOf(b);
const activeModal: View<string | null> = {
  label: activeModalRaw.label,
  get: async () => modalNameOf(await activeModalRaw.get()),
  set: async (next) => {
    const raw = await activeModalRaw.get();
    const value = nextModalState(raw, next);
    if (value !== undefined) await activeModalRaw.set(value);
  },
  update: async (fn) => {
    const next = fn(modalNameOf(await activeModalRaw.get()));
    await activeModal.set(next);
    return next;
  },
  onChange: (cb) =>
    activeModalRaw.onChange((next, prev) => cb(modalNameOf(next), modalNameOf(prev)), sameModal),
  onChangeNow: (cb) =>
    activeModalRaw.onChangeNow((next, prev) => cb(modalNameOf(next), modalNameOf(prev)), sameModal),
  asSignature: (opts) => activeModalRaw.asSignature(opts as any) as any,
};
const inventoryModalIsActive = makeAtom<boolean>("inventoryModalIsActiveAtom");
// Since v1396 Stats and Activity Log share the `activityLog` modal; this picks the tab (`"logs"` | `"stats"`).
const activityLogTab = makeAtom<string>("activityLogTabAtom");
const avatarTriggerAnimationAtom = makeAtom<AvatarTriggerAnimation | null>("avatarTriggerAnimationAtom")

const friendBonusMultiplier = makeAtom<any>("friendBonusMultiplierAtom")

/* ============================================================================
 * Derived views
 * ==========================================================================*/
const garden = makeView<any, GardenState | null>("myDataAtom", { path: "garden" });
const gardenTileObjects = makeView<any, Record<string, any>>("myDataAtom", { path: "garden.tileObjects" });
const favoriteIds = makeView<any, string[]>("myInventoryAtom", { path: "favoritedItemIds" });
// `playerAtom.id` porte aujourd'hui l'id de compte (il portait un id de room
// `p_…` avant le renommage). Cette vue reste brute et sans garantie : une vue
// mono-chemin renvoie null en silence au prochain renommage, et ne sait pas
// distinguer les deux espaces de noms. Pour identifier le joueur, passer par
// resolveMyAccountId() dans ../utils/playerIdentity.
export const playerId = makeView<any, string | null>("playerAtom", { path: "id" });
const myOwnCurrentGardenObjectType = makeView<any, string | null>("myOwnCurrentGardenObjectAtom", { path: "objectType" });

/* stateAtom sub-views (optionnel) */
export const stateUserSlots = makeView<any, any>("stateAtom", { path: "child.data.userSlots" });
export const myActivityLog = makeView<any>("myDataAtom", { path: "activityLogs"});

/* Shops view (derived from stateAtom — shopsAtom removed from game) */
const seedShop  = makeView<any, any>("stateAtom", { path: "child.data.shops.seed"  });
const toolShop  = makeView<any, any>("stateAtom", { path: "child.data.shops.tool"  });
const eggShop   = makeView<any, any>("stateAtom", { path: "child.data.shops.egg"   });
const decorShop = makeView<any, any>("stateAtom", { path: "child.data.shops.decor" });

/* ============================================================================
 * Signatures / Channels de diff
 * ==========================================================================*/



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









/* ============================================================================
 * Registry (lecture seule)
 * ==========================================================================*/
export const Atoms = {
  ui: { activeModal, inventoryModalIsActive, activityLogTab },
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
    myToolShackItems,
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
    myUserSlot,
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

export async function onActivePetsStructuralChangeNow(cb: (pets: PetState) => void) {
  cb(await myPetInfos.get());
  return myPetInfos.onChange(cb, activePetsStructuralEq);
}

/* ============================================================================
 * Utils format
 * ==========================================================================*/

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
