import { Store, type Unsubscribe } from "./api";

/**
 * Views over the game's atoms: an atom by label, optionally narrowed to a path
 * inside its value, with get, set and change listeners.
 */

type Path = string | Array<string | number>;

function toPathArray(path?: Path): Array<string | number> {
  if (!path) return [];
  return Array.isArray(path) ? path.slice() : path.split(".").map((k) => (k.match(/^\d+$/) ? Number(k) : k));
}

function getAtPath<T = any>(root: any, path?: Path): T {
  let cur = root;
  for (const seg of toPathArray(path)) {
    if (cur == null) return undefined as any;
    cur = cur[seg as any];
  }
  return cur as T;
}

/** A copy of `root` with `nextValue` at `path`, cloning every level on the way. */
function setAtPath(root: any, path: Path, nextValue: any) {
  const segs = toPathArray(path);
  if (!segs.length) return nextValue;
  const clone = Array.isArray(root) ? root.slice() : { ...(root ?? {}) };
  let cur: any = clone;
  for (let i = 0; i < segs.length - 1; i++) {
    const src = cur[segs[i] as any];
    const obj = typeof src === "object" && src !== null ? (Array.isArray(src) ? src.slice() : { ...src }) : {};
    cur[segs[i] as any] = obj;
    cur = obj;
  }
  cur[segs[segs.length - 1] as any] = nextValue;
  return clone;
}

type ChangeListener<T> = (next: T, prev?: T) => void;

export type View<T> = {
  label: string;
  get(): Promise<T>;
  set(next: T): Promise<void>;
  /** Called on each change after the atom exists. */
  onChange(cb: ChangeListener<T>, isEqual?: (a: T, b: T) => boolean): Promise<Unsubscribe>;
  /** Same, plus one call with the current value as soon as the atom exists. */
  onChangeNow(cb: ChangeListener<T>, isEqual?: (a: T, b: T) => boolean): Promise<Unsubscribe>;
};

export function makeView<TSrc = any, T = any>(sourceLabel: string, opts: { path?: Path } = {}): View<T> {
  const { path } = opts;
  const pick = (src: TSrc): T => (path ? getAtPath<T>(src, path) : (src as any)) as T;

  const listen = (subscribe: typeof Store.subscribe) =>
    async (cb: ChangeListener<T>, isEqual: (a: T, b: T) => boolean = Object.is) => {
      let prev: T | undefined;
      return subscribe<TSrc>(sourceLabel, (src) => {
        const v = pick(src);
        if (typeof prev === "undefined" || !isEqual(prev as T, v)) {
          const p = prev;
          prev = v;
          cb(v, p);
        }
      });
    };

  return {
    label: sourceLabel + (path ? ":" + toPathArray(path).join(".") : ""),
    async get() {
      return pick((await Store.select<TSrc>(sourceLabel)) as TSrc);
    },
    async set(next: T) {
      const prev = await Store.select<any>(sourceLabel);
      return Store.set(sourceLabel, path ? setAtPath(prev, path, next) : next);
    },
    onChange: listen(Store.subscribe),
    onChangeNow: listen(Store.subscribeImmediate),
  };
}

export function makeAtom<T = any>(label: string) {
  return makeView<T, T>(label);
}

/**
 * An atom the game has known under several names; the first one found wins.
 *
 * The game sometimes renames an atom between versions. A missing label raises
 * no error (`set` and `subscribe` just do nothing), so the feature behind it
 * stops without a trace. Listing the old name as a fallback keeps the mod
 * working through the transition (cached bundles, a game rollback).
 *
 * The chosen name is remembered once resolved. Until one resolves, every call
 * tries again rather than freezing a wrong pick at boot, before the game has
 * registered its atoms.
 */
export function makeAliasedAtom<T = any>(labels: string[]): View<T> {
  let resolved: View<T> | null = null;

  async function pick(): Promise<View<T>> {
    if (resolved) return resolved;
    for (const label of labels) {
      if (await Store.hasAtom(label)) {
        resolved = makeView<T, T>(label);
        return resolved;
      }
    }
    return makeView<T, T>(labels[0]);
  }

  return {
    label: labels[0],
    get: async () => (await pick()).get(),
    set: async (next) => (await pick()).set(next),
    onChange: async (cb, isEqual) => (await pick()).onChange(cb, isEqual),
    onChangeNow: async (cb, isEqual) => (await pick()).onChangeNow(cb, isEqual),
  };
}

/**
 * Reads a view once, then follows its changes. Unlike `onChangeNow`, the first
 * read answers at once (with whatever the store holds, possibly nothing) rather
 * than waiting for the atom to exist. Errors are swallowed on both steps.
 */
export async function readAndFollow<T>(view: View<T>, cb: (value: T) => void): Promise<void> {
  try {
    cb(await view.get());
  } catch {}
  try {
    await view.onChange((next) => cb(next));
  } catch {}
}
