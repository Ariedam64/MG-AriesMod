import { Atoms } from "../../../game/store/atoms";
import { closeModal, JOURNAL_MODAL_ID, openModal } from "../../../game/fakeModal";
import { eventMatchesKeybind, type KeybindId } from "../keybinds";
import { shouldIgnoreKeydown } from "../../../lib/keyboard";

const ACTION_ID: KeybindId = "game.journal";

let journalKeybindsInstalled = false;

async function toggleJournalModal(): Promise<void> {
  try {
    const current = await Atoms.ui.activeModal.get();
    if (current === JOURNAL_MODAL_ID) {
      await closeModal(JOURNAL_MODAL_ID);
      return;
    }
    await openModal(JOURNAL_MODAL_ID);
  } catch {
    // ignore errors
  }
}

export function installJournalKeybindsOnce(): void {
  if (journalKeybindsInstalled || typeof window === "undefined") return;
  journalKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind(ACTION_ID, event)) return;

      event.preventDefault();
      event.stopPropagation();
      void toggleJournalModal();
    },
    true
  );
}
