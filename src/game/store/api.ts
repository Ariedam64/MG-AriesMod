import { ensureStore, getAtomByLabel, jGet, jSub, jSet, waitForAtom } from "./jotai";

export type Unsubscribe = () => void;

/** Captures the store if it can; a failed capture shows up as atoms not found. */
async function ensureStoreQuietly() {
  try {
    await ensureStore();
  } catch {}
}

/**
 * Reads an atom by label, or returns `fallback` when it is missing.
 *
 * Deliberately non-blocking, unlike the subscriptions: a read answers at once,
 * with the fallback if need be. For a value that does not exist yet at boot,
 * subscribe instead.
 */
async function select<T>(label: string, fallback?: T): Promise<T | undefined> {
  await ensureStoreQuietly();
  const atom = getAtomByLabel(label);
  if (!atom) return fallback;
  try {
    return await jGet<T>(atom);
  } catch {
    return fallback;
  }
}

/**
 * Whether the game has an atom under this label.
 *
 * `select` and `set` do nothing at all when the label is missing, without an
 * error, so a rename on the game's side breaks a feature silently. This lets a
 * caller choose between several possible names.
 */
async function hasAtom(label: string): Promise<boolean> {
  await ensureStoreQuietly();
  return !!getAtomByLabel(label);
}

/**
 * Subscribes to an atom by label. With `immediate`, the current value is also
 * pushed once the subscription is attached.
 *
 * A label that does not exist yet is attached later, as soon as the game
 * registers it. The order matters with `immediate`: subscribe first, then read,
 * so nothing that happens in between is lost; and when the atom arrives late
 * the value is pushed at attach time, not at boot, or the subscriber would sit
 * on the empty boot value until the next change, which may never come.
 *
 * The returned unsubscribe cancels the wait as well as the subscription, and
 * is safe to call more than once.
 */
async function attach<T>(label: string, cb: (value: T) => void, immediate: boolean): Promise<Unsubscribe> {
  await ensureStoreQuietly();
  let cancelled = false;
  let attachedUnsub: Unsubscribe | null = null;

  const attachTo = async (atom: unknown): Promise<void> => {
    const unsub = await jSub(atom, async () => {
      try { cb(await jGet<T>(atom)); } catch {}
    });
    if (cancelled) {
      try { unsub(); } catch {}
      return;
    }
    attachedUnsub = unsub;
    if (!immediate) return;
    try {
      const current = await jGet<T>(atom);
      if (!cancelled && current !== undefined) cb(current);
    } catch {}
  };

  const atom = getAtomByLabel(label);
  if (atom) {
    await attachTo(atom);
  } else {
    void (async () => {
      const found = await waitForAtom(label);
      if (!found || cancelled) return;
      try { await attachTo(found); } catch {}
    })();
  }

  return () => {
    cancelled = true;
    const unsub = attachedUnsub;
    attachedUnsub = null;
    try { unsub?.(); } catch {}
  };
}

async function set(label: string, value: any) {
  await ensureStoreQuietly();
  const atom = getAtomByLabel(label);
  if (!atom) return;
  await jSet(atom, value);
}

export const Store = {
  select,
  /** Calls `cb` on every change, once the atom exists. */
  subscribe: <T>(label: string, cb: (value: T) => void) => attach(label, cb, false),
  /** Same, plus one call with the current value as soon as the atom exists. */
  subscribeImmediate: <T>(label: string, cb: (value: T) => void) => attach(label, cb, true),
  set,
  hasAtom,
};
