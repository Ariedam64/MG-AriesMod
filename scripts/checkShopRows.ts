// Which shop an item belongs to, read from the catalogs' `eligibleShops`.
//
// The game's shop enum is lower case ("tool", "snow"), while the mod used to
// compare against "Tool" with a capital. Served raw, every tool would turn into
// a weather-only item with a "tool only" chip. What this guards:
//   - `splitEligibleShops` reads shop names whatever their case, and gives
//     the base shop as a section type and weather shops with a capital
//     ("snow" becomes "Snow");
//   - the bundled catalog copy, used when /data fails at boot, carries the
//     new cleansers (Tool Shop) and the weather shop potions, so the Shops tab
//     lists them; RainbowPotion, sold by no shop, gets no row.
//
// Run with: npm run check:shoprows

import { check, checkEqual, done } from "./_check";
import * as shopRowsModule from "../src/features/notifier/shopRows";
import { ShopRows, type NotifierRow } from "../src/features/notifier/shopRows";

type Split = { base: string | null; weathers: string[] };

// Read through Reflect so the suite still bundles while the function is not exported.
const exported: unknown = Reflect.get(shopRowsModule, "splitEligibleShops");
const split = typeof exported === "function" ? (exported as (shops: unknown) => Split) : null;

check("shopRows exports splitEligibleShops", split !== null);
const splitOf = (shops: unknown): Split | null => (split ? split(shops) : null);

checkEqual("lower case tool is the Tool shop", splitOf(["tool"]), { base: "Tool", weathers: [] });
checkEqual("capitalised Tool is the Tool shop", splitOf(["Tool"]), { base: "Tool", weathers: [] });
checkEqual("lower case snow is the Snow weather shop", splitOf(["snow"]), { base: null, weathers: ["Snow"] });
checkEqual("capitalised Dawn stays the Dawn weather shop", splitOf(["Dawn"]), { base: null, weathers: ["Dawn"] });
checkEqual("an empty list gives nothing", splitOf([]), { base: null, weathers: [] });
checkEqual("no list gives nothing", splitOf(undefined), { base: null, weathers: [] });

// Rows from the bundled copy: the check runs offline, so MG API never answers.
const rows = ShopRows.state().rows;
const row = (id: string): NotifierRow | undefined => rows.find((r) => r.id === id);
const shape = (r: NotifierRow | undefined) =>
  r ? { type: r.type, name: r.name, weatherOnly: r.weatherOnly ?? false, weathers: r.weathers ?? [] } : null;

checkEqual("Hydro Cleanser is a Tool Shop row", shape(row("Tool:HydroCleanser")), {
  type: "Tool",
  name: "Hydro Cleanser",
  weatherOnly: false,
  weathers: [],
});
checkEqual("Lunar Cleanser is a Tool Shop row", shape(row("Tool:LunarCleanser")), {
  type: "Tool",
  name: "Lunar Cleanser",
  weatherOnly: false,
  weathers: [],
});
const frozen = row("Tool:FrozenPotion");
checkEqual("Frozen Potion is sold only by the Snow shop", frozen ? [frozen.weatherOnly, frozen.weathers] : null, [true, ["Snow"]]);
const dawnbound = row("Tool:DawnboundPotion");
checkEqual("Dawnbound Potion is sold by the Dawn shop", dawnbound ? dawnbound.weathers : null, ["Dawn"]);
checkEqual("Rainbow Potion, sold by no shop, has no row", row("Tool:RainbowPotion"), undefined);

done();
