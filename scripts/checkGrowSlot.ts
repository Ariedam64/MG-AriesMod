// Mirrors the game's own grow-slot resolution (`Vv` in the v1125 bundle):
//   exact slotId match, else the next id upwards, else the lowest id.
import { resolveGrowSlot, resolveGrowSlotIndex } from "../src/utils/growSlot";

const slots = [{ slotId: 68 }, { slotId: 61 }, { slotId: 75 }]; // deliberately unsorted

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

check("exact match", resolveGrowSlot(slots, 68)?.slotId, 68);
check("cursor 0 -> lowest id, not slots[0]", resolveGrowSlot(slots, 0)?.slotId, 61);
check("null cursor -> lowest id", resolveGrowSlot(slots, null)?.slotId, 61);
check("harvested id -> next upwards", resolveGrowSlot(slots, 62)?.slotId, 68);
check("cursor past the end wraps to lowest", resolveGrowSlot(slots, 99)?.slotId, 61);
check("single slot ignores the cursor", resolveGrowSlot([{ slotId: 7 }], 0)?.slotId, 7);
check("slot without an id still resolves", resolveGrowSlot([{}], 0) != null, true);
check("empty -> null", resolveGrowSlot([], 0), null);
check("null slots -> null", resolveGrowSlot(null, 0), null);
check("index of the resolved slot", resolveGrowSlotIndex(slots, 62), 0);
check("index when empty", resolveGrowSlotIndex([], 0), -1);

console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
process.exit(failed ? 1 : 0);
