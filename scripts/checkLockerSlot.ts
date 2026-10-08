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
import { selectedSlotInfo } from "../src/features/locker/slotWatcher";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

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

check("an exact id is that fruit", picked(7), 7);
check("a harvested id moves to the next id upwards", picked(5), 7);
check("an id below every fruit is the lowest", picked(0), 1);
check("an id past every fruit wraps to the lowest", picked(9), 1);
check("no cursor yet is the lowest id", picked(null), 1);

const info = selectedSlotInfo(carrot, 4);
check("the size is the selected fruit's", info.sizePercent, 64);
check("its index is its place in slots[]", info.slotIndex, 0);

const clover = selectedSlotInfo(plant([slot(0, { species: "FourLeafClover", mutations: ["gold"] })]), 0);
check("a fruit of its own species is judged as that species", clover.seedKey, "FourLeafClover");
check("its mutations are read in the locker's spelling", clover.mutations.join(","), "Gold");

check("an empty plant selects nothing", selectedSlotInfo(plant([]), 0).slot, null);
check("an empty plant is still a plant", selectedSlotInfo(plant([]), 0).isPlant, true);
check("an egg is not a plant", selectedSlotInfo({ objectType: "egg", eggId: "CommonEgg" }, 0).isPlant, false);

console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
process.exit(failed ? 1 : 0);
