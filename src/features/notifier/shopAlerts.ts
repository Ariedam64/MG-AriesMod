import { Emitter } from "../../lib/emitter";
import {
  purchasedCount,
  shopItemId,
  type PurchasesSnapshot,
  type ShopItem,
  type ShopsSnapshot,
} from "../shops/shopFeed";
import type { ShopKind } from "../shops/purchases";
import type { Kind as BuyKind } from "../shops/shops";
import { audio, type PlaybackMode, type TriggerOverrides } from "./audio/audio";
import { ruleOverrides, type NotifierRule } from "./rules";
import { ShopRows } from "./shopRows";

/**
 * Which followed items are in stock right now, and the sounds that go with
 * them. The overlay draws the list; this decides it and rings for it.
 *
 * Sounds follow the list: an item that appears rings, one that leaves stops
 * its loop, and a restock rings everything again. Until the shops have
 * settled at boot nothing rings, then whatever is already listed rings once.
 */

export type AvailableItem = { id: string; qty: number };

const SHOP_KINDS: ShopKind[] = ["seed", "tool", "egg", "decor"];

const BUY_KIND: Record<ShopKind, BuyKind> = { seed: "seeds", egg: "eggs", tool: "tools", decor: "decor" };

const KIND_OF_PREFIX: Record<string, ShopKind> = { Seed: "seed", Egg: "egg", Tool: "tool", Decor: "decor" };

/** Boot is over once the shops have been pushed this many times... */
const SHOP_UPDATES_TO_ARM = 3;
/** ...the purchases this many times, and the shops are not empty. */
const PURCHASE_UPDATES_TO_ARM = 2;

/** The stock entry of an alert item (`Seed:Carrot`) in the shops, with what ShopsService needs to buy it. */
export function findStockItem(
  shops: ShopsSnapshot | null,
  id: string,
): { kind: BuyKind; item: ShopItem } | null {
  if (!shops) return null;
  const [prefix, raw] = String(id).split(":");
  const kind = KIND_OF_PREFIX[prefix];
  if (!kind || !raw) return null;
  const item = shops[kind]?.inventory?.find((it) => shopItemId(kind, it) === `${prefix}:${raw}`);
  return item ? { kind: BUY_KIND[kind], item } : null;
}

export class ShopAlerts {
  private shops: ShopsSnapshot | null = null;
  private purchases: PurchasesSnapshot | null = null;
  private rules = new Map<string, NotifierRule>();
  private available: AvailableItem[] = [];
  private listedIds = new Set<string>();
  private prevListedIds = new Set<string>();

  private shopUpdates = 0;
  private purchaseUpdates = 0;
  private armed = false;
  private justRestocked = false;

  private readonly changed = new Emitter<AvailableItem[]>();

  constructor() {
    // A loop set to stop on purchase asks this before each play.
    audio.setPurchaseChecker((itemId) => {
      if (!itemId || this.listedIds.has(itemId)) return false;
      return purchasedCount(itemId, this.purchases) > 0;
    });
  }

  /** Fires with the listed items after every update, before any sound starts. */
  onChange(cb: (items: AvailableItem[]) => void): () => void {
    return this.changed.on(cb);
  }

  items(): AvailableItem[] {
    return this.available;
  }

  shopsSnapshot(): ShopsSnapshot | null {
    return this.shops;
  }

  setShops(next: ShopsSnapshot): void {
    const prev = this.shops;
    this.shops = next;
    this.shopUpdates++;
    // A restock timer that went up means at least one shop restocked.
    this.justRestocked =
      !!prev && SHOP_KINDS.some((k) => (prev[k]?.secondsUntilRestock ?? 0) < (next[k]?.secondsUntilRestock ?? 0));
    this.update();
  }

  setPurchases(next: PurchasesSnapshot): void {
    this.purchases = next;
    this.purchaseUpdates++;
    this.update();
  }

  /** The followed items changed. */
  refresh(): void {
    this.update();
  }

  setRules(rules: Record<string, NotifierRule>): void {
    this.rules.clear();
    for (const [id, rule] of Object.entries(rules)) {
      if (id && rule) this.rules.set(id, { ...rule });
    }
    this.restartLoops();
  }

