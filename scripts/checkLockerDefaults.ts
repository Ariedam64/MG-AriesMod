// What the Harvest Locker does before the player has asked it for anything.
//
// Turning the Locker on, or switching a single species on, used to start from
// "Range 50–100". That is an *active* size criterion which every crop matches,
// so in LOCK mode it locked the whole species outright while the sliders sat at
// their extremes and read as no filter at all. Someone reported exactly that:
// Aloe became unharvestable with no visible reason.
import { lockerService, type LockerSettingsPersisted } from "../src/services/locker";

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

const SIZES = [50, 62, 75, 88, 100];
const allows = (seedKey: string, size: number) =>
  lockerService.allowsHarvest({ seedKey, sizePercent: size, mutations: [] });
const allowedAt = (seedKey: string) => SIZES.filter((size) => allows(seedKey, size));

// The untouched settings, as the service itself builds them.
const untouched = lockerService.getState().settings;
const clone = (patch: Partial<LockerSettingsPersisted> = {}): LockerSettingsPersisted =>
  ({ ...untouched, ...patch });

check("no size criterion out of the box", untouched.scaleLockMode, "NONE");
check("lock mode is still LOCK", untouched.lockMode ?? "LOCK", "LOCK");

// --- the Locker on, nothing configured --------------------------------------
lockerService.setGlobalState({ enabled: true, settings: clone() });
check("switching the Locker on locks nothing", allowedAt("Carrot").join(","), SIZES.join(","));

// --- a species switched on, nothing configured ------------------------------
lockerService.setOverride("Aloe", { enabled: true, settings: clone() });
check("switching a species on locks nothing", allowedAt("Aloe").join(","), SIZES.join(","));
check("and the other species are untouched", allowedAt("Carrot").join(","), SIZES.join(","));

// --- the criteria still work when actually asked for ------------------------
lockerService.setOverride("Aloe", { enabled: true, settings: clone({ scaleLockMode: "MINIMUM", minScalePct: 80 }) });
check("LOCK + minimum 80 keeps the big ones", allowedAt("Aloe").join(","), "50,62,75");

lockerService.setOverride("Aloe", { enabled: true, settings: clone({ scaleLockMode: "MAXIMUM", maxScalePct: 75 }) });
check("LOCK + maximum 75 keeps the small ones", allowedAt("Aloe").join(","), "88,100");

lockerService.setOverride("Aloe", {
  enabled: true,
  settings: clone({ scaleLockMode: "RANGE", minScalePct: 60, maxScalePct: 90 }),
});
check("LOCK + range 60-90 keeps what falls outside", allowedAt("Aloe").join(","), "50,100");

// A full-span range stays a real "lock the lot": it is a deliberate choice, it
// just is no longer what a species starts on.
lockerService.setOverride("Aloe", {
  enabled: true,
  settings: clone({ scaleLockMode: "RANGE", minScalePct: 50, maxScalePct: 100 }),
});
check("an explicit full range still locks everything", allowedAt("Aloe").length, 0);

// --- a disabled override falls back to the global settings ------------------
lockerService.setOverride("Aloe", { enabled: false, settings: clone({ scaleLockMode: "RANGE" }) });
check("a switched-off species is not locked", allowedAt("Aloe").join(","), SIZES.join(","));

console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
process.exit(failed ? 1 : 0);
