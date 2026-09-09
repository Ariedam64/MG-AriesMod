// src/services/companionKeybind.ts
// Le raccourci qui ouvre le companion directement sur son fil de discussion.
//
// Deux événements plutôt qu'un appel direct : le HUD et les menus vivent dans
// `src/ui/`, et un service n'a pas à aller y chercher une instance. Le premier
// ouvre la fenêtre, le second lui dit quel onglet montrer.
//
// L'ordre compte. `qws:open-panel` monte le menu, qui installe au passage son
// écoute d'onglet ; le second événement ne peut donc partir qu'après. Une
// fenêtre déjà ouverte est simplement remise au premier plan, et son écoute est
// toujours en place — les deux cas retombent sur le même enchaînement.

import { eventMatchesKeybind } from "./keybinds";
import { shouldIgnoreKeydown } from "../utils/keyboard";

/** Identifiant de la fenêtre, tel que `main.ts` l'enregistre auprès du HUD. */
const COMPANION_PANEL_ID = "companion";
const CHAT_TAB_ID = "chat";

/** Demande au menu companion de basculer sur un onglet. Écouté par `companion.ts`. */
export const COMPANION_TAB_EVENT = "qws:companion-tab";

let installed = false;

export function openCompanionChat(): void {
  window.dispatchEvent(new CustomEvent("qws:open-panel", { detail: { id: COMPANION_PANEL_ID } }));
  window.dispatchEvent(new CustomEvent(COMPANION_TAB_EVENT, { detail: { tab: CHAT_TAB_ID } }));
}

export function installCompanionKeybindsOnce(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener(
    "keydown",
    (event) => {
      if (shouldIgnoreKeydown(event)) return;
      if (!eventMatchesKeybind("companion.chat", event)) return;

      event.preventDefault();
      event.stopPropagation();
      openCompanionChat();
    },
    true
  );
}