  /* ================================ Listing ================================ */

  private listAvailable(shops: ShopsSnapshot, purchases: PurchasesSnapshot): AvailableItem[] {
    const out: AvailableItem[] = [];
    for (const kind of SHOP_KINDS) {
      for (const item of shops[kind].inventory) {
        const id = shopItemId(kind, item);
        if (!id || !ShopRows.isFollowed(id)) continue;
        const remaining = Math.max(Number(item.initialStock) - purchasedCount(id, purchases), 0);
        if (remaining > 0) out.push({ id, qty: remaining });
      }
    }
    return out;
  }

  private update(): void {
    const shops = this.shops;
    const purchases = this.purchases;
    if (!shops || !purchases) return;

    this.available = this.listAvailable(shops, purchases);
    this.changed.emit(this.available);

    const listed = new Set(this.available.map((r) => r.id));
    this.listedIds = listed;

    if (!this.armed) {
      const shopsEmpty = SHOP_KINDS.every((k) => (shops[k]?.inventory?.length ?? 0) === 0);
      const settled =
        this.shopUpdates >= SHOP_UPDATES_TO_ARM && this.purchaseUpdates >= PURCHASE_UPDATES_TO_ARM && !shopsEmpty;
      if (settled) {
        this.armed = true;
        if (listed.size > 0) this.ring(listed);
        this.justRestocked = false;
      }
      this.prevListedIds = listed;
      return;
    }

    if (listed.size === 0) {
      audio.stopAllLoops();
    } else if (this.justRestocked) {
      this.ring(listed);
      this.stopLoopsLeaving(listed);
    } else {
      const appeared = [...listed].filter((id) => !this.prevListedIds.has(id));
      if (appeared.length) this.ring(appeared);
      this.stopLoopsLeaving(listed);
    }
    this.prevListedIds = listed;
    this.justRestocked = false;
  }

  private stopLoopsLeaving(listed: Set<string>): void {
    for (const id of this.prevListedIds) {
      if (!listed.has(id)) audio.stopLoop(id);
    }
  }

  /* ================================ Sounds ================================= */

  private playbackModeOf(id: string): PlaybackMode {
    const rule = this.rules.get(id);
    const baseMode = audio.getPlaybackMode("shops");
    if (!rule) return baseMode;
    if (rule.playbackMode === "loop" || rule.playbackMode === "oneshot") return rule.playbackMode;
    if ((rule.stopMode || rule.loopIntervalMs != null) && baseMode === "loop") return "loop";
    return baseMode;
  }

  /**
   * Rings for these items. Items sharing a sound and volume ring once
   * together: every loop starts, and a one-shot plays only when no loop
   * shares its sound.
   */
  private ring(ids: Iterable<string>): void {
    type Entry = { id: string; overrides: TriggerOverrides };
    const groups = new Map<string, { loops: Entry[]; oneshots: Entry[] }>();

    for (const id of ids) {
      const overrides = ruleOverrides(this.rules.get(id)) ?? {};
      const sound = overrides.sound ? overrides.sound.trim().toLowerCase() : "__default__";
      const volume = overrides.volume != null ? Math.round(overrides.volume * 1000) : "__default__";
      const key = `sound:${sound}|vol:${volume}`;
      const group = groups.get(key) ?? { loops: [], oneshots: [] };
      if (this.playbackModeOf(id) === "loop") group.loops.push({ id, overrides });
      else group.oneshots.push({ id, overrides });
      groups.set(key, group);
    }

    for (const { loops, oneshots } of groups.values()) {
      if (loops.length) {
        for (const entry of loops) audio.trigger(entry.id, entry.overrides, "shops").catch(() => {});
      } else if (oneshots.length) {
        audio.trigger(oneshots[0].id, oneshots[0].overrides, "shops").catch(() => {});
      }
    }
  }

  /** Restarts the loops of listed items so a changed rule takes effect. */
  private restartLoops(): void {
    const loopIds = [...this.listedIds].filter((id) => this.playbackModeOf(id) === "loop");
    for (const id of loopIds) audio.stopLoop(id);
    if (loopIds.length) this.ring(loopIds);
  }
}
