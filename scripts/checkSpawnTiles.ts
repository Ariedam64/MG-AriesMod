// The room's garden positions come back once the map is known, even when the
// first read happened before it was.
//
// `sortedSpawnTiles` cached its first answer for the session. Read before the
// map atom had a value, that answer was an empty list, and an empty array is
// truthy, so every later read returned it: no garden positions for the rest
// of the session.

import { Atoms } from "../src/game/store/atoms";
import { sortedSpawnTiles } from "../src/features/room/spawnTiles";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${JSON.stringify(got)}${ok ? "" : ` (expected ${JSON.stringify(want)})`}`);
};

let map: unknown = null;
let mapReads = 0;
(Atoms.root.map as any).get = async () => {
  mapReads++;
  return map;
};
(Atoms.root.state as any).get = async () => null;

(async () => {
  check("before the map is ready there are no tiles", await sortedSpawnTiles(), []);

  map = { spawnTiles: [30, 10, 20] };
  check("once the map is ready the tiles are read again", await sortedSpawnTiles(), [10, 20, 30]);

  const readsBefore = mapReads;
  map = { spawnTiles: [99] };
  check("a non-empty answer is kept for the session", await sortedSpawnTiles(), [10, 20, 30]);
  check("and the map is not read again", mapReads, readsBefore);

  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall spawn tile checks passed");
})();
