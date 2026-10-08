import { Atoms } from "../../game/store/atoms";
import { Emitter } from "../../lib/emitter";
import { decorCatalog, eggCatalog, plantCatalog, toolCatalog } from "../../data";
import { playerShopView, type PlayerShopView, type ShopKind } from "./purchases";

/**
 * The shops as this player sees them, and what they bought in the current
 * restocks, pushed to listeners whenever either changes.
 *
 * Which shop the player buys from depends on two values: the room's shops,
 * and the player's slot (personal restocks, purchases). Both raw values are
 * kept, and a change to either re-derives the view.
 */

export type ShopItem = {
  itemType?: string;
  species?: string;
  eggId?: string;
  toolId?: string;
  decorId?: string;
  initialStock?: number;
  [field: string]: unknown;
};

type ShopSection = { inventory: ShopItem[]; secondsUntilRestock: number };

export type ShopsSnapshot = Record<ShopKind, ShopSection>;

export type PurchasesSnapshot = Record<ShopKind, { createdAt: number; purchases: Record<string, number> }>;

const ITEM_TYPE_KIND: Record<string, ShopKind> = { Seed: "seed", Egg: "egg", Tool: "tool", Decor: "decor" };

/** The kind of a weather shop item, which its shop key does not tell. */
function itemKind(itemId: string): ShopKind | null {
  if (itemId in plantCatalog) return "seed";
  if (itemId in eggCatalog) return "egg";
  if (itemId in toolCatalog) return "tool";
  if (itemId in decorCatalog) return "decor";
  return null;
}

const viewOf = (shops: unknown, slot: unknown): PlayerShopView => playerShopView(shops, slot, itemKind);

/** Every open shop's stock, grouped by item kind (weather shops included). */
function toShopsSnapshot(shops: any): ShopsSnapshot {
  const snap: ShopsSnapshot = {
    seed: { inventory: [], secondsUntilRestock: Number(shops?.seed?.secondsUntilRestock) || 0 },
    egg: { inventory: [], secondsUntilRestock: Number(shops?.egg?.secondsUntilRestock) || 0 },
    tool: { inventory: [], secondsUntilRestock: Number(shops?.tool?.secondsUntilRestock) || 0 },
    decor: { inventory: [], secondsUntilRestock: Number(shops?.decor?.secondsUntilRestock) || 0 },
  };
  if (!shops || typeof shops !== "object") return snap;
  for (const shop of Object.values<any>(shops)) {
    if (!shop || typeof shop !== "object" || !Array.isArray(shop.inventory)) continue;
    for (const item of shop.inventory) {
      if (!item || typeof item !== "object") continue;
      const kind = ITEM_TYPE_KIND[item.itemType];
      if (kind) snap[kind].inventory.push(item);
    }
  }
  return snap;
}

function toPurchasesSnapshot(view: PlayerShopView, slot: any): PurchasesSnapshot {
  const raw = slot?.data?.shopPurchases;
  const startedAt = (kind: ShopKind) => Number(raw?.[kind]?.startedAtMs ?? raw?.[kind]?.createdAt) || 0;
  const section = (kind: ShopKind) => ({ createdAt: startedAt(kind), purchases: view.purchases[kind] });
  return { seed: section("seed"), egg: section("egg"), tool: section("tool"), decor: section("decor") };
}

/** The slot changes on every garden tick; only these parts move the shops. */
const sameShopParts = (a: any, b: any): boolean =>
  a?.data?.shopPurchases === b?.data?.shopPurchases &&
  a?.data?.customRestocks === b?.data?.customRestocks &&
  a?.customRestockInventories === b?.customRestockInventories;

let rawShops: unknown = null;
let rawSlot: unknown = null;
const shopsChanged = new Emitter<ShopsSnapshot>();
const purchasesChanged = new Emitter<PurchasesSnapshot>();
let watching = false;

const emitShops = () => shopsChanged.emit(toShopsSnapshot(viewOf(rawShops, rawSlot).shops));
const emitPurchases = () => purchasesChanged.emit(toPurchasesSnapshot(viewOf(rawShops, rawSlot), rawSlot));

function onShops(shops: unknown): void {
  rawShops = shops;
  emitShops();
  // After the shops, never before: purchases re-derived against a restock the
  // overlay has not seen yet would make the old stock look unbought.
  if (rawSlot != null) emitPurchases();
}

function onSlot(slot: unknown): void {
  rawSlot = slot;
  // A personal restock changes the shop itself, not only the counts.
  if (rawShops != null) emitShops();
  emitPurchases();
}

async function readBoth(): Promise<[unknown, unknown]> {
  return Promise.all([Atoms.shop.shops.get(), Atoms.shop.myUserSlot.get()]);
}

export const ShopFeed = {
  /**
   * Follows the room's shops and the player's slot. The atoms may not exist
   * yet (the HUD mounts the overlay at document-start): the subscriptions
   * attach once the game registers them, and push the current value then.
   */
  start(): void {
    if (watching) return;
    watching = true;
    void Atoms.shop.shops.onChangeNow((next) => onShops(next));
    void Atoms.shop.myUserSlot.onChangeNow((next) => onSlot(next), sameShopParts);
  },

  onShopsChange(cb: (snap: ShopsSnapshot) => void): () => void {
    return shopsChanged.on(cb);
  },

  onPurchasesChange(cb: (snap: PurchasesSnapshot) => void): () => void {
    return purchasesChanged.on(cb);
  },

  /** The shops right now, read from the store rather than the last push. */
  async readShops(): Promise<ShopsSnapshot> {
    const [shops, slot] = await readBoth();
    return toShopsSnapshot(viewOf(shops, slot).shops);
  },

  /** The purchases right now, read from the store rather than the last push. */
  async readPurchases(): Promise<PurchasesSnapshot> {
    const [shops, slot] = await readBoth();
    return toPurchasesSnapshot(viewOf(shops, slot), slot);
  },
};

const ALERT_ID_PREFIX: Record<ShopKind, string> = { seed: "Seed", egg: "Egg", tool: "Tool", decor: "Decor" };

/** The item id the alerts use (`Seed:Carrot`) for a shop stock entry, or null. */
export function shopItemId(kind: ShopKind, item: ShopItem): string | null {
  const key =
    kind === "seed" ? item.species : kind === "egg" ? item.eggId : kind === "tool" ? item.toolId : item.decorId;
  if (key == null) return null;
  return `${ALERT_ID_PREFIX[kind]}:${key}`;
}

/** How many of an alert item (`Seed:Carrot`) the player bought in the current restock. */
export function purchasedCount(id: string, purchases: PurchasesSnapshot | null | undefined): number {
  if (!purchases) return 0;
  const [type, raw] = String(id).split(":");
  const kind: ShopKind = type === "Seed" ? "seed" : type === "Egg" ? "egg" : type === "Tool" ? "tool" : "decor";
  const n = purchases[kind]?.purchases?.[raw];
  return typeof n === "number" && n > 0 ? n : 0;
}
