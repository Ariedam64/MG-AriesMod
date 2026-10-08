// Every section of the `aries_mod` blob must survive a page reload.
//
// Reading the blob back used to go through a list of known sections, and a
// section missing from that list was written to disk, then silently dropped on
// the next load. Settings held for the session thanks to the in-memory cache
// and vanished on the first refresh. The hatch tracker (seen pets, Bad Luck
// Protection counters) and the skins switch were both missing from the list.
// This simulates exactly that moment: a blob already on disk, read by a module
// with nothing cached yet.
//
// Run with: npm run check:storagesections

const stored = new Map<string, string>();
const g = globalThis as any;
g.window = g;
g.document = { addEventListener() {}, visibilityState: "visible" };
g.addEventListener = () => {};
g.localStorage = {
  getItem: (key: string) => stored.get(key) ?? null,
  setItem: (key: string, value: string) => void stored.set(key, value),
  removeItem: (key: string) => void stored.delete(key),
};

stored.set(
  "aries_mod",
  JSON.stringify({
    version: 1,
    hatch: { tracker: { seenPetIds: ["pet-1"], counters: { CommonEgg: { hatches: 4 } } }, expanded: { CommonEgg: true } },
    skins: { enabled: false },
    room: { customRooms: ["abc"] },
    notifications: { soundEnabled: false, mutedGroupIds: [3] },
    misc: { ghostMode: true },
    stats: { snapshot: { snapshot: { harvested: 12 } } },
    // Pre-nesting keys from old builds still fold into their section.
    petTeams: [{ id: "team-1" }],
    lockerState: { locked: true },
  }),
);

import { getAriesStorage, readAriesPath, writeAriesPath } from "../src/platform/storage";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
}

check("the hatch tracker survives a reload", readAriesPath("hatch.tracker.seenPetIds"), ["pet-1"]);
check("with its Bad Luck Protection counters", readAriesPath("hatch.tracker.counters.CommonEgg.hatches"), 4);
check("and the expanded hatch cards", readAriesPath("hatch.expanded.CommonEgg"), true);
check("the skins switch survives a reload", getAriesStorage().skins?.enabled, false);
check("custom rooms stored nested survive a reload", readAriesPath("room.customRooms"), ["abc"]);
check("notification settings survive a reload", readAriesPath("notifications.soundEnabled"), false);
check("sections the old list knew still load", readAriesPath("misc.ghostMode"), true);
check("nested stats snapshots are unwrapped", readAriesPath("stats"), { harvested: 12 });
check("legacy pet teams fold into pets.teams", readAriesPath("pets.teams"), [{ id: "team-1" }]);
check("legacy locker state folds into locker.state", readAriesPath("locker.state"), { locked: true });

writeAriesPath("misc.ghostMode", false);
check("writing one setting keeps the others", readAriesPath("hatch.tracker.seenPetIds"), ["pet-1"]);

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall storage section checks passed");
