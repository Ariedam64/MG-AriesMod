// src/ui/menus/companion/companion.ts
// Menu dédié au companion.
//
// Deux onglets seulement. Ce qu'il dit n'en est pas un : ses répliques sont
// calées sur l'état du jeu et n'ont pas à être réglées à la main.

import { Menu } from "../../menu";
import { COMPANION_TAB_EVENT } from "../../../services/companionKeybind";
import { css, ensurePanelStyles } from "../panel-ui";
import { renderBehaviorTab } from "./behavior-tab";
import { renderChatTab } from "./chat-tab";

/**
 * Le fil de discussion a besoin de largeur : les fenêtres du HUD se dimensionnent
 * sur leur contenu, et sans plancher le companion s'ouvrait dans une colonne où
 * chaque message tenait sur cinq lignes.
 */
const MIN_WIDTH_PX = 460;

export function renderCompanionMenu(root: HTMLElement): void {
  ensurePanelStyles();

  const ui = new Menu({ id: "companion", compact: true, windowSelector: ".qws-win" });
  ui.mount(root);
  css(root, { minWidth: `${MIN_WIDTH_PX}px` });

  const TABS = ["behavior", "chat"] as const;
  ui.addTab("behavior", "Behavior", (view) => renderBehaviorTab(view));
  ui.addTab("chat", "Chat", (view) => renderChatTab(view));

  // Le raccourci clavier demande un onglet précis.
  //
  // On vérifie qu'il existe : `switchTo` accepte n'importe quelle chaîne et se
  // contente de n'activer personne, ce qui laisserait une fenêtre vide et sans
  // recours. Et on se désabonne dès que la fenêtre disparaît, parce que le HUD
  // redessine un menu sans jamais appeler de nettoyage.
  const onTabRequest = (event: Event): void => {
    if (!root.isConnected) {
      window.removeEventListener(COMPANION_TAB_EVENT, onTabRequest);
      return;
    }
    const tab = String((event as CustomEvent).detail?.tab ?? "");
    if (TABS.includes(tab as (typeof TABS)[number])) ui.switchTo(tab);
  };
  window.addEventListener(COMPANION_TAB_EVENT, onTabRequest);
}
