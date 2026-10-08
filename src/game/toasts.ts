import { getAtomByLabel, jGet, jSet } from "./store/jotai";

/** The game's list of toasts on screen. Its entries are keyed by `id`. */
const TOASTS_ATOM = "quinoaToastsAtom";

/**
 * Rewrites the list of toasts the game is showing. `edit` gets a copy of the
 * current list and returns the new one; nothing is written when it returns the
 * same length and the same entries. Resolves false when the game has no toast
 * list to edit, so the caller can fall back to its own toast.
 */
export async function editGameToasts(edit: (toasts: any[]) => any[]): Promise<boolean> {
  const atom = getAtomByLabel(TOASTS_ATOM);
  if (!atom) return false;

  const current = await jGet<any[]>(atom).catch(() => []);
  const list = Array.isArray(current) ? current : [];
  const next = edit(list.slice());
  const unchanged = next.length === list.length && next.every((toast, i) => toast === list[i]);
  if (!unchanged) await jSet(atom, next);
  return true;
}
