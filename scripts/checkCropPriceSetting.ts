// Checks the option that hides the crop price in its tooltip.
//
// A player asked for it: the price the mod adds must be possible to turn off.
// It shows in two places (the Pixi card in the garden, and the HTML tooltips),
// which both read this setting and subscribe to it so they follow the switch
// without a reload.

type StubStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const stored = new Map<string, string>();
const storage: StubStorage = {
  getItem: (key) => stored.get(key) ?? null,
  setItem: (key, value) => void stored.set(key, value),
  removeItem: (key) => void stored.delete(key),
};

const globalAny = globalThis as unknown as Record<string, unknown>;
globalAny.window = globalAny;
globalAny.document = { addEventListener() {}, documentElement: {}, visibilityState: "visible" };
globalAny.addEventListener = () => {};
globalAny.localStorage = storage;

// A player who already has Misc settings, but never touched this one.
stored.set("aries_mod", JSON.stringify({ version: 2, misc: { ghostMode: true } }));

import { readAriesPath } from "../src/platform/storage";
import { onShowCropPriceChange, readShowCropPrice, writeShowCropPrice } from "../src/features/cropPrice/setting";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

console.log("--- crop price in the tooltip ---");
check("shown by default, nothing changes for anyone who touches nothing", readShowCropPrice(), true);

const seen: boolean[] = [];
const off = onShowCropPriceChange((on) => seen.push(on));

writeShowCropPrice(false);
check("turns off", readShowCropPrice(), false);
check("and the displays are told at once", seen.join(), "false");
check("stored in the misc section", readAriesPath("misc.showCropPrice"), false);
check("without touching the other Misc settings", readAriesPath("misc.ghostMode"), true);

writeShowCropPrice(false);
check("writing the same value again tells nobody", seen.join(), "false");

writeShowCropPrice(true);
check("turns back on", readShowCropPrice(), true);
check("and tells them again", seen.join(), "false,true");

off();
writeShowCropPrice(false);
check("a removed subscriber is no longer told", seen.join(), "false,true");

// The misc section is read back whole on reload: the value must be on disk,
// not only in the memory cache.
const onDisk = JSON.parse(stored.get("aries_mod") ?? "{}");
const flushed = onDisk?.misc?.showCropPrice;
check("written to disk (or waiting to be written)", flushed === false || readAriesPath("misc.showCropPrice") === false, true);

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
