// src/services/shops.ts
// Service d'accès aux shops (Seeds / Tools / Eggs / Decor) + helpers d'achats et d'inventaire.

import { openModal } from "./fakeModal";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";
import { StatsService} from "./stats";
import { sendToGame } from "../core/webSocketBridge";


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

export const ShopsService = {
  buyOne(kind: Kind, it: AnyItem) {
    if (kind === "seeds") {
      const species = it.species ?? it.name;
      if (species) {
        try { sendToGame({ type: "PurchaseShopItem", shop: "seed", item: { itemType: "Seed", species } }); StatsService.incrementShopStat("seedsBought"); }
        catch (err) {  }
      }
      return;
    }
    if (kind === "tools") {
      const toolId = it.toolId ?? it.id;
      if (toolId) {
        try { sendToGame({ type: "PurchaseShopItem", shop: "tool", item: { itemType: "Tool", toolId } }); StatsService.incrementShopStat("toolsBought"); }
        catch (err) { }
      }
      return;
    }
    if (kind === "eggs") {
      const eggId = it.eggId ?? it.id;
      if (eggId) {
        try { sendToGame({ type: "PurchaseShopItem", shop: "egg", item: { itemType: "Egg", eggId } }); StatsService.incrementShopStat("eggsBought"); }
        catch (err) { }
      }
      return;
    }
    if (kind === "decor") {
      const decorId = it.decorId ?? it.id;
      if (decorId) {
        try { sendToGame({ type: "PurchaseShopItem", shop: "decor", item: { itemType: "Decor", decorId } }); StatsService.incrementShopStat("decorBought"); }
        catch (err) { }
      }
      return;
    }
  }
}

type AnyItem = Record<string, any>;
