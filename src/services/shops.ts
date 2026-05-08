// src/services/shops.ts
// Service d'accès aux shops (Seeds / Tools / Eggs / Decor) + helpers d'achats et d'inventaire.

import { openModal } from "./fakeModal";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";
import { StatsService} from "./stats";
import { sendToGame } from "../core/webSocketBridge";
import { Atoms } from "../store/atoms";


export type Kind = "seeds" | "tools" | "eggs" | "decor";

type ShopModalId = "seedShop" | "eggShop" | "decorShop" | "toolShop";
type ShopKeybindId = Extract<
  KeybindId,
  "shops.seeds" | "shops.eggs" | "shops.decors" | "shops.tools"
>;

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

      for (const { id, modal } of SHOP_KEYBINDS) {
        if (!eventMatchesKeybind(id, event)) continue;

        event.preventDefault();
        event.stopPropagation();
        void openModal(modal);
        break;
      }
    },
    true,
  );
}

type AnyItem = Record<string, any>;

// =========================== Routing d'achat (multi-shop) ===========================

type ShopStatKey = "seedsBought" | "toolsBought" | "eggsBought" | "decorBought";
type PurchasePayload = { item: Record<string, string>; stat: ShopStatKey };

const BASE_SHOP_KEYS = ["seed", "egg", "tool", "decor"];

function _fallbackShopFor(kind: Kind): string {
  return kind === "seeds" ? "seed"
       : kind === "tools" ? "tool"
       : kind === "eggs"  ? "egg"
       :                    "decor";
}

function _buildPurchasePayload(kind: Kind, it: AnyItem): PurchasePayload | null {
  if (kind === "seeds") {
    const species = it.species ?? it.name;
    return species ? { item: { itemType: "Seed", species: String(species) }, stat: "seedsBought" } : null;
  }
  if (kind === "tools") {
    const toolId = it.toolId ?? it.id;
    return toolId ? { item: { itemType: "Tool", toolId: String(toolId) }, stat: "toolsBought" } : null;
  }
  if (kind === "eggs") {
    const eggId = it.eggId ?? it.id;
    return eggId ? { item: { itemType: "Egg", eggId: String(eggId) }, stat: "eggsBought" } : null;
  }
  if (kind === "decor") {
    const decorId = it.decorId ?? it.id;
    return decorId ? { item: { itemType: "Decor", decorId: String(decorId) }, stat: "decorBought" } : null;
  }
  return null;
}

/** Recherche dans le snapshot live des shops la rotation où l'item est listé.
 * Préférence aux shops weather (clés hors base) sur les shops base. */
function _findShopForItem(snap: any, kind: Kind, it: AnyItem): string | null {
  if (!snap || typeof snap !== "object") return null;

  const keys = Object.keys(snap);
  const weatherKeys = keys.filter(k => !BASE_SHOP_KEYS.includes(k));
  const baseKeys = keys.filter(k => BASE_SHOP_KEYS.includes(k));
  const ordered = [...weatherKeys, ...baseKeys];

  const targetSpecies = it.species ?? it.name;
  const targetToolId  = it.toolId  ?? it.id;
  const targetEggId   = it.eggId   ?? it.id;
  const targetDecorId = it.decorId ?? it.id;

  const matches = (entry: any): boolean => {
    if (!entry || typeof entry !== "object") return false;
    if (kind === "seeds") return targetSpecies != null && entry.species === targetSpecies;
    if (kind === "tools") return targetToolId  != null && entry.toolId  === targetToolId;
    if (kind === "eggs")  return targetEggId   != null && entry.eggId   === targetEggId;
    if (kind === "decor") return targetDecorId != null && entry.decorId === targetDecorId;
    return false;
  };

  for (const k of ordered) {
    const inv = snap[k]?.inventory;
    if (!Array.isArray(inv)) continue;
    if (inv.some(matches)) return k;
  }
  return null;
}

export const ShopsService = {
  /** Achat unitaire : envoie le bon message au jeu. */
  async buyOne(kind: Kind, it: AnyItem): Promise<void> {
    const built = _buildPurchasePayload(kind, it);
    if (!built) return;

    let shop: string | null = null;
    try {
      const snap = await Atoms.shop.shops.get();
      shop = _findShopForItem(snap, kind, it);
    } catch { }
    if (!shop) shop = _fallbackShopFor(kind);

    try {
      sendToGame({ type: "PurchaseShopItem", shop, item: built.item });
      StatsService.incrementShopStat(built.stat);
    } catch { }
  },
};
