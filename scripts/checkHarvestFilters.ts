// The companion's harvest filters, from the garden payload to the kept rows.
//
// `scanGarden` feeds two gates that both read the same number: the companion's
// own "at least N% size" filter, and the Locker's size range. Both were seeing
// 100% for every crop because the scan still read the pre-rework `targetScale`
// on the slot and `maxScale` on the catalog, and the game renamed both.
import { scanGarden } from "../src/services/workflowScan";
import { DEFAULT_FILTERS, filterRows, type HarvestRow } from "../src/services/companion/chat/harvest";
import { plantCatalog } from "../src/data";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

// A real species, so the catalog lookup is the one the mod actually does.
const SPECIES = "Carrot";
const maxSizeMultiplier = (plantCatalog as any)[SPECIES]?.crop?.maxSizeMultiplier;
check("catalog exposes maxSizeMultiplier", typeof maxSizeMultiplier, "number");
check("catalog no longer exposes maxScale", (plantCatalog as any)[SPECIES]?.crop?.maxScale, undefined);

const ripe = { startTime: 1_000, endTime: 2_000 };

/** A garden holding one crop per size, as the game sends it since the rework. */
const tileObjects = {
  "10": {
    objectType: "plant",
    species: SPECIES,
    slots: [
      { slotId: 0, size: 50, mutations: [], ...ripe },
      { slotId: 2, size: 75, mutations: [], ...ripe },
      { slotId: 5, size: 100, mutations: [], ...ripe },
    ],
  },
};

const scan = scanGarden(tileObjects as any, new Set([SPECIES]));
const sizes = scan.plants[0].crops.map((crop) => crop.sizePct);

check("reads the slot's own size", sizes.join(","), "50,75,100");
check("a small crop is not reported as full size", sizes[0], 50);

// --- what the companion is asked to do --------------------------------------
const rows: HarvestRow[] = scan.plants[0].crops.map((crop) => ({
  tileIndex: 10,
  slotId: crop.slotIndex,
  species: crop.species,
  sizePct: crop.sizePct,
  growthPct: Math.round(crop.growthPct),
  mutations: crop.mutations,
  ready: true,
  preserved: false,
}));

const big = filterRows(rows, { ...DEFAULT_FILTERS, minSizePct: 80 });
check("'at least 80% size' keeps only the big one", big.length, 1);
check("and it is the right one", big[0]?.sizePct, 100);

const mid = filterRows(rows, { ...DEFAULT_FILTERS, minSizePct: 75 });
check("'at least 75% size' keeps two", mid.map((r) => r.sizePct).join(","), "75,100");

const all = filterRows(rows, DEFAULT_FILTERS);
check("no size filter keeps everything", all.length, 3);

// --- the slotId trap (fix v3.1.503) must survive the change -----------------
check("slotIds are carried, not array indices", rows.map((r) => r.slotId).join(","), "0,2,5");

// --- a pre-rework capture still resolves ------------------------------------
const legacy = scanGarden(
  {
    "10": {
      objectType: "plant",
      species: SPECIES,
      slots: [{ slotId: 0, targetScale: maxSizeMultiplier, mutations: [], ...ripe }],
    },
  } as any,
  new Set([SPECIES]),
);
check("a legacy targetScale still reads as full size", legacy.plants[0].crops[0].sizePct, 100);

console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
process.exit(failed ? 1 : 0);
