// src/ui/menus/companion/settings-notice.ts
// L'avertissement d'une action dont les réglages n'ont jamais été ouverts.
//
// Il ne bloque rien : l'action marche très bien avec ses valeurs par défaut, et
// barrer la route de quelqu'un qui veut juste essayer serait pénible. Il dit ce
// que le companion fera faute d'instruction, et met l'écran de réglages à un
// clic — puis disparaît définitivement une fois cet écran ouvert.

import { isUnreviewed, type SettingsGroup } from "../../../services/companion/state";
import { BORDER, TEXT, WARN, css } from "../panel-ui";

export type SettingsNotice = { root: HTMLElement };

/**
 * Rend un bandeau, ou un élément vide si le groupe a déjà été consulté.
 *
 * L'appelant l'ajoute sans condition : décider ici plutôt qu'au point d'appel
 * évite que trois popups oublient chacune de leur côté de poser la question.
 */
export function settingsNotice(group: SettingsGroup, what: string, onOpen: () => void): SettingsNotice {
  const root = document.createElement("div");
  if (!isUnreviewed(group)) {
    // Un élément vide compte quand même dans une colonne flex : sans ça il
    // laisserait un espace de la taille du `gap` en haut de chaque popup.
    root.style.display = "none";
    return { root };
  }

  css(root, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "10px 12px",
    borderRadius: "12px",
    background: "rgba(251,191,36,0.08)",
    border: `1px solid ${BORDER}`,
    flex: "0 0 auto",
  });

  const text = document.createElement("div");
  css(text, { fontSize: "11.5px", lineHeight: "1.5", color: TEXT, flex: "1", minWidth: "0" });
  text.textContent = what;

  const open = document.createElement("button");
  open.type = "button";
  open.textContent = "Set up";
  css(open, {
    flex: "0 0 auto",
    padding: "6px 11px",
    borderRadius: "9px",
    border: `1px solid ${WARN}`,
    background: "transparent",
    color: WARN,
    cursor: "pointer",
    fontSize: "11.5px",
    lineHeight: "1",
  });
  open.addEventListener("click", onOpen);

  root.append(text, open);
  return { root };
}
