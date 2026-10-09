// A small jotai-like store for checks, handed to the mod through the store
// bridge (`__MG_STORE_BRIDGE__`) so `ensureStore`, `jGet` and `jSet` work in
// node. Primitive atoms are `{ init }`; derived atoms have `read(get)` and may
// have `write(get, set, value)`, which is how the game's forwarding atoms work.

export type FakeAtom = { init?: unknown; read?: (get: (a: FakeAtom) => unknown) => unknown; write?: Function; debugLabel?: string };

export function primitive<T>(init: T, debugLabel?: string): FakeAtom {
  return { init, debugLabel };
}

export function createFakeStore() {
  const values = new Map<FakeAtom, unknown>();
  const listeners = new Map<FakeAtom, Set<() => void>>();

  const get = (atom: FakeAtom): unknown => {
    if (typeof atom.read === "function") return atom.read(get);
    return values.has(atom) ? values.get(atom) : atom.init;
  };
  const set = (atom: FakeAtom, value: unknown): void => {
    if (typeof atom.write === "function") {
      atom.write(get, set, value);
      return;
    }
    const next = typeof value === "function" ? (value as (prev: unknown) => unknown)(get(atom)) : value;
    values.set(atom, next);
    for (const listener of listeners.get(atom) ?? []) listener();
  };
  const sub = (atom: FakeAtom, listener: () => void) => {
    if (!listeners.has(atom)) listeners.set(atom, new Set());
    listeners.get(atom)!.add(listener);
    return () => listeners.get(atom)?.delete(listener);
  };
  return { get, set, sub };
}

/** Publishes `store` as the page's shared store and `atoms` as the game's atom cache, keyed by path. */
export function installFakeGame(store: ReturnType<typeof createFakeStore>, atoms: Record<string, FakeAtom>): void {
  const g = globalThis as any;
  const cache = { cache: new Map<string, FakeAtom>(Object.entries(atoms)) };
  const bridge = { version: 1, owner: "check", promise: Promise.resolve(store) };
  for (const target of [g, g.window].filter(Boolean)) {
    target.jotaiAtomCache = cache;
    target.__MG_STORE_BRIDGE__ = bridge;
  }
}
