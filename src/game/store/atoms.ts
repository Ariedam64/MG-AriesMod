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

// Renamed `myPrimitivePetSlotsAtom` -> `myPredictedPetSlotsAtom` when the game
// added prediction and rollback: the same slot array, served from its
// prediction atoms and including commands still in flight. The old name stays
// as a fallback while cached bundles die out.
const myPrimitivePetSlots = makeAliasedAtom<any[]>([
  "myPredictedPetSlotsAtom",
  "myPrimitivePetSlotsAtom",
]);
const myCropItemsToSell = makeAtom<any>("myCropItemsToSellAtom");
export const myPetHutchPetItems = makeAtom<any>("myPetHutchPetItemsAtom");
/** Everything stored in the pet hutch, pets and their items alike. */
export const myPetHutchItems = makeAtom<any[]>("myPetHutchItemsAtom");
export const myPetHutchCapacitySlots = makeAtom<number>("myPetHutchCapacitySlotsAtom");

/** The local player's userSlot: `data` plus `customRestockInventories`, their personal restocks. */
const myUserSlot = makeAtom<any>("myUserSlotAtom");

export const numPlayers = makeAtom<number>("numPlayersAtom");
const totalCropSellPrice = makeAtom<number>("totalCropSellPriceAtom");
const friendBonusMultiplier = makeAtom<any>("friendBonusMultiplierAtom");

// The selection is held by item id since build 1441; both atoms are derived
// and read-only. The game changes it by sending SetSelectedItem.
const myValidatedSelectedItemIndex = makeAliasedAtom<number | null>([
  "mySelectedItemIndexAtom",
  "myValidatedSelectedItemIndexAtom",
]);
const mySelectedItemId = makeAtom<any>("mySelectedItemIdAtom");
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
    mySelectedItemRotation,
    myValidatedSelectedItemIndex,
    myCropItemsToSell,
  },
  pets: { myPrimitivePetSlots },
  shop: { shops, myUserSlot, totalCropSellPrice, eggShop },
} as const;

