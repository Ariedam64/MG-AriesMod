import { makeAtom, makeAliasedAtom, makeView, type View } from "./hub";
import { modalNameOf, nextModalState } from "../modalState";

/**
 * The game's jotai atoms the mod reads and writes, by the label the game gives
 * them. Labels are the game's own strings: never rename one here, add the new
 * name to a `makeAliasedAtom` list instead.
 */

/* ================================== Types ================================== */

export type XY = { x: number; y: number };

export type GardenState = {
  tileObjects: Record<string, any>;
  boardwalkTileObjects: Record<string, any>;
};

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

type PetInfo = { slot: PetSlot; position?: XY | null };
type PetState = PetInfo[] | null;

type ToolItem = { toolId: string; itemType: string; quantity: number };
type DecorItem = { decorId: string; itemType: "Decor"; quantity: number };
type SeedItem = { species: string; itemType: "Seed"; quantity: number };

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

type AvatarTriggerAnimation = { playerId: string; animation: string };

/* ================================ Root atoms =============================== */

const position = makeAtom<XY>("positionAtom");
const state = makeAtom<any>("stateAtom");
const map = makeAtom<any>("mapAtom");
export const player = makeAtom<any>("playerAtom");
const action = makeAtom<any | null>("actionAtom");

const myData = makeAtom<any>("myDataAtom");
const myInventory = makeAtom<any>("myInventoryAtom");

const myCropInventory = makeAtom<CropItem[] | null>("myCropInventoryAtom");
const mySeedInventory = makeAtom<SeedItem[] | null>("mySeedInventoryAtom");
const myToolInventory = makeAtom<ToolItem[] | null>("myToolInventoryAtom");
const myEggInventory = makeAtom<ToolItem[] | null>("myEggInventoryAtom");
const myDecorInventory = makeAtom<DecorItem[] | null>("myDecorInventoryAtom");
export const mySeedSiloItems = makeAtom<SeedItem[] | null>("mySeedSiloItemsAtom");
export const myDecorShedItems = makeAtom<DecorItem[] | null>("myDecorShedItemsAtom");
export const myToolShackItems = makeAtom<ToolItem[] | null>("myToolShackItemsAtom");

// `myPetInfosAtom` no longer exists in the game (v1029). The pet streams in
// `game/player.ts` prefer it but fall back to the pet slots below, which carry
// every field they need. Deliberately not repointed at `petInfosAtom`, which is
// every pet in the room rather than ours.
const myPetInfos = makeAtom<PetState>("myPetInfosAtom");
// Renamed `myPrimitivePetSlotsAtom` -> `myPredictedPetSlotsAtom` when the game
// added prediction and rollback: the same slot array, served from its
// prediction atoms and including commands still in flight. The old name stays
// as a fallback while cached bundles die out.
const myPrimitivePetSlots = makeAliasedAtom<any[]>([
  "myPredictedPetSlotsAtom",
  "myPrimitivePetSlotsAtom",
]);
const totalPetSellPrice = makeAtom<number>("totalPetSellPriceAtom");
const myCropItemsToSell = makeAtom<any>("myCropItemsToSellAtom");
export const myPetHutchPetItems = makeAtom<any>("myPetHutchPetItemsAtom");
export const isMyInventoryAtMaxLength = makeAtom<any>("isMyInventoryAtMaxLengthAtom");
export const myNumPetHutchItems = makeAtom<any>("myNumPetHutchItemsAtom");
export const myPetHutchCapacitySlots = makeAtom<number>("myPetHutchCapacitySlotsAtom");

/** The local player's userSlot: `data` plus `customRestockInventories`, their personal restocks. */
const myUserSlot = makeAtom<any>("myUserSlotAtom");

export const numPlayers = makeAtom<number>("numPlayersAtom");
const totalCropSellPrice = makeAtom<number>("totalCropSellPriceAtom");
const friendBonusMultiplier = makeAtom<any>("friendBonusMultiplierAtom");

const myValidatedSelectedItemIndex = makeAtom<number | null>("myValidatedSelectedItemIndexAtom");
const setSelectedIndexToEnd = makeAtom<number | null>("setSelectedIndexToEndAtom");
const mySelectedItemName = makeAtom<any>("mySelectedItemNameAtom");
const mySelectedItemId = makeAtom<any>("mySelectedItemIdAtom");
const myPossiblyNoLongerValidSelectedItemIndex = makeAtom<number | null>("myPossiblyNoLongerValidSelectedItemIndexAtom");
const mySelectedItemRotation = makeAtom<any>("mySelectedItemRotationAtom");

export const myCurrentGardenObject = makeAtom<CurrentGardenObject>("myCurrentGardenObjectAtom");

/**
 * slotId of the selected fruit, NOT its position in `slots[]`.
 *
 * v1169 moved crop selection into `data/tile/cropSelection.ts` and publishes
 * the already-resolved id as `selectedCropSlotIdAtom`; it defaults to the
 * first of the plant's sortedSlotIds and, when the stored pick was harvested
 * away, slides to the next id upwards (else the lowest).
 *
 * The older names behind it are the raw cursor, which starts at 0 and keeps
 * pointing at ids harvesting removed. Those need `resolveGrowSlot` to land on
 * a slot, which is why the resolution stays in place downstream.
 */
