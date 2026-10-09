import { checkEqual, done } from "./_check";
import { computeAbilityStatsAtRatio } from "../src/features/pets/abilityStats";
import { computeTeamStats, effectGroupKeyForAbility } from "../src/features/pets/teamStats";
import { getPetStrength, getPetMaxStrength } from "../src/data/rules/petValue";
import { captureState } from "../src/data/live/state";
import { buildSuggestedTeams } from "../src/features/pets/teamBuilder";

const mkPet = (id: string, species: string, targetScale: number, xp: number, abilities: string[], hunger = 1e9) =>
  ({ id, itemType: "Pet" as const, petSpecies: species, name: id, xp, hunger, mutations: [], targetScale, abilities });

console.log("--- formula parity (hardcoded fallback catalog) ---");
const full = mkPet("t1", "Turtle", 2.5, 1e9, ["PlantGrowthBoostII"]);
checkEqual("Turtle maxScale 2.5 -> maxStrength 100", getPetMaxStrength(full), 100);
checkEqual("Turtle fully xp'd -> strength 100", getPetStrength(full), 100);
checkEqual("xp=0 Turtle -> strength 70 (max-30 floor)", getPetStrength(mkPet("t", "Turtle", 2.5, 0, [])), 70);

const at100 = computeAbilityStatsAtRatio("PlantGrowthBoostII", 1.0);
checkEqual("proc @ratio 1.0 = base 27", at100?.effectiveProbability?.toFixed(2), "27.00");
const at96 = computeAbilityStatsAtRatio("PlantGrowthBoostII", 0.96);
checkEqual("proc @ratio 0.96 = 25.92", at96?.effectiveProbability?.toFixed(2), "25.92");
checkEqual("magnitude scales: 5min @0.96 = 4.80", at96?.scaledParameters.plantGrowthReductionMinutes?.toFixed(2), "4.80");
checkEqual("probability clamped at 100", computeAbilityStatsAtRatio("PlantGrowthBoostII", 99)?.effectiveProbability, 100);
checkEqual("unknown ability id -> null, no throw", computeAbilityStatsAtRatio("NotARealAbility", 1), null);

console.log("\n--- combined proc is a product, not a sum ---");
const trio = [
  mkPet("a", "Turtle", 2.5, 1e9, ["PlantGrowthBoostII"]),
  mkPet("b", "Turtle", 2.5, 1e9, ["PlantGrowthBoostII"]),
  mkPet("c", "Turtle", 2.5, 1e9, ["PlantGrowthBoostII"]),
];
const trioStats = computeTeamStats(trio);
const group = trioStats.groups[0];
checkEqual("3x27% -> 61.10 (naive sum would be 81)", group.combinedProbability?.toFixed(2), "61.10");
checkEqual("all 3 merged into one group", group.contributors.length, 3);
checkEqual("summed magnitude 3x5min = 15.0", group.summedParameters.plantGrowthReductionMinutes?.toFixed(1), "15.0");
checkEqual("potential 100% when maxed", (trioStats.potential * 100).toFixed(0), "100");
checkEqual("headroom 0 when maxed", trioStats.headroom.toFixed(2), "0.00");

const weak = [0, 1, 2].map((i) => mkPet(`w${i}`, "Turtle", 2.5, 0, ["PlantGrowthBoostII"]));
const weakStats = computeTeamStats(weak);
checkEqual("xp=0 trio potential 70%", (weakStats.potential * 100).toFixed(0), "70");
checkEqual("xp=0 trio headroom +42.9%", (weakStats.headroom * 100).toFixed(1), "42.9");
checkEqual(
  "proc headroom is non-linear, differs from magnitude headroom",
  weakStats.groups[0].combinedProbability?.toFixed(2) !== weakStats.groups[0].combinedProbabilityAtMax?.toFixed(2),
  true,
);

console.log("\n--- the bar's reference is the team's own ceiling, not 100% ---");
// Same three pets, once fully levelled and once not. The ceiling must be
// identical in both cases: it describes the pets, not their current xp.
const maxedTrio = computeTeamStats(trio).groups[0];
const underTrio = computeTeamStats(weak).groups[0];
checkEqual("maxed team sits exactly at its ceiling",
  maxedTrio.combinedProbability?.toFixed(4), maxedTrio.combinedProbabilityAtMax?.toFixed(4));
