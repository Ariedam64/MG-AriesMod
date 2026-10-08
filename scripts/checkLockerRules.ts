// What the Harvest Locker decides for a crop, filter by filter.
//
// The locker reads a crop's size and mutations and either lets the harvest go
// out or drops it. These cases pin every filter the menu offers (size, colour,
// weather in its three modes, the "no weather" tag) in both LOCK and ALLOW
// mode, so moving the rules around cannot change what gets blocked.
//
// Run with: npm run check:lockerrules
import { lockerService, type LockerSettingsPersisted } from "../src/features/locker/locker";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

const base = lockerService.getState().settings;
const configure = (patch: Partial<LockerSettingsPersisted>) =>
  lockerService.setGlobalState({ enabled: true, settings: { ...base, ...patch } });
const allows = (sizePercent: number, mutations: string[] = []) =>
  lockerService.allowsHarvest({ seedKey: "Carrot", sizePercent, mutations });

// --- colour ---------------------------------------------------------------
configure({ visualMutations: ["Gold"] });
check("LOCK gold blocks a gold crop", allows(80, ["Gold"]), false);
check("LOCK gold lets a normal crop through", allows(80), true);
check("LOCK gold lets a rainbow crop through", allows(80, ["Rainbow"]), true);

configure({ avoidNormal: true });
check("LOCK normal blocks a crop with no colour", allows(80, ["Wet"]), false);
check("LOCK normal lets a gold crop through", allows(80, ["Gold"]), true);

// Settings saved before `avoidNormal` existed only carry `includeNormal`.
const { avoidNormal: _dropped, ...withoutAvoidNormal } = base;
lockerService.setGlobalState({
  enabled: true,
  settings: { ...withoutAvoidNormal, includeNormal: false } as unknown as LockerSettingsPersisted,
});
check("the legacy includeNormal=false still means avoid normal", allows(80), false);

// --- weather, ANY ---------------------------------------------------------
configure({ weatherMode: "ANY", weatherSelected: ["Wet", "Frozen"] });
check("ANY blocks a crop carrying one of them", allows(80, ["Wet"]), false);
check("ANY lets a crop with none of them through", allows(80, ["Chilled"]), true);
check("ANY reads mutation tags in any spelling", allows(80, ["dawn-lit", "frozen"]), false);

configure({ weatherMode: "ANY", weatherSelected: ["NoWeatherEffect"] });
check("ANY no-weather blocks a crop without weather", allows(80, ["Gold"]), false);
check("ANY no-weather lets a wet crop through", allows(80, ["Wet"]), true);

// --- weather, ALL ---------------------------------------------------------
configure({ weatherMode: "ALL", weatherSelected: ["Wet", "Dawnlit"] });
check("ALL blocks a crop carrying both", allows(80, ["Wet", "Dawnlit"]), false);
check("ALL lets a crop carrying one through", allows(80, ["Wet"]), true);
check("ALL accepts the old Dawn spelling", allows(80, ["Wet", "Dawn"]), false);

// --- weather, RECIPES -----------------------------------------------------
configure({ weatherMode: "RECIPES", weatherSelected: ["Wet"], weatherRecipes: [["Frozen", "Amberlit"], ["Chilled"]] });
check("RECIPES ignores the plain selection", allows(80, ["Wet"]), true);
check("RECIPES blocks a full first row", allows(80, ["Frozen", "Amberlit"]), false);
check("RECIPES blocks a full second row", allows(80, ["Chilled", "Gold"]), false);
check("RECIPES lets a partial row through", allows(80, ["Frozen"]), true);

configure({ weatherMode: "RECIPES", weatherRecipes: [["NoWeatherEffect"]] });
check("RECIPES no-weather row blocks a crop without weather", allows(80), false);
check("RECIPES no-weather row lets a wet crop through", allows(80, ["Wet"]), true);

// --- several categories in LOCK: any match blocks ---------------------------
configure({ scaleLockMode: "MINIMUM", minScalePct: 90, visualMutations: ["Rainbow"] });
check("LOCK size or colour: a big normal crop is blocked", allows(95), false);
check("LOCK size or colour: a small rainbow crop is blocked", allows(60, ["Rainbow"]), false);
check("LOCK size or colour: a small normal crop goes", allows(60), true);

// --- ALLOW: every category with criteria must match --------------------------
configure({ lockMode: "ALLOW", scaleLockMode: "MINIMUM", minScalePct: 90, visualMutations: ["Gold"] });
check("ALLOW size and colour: big gold goes", allows(95, ["Gold"]), true);
check("ALLOW size and colour: big normal is blocked", allows(95), false);
check("ALLOW size and colour: small gold is blocked", allows(60, ["Gold"]), false);

configure({ lockMode: "ALLOW" });
check("ALLOW with no criteria lets everything through", allows(60), true);

configure({ lockMode: "ALLOW", scaleLockMode: "RANGE", minScalePct: 70, maxScalePct: 80 });
check("ALLOW range 70-80 lets 75 through", allows(75), true);
check("ALLOW range 70-80 blocks 85", allows(85), false);

configure({ lockMode: "ALLOW", weatherMode: "RECIPES", weatherRecipes: [["Wet", "Amberbound"]] });
check("ALLOW recipe: the full row goes", allows(80, ["Amberbound", "Wet"]), true);
check("ALLOW recipe: half the row is blocked", allows(80, ["Wet"]), false);

// --- a range the player squeezed shut is opened by one point -----------------
configure({ scaleLockMode: "RANGE", minScalePct: 99, maxScalePct: 99 });
check("a 99-99 range is stored as 99-100", `${lockerService.getState().settings.minScalePct}-${lockerService.getState().settings.maxScalePct}`, "99-100");
configure({ scaleLockMode: "RANGE", minScalePct: 70, maxScalePct: 60 });
check("an inverted range is stored as min..min+1", `${lockerService.getState().settings.minScalePct}-${lockerService.getState().settings.maxScalePct}`, "70-71");

// --- the switch -------------------------------------------------------------
lockerService.setGlobalState({ enabled: false, settings: { ...base, visualMutations: ["Gold"] } });
check("a switched-off locker blocks nothing", allows(80, ["Gold"]), true);

console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
process.exit(failed ? 1 : 0);
