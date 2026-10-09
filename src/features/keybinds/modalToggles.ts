// Shortcuts that open a building's modal, or close it when it is already open.

import { Atoms } from "../../game/store/atoms";
import { closeModal, JOURNAL_MODAL_ID, openModal } from "../../game/fakeModal";
import { shouldIgnoreKeydown } from "../../lib/keyboard";
import { eventMatchesKeybind, type KeybindId } from "./keybinds";

/** Each shortcut and the game modal it toggles. Modal ids are the game's own. */
const MODAL_TOGGLES: ReadonlyArray<readonly [KeybindId, string]> = [
  ["game.pet-hutch", "petHutch"],
  ["game.journal", JOURNAL_MODAL_ID],
  // The quest booth's modal, added in build 1449.
  ["game.daily-quests", "dailyQuests"],
  ["game.seed-silo", "seedSilo"],
  ["game.decor-shed", "decorShed"],
  ["game.tool-shack", "toolShack"],
  ["game.feeding-trough", "feedingTrough"],
  ["game.weather-station", "weatherStation"],
];

const installedActions = new Set<KeybindId>();

async function toggleModal(modalId: string): Promise<void> {
  try {
    if ((await Atoms.ui.activeModal.get()) === modalId) await closeModal(modalId);
    else await openModal(modalId);
  } catch {
    // The modal atoms are not ready yet: the key simply does nothing.
  }
}

/** Makes one shortcut toggle one modal. Installing the same action twice is a no-op. */
function installModalToggleKeybind(actionId: KeybindId, modalId: string): void {
  if (installedActions.has(actionId) || typeof window === "undefined") return;
  installedActions.add(actionId);

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event) || !eventMatchesKeybind(actionId, event)) return;
      event.preventDefault();
      event.stopPropagation();
      void toggleModal(modalId);
    },
    true,
  );
}

export function installModalToggleKeybinds(): void {
  for (const [actionId, modalId] of MODAL_TOGGLES) installModalToggleKeybind(actionId, modalId);
}
