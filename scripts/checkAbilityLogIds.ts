// Which pet abilities are allowed into the activity logs.
//
// The gate used to be a module constant: `new Set(Object.keys(petAbilities))`,
// evaluated at import, which is document-start. The catalog proxy serves the
// live API first and the bundled copy only as a fallback, and at that moment
// the live one has not arrived, so the set was pinned to the bundled copy for
// the whole session. Every ability shipped since that copy was taken was
// dropped on arrival: Double Hatch II among them, which is how someone noticed.
import { captureState } from "../src/data/dynamic/state";
import { getLoggablePetAbilityIds } from "../src/services/pets";
import { formatAbilityLog, isPetAbilityAction } from "../src/data/dynamic/logic/abilityFormatter";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

// --- before the API answers --------------------------------------------------
const bundled = getLoggablePetAbilityIds();
check("the bundled catalog is available at once", bundled.size > 0, true);
check("Double Hatch I is known from the start", bundled.has("DoubleHatch"), true);
// Not a requirement, just what makes the bug reachable: the bundled copy is old.
check("Double Hatch II is not in the bundled copy", bundled.has("DoubleHatchII"), false);

// --- the API answers, as it does a moment after boot -------------------------
// Shaped like the real payload: the live catalog, keyed by ability id.
const live: Record<string, unknown> = {};
for (const id of bundled) live[id] = { name: id, trigger: "hatchEgg" };
live.DoubleHatchII = { name: "Double Hatch II", trigger: "hatchEgg", baseProbability: 5 };
live.ThunderCoinFinder = { name: "Thunder Coin Finder", trigger: "weather" };
live.Rebirth = { name: "Rebirth", trigger: "sellPet" };
(captureState.data as Record<string, unknown>).abilities = live;

const afterLoad = getLoggablePetAbilityIds();
check("the late catalog is picked up", afterLoad.has("DoubleHatchII"), true);
check("and so is everything else it added", afterLoad.has("Rebirth") && afterLoad.has("ThunderCoinFinder"), true);
check("without losing what was already known", afterLoad.has("DoubleHatch"), true);

// --- weather mutation boosters stay out -------------------------------------
// The game never logs these as discrete entries, so they must not slip back in
// along with the live catalog.
(captureState.data as Record<string, unknown>).abilities = {
  ...live,
  ProduceMutationBoost: { name: "Produce Mutation Boost", trigger: "weather" },
};
check("weather mutation boosters stay filtered out", getLoggablePetAbilityIds().has("ProduceMutationBoost"), false);

// --- the log line reads properly --------------------------------------------
check("Double Hatch II is formatted, not generic", isPetAbilityAction("DoubleHatchII"), true);
check(
  "and it reads like Double Hatch I",
  formatAbilityLog({ action: "DoubleHatchII", timestamp: 0, parameters: { extraPet: { petSpecies: "Rooster" } } }),
  "Double hatched Rooster",
);
check(
  "Double Hatch I is unchanged",
  formatAbilityLog({ action: "DoubleHatch", timestamp: 0, parameters: { extraPet: { petSpecies: "Turkey" } } }),
  "Double hatched Turkey",
);

console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
process.exit(failed ? 1 : 0);
