// Counts a feature wants shown on its menu's dock button (the Alerts menu's
// available items, for one). Features set them here; the dock listens, so no
// feature needs to know about the HUD.

import { Emitter, type Unsubscribe } from "../../lib/emitter";

const counts = new Map<string, number>();
const changed = new Emitter<[string, number]>();

export function setMenuBadge(id: string, count: number): void {
  const next = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  if (counts.get(id) === next) return;
  counts.set(id, next);
  changed.emit([id, next]);
}

/** Replays every count set so far, then follows changes. */
export function onMenuBadge(cb: (id: string, count: number) => void): Unsubscribe {
  for (const [id, count] of counts) cb(id, count);
  return changed.on(([id, count]) => cb(id, count));
}
