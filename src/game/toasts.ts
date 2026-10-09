// The game's list of toasts on screen.
//
// It is the `toasts` field of the current room (see roomScope.ts); the
// game's toast system draws whatever the list holds. Entries are keyed by
// `id`, and a toast that is not `isStackable` replaces the others when the
// game adds it, so the mod's toasts always stack.

import { currentRoomAtom } from "./roomScope";
import { jGet, jSet } from "./store/jotai";

async function toastsAtom(): Promise<any | null> {
  return currentRoomAtom("toasts");
}

/**
 * Rewrites the list of toasts the game is showing. `edit` gets a copy of the
 * current list and returns the new one; nothing is written when it returns the
 * same entries. Resolves false when the game has no toast list to edit, so the
 * caller can fall back to its own toast.
 */
export async function editGameToasts(edit: (toasts: any[]) => any[]): Promise<boolean> {
  const atom = await toastsAtom();
  if (!atom) return false;

  const current = await jGet<any[]>(atom).catch(() => []);
  const list = Array.isArray(current) ? current : [];
  const next = edit(list.slice());
  const unchanged = next.length === list.length && next.every((toast, i) => toast === list[i]);
  if (!unchanged) await jSet(atom, next);
  return true;
}

/** Adds a toast, or replaces the one with the same id. False when there is no toast list yet. */
export function pushGameToast(toast: { id: string; [key: string]: unknown }): Promise<boolean> {
  return editGameToasts((list) => {
    const index = list.findIndex((t) => t?.id === toast.id);
    if (index === -1) return [...list, toast];
    list[index] = toast;
    return list;
  });
}
