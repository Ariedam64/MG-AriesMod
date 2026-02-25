import { Atoms } from "../store/atoms";
import { closeModal, openModal } from "./fakeModal";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";

const ACTION_ID: KeybindId = "game.seed-silo";
const SEED_SILO_MODAL_ID = "seedSilo";

let seedSiloKeybindsInstalled = false;

async function toggleSeedSiloModal(): Promise<void> {
  try {
    const current = await Atoms.ui.activeModal.get();
    if (current === SEED_SILO_MODAL_ID) {
      await closeModal(SEED_SILO_MODAL_ID);
      return;
    }
    await openModal(SEED_SILO_MODAL_ID);
  } catch {
    // ignore failures
  }
}

export function installSeedSiloKeybindsOnce(): void {
  if (seedSiloKeybindsInstalled || typeof window === "undefined") return;
  seedSiloKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind(ACTION_ID, event)) return;

      event.preventDefault();
      event.stopPropagation();
      void toggleSeedSiloModal();
    },
    true
  );
}
