import { Subscriptions } from "../../lib/emitter";
import { ShopFeed, type PurchasesSnapshot, type ShopsSnapshot } from "../shops/shopFeed";
import { InventoryCaps } from "./inventoryCaps";
import { NotifierRules, type NotifierRule } from "./rules";
import { ShopRows, type NotifierState } from "./shopRows";
import { WeatherAlerts, type WeatherState } from "./weatherAlerts";

/**
 * The alerts service: starts the shop feed, the inventory caps and the
 * weather watcher together, and hands each listener the current value before
 * its first change. Started on first use by the overlay, the menu or the
 * companion, whichever comes first.
 */

let started = false;
const subscriptions = new Subscriptions();

const onCatalogsUpdated = () => {
  try {
    ShopRows.rebuild();
  } catch {}
};

async function ensureStarted(): Promise<void> {
  if (started) return;
  started = true;

  try {
    ShopRows.rebuild();
  } catch {}
  window.addEventListener("gemini:data-updated", onCatalogsUpdated);
  subscriptions.add(() => window.removeEventListener("gemini:data-updated", onCatalogsUpdated));

  // Not awaited: the HUD mounts the overlay long before the game registers
  // its atoms, and the feed pushes as soon as they arrive.
  ShopFeed.start();
  subscriptions.add(() => ShopFeed.stop());

  subscriptions.add(InventoryCaps.onChange(() => ShopRows.refresh()));
  subscriptions.add(() => InventoryCaps.stop());
  await InventoryCaps.start();

  subscriptions.add(() => WeatherAlerts.stop());
  await WeatherAlerts.start();
}

function stop(): void {
  subscriptions.dispose();
  started = false;
}

export const NotifierService = {
  /** Starts everything; resolves to the function that stops it. */
  async start(): Promise<() => void> {
    await ensureStarted();
    return stop;
  },

  async get(): Promise<NotifierState> {
    await ensureStarted();
    return ShopRows.state();
  },

  async onChangeNow(cb: (s: NotifierState) => void): Promise<() => void> {
    await ensureStarted();
    cb(ShopRows.state());
    return ShopRows.onChange(cb);
  },

  async onShopsChangeNow(cb: (s: ShopsSnapshot) => void): Promise<() => void> {
    await ensureStarted();
    try {
      cb(await ShopFeed.readShops());
    } catch {}
    return ShopFeed.onShopsChange(cb);
  },

  async onPurchasesChangeNow(cb: (p: PurchasesSnapshot) => void): Promise<() => void> {
    await ensureStarted();
    try {
      cb(await ShopFeed.readPurchases());
    } catch {}
    return ShopFeed.onPurchasesChange(cb);
  },

  async getWeatherState(): Promise<WeatherState> {
    await ensureStarted();
    return WeatherAlerts.state();
  },

  async onWeatherChangeNow(cb: (s: WeatherState) => void): Promise<() => void> {
    await ensureStarted();
    cb(WeatherAlerts.state());
    return WeatherAlerts.onChange(cb);
  },

  async onRulesChangeNow(cb: (rules: Record<string, NotifierRule>) => void): Promise<() => void> {
    await ensureStarted();
    cb(NotifierRules.getAll());
    return NotifierRules.onChange(cb);
  },

  /** Whether an item's alert is on. A capped item reads as off. */
  getPref(id: string): { popup: boolean; followed: boolean } {
    const on = ShopRows.isFollowed(id);
    return { popup: on, followed: on };
  },
};