export const myCurrentGrowSlotIndex = makeAliasedAtom<number | null>([
  "selectedCropSlotIdAtom",
  "myCurrentGrowSlotIdAtom",
  "mySelectedSlotIdAtom",
]);

const weather = makeAtom<string | null>("weatherAtom");

// Renamed `activeModalAtom` -> `activeModalStateAtom` in the game. Since v1342
// it holds `{ modal, openId }` instead of the name, and `activeModalAtom` became
// a read-only derived atom, so writes always go to the state atom. This view
// keeps the `string | null` interface for the whole mod and translates to
// whichever shape the build uses (see `game/modalState.ts`).
const activeModalRaw = makeAliasedAtom<any>(["activeModalStateAtom", "activeModalAtom"]);
const sameModal = (a: unknown, b: unknown) => modalNameOf(a) === modalNameOf(b);
const activeModal: View<string | null> = {
  label: activeModalRaw.label,
  get: async () => modalNameOf(await activeModalRaw.get()),
  set: async (next) => {
    const raw = await activeModalRaw.get();
    const value = nextModalState(raw, next);
    if (value !== undefined) await activeModalRaw.set(value);
  },
  onChange: (cb) =>
    activeModalRaw.onChange((next, prev) => cb(modalNameOf(next), modalNameOf(prev)), sameModal),
  onChangeNow: (cb) =>
    activeModalRaw.onChangeNow((next, prev) => cb(modalNameOf(next), modalNameOf(prev)), sameModal),
};
const inventoryModalIsActive = makeAtom<boolean>("inventoryModalIsActiveAtom");
// Since v1396 Stats and Activity Log share the `activityLog` modal; this picks the tab (`"logs"` | `"stats"`).
const activityLogTab = makeAtom<string>("activityLogTabAtom");
const avatarTriggerAnimationAtom = makeAtom<AvatarTriggerAnimation | null>("avatarTriggerAnimationAtom");

/* =============================== Derived views ============================== */

const garden = makeView<any, GardenState | null>("myDataAtom", { path: "garden" });
const gardenTileObjects = makeView<any, Record<string, any>>("myDataAtom", { path: "garden.tileObjects" });
const favoriteIds = makeView<any, string[]>("myInventoryAtom", { path: "favoritedItemIds" });
// `playerAtom.id` now carries the account id (it carried a `p_...` room id
// before the rename). This view stays raw and promises nothing: a single-path
// view silently returns null at the next rename and cannot tell the two id
// spaces apart. To identify the player, use resolveMyAccountId() in
// `game/playerIdentity.ts`.
export const playerId = makeView<any, string | null>("playerAtom", { path: "id" });

export const stateUserSlots = makeView<any, any>("stateAtom", { path: "child.data.userSlots" });
export const myActivityLog = makeView<any>("myDataAtom", { path: "activityLogs" });

// `shopsAtom` is gone from the game: the shops are read off the room state.
const shops = makeView<any, any>("stateAtom", { path: "child.data.shops" });
// A view of its own so its listeners only fire when the egg shop changes.
const eggShop = makeView<any, any>("stateAtom", { path: "child.data.shops.egg" });

/* ================================= Registry ================================ */

export const Atoms = {
  ui: { activeModal, inventoryModalIsActive, activityLogTab },
  server: { numPlayers, friendBonusMultiplier },
  player: { position, avatarTriggerAnimationAtom, player, action, playerId },
  root: { state, map },
  data: { myData, garden, gardenTileObjects, myCurrentGardenObject, weather },
  inventory: {
    myInventory,
    myCropInventory,
    mySeedInventory,
    myToolInventory,
    myEggInventory,
    myDecorInventory,
    mySeedSiloItems,
    myDecorShedItems,
    favoriteIds,
    mySelectedItemId,
    mySelectedItemName,
    mySelectedItemRotation,
    myPossiblyNoLongerValidSelectedItemIndex,
    myValidatedSelectedItemIndex,
    setSelectedIndexToEnd,
    myCropItemsToSell,
  },
  pets: { myPetInfos, myPrimitivePetSlots, totalPetSellPrice },
  shop: { shops, myUserSlot, totalCropSellPrice, eggShop },
} as const;

/* ========================= Active pets, structurally ======================== */

/** Pet identity without xp, hunger or position, so a menu does not redraw on every tick. */
function activePetStableSig(p: PetInfo): string {
  const s = p?.slot ?? ({} as PetSlot);
  const muts = Array.isArray(s.mutations) ? s.mutations.slice().sort().join(",") : "";
  const ab = Array.isArray(s.abilities) ? s.abilities.slice().sort().join(",") : "";
  const scale = Number.isFinite(s.targetScale as number) ? Math.round((s.targetScale as number) * 1000) : 0;
  return `${s.petSpecies ?? ""}|${s.name ?? ""}|sc:${scale}|m:${muts}|a:${ab}`;
}

function activePetsStructuralEq(a: PetState, b: PetState): boolean {
  const snap = (st: PetState) => {
    const m = new Map<string, string>();
    for (const it of Array.isArray(st) ? st : []) {
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

/** Calls `cb` now, then whenever an active pet is added, removed or changes identity. */
export async function onActivePetsStructuralChangeNow(cb: (pets: PetState) => void) {
  cb(await myPetInfos.get());
  return myPetInfos.onChange(cb, activePetsStructuralEq);
}