checkEqual("under-levelled team is below its ceiling",
  (underTrio.combinedProbability ?? 0) < (underTrio.combinedProbabilityAtMax ?? 0), true);
checkEqual("both teams share the SAME ceiling",
  underTrio.combinedProbabilityAtMax?.toFixed(4), maxedTrio.combinedProbabilityAtMax?.toFixed(4));
checkEqual("a maxed team fills the bar (ratio 1.0)",
  ((maxedTrio.combinedProbability ?? 0) / (maxedTrio.combinedProbabilityAtMax ?? 1)).toFixed(2), "1.00");
// Scaling against 100% would have rendered this near-empty; against its own
// ceiling it is full, which is the whole point of the change.
const rainbow = computeTeamStats([
  mkPet("r1", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
  mkPet("r2", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
  mkPet("r3", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
]).groups[0];
checkEqual("maxed Rainbow trio is tiny in absolute terms",
  (rainbow.combinedProbability ?? 0) < 3, true);
checkEqual("...yet fills its own bar completely",
  ((rainbow.combinedProbability ?? 0) / (rainbow.combinedProbabilityAtMax ?? 1)).toFixed(2), "1.00");

console.log("\n--- magnitudes are per proc, only the chance stacks ---");
// Three Crop Size Boost I pets at full strength. Each proc applies ONE pet's
// +4 Size, so every contributor must still report 4, not a shared 12.
const cropTrio = computeTeamStats([
  mkPet("c1", "Turtle", 2.5, 1e9, ["ProduceScaleBoost"]),
  mkPet("c2", "Turtle", 2.5, 1e9, ["ProduceScaleBoost"]),
  mkPet("c3", "Turtle", 2.5, 1e9, ["ProduceScaleBoost"]),
]).groups[0];
checkEqual("each contributor keeps its own magnitude",
  cropTrio.contributors.map((c) => c.scaledParameters.sizeIncrease).join(","), "4,4,4");
checkEqual("the chance does stack across the three",
  (cropTrio.combinedProbability ?? 0) > (cropTrio.contributors[0].probability ?? 0), true);
// Different tiers must stay distinguishable per pet, so the UI can show a range.
const mixedTiers = computeTeamStats([
  mkPet("t1", "Turtle", 2.5, 1e9, ["ProduceScaleBoost"]),
  mkPet("t2", "Turtle", 2.5, 1e9, ["ProduceScaleBoostIII"]),
]).groups[0];
checkEqual("mixed tiers keep distinct per-proc values",
  mixedTiers.contributors.map((c) => c.scaledParameters.sizeIncrease).sort().join("-"), "4-9");
// Crop Size is a whole number the game adds flat: strength changes how often
// the ability procs, never how many Size points it grants.
checkEqual("a weaker pet grants the same Size points",
  computeTeamStats([mkPet("w", "Turtle", 2.5, 0, ["ProduceScaleBoost"])])
    .groups[0].contributors[0].scaledParameters.sizeIncrease, 4);
// Percentage parameters do still scale on strength.
checkEqual("a weaker pet reports a smaller percentage magnitude",
  computeTeamStats([mkPet("w2", "Turtle", 2.5, 0, ["ProduceEater"])])
    .groups[0].contributors[0].scaledParameters.cropSellPriceIncreasePercentage?.toFixed(1), "105.0");

console.log("\n--- effect grouping is derived from the catalog ---");
checkEqual("Gold vs Rainbow granter stay separate", computeTeamStats([
  mkPet("g1", "Turtle", 2.5, 1e9, ["GoldGranter"]),
  mkPet("g2", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
]).groups.length, 2);
checkEqual("two Gold Granters merge", computeTeamStats([
  mkPet("g1", "Turtle", 2.5, 1e9, ["GoldGranter"]),
  mkPet("g2", "Turtle", 2.5, 1e9, ["GoldGranter"]),
]).groups.length, 1);
checkEqual("SeedFinder I+IV merge, Copycat stays apart", computeTeamStats([
  mkPet("s1", "Turtle", 2.5, 1e9, ["SeedFinderI", "Copycat"]),
  mkPet("s2", "Turtle", 2.5, 1e9, ["SeedFinderIV"]),
]).groups.length, 2);
checkEqual("Crop Eater does not merge with Sell Boost", computeTeamStats([
  mkPet("e1", "Turtle", 2.5, 1e9, ["ProduceEater"]),
  mkPet("e2", "Turtle", 2.5, 1e9, ["SellBoostIV"]),
]).groups.length, 2);
checkEqual("always-on modifier reports no proc",
  computeAbilityStatsAtRatio("ProduceMutationBoost", 1)?.effectiveProbability, null);

console.log("\n--- category focus: key from an ability id must match the group's key ---");
const cropSizeKey = effectGroupKeyForAbility("ProduceScaleBoostIII");
checkEqual("tier variants share a key", effectGroupKeyForAbility("ProduceScaleBoost"), cropSizeKey);
checkEqual("weather variant shares the key", effectGroupKeyForAbility("SnowyCropSizeBoost"), cropSizeKey);
checkEqual("a different effect does not", effectGroupKeyForAbility("PlantGrowthBoostII") !== cropSizeKey, true);
checkEqual("unknown ability id -> null", effectGroupKeyForAbility("NotARealAbility"), null);

// The filter only works if the key derived from a category's best-tier id
// equals the key of the group the pets actually land in, including when a
// pet carries a *lower* tier than the category advertises.
const mixed = computeTeamStats([
  mkPet("m1", "Turtle", 2.5, 1e9, ["ProduceScaleBoost", "CoinFinderI", "GoldGranter"]),
  mkPet("m2", "Turtle", 2.5, 1e9, ["SnowyCropSizeBoost", "SeedFinderII"]),
]);
checkEqual("mixed team produces several groups", mixed.groups.length > 1, true);
checkEqual("exactly one group matches the Crop Size category",
  mixed.groups.filter((g) => g.key === cropSizeKey).length, 1);
checkEqual("that group merged the low tier and the weather variant",
  mixed.groups.find((g) => g.key === cropSizeKey)?.contributors.length, 2);

console.log("\n--- trigger drives the unit (continuous rolls once a minute) ---");
checkEqual("continuous ability -> continuous group",
  computeTeamStats([mkPet("u1", "Turtle", 2.5, 1e9, ["ProduceScaleBoostIII"])]).groups[0].trigger, "continuous");
checkEqual("sell ability keeps its own trigger",
  computeTeamStats([mkPet("u2", "Turtle", 2.5, 1e9, ["SellBoostIV"])]).groups[0].trigger, "sellAllCrops");
checkEqual("harvest ability keeps its own trigger",
  computeTeamStats([mkPet("u3", "Turtle", 2.5, 1e9, ["DoubleHarvest"])]).groups[0].trigger, "harvest");
checkEqual("hatch ability keeps its own trigger",
  computeTeamStats([mkPet("u4", "Turtle", 2.5, 1e9, ["DoubleHatch"])]).groups[0].trigger, "hatchEgg");

console.log("\n--- hunger: drain, Hunger Boost and Hunger Restore ---");
// Bare pets, no hunger abilities: falls back to the raw depletion time.
const bare = computeTeamStats([mkPet("h1", "Turtle", 2.5, 1e9, [], 100000)]);
checkEqual("no hunger abilities -> raw 90 min depletion", bare.autonomy.minutesFromFull?.toFixed(1), "90.0");
checkEqual("status is runs-out", bare.autonomy.status, "runs-out");
checkEqual("limiting pet is named", bare.autonomy.limitingPetName, "h1");

// Live hunger must stay irrelevant: the figure rates the composition.
checkEqual("live hunger is ignored (1 hunger still -> 90 min)",
  computeTeamStats([mkPet("h", "Turtle", 2.5, 1e9, [], 1)]).autonomy.minutesFromFull?.toFixed(1), "90.0");
checkEqual("team takes the SHORTEST lifetime (Turtle 90 + Bee 15 -> 15)",
  computeTeamStats([mkPet("t", "Turtle", 2.5, 1e9, [], 0), mkPet("b", "Bee", 1, 1e9, [], 1e9)])
    .autonomy.minutesFromFull?.toFixed(1), "15.0");

// Hunger Boost cuts the drain rate, stretching the lifetime proportionally.
// HungerBoostII refunds 16% at full strength -> 90 / 0.84 = 107.1 min.
const boosted = computeTeamStats([mkPet("b1", "Turtle", 2.5, 1e9, ["HungerBoostII"], 1e9)]);
checkEqual("Hunger Boost II reduces drain by 16%", boosted.autonomy.drainReductionPercent.toFixed(1), "16.0");
checkEqual("...stretching 90 min to 107.1", boosted.autonomy.minutesFromFull?.toFixed(1), "107.1");

// Boost stacks across the team: 3 x HungerBoostIII = 60% off the drain,
// stretching 90 min to 225.
const stacked = computeTeamStats([
  mkPet("n1", "Turtle", 2.5, 1e9, ["HungerBoostIII"], 1e9),
  mkPet("n2", "Turtle", 2.5, 1e9, ["HungerBoostIII"], 1e9),
  mkPet("n3", "Turtle", 2.5, 1e9, ["HungerBoostIII"], 1e9),
]);
checkEqual("Boost stacks team-wide (3 x 20% = 60%)", stacked.autonomy.drainReductionPercent.toFixed(0), "60");
checkEqual("...stretching 90 min to 225", stacked.autonomy.minutesFromFull?.toFixed(1), "225.0");

// Weather-gated hunger abilities must NOT be assumed active: Snow Hunger
// Boost only works during Frost, which is never guaranteed.
const frostOnly = computeTeamStats([mkPet("f1", "Turtle", 2.5, 1e9, ["SnowyHungerBoost"], 1e9)]);
checkEqual("Frost-only Boost is not counted", frostOnly.autonomy.drainReductionPercent.toFixed(0), "0");
checkEqual("so the pet still runs out at 90 min", frostOnly.autonomy.minutesFromFull?.toFixed(1), "90.0");
checkEqual("and the UI is told why", frostOnly.autonomy.weatherGatedHungerAbilities.length > 0, true);
checkEqual("Frost-only Restore is not counted either",
  computeTeamStats([mkPet("f2", "Turtle", 2.5, 1e9, ["SnowyHungerRestore"], 1e9)])
    .autonomy.restoreActivationsPerMinute.toFixed(0), "0");

// Restore activation rate: a 14% per-minute chance checked each second
// averages slightly more than 0.14 activations per minute.
const restorer = computeTeamStats([mkPet("r1", "Turtle", 2.5, 1e9, ["HungerRestoreII"], 1e9)]);
checkEqual("HungerRestoreII averages ~0.1506 activations/min",
  restorer.autonomy.restoreActivationsPerMinute.toFixed(4), "0.1506");

// The reported bug, reproduced: two Rainbow Turtles plus a feeder Turtle with
// Hunger Boost II + Hunger Restore II. The old code answered a flat 90 min,
// ignoring both abilities entirely.
const afkRainbow = computeTeamStats([
  mkPet("rain1", "Turtle", 2.5, 1e9, ["RainbowGranter"], 1e9),
  mkPet("rain2", "Turtle", 2.5, 1e9, ["RainbowGranter"], 1e9),
  mkPet("feeder", "Turtle", 2.5, 1e9, ["HungerRestoreII", "HungerBoostII"], 1e9),
]);
checkEqual("feeder team lasts far longer than the raw 90 min",
  (afkRainbow.autonomy.minutesFromFull ?? 0) > 1000, true);
checkEqual("Boost is counted", afkRainbow.autonomy.drainReductionPercent.toFixed(0), "16");
checkEqual("Restore is counted", afkRainbow.autonomy.restoreActivationsPerMinute > 0, true);

// A second feeder tips the same team into self-sustaining.
checkEqual("two feeders -> sustained", computeTeamStats([
  mkPet("rain1", "Turtle", 2.5, 1e9, ["RainbowGranter"], 1e9),
  mkPet("f1", "Turtle", 2.5, 1e9, ["HungerRestoreII", "HungerBoostII"], 1e9),
  mkPet("f2", "Turtle", 2.5, 1e9, ["HungerRestoreII", "HungerBoostII"], 1e9),
]).autonomy.status, "sustained");

const unknown = computeTeamStats([mkPet("u1", "NotARealPet", 2, 1e9, [], 100)]);
checkEqual("unknown species -> status unknown", unknown.autonomy.status, "unknown");
checkEqual("unknown species surfaced", unknown.unknownSpecies.join(","), "NotARealPet");
checkEqual("WhiteCaribou keyed on catalog id, not 'Caribou'",
  computeTeamStats([mkPet("c1", "WhiteCaribou", 1, 1e9, [], 1)]).autonomy.speciesMissingDepletion.length, 0);
checkEqual("mixed team: one unknown pet blocks the computation",
  computeTeamStats([mkPet("k", "Turtle", 2.5, 1e9, [], 100000), mkPet("u", "Nope", 1, 1e9, [], 1)])
    .autonomy.status, "unknown");

console.log("\n--- MGData takes precedence; depletion table must NOT be shadowed ---");
captureState.data.abilities = {
  PlantGrowthBoostII: {
    name: "Plant Growth Boost II", trigger: "continuous", baseProbability: 50,
    baseParameters: { plantGrowthReductionMinutes: 9 },
  },
  DawnCapture: {
    name: "Dawn Capture", trigger: "playerActivated",
    baseParameters: { cooldownSeconds: 300 },
  },
} as never;

checkEqual("dynamic ability overrides fallback (27 -> 50)",
  computeAbilityStatsAtRatio("PlantGrowthBoostII", 1)?.effectiveProbability?.toFixed(0), "50");
checkEqual("cooldown DIVIDES by ratio: 300s @0.5 -> 600s",
  computeAbilityStatsAtRatio("DawnCapture", 0.5)?.effectiveCooldownSeconds, 600);
checkEqual("cooldown @ratio 1.0 -> unchanged 300s",
  computeAbilityStatsAtRatio("DawnCapture", 1.0)?.effectiveCooldownSeconds, 300);
checkEqual("playerActivated has no proc figure",
  computeAbilityStatsAtRatio("DawnCapture", 1)?.effectiveProbability, null);

// The whole reason the depletion table is a standalone export rather than
// extra fields on petCatalog: MGData's entry replaces the hardcoded one
// wholesale, so a field folded in there would vanish in-game.
captureState.data.pets = {
  Turtle: {
    name: "Turtle", coinsToFullyReplenishHunger: 100000,
    maxScale: 2.5, hoursToMature: 100, maturitySellPrice: 1e7,
  },
} as never;
checkEqual("depletion still resolves once MGData serves the species",
  computeTeamStats([mkPet("d1", "Turtle", 2.5, 1e9, [], 100000)]).autonomy.minutesFromFull?.toFixed(1), "90.0");

console.log("\n--- AFK feeders avoid unwanted mutation granters ---");
// A Crop Size Boost III AFK team. Two goal pets are fixed; the scenarios only
// differ in which feeders are on offer. Turtle 2.5 -> STR 100.
const HUNGER: string[] = ["HungerRestoreII", "HungerBoostII"];
const scale = (str: number) => 1 + (str - 80) / 20 * (2.5 - 1);
const cropGoal = () => [
  mkPet("goal1", "Turtle", 2.5, 1e9, ["ProduceScaleBoostIII", ...HUNGER]),
  mkPet("goal2", "Turtle", 2.5, 1e9, ["ProduceScaleBoostIII", ...HUNGER]),
];
const cropAfk = (feeders: ReturnType<typeof mkPet>[]) => {
  const teams = buildSuggestedTeams([...cropGoal(), ...feeders]);
  return teams.teams.find((t) => t.mode === "afk" && t.categories.some((c) => c.id === "cropSize"));
};
const feeder = (id: string, str: number, extra: string[] = []) =>
  mkPet(id, "Turtle", scale(str), 1e9, [...HUNGER, ...extra]);

// A: no granter anywhere -> highest strength.
checkEqual("A · no granter -> strongest feeder",
  cropAfk([feeder("clean100", 100), feeder("clean88", 88)])?.petIds.includes("clean100"), true);
// B: Gold is dropped for a clean feeder however big the gap.
checkEqual("B · Gold dropped for a clean feeder",
  cropAfk([feeder("gold100", 100, ["GoldGranter"]), feeder("clean88", 88)])?.petIds.includes("clean88"), true);
// C: Rainbow within 10 strength -> the clean feeder wins.
checkEqual("C · Rainbow, gap 6 -> clean feeder",
  cropAfk([feeder("rain100", 100, ["RainbowGranter"]), feeder("clean94", 94)])?.petIds.includes("clean94"), true);
// D: Rainbow more than 10 stronger -> tolerated.
checkEqual("D · Rainbow, gap 15 -> tolerated",
  cropAfk([feeder("rain100", 100, ["RainbowGranter"]), feeder("clean85", 85)])?.petIds.includes("rain100"), true);
// E: no clean option -> Rainbow beats Gold.
checkEqual("E · no clean option -> Rainbow over Gold",
  cropAfk([feeder("gold100", 100, ["GoldGranter"]), feeder("rain92", 92, ["RainbowGranter"])])
    ?.petIds.includes("rain92"), true);
// F: goal pets carry no hunger of their own, so the feeder alone sustains the
// team. Dodging Gold by taking a Restore-only feeder would cost real feeding
// capability, which outranks the granter rule.
const halfFeederCase = buildSuggestedTeams([
  mkPet("plain1", "Turtle", 2.5, 1e9, ["ProduceScaleBoostIII"]),
  mkPet("plain2", "Turtle", 2.5, 1e9, ["ProduceScaleBoostIII"]),
  feeder("gold100", 100, ["GoldGranter"]),
  mkPet("halfFeeder", "Turtle", 2.5, 1e9, ["HungerRestoreII"]),
]).teams.find((t) => t.mode === "afk" && t.categories.some((c) => c.id === "cropSize"));
checkEqual("F · a half feeder does not justify losing sustain",
  halfFeederCase?.petIds.includes("gold100"), true);
// But when the clean feeder is just as capable, Gold loses even at -12 STR.
const equalFeederCase = buildSuggestedTeams([
  mkPet("plain1", "Turtle", 2.5, 1e9, ["ProduceScaleBoostIII"]),
  mkPet("plain2", "Turtle", 2.5, 1e9, ["ProduceScaleBoostIII"]),
  feeder("gold100", 100, ["GoldGranter"]),
  feeder("clean88", 88),
]).teams.find((t) => t.mode === "afk" && t.categories.some((c) => c.id === "cropSize"));
checkEqual("F' · an equally capable clean feeder still beats Gold",
  equalFeederCase?.petIds.includes("clean88"), true);
// G: a Rainbow team wants its Rainbow granter, so the rule must not fire.
const rainbowGoal = buildSuggestedTeams([
  mkPet("rg1", "Turtle", 2.5, 1e9, ["RainbowGranter", ...HUNGER]),
  mkPet("rg2", "Turtle", 2.5, 1e9, ["RainbowGranter", ...HUNGER]),
  feeder("rainFeeder", 100, ["RainbowGranter"]),
  feeder("cleanFeeder", 100),
]).teams.find((t) => t.mode === "afk" && t.categories.some((c) => c.id === "mutationRainbow"));
checkEqual("G · a Rainbow team keeps its Rainbow feeder",
  rainbowGoal?.petIds.includes("rainFeeder"), true);
// Only Gold and Rainbow are steered around. Penalising the others reshuffled
// unrelated teams for no benefit, so a Wet granter is simply ignored.
checkEqual("H · a Wet granter is ignored, strength decides",
  cropAfk([feeder("wet100", 100, ["RainDance"]), feeder("clean94", 94)])?.petIds.includes("wet100"), true);
checkEqual("H' · an Ambershine granter is ignored too",
  cropAfk([feeder("amber100", 100, ["AmberlitGranter"]), feeder("clean94", 94)])
    ?.petIds.includes("amber100"), true);

console.log("\n--- granter avoidance applies to every pet, not just feeders ---");
// An ACTIVE Plant Growth team of Turtles. None of these is a feeder, so this
// goes through rankCandidates, which used to sort on strength alone and
// happily put a Gold Granter in the team.
const plantActive = (pets: ReturnType<typeof mkPet>[]) =>
  buildSuggestedTeams(pets).teams.find(
    (t) => t.mode === "active" && t.categories.some((c) => c.id === "plantGrowth"),
  );
const grower = (id: string, str: number, extra: string[] = []) =>
  mkPet(id, "Turtle", scale(str), 1e9, ["PlantGrowthBoostIII", ...extra]);

// Four candidates for three slots, so the ranking actually evicts someone.
checkEqual("Gold grower is the one cut from an otherwise clean team",
  plantActive([
    grower("gold100", 100, ["GoldGranter"]),
    grower("clean88", 88), grower("clean86", 86), grower("clean84", 84),
  ])?.petIds.includes("gold100"), false);
checkEqual("...even when it is 20 strength ahead of every clean one",
  plantActive([
    grower("gold100", 100, ["GoldGranter"]),
    grower("clean80", 80), grower("clean81", 81), grower("clean82", 82),
  ])?.petIds.includes("gold100"), false);
// With nothing else to field it still gets in: an empty slot is worse.
checkEqual("but it is kept when there is no alternative",
  plantActive([grower("gold100", 100, ["GoldGranter"]), grower("clean88", 88)])
    ?.petIds.includes("gold100"), true);
checkEqual("but a higher tier still beats the granter rule",
  plantActive([
    mkPet("goldTierIII", "Turtle", scale(100), 1e9, ["PlantGrowthBoostIII", "GoldGranter"]),
    mkPet("cleanTierI", "Turtle", scale(100), 1e9, ["PlantGrowthBoost"]),
  ])?.petIds[0], "goldTierIII");
checkEqual("Rainbow grower, gap 6 -> clean one preferred",
  plantActive([grower("rain100", 100, ["RainbowGranter"]), grower("clean94", 94), grower("clean93", 93)])
    ?.petIds[0], "clean94");
checkEqual("Rainbow grower, gap 15 -> tolerated",
  plantActive([grower("rain100", 100, ["RainbowGranter"]), grower("clean85", 85), grower("clean84", 84)])
    ?.petIds[0], "rain100");
// A Gold team obviously still wants its Gold Granters.
checkEqual("a Gold team is not penalised for granting Gold", buildSuggestedTeams([
  mkPet("g1", "Turtle", scale(100), 1e9, ["GoldGranter"]),
  mkPet("g2", "Turtle", scale(88), 1e9, ["GoldGranter"]),
]).teams.find((t) => t.categories.some((c) => c.id === "mutationGold"))?.petIds[0], "g1");

console.log("\n--- sibling padding earns a reported stat, sustain does not ---");
captureState.data.abilities = null as never;
captureState.data.pets = null as never;

// Two Sell Boost pets and nothing else in that category: the builder tops the
// team off from Crop Refund, which fires on the same "sell all crops" click.
const sellTeams = buildSuggestedTeams([
  mkPet("p1", "Peacock", 2, 1e9, ["SellBoostIV"]),
  mkPet("p2", "Peacock", 2, 1e9, ["SellBoostIV"]),
  mkPet("cap", "Capybara", 2, 1e9, ["ProduceRefund"]),
]);
const sellTeam = sellTeams.teams.find((t) => t.categories.some((c) => c.id === "sellBoost"));
checkEqual("sell team was padded to 3 pets", sellTeam?.petIds.length, 3);
checkEqual("it reports Sell Boost", sellTeam?.focusAbilityIds.includes("SellBoostIV"), true);
checkEqual("...and the Crop Refund it was padded with",
  sellTeam?.focusAbilityIds.includes("ProduceRefund"), true);

// A sustain pet joins an AFK team for feeding only, so its hunger abilities
// must never show up as procs.
const afkTeams = buildSuggestedTeams([
  mkPet("g", "Turtle", 2.5, 1e9, ["GoldGranter"]),
  mkPet("feeder", "Turtle", 2.5, 1e9, ["HungerRestoreII", "HungerBoostII"]),
]);
const afkTeam = afkTeams.teams.find((t) => t.mode === "afk");
checkEqual("sustain pet is in the AFK team", afkTeam?.petIds.includes("feeder"), true);
checkEqual("but contributes no reported stat",
  afkTeam?.focusAbilityIds.some((id) => id.startsWith("Hunger")), false);
checkEqual("the AFK team still reports its own goal",
  afkTeam?.focusAbilityIds.includes("GoldGranter"), true);

console.log("\n--- AFK feeder prefers one that also serves the goal ---");
// The reported bug: two Rainbow Granter pets, plus two possible feeders:
// a max-strength one WITHOUT Rainbow Granter and a slightly weaker one WITH
// it. The weaker one turns a dead slot into a third proc source and must win.
// targetScale 2.5 on a Turtle -> max strength 100; 2.2 -> 96.
const rainbowAfk = buildSuggestedTeams([
  mkPet("rain1", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
  mkPet("rain2", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
  mkPet("feederStrong", "Turtle", 2.5, 1e9, ["HungerRestoreII", "HungerBoostII"]),
  mkPet("feederRainbow", "Turtle", 2.2, 1e9, ["HungerRestoreII", "HungerBoostII", "RainbowGranter"]),
]);
const rainbowTeam = rainbowAfk.teams.find(
  (t) => t.mode === "afk" && t.categories.some((c) => c.id === "mutationRainbow"),
);
checkEqual("an AFK Rainbow team exists", Boolean(rainbowTeam), true);
checkEqual("the weaker feeder that also procs Rainbow is chosen",
  rainbowTeam?.petIds.includes("feederRainbow"), true);

// The second reported bug: two Rainbow Turtles that ALSO carry Hunger Restore
// and Hunger Boost. Taking both makes the team feed itself forever; the old
// "N-1 goal slots + exactly one feeder" split took only one of them and
// landed on a finite ~2h31 instead.
const dualPurpose = buildSuggestedTeams([
  mkPet("dual1", "Turtle", 2.2, 1e9, ["RainbowGranter", "HungerRestoreII", "HungerBoostII"]),
  mkPet("dual2", "Turtle", 2.2, 1e9, ["RainbowGranter", "HungerRestoreII", "HungerBoostII"]),
  mkPet("pureRainbow", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
]);
const dualTeam = dualPurpose.teams.find(
  (t) => t.mode === "afk" && t.categories.some((c) => c.id === "mutationRainbow"),
);
checkEqual("both dual-purpose pets are taken",
  ["dual1", "dual2"].every((id) => dualTeam?.petIds.includes(id)), true);
const dualPets = [
  mkPet("dual1", "Turtle", 2.2, 1e9, ["RainbowGranter", "HungerRestoreII", "HungerBoostII"]),
  mkPet("dual2", "Turtle", 2.2, 1e9, ["RainbowGranter", "HungerRestoreII", "HungerBoostII"]),
  mkPet("pureRainbow", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
].filter((p) => dualTeam?.petIds.includes(p.id));
checkEqual("and the team never needs feeding",
  computeTeamStats(dualPets).autonomy.status, "sustained");

// Sustainability outranks raw proc: a team that lasts forever is chosen over
// a stronger one that runs dry, which is the whole point of an AFK team.
const tradeOff = buildSuggestedTeams([
  mkPet("r1", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
  mkPet("r2", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
  mkPet("f1", "Turtle", 2.5, 1e9, ["HungerRestoreII", "HungerBoostII"]),
  mkPet("f2", "Turtle", 2.5, 1e9, ["HungerRestoreII", "HungerBoostII"]),
]);
const tradeTeam = tradeOff.teams.find(
  (t) => t.mode === "afk" && t.categories.some((c) => c.id === "mutationRainbow"),
);
checkEqual("two feeders are taken over a second proc source",
  ["f1", "f2"].every((id) => tradeTeam?.petIds.includes(id)), true);
checkEqual("the goal is still served", tradeTeam?.petIds.some((id) => id.startsWith("r")), true);

// Sustain quality still wins over goal usefulness: half a feeder is a real
// loss, not the "slightly weaker" trade this is meant to allow.
const halfFeeder = buildSuggestedTeams([
  mkPet("rain1", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
  mkPet("rain2", "Turtle", 2.5, 1e9, ["RainbowGranter"]),
  mkPet("fullFeeder", "Turtle", 2.5, 1e9, ["HungerRestoreII", "HungerBoostII"]),
  mkPet("halfFeeder", "Turtle", 2.5, 1e9, ["HungerRestoreII", "RainbowGranter"]),
]);
checkEqual("a full feeder still beats a half feeder that procs",
  halfFeeder.teams.find((t) => t.mode === "afk" && t.categories.some((c) => c.id === "mutationRainbow"))
    ?.petIds.includes("fullFeeder"), true);

done();
