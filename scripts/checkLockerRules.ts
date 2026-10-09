// What the Harvest Locker decides for a crop, filter by filter.
//
// The locker reads a crop's size and mutations and either lets the harvest go
// out or drops it. These cases pin every filter the menu offers (size, colour,
// weather in its three modes, the "no weather" tag) in both LOCK and ALLOW
// mode, so moving the rules around cannot change what gets blocked.
//
// Run with: npm run check:lockerrules
import { checkEqual, done } from "./_check";
import { lockerService, type LockerSettingsPersisted } from "../src/features/locker/locker";

const base = lockerService.getState().settings;
const configure = (patch: Partial<LockerSettingsPersisted>) =>
  lockerService.setGlobalState({ enabled: true, settings: { ...base, ...patch } });
const allows = (sizePercent: number, mutations: string[] = []) =>
  lockerService.allowsHarvest({ seedKey: "Carrot", sizePercent, mutations });

// --- colour ---------------------------------------------------------------
configure({ visualMutations: ["Gold"] });
checkEqual("LOCK gold blocks a gold crop", allows(80, ["Gold"]), false);
checkEqual("LOCK gold lets a normal crop through", allows(80), true);
checkEqual("LOCK gold lets a rainbow crop through", allows(80, ["Rainbow"]), true);

configure({ avoidNormal: true });
checkEqual("LOCK normal blocks a crop with no colour", allows(80, ["Wet"]), false);
checkEqual("LOCK normal lets a gold crop through", allows(80, ["Gold"]), true);

// Settings saved before `avoidNormal` existed only carry `includeNormal`.
const { avoidNormal: _dropped, ...withoutAvoidNormal } = base;
lockerService.setGlobalState({
  enabled: true,
  settings: { ...withoutAvoidNormal, includeNormal: false } as unknown as LockerSettingsPersisted,
});
checkEqual("the legacy includeNormal=false still means avoid normal", allows(80), false);

// --- weather, ANY ---------------------------------------------------------
configure({ weatherMode: "ANY", weatherSelected: ["Wet", "Frozen"] });
checkEqual("ANY blocks a crop carrying one of them", allows(80, ["Wet"]), false);
checkEqual("ANY lets a crop with none of them through", allows(80, ["Chilled"]), true);
checkEqual("ANY reads mutation tags in any spelling", allows(80, ["dawn-lit", "frozen"]), false);

configure({ weatherMode: "ANY", weatherSelected: ["NoWeatherEffect"] });
checkEqual("ANY no-weather blocks a crop without weather", allows(80, ["Gold"]), false);
checkEqual("ANY no-weather lets a wet crop through", allows(80, ["Wet"]), true);

// --- weather, ALL ---------------------------------------------------------
configure({ weatherMode: "ALL", weatherSelected: ["Wet", "Dawnlit"] });
checkEqual("ALL blocks a crop carrying both", allows(80, ["Wet", "Dawnlit"]), false);
checkEqual("ALL lets a crop carrying one through", allows(80, ["Wet"]), true);
checkEqual("ALL accepts the old Dawn spelling", allows(80, ["Wet", "Dawn"]), false);

// --- weather, RECIPES -----------------------------------------------------
configure({ weatherMode: "RECIPES", weatherSelected: ["Wet"], weatherRecipes: [["Frozen", "Amberlit"], ["Chilled"]] });
checkEqual("RECIPES ignores the plain selection", allows(80, ["Wet"]), true);
checkEqual("RECIPES blocks a full first row", allows(80, ["Frozen", "Amberlit"]), false);
checkEqual("RECIPES blocks a full second row", allows(80, ["Chilled", "Gold"]), false);
checkEqual("RECIPES lets a partial row through", allows(80, ["Frozen"]), true);

configure({ weatherMode: "RECIPES", weatherRecipes: [["NoWeatherEffect"]] });
checkEqual("RECIPES no-weather row blocks a crop without weather", allows(80), false);
checkEqual("RECIPES no-weather row lets a wet crop through", allows(80, ["Wet"]), true);

// --- several categories in LOCK: any match blocks ---------------------------
configure({ scaleLockMode: "MINIMUM", minScalePct: 90, visualMutations: ["Rainbow"] });
checkEqual("LOCK size or colour: a big normal crop is blocked", allows(95), false);
checkEqual("LOCK size or colour: a small rainbow crop is blocked", allows(60, ["Rainbow"]), false);
checkEqual("LOCK size or colour: a small normal crop goes", allows(60), true);

// --- ALLOW: every category with criteria must match --------------------------
configure({ lockMode: "ALLOW", scaleLockMode: "MINIMUM", minScalePct: 90, visualMutations: ["Gold"] });
checkEqual("ALLOW size and colour: big gold goes", allows(95, ["Gold"]), true);
checkEqual("ALLOW size and colour: big normal is blocked", allows(95), false);
checkEqual("ALLOW size and colour: small gold is blocked", allows(60, ["Gold"]), false);

configure({ lockMode: "ALLOW" });
checkEqual("ALLOW with no criteria lets everything through", allows(60), true);

configure({ lockMode: "ALLOW", scaleLockMode: "RANGE", minScalePct: 70, maxScalePct: 80 });
checkEqual("ALLOW range 70-80 lets 75 through", allows(75), true);
checkEqual("ALLOW range 70-80 blocks 85", allows(85), false);

configure({ lockMode: "ALLOW", weatherMode: "RECIPES", weatherRecipes: [["Wet", "Amberbound"]] });
checkEqual("ALLOW recipe: the full row goes", allows(80, ["Amberbound", "Wet"]), true);
checkEqual("ALLOW recipe: half the row is blocked", allows(80, ["Wet"]), false);

// --- a range the player squeezed shut is opened by one point -----------------
configure({ scaleLockMode: "RANGE", minScalePct: 99, maxScalePct: 99 });
checkEqual("a 99-99 range is stored as 99-100", `${lockerService.getState().settings.minScalePct}-${lockerService.getState().settings.maxScalePct}`, "99-100");
configure({ scaleLockMode: "RANGE", minScalePct: 70, maxScalePct: 60 });
checkEqual("an inverted range is stored as min..min+1", `${lockerService.getState().settings.minScalePct}-${lockerService.getState().settings.maxScalePct}`, "70-71");

// --- the switch -------------------------------------------------------------
lockerService.setGlobalState({ enabled: false, settings: { ...base, visualMutations: ["Gold"] } });
checkEqual("a switched-off locker blocks nothing", allows(80, ["Gold"]), true);

done();
