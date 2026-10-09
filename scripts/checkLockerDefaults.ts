// What the Harvest Locker does before the player has asked it for anything.
//
// Turning the Locker on, or switching a single species on, used to start from
// "Range 50 to 100". That is an *active* size criterion which every crop matches,
// so in LOCK mode it locked the whole species outright while the sliders sat at
// their extremes and read as no filter at all. Someone reported exactly that:
// Aloe became unharvestable with no visible reason.
import { checkEqual, done } from "./_check";
import { lockerService, type LockerSettingsPersisted } from "../src/features/locker/locker";

const SIZES = [50, 62, 75, 88, 100];
const allows = (seedKey: string, size: number) =>
  lockerService.allowsHarvest({ seedKey, sizePercent: size, mutations: [] });
const allowedAt = (seedKey: string) => SIZES.filter((size) => allows(seedKey, size));

// The untouched settings, as the service itself builds them.
const untouched = lockerService.getState().settings;
const clone = (patch: Partial<LockerSettingsPersisted> = {}): LockerSettingsPersisted =>
  ({ ...untouched, ...patch });

checkEqual("no size criterion out of the box", untouched.scaleLockMode, "NONE");
checkEqual("lock mode is still LOCK", untouched.lockMode ?? "LOCK", "LOCK");

// --- the Locker on, nothing configured --------------------------------------
lockerService.setGlobalState({ enabled: true, settings: clone() });
checkEqual("switching the Locker on locks nothing", allowedAt("Carrot").join(","), SIZES.join(","));

// --- a species switched on, nothing configured ------------------------------
lockerService.setOverride("Aloe", { enabled: true, settings: clone() });
checkEqual("switching a species on locks nothing", allowedAt("Aloe").join(","), SIZES.join(","));
checkEqual("and the other species are untouched", allowedAt("Carrot").join(","), SIZES.join(","));

// --- the criteria still work when actually asked for ------------------------
lockerService.setOverride("Aloe", { enabled: true, settings: clone({ scaleLockMode: "MINIMUM", minScalePct: 80 }) });
checkEqual("LOCK + minimum 80 keeps the big ones", allowedAt("Aloe").join(","), "50,62,75");

lockerService.setOverride("Aloe", { enabled: true, settings: clone({ scaleLockMode: "MAXIMUM", maxScalePct: 75 }) });
checkEqual("LOCK + maximum 75 keeps the small ones", allowedAt("Aloe").join(","), "88,100");

lockerService.setOverride("Aloe", {
  enabled: true,
  settings: clone({ scaleLockMode: "RANGE", minScalePct: 60, maxScalePct: 90 }),
});
checkEqual("LOCK + range 60-90 keeps what falls outside", allowedAt("Aloe").join(","), "50,100");

// A full-span range stays a real "lock the lot": it is a deliberate choice, it
// just is no longer what a species starts on.
lockerService.setOverride("Aloe", {
  enabled: true,
  settings: clone({ scaleLockMode: "RANGE", minScalePct: 50, maxScalePct: 100 }),
});
checkEqual("an explicit full range still locks everything", allowedAt("Aloe").length, 0);

// --- a disabled override falls back to the global settings ------------------
lockerService.setOverride("Aloe", { enabled: false, settings: clone({ scaleLockMode: "RANGE" }) });
checkEqual("a switched-off species is not locked", allowedAt("Aloe").join(","), SIZES.join(","));

done();
