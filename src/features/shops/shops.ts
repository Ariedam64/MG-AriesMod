import { openModal } from "../../game/fakeModal";
import { eventMatchesKeybind, type KeybindId } from "../keybinds/keybinds";
import { shouldIgnoreKeydown } from "../../lib/keyboard";
import { StatsService } from "../stats/stats";
import { sendToGame } from "../../game/ws/send";
import { Atoms } from "../../game/store/atoms";
import { pageWindow } from "../../platform/pageContext";
import { buildShopPurchaseCommand, readShopViewMode } from "../../game/ws/shopPurchaseMessage";
import { playerShopView } from "./purchases";

/** Buying from the shops (seeds, tools, eggs, decor), and the keybinds that open them. */

export type Kind = "seeds" | "tools" | "eggs" | "decor";

/* ================================ Keybinds ================================ */

type ShopModalId = "seedShop" | "eggShop" | "decorShop" | "toolShop";
type ShopKeybindId = Extract<KeybindId, "shops.seeds" | "shops.eggs" | "shops.decors" | "shops.tools">;

const SHOP_KEYBINDS: { id: ShopKeybindId; modal: ShopModalId }[] = [
  { id: "shops.seeds", modal: "seedShop" },
  { id: "shops.eggs", modal: "eggShop" },
  { id: "shops.decors", modal: "decorShop" },
  { id: "shops.tools", modal: "toolShop" },
];

let shopKeybindsInstalled = false;

export function installShopKeybindsOnce(): void {
  if (shopKeybindsInstalled || typeof window === "undefined") return;
  shopKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      const bind = SHOP_KEYBINDS.find(({ id }) => eventMatchesKeybind(id, event));
      if (!bind) return;
      event.preventDefault();
      event.stopPropagation();
      void openModal(bind.modal);
    },
    true,
  );
}

/* ================================ Purchases =============================== */

type ShopItemLike = Record<string, any>;
type ShopStatKey = "seedsBought" | "toolsBought" | "eggsBought" | "decorBought";
type PurchasePayload = { item: Record<string, string>; stat: ShopStatKey };

const BASE_SHOP_KEYS = ["seed", "egg", "tool", "decor"];

const BASE_SHOP_OF: Record<Kind, string> = { seeds: "seed", tools: "tool", eggs: "egg", decor: "decor" };

/** The item's own id field, e.g. `species` for a seed. */
function itemIdOf(kind: Kind, it: ShopItemLike): unknown {
  if (kind === "seeds") return it.species ?? it.name;
  if (kind === "tools") return it.toolId ?? it.id;
  if (kind === "eggs") return it.eggId ?? it.id;
  return it.decorId ?? it.id;
}

function buildPurchasePayload(kind: Kind, it: ShopItemLike): PurchasePayload | null {
  const id = itemIdOf(kind, it);
  if (!id) return null;
  const value = String(id);
  if (kind === "seeds") return { item: { itemType: "Seed", species: value }, stat: "seedsBought" };
  if (kind === "tools") return { item: { itemType: "Tool", toolId: value }, stat: "toolsBought" };
  if (kind === "eggs") return { item: { itemType: "Egg", eggId: value }, stat: "eggsBought" };
  return { item: { itemType: "Decor", decorId: value }, stat: "decorBought" };
}

const ITEM_FIELD: Record<Kind, string> = { seeds: "species", tools: "toolId", eggs: "eggId", decor: "decorId" };

/**
 * The shop that lists the item, weather shops first: a weather shop selling
 * the item is where the game buys it from too.
 */
function findShopForItem(shops: any, kind: Kind, it: ShopItemLike): string | null {
  if (!shops || typeof shops !== "object") return null;
  const keys = Object.keys(shops);
  const ordered = [...keys.filter((k) => !BASE_SHOP_KEYS.includes(k)), ...keys.filter((k) => BASE_SHOP_KEYS.includes(k))];
  const target = itemIdOf(kind, it);
  if (target == null) return null;
  const field = ITEM_FIELD[kind];
  for (const key of ordered) {
    const inv = shops[key]?.inventory;
    if (Array.isArray(inv) && inv.some((entry: any) => entry && typeof entry === "object" && entry[field] === target)) {
      return key;
    }
  }
  return null;
}

export const ShopsService = {
  /** Buys one of the item. */
  async buyOne(kind: Kind, it: ShopItemLike): Promise<void> {
    return ShopsService.buy(kind, it, 1);
  },

  /**
   * Buys `count` of the item, one purchase at a time. The server takes a
   * `quantity` since v1292, but the game only sends it when the player can pay
   * for the whole stack and has room for it, and the mod knows neither. Unit
   * purchases still buy what the player can afford.
   */
  async buyEach(kind: Kind, it: ShopItemLike, count: number): Promise<void> {
    for (let i = 0; i < count; i++) await ShopsService.buyOne(kind, it);
  },

  /** Buys `quantity` of the item in one command, like the game's own Buy All. */
  async buy(kind: Kind, it: ShopItemLike, quantity: number): Promise<void> {
    const built = buildPurchasePayload(kind, it);
    if (!built) return;

    let shop: string | null = null;
    try {
      // The shops the player can buy from: a closed weather shop still lists
      // its stock, and a personal restock replaces the room's.
      const [shops, slot] = await Promise.all([Atoms.shop.shops.get(), Atoms.shop.myUserSlot.get()]);
      shop = findShopForItem(playerShopView(shops, slot, () => null).shops, kind, it);
    } catch {}
    if (!shop) shop = BASE_SHOP_OF[kind];

    try {
      let storage: Storage | null = null;
      try {
        storage = pageWindow.localStorage;
      } catch {}
      const command = buildShopPurchaseCommand(shop, built.item, readShopViewMode(shop, storage), quantity);
      sendToGame(command);
      StatsService.incrementShopStat(built.stat, Number(command.quantity ?? 1));
    } catch {}
  },
};
