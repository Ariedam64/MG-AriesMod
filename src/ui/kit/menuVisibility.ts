// Menus a feature wants kept out of the dock (the Debug menu until a player
// turns it on). Features set it here; the HUD listens, so no feature needs to
// know about the HUD.

import { Emitter, type Unsubscribe } from "../../lib/emitter";

const hiddenMenus = new Map<string, boolean>();
const changed = new Emitter<[string, boolean]>();

export function setMenuHidden(id: string, hidden: boolean): void {
  if (hiddenMenus.get(id) === hidden) return;
  hiddenMenus.set(id, hidden);
  changed.emit([id, hidden]);
}

/** Replays every menu's state set so far, then follows changes. */
export function onMenuHidden(cb: (id: string, hidden: boolean) => void): Unsubscribe {
  for (const [id, hidden] of hiddenMenus) cb(id, hidden);
  return changed.on(([id, hidden]) => cb(id, hidden));
}
