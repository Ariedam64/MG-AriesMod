// Remaps the game's own keys (Action, Inventory, movement) to the keys the
// player chose, through the game's hotkey layer. The game keeps listening for
// its default key; `inGameHotkeys.replace` makes the chosen key emit it.

import { inGameHotkeys } from "../../game/ingameHotkeys";
import { hotkeyToString } from "../../lib/hotkey";
import { getKeybind, getKeybindHoldDetection, onKeybindChange, onKeybindHoldDetectionChange } from "./keybinds";

type GameKeybindId =
  | "game.action"
  | "game.inventory"
  | "game.move-up"
  | "game.move-down"
  | "game.move-left"
  | "game.move-right";

/** The key the game itself listens for, per action. Codes are layout independent (KeyW is Z on AZERTY). */
const GAME_KEYS: Record<GameKeybindId, string> = {
  "game.action": "Space",
  "game.inventory": "KeyE",
  "game.move-up": "KeyW",
  "game.move-down": "KeyS",
  "game.move-left": "KeyA",
  "game.move-right": "KeyD",
};

/** Rapid fire currently running, per action, keyed by the physical combo it listens to. */
const rapidFireCombos = new Map<GameKeybindId, string>();
let installed = false;

/** Removes every block and remap that ends on the game's key, whoever set it. */
function clearRemapsTo(gameKey: string): void {
  try { inGameHotkeys.unblock(gameKey); } catch {}
  try {
    // `current()` maps a physical combo ("Ctrl+KeyX") to the key it emits.
    for (const [from, to] of Object.entries(inGameHotkeys.current())) {
      if (String(to).split("+").pop() === gameKey) {
        try { inGameHotkeys.remove(from); } catch {}
      }
    }
  } catch {}
}

function syncGameKeybind(id: GameKeybindId): void {
  const gameKey = GAME_KEYS[id];
  clearRemapsTo(gameKey);

  const previousRapidFire = rapidFireCombos.get(id);
  if (previousRapidFire) {
    try { inGameHotkeys.stopRapidFire(previousRapidFire); } catch {}
    rapidFireCombos.delete(id);
  }

  const hk = getKeybind(id);
  const combo = hk ? hotkeyToString(hk) : "";
  if (!combo) return;

  // The game's own key needs no remap: clearing it above was enough.
  if (combo !== gameKey) {
    try { inGameHotkeys.replace(gameKey, combo); } catch {}
  }

  if (getKeybindHoldDetection(id)) {
    try {
      // Holding the chosen key taps it; the remap above turns each tap into the game's key.
      inGameHotkeys.startRapidFire({ trigger: combo, emit: combo, mode: "tap", rateHz: 10 });
      rapidFireCombos.set(id, combo);
    } catch {}
  }
}

export function installGameKeybindsOnce(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  for (const id of Object.keys(GAME_KEYS) as GameKeybindId[]) {
    syncGameKeybind(id);
    onKeybindChange(id, () => syncGameKeybind(id));
    onKeybindHoldDetectionChange(id, () => syncGameKeybind(id));
  }
}
