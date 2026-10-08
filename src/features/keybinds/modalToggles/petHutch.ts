import { Atoms } from "../../../game/store/atoms";
import { closeModal, openModal } from "../../../game/fakeModal";
import { eventMatchesKeybind, type KeybindId } from "../keybinds";
import { shouldIgnoreKeydown } from "../../../lib/keyboard";

const ACTION_ID: KeybindId = "game.pet-hutch";
const PET_HUTCH_MODAL_ID = "petHutch";

let petHutchKeybindsInstalled = false;

async function togglePetHutchModal(): Promise<void> {
  try {
    const current = await Atoms.ui.activeModal.get();
    if (current === PET_HUTCH_MODAL_ID) {
      await closeModal(PET_HUTCH_MODAL_ID);
      return;
    }
    await openModal(PET_HUTCH_MODAL_ID);
  } catch {
    // ignore failures
  }
}

export function installPetHutchKeybindsOnce(): void {
  if (petHutchKeybindsInstalled || typeof window === "undefined") return;
  petHutchKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind(ACTION_ID, event)) return;

      event.preventDefault();
      event.stopPropagation();
      void togglePetHutchModal();
    },
    true
  );
}
