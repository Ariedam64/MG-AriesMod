// Mirrors the game's own grow-slot resolution (`Vv` in the v1125 bundle):
//   exact slotId match, else the next id upwards, else the lowest id.
import { checkEqual, done } from "./_check";
import { resolveGrowSlot, resolveGrowSlotIndex } from "../src/data/rules/growSlot";

const slots = [{ slotId: 68 }, { slotId: 61 }, { slotId: 75 }]; // deliberately unsorted

checkEqual("exact match", resolveGrowSlot(slots, 68)?.slotId, 68);
checkEqual("cursor 0 -> lowest id, not slots[0]", resolveGrowSlot(slots, 0)?.slotId, 61);
checkEqual("null cursor -> lowest id", resolveGrowSlot(slots, null)?.slotId, 61);
checkEqual("harvested id -> next upwards", resolveGrowSlot(slots, 62)?.slotId, 68);
checkEqual("cursor past the end wraps to lowest", resolveGrowSlot(slots, 99)?.slotId, 61);
checkEqual("single slot ignores the cursor", resolveGrowSlot([{ slotId: 7 }], 0)?.slotId, 7);
checkEqual("slot without an id still resolves", resolveGrowSlot([{}], 0) != null, true);
checkEqual("empty -> null", resolveGrowSlot([], 0), null);
checkEqual("null slots -> null", resolveGrowSlot(null, 0), null);
checkEqual("index of the resolved slot", resolveGrowSlotIndex(slots, 62), 0);
checkEqual("index when empty", resolveGrowSlotIndex([], 0), -1);

done();
