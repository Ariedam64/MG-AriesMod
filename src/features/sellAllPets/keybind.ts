// src/services/sell.ts
// Installs keybind handlers for selling crops and pets.

import { PlayerService } from "../../game/player";
import { eventMatchesKeybind } from "../keybinds/keybinds";
import { shouldIgnoreKeydown } from "../../lib/keyboard";
import { runSellAllPetsFlow } from "./domButton";

let sellKeybindsInstalled = false;

export function installSellKeybindsOnce(): void {
  if (sellKeybindsInstalled || typeof window === "undefined") return;
  sellKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;

      if (eventMatchesKeybind("sell.sell-all", event)) {
        event.preventDefault();
        event.stopPropagation();
        void PlayerService.sellAllCrops();
        return;
      }

      if (eventMatchesKeybind("sell.sell-all-pets", event)) {
        event.preventDefault();
        event.stopPropagation();
        void runSellAllPetsFlow();
      }
    },
    true,
  );
}
