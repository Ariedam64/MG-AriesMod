import { Atoms } from "../store/atoms";
import { closeModal, openModal } from "./fakeModal";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";

const ACTION_ID: KeybindId = "game.decor-shed";
const DECOR_SHED_MODAL_ID = "decorShed";

let decorShedKeybindsInstalled = false;

async function toggleDecorShedModal(): Promise<void> {
  try {
    const current = await Atoms.ui.activeModal.get();
    if (current === DECOR_SHED_MODAL_ID) {
      await closeModal(DECOR_SHED_MODAL_ID);
      return;
    }
    await openModal(DECOR_SHED_MODAL_ID);
  } catch {
    // ignore failures
  }
}

export function installDecorShedKeybindsOnce(): void {
  if (decorShedKeybindsInstalled || typeof window === "undefined") return;
  decorShedKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind(ACTION_ID, event)) return;

      event.preventDefault();
      event.stopPropagation();
      void toggleDecorShedModal();
    },
    true
  );
}
