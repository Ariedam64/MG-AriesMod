import { Atoms } from "../store/atoms";
import { closeModal, openModal } from "./fakeModal";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";

const ACTION_ID: KeybindId = "game.feeding-trough";
const FEEDING_TROUGH_MODAL_ID = "feedingTrough";

let feedingTroughKeybindsInstalled = false;

async function toggleFeedingTroughModal(): Promise<void> {
  try {
    const current = await Atoms.ui.activeModal.get();
    if (current === FEEDING_TROUGH_MODAL_ID) {
      await closeModal(FEEDING_TROUGH_MODAL_ID);
      return;
    }
    await openModal(FEEDING_TROUGH_MODAL_ID);
  } catch {
    // ignore failures
  }
}

export function installFeedingTroughKeybindsOnce(): void {
  if (feedingTroughKeybindsInstalled || typeof window === "undefined") return;
  feedingTroughKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind(ACTION_ID, event)) return;

      event.preventDefault();
      event.stopPropagation();
      void toggleFeedingTroughModal();
    },
    true
  );
}
