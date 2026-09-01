import { Atoms } from "../store/atoms";
import { closeModal, openModal } from "./fakeModal";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";

const ACTION_ID: KeybindId = "game.tool-shack";
const TOOL_SHACK_MODAL_ID = "toolShack";

let toolShackKeybindsInstalled = false;

async function toggleToolShackModal(): Promise<void> {
  try {
    const current = await Atoms.ui.activeModal.get();
    if (current === TOOL_SHACK_MODAL_ID) {
      await closeModal(TOOL_SHACK_MODAL_ID);
      return;
    }
    await openModal(TOOL_SHACK_MODAL_ID);
  } catch {
    // ignore failures
  }
}

export function installToolShackKeybindsOnce(): void {
  if (toolShackKeybindsInstalled || typeof window === "undefined") return;
  toolShackKeybindsInstalled = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind(ACTION_ID, event)) return;

      event.preventDefault();
      event.stopPropagation();
      void toggleToolShackModal();
    },
    true
  );
}
