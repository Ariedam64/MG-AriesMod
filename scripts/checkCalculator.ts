// The crop price simulator must show what the shared crop rules give: the same
// coins as `estimateProduceValue` and the same weight as `cropWeight`. Before
// it moved to `features/calculator/compute.ts` the menu carried its own copy of
// both, and it passed the mutations by their sprite names (Dawncharged,
// Ambershine...), so the old spelling is checked to price the same too.

import { checkEqual, done } from "./_check";
import {
  calculatorPrice,
  calculatorWeight,
  defaultCalculatorState,
  formatCoins,
  formatWeight,
  friendPlayersLabel,
  friendPlayersOf,
  type CalculatorState,
} from "../src/features/calculator/compute";
import { DefaultPricing, estimateProduceValue } from "../src/data/rules/cropValue";
import { cropWeight } from "../src/data/rules/cropSize";

const state = (patch: Partial<CalculatorState>): CalculatorState => ({ ...defaultCalculatorState(), ...patch });

// Carrot sells for 20 at Size 50 and 60 at Size 100; Gold is x25, Wet x2,
// Dawnlit x4, and weather and lighting combine as 2 + 4 - 2 + 1 = 5.
checkEqual("Carrot at Size 50", calculatorPrice("Carrot", state({})), 20);
checkEqual("Carrot at Size 100", calculatorPrice("Carrot", state({ size: 100 })), 60);
checkEqual("Gold Carrot", calculatorPrice("Carrot", state({ color: "Gold" })), 500);
checkEqual(
  "Gold Wet Dawnlit Carrot",
  calculatorPrice("Carrot", state({ color: "Gold", weather: "Wet", lighting: "Dawnlit" })),
  2500,
);
checkEqual("Carrot with two players", calculatorPrice("Carrot", state({ friendPlayers: 2 })), 22);
checkEqual("unknown species has no price", calculatorPrice("NotACrop", state({})), null);

const spriteNames: Record<string, string> = { Dawnbound: "Dawncharged", Amberlit: "Ambershine", Amberbound: "Ambercharged" };
const cases: Array<[string, Partial<CalculatorState>]> = [
  ["Banana", { size: 73, color: "Rainbow", weather: "Frozen", lighting: "Amberbound" }],
  ["Carrot", { size: 88, weather: "Thundercharged", lighting: "Dawnbound", friendPlayers: 6 }],
  ["Banana", { size: 50, color: "Gold", weather: "Chilled", lighting: "Amberlit", friendPlayers: 3 }],
];
for (const [species, patch] of cases) {
  const s = state(patch);
  const labels = [s.color, s.weather, s.lighting].filter((m) => m !== "None");
  const options = { ...DefaultPricing, friendPlayers: s.friendPlayers };
  const expected = estimateProduceValue(species, s.size, labels, options);
  const name = `${species} ${labels.join("+")} x${s.friendPlayers}`;
  checkEqual(`${name} matches the rules`, calculatorPrice(species, s), expected);
  const legacy = estimateProduceValue(species, s.size, labels.map((m) => spriteNames[m] ?? m), options);
  checkEqual(`${name} matches the sprite-name spelling`, calculatorPrice(species, s), legacy);
}

for (const [species, size] of [["Carrot", 50], ["Carrot", 100], ["Banana", 77]] as const) {
  checkEqual(`${species} weight at Size ${size}`, calculatorWeight(species, size), cropWeight(species, size));
}
checkEqual("unknown species has no weight", calculatorWeight("NotACrop", 60), null);

checkEqual("coins format", formatCoins(1234567.6), "1,234,568");
checkEqual("no coins", formatCoins(null), "-");
checkEqual("weight format drops trailing zeros", formatWeight(1.5), "1.5 kg");
checkEqual("weight format keeps three decimals", formatWeight(0.12345), "0.123 kg");
checkEqual("whole weight", formatWeight(2), "2 kg");
checkEqual("friend label for 3 players", friendPlayersLabel(3), "+20%");
checkEqual("friend label clamps", [friendPlayersLabel(0), friendPlayersLabel(9), friendPlayersLabel(NaN)], ["+0%", "+50%", "+0%"]);
checkEqual("players for +50%", friendPlayersOf("+50%"), 6);

done();
