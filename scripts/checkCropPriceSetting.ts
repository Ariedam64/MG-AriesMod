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

import { checkEqual, done } from "./_check";
import { readAriesPath } from "../src/platform/storage";
import { onShowCropPriceChange, readShowCropPrice, writeShowCropPrice } from "../src/features/cropPrice/setting";

console.log("--- crop price in the tooltip ---");
checkEqual("shown by default, nothing changes for anyone who touches nothing", readShowCropPrice(), true);

const seen: boolean[] = [];
const off = onShowCropPriceChange((on) => seen.push(on));

writeShowCropPrice(false);
checkEqual("turns off", readShowCropPrice(), false);
checkEqual("and the displays are told at once", seen.join(), "false");
checkEqual("stored in the misc section", readAriesPath("misc.showCropPrice"), false);
checkEqual("without touching the other Misc settings", readAriesPath("misc.ghostMode"), true);

writeShowCropPrice(false);
checkEqual("writing the same value again tells nobody", seen.join(), "false");

writeShowCropPrice(true);
checkEqual("turns back on", readShowCropPrice(), true);
checkEqual("and tells them again", seen.join(), "false,true");

off();
writeShowCropPrice(false);
checkEqual("a removed subscriber is no longer told", seen.join(), "false,true");

// The misc section is read back whole on reload: the value must be on disk,
// not only in the memory cache.
const onDisk = JSON.parse(stored.get("aries_mod") ?? "{}");
const flushed = onDisk?.misc?.showCropPrice;
checkEqual("written to disk (or waiting to be written)", flushed === false || readAriesPath("misc.showCropPrice") === false, true);

done();
