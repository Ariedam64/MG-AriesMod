// Which fruit the Harvest Locker judges when the player selects a plant.
//
// The locker's purple outline, and its fallback when a harvest's tile cannot
// be resolved, both judge "the selected fruit". The game resolves its slot
// cursor as exact slotId, else the next id upwards, else the lowest id
// (data/rules/growSlot.ts). The locker used to fall back on the cursor as a
// position in `slots[]` instead, so once a harvest left the cursor on a gone
// id, it could judge a different fruit from the one the game showed and the
// crop price badge priced.
//
// Run with: npm run check:lockerslot
import { checkEqual, done } from "./_check";
import { selectedSlotInfo } from "../src/features/locker/slotWatcher";

const slot = (slotId: number, extra: Record<string, unknown> = {}) => ({
  slotId,
  species: "Carrot",
  startTime: 0,
  endTime: 1,
  size: 60 + slotId,
  mutations: [],
  ...extra,
});
const plant = (slots: unknown[]) => ({ objectType: "plant", species: "Carrot", slots });

// Deliberately unsorted, with gaps where fruits were harvested.
const carrot = plant([slot(4), slot(1), slot(7)]);
const picked = (cursor: number | null) => selectedSlotInfo(carrot, cursor).slot?.slotId;

checkEqual("an exact id is that fruit", picked(7), 7);
checkEqual("a harvested id moves to the next id upwards", picked(5), 7);
checkEqual("an id below every fruit is the lowest", picked(0), 1);
checkEqual("an id past every fruit wraps to the lowest", picked(9), 1);
checkEqual("no cursor yet is the lowest id", picked(null), 1);

const info = selectedSlotInfo(carrot, 4);
checkEqual("the size is the selected fruit's", info.sizePercent, 64);
checkEqual("its index is its place in slots[]", info.slotIndex, 0);

const clover = selectedSlotInfo(plant([slot(0, { species: "FourLeafClover", mutations: ["gold"] })]), 0);
checkEqual("a fruit of its own species is judged as that species", clover.seedKey, "FourLeafClover");
checkEqual("its mutations are read in the locker's spelling", clover.mutations.join(","), "Gold");

checkEqual("an empty plant selects nothing", selectedSlotInfo(plant([]), 0).slot, null);
checkEqual("an empty plant is still a plant", selectedSlotInfo(plant([]), 0).isPlant, true);
checkEqual("an egg is not a plant", selectedSlotInfo({ objectType: "egg", eggId: "CommonEgg" }, 0).isPlant, false);

done();
