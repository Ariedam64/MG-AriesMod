import { pageWindow } from "../../platform/pageContext";
import { sleep, waitUntil } from "../../lib/async";
import { acquireSharedStore } from "./bridge";

/**
 * Access to the game's jotai store: capturing it, reading and writing atoms,
 * and finding atoms by their debug label. No feature logic lives here.
 */

export type JotaiStore = {
  get: (atom: any) => any;
  set: (atom: any, value: any) => void | Promise<void>;
  sub: (atom: any, cb: () => void) => () => void;
  /** True when no real store could be captured. */
  __polyfill?: boolean;
};

let _store: JotaiStore | null = null;
let _captureInProgress = false;
let _captureError: unknown = null;
let _lastCapturedVia: "fiber" | "write" | "polyfill" | null = null;

/** How long to wait for jotaiAtomCache to appear (Discord activities load slowly). */
const ATOM_CACHE_WAIT_MS = 20_000;
/** How long to wait for an atom write once the cache is there. */
const WRITE_ONCE_MS = 5_000;

const getAtomCache = () => (pageWindow as any).jotaiAtomCache?.cache as Map<any, any> | undefined;

/* =============================== Store capture ============================== */

/** Captures the store by scanning React fiber roots for a jotai `<Provider value={store}>`. */
function findStoreViaFiber(): JotaiStore | null {
  const hook: any = (pageWindow as any).__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook?.renderers?.size) return null;

  for (const [rid] of hook.renderers) {
    const roots = hook.getFiberRoots?.(rid);
    if (!roots) continue;

    for (const root of roots) {
      const seen = new Set<any>();
      const stack = [root.current];
      while (stack.length) {
        const f = stack.pop();
        if (!f || seen.has(f)) continue;
        seen.add(f);

        const v = f?.pendingProps?.value;
        if (v && typeof v.get === "function" && typeof v.set === "function" && typeof v.sub === "function") {
          _lastCapturedVia = "fiber";
          return v as JotaiStore;
        }
        if (f.child) stack.push(f.child);
        if (f.sibling) stack.push(f.sibling);
        if (f.alternate) stack.push(f.alternate);
      }
    }
  }
  return null;
}

function makePolyfillStore(): JotaiStore {
  _lastCapturedVia = "polyfill";
  return {
    get: () => { throw new Error("Store not captured: get unavailable"); },
    set: () => { throw new Error("Store not captured: set unavailable"); },
    sub: () => () => {},
    __polyfill: true,
  };
}

/**
 * Fallback capture: briefly patches every atom's `write()` to grab the store's
 * (get, set) the next time the game writes any atom. Waits up to
 * ATOM_CACHE_WAIT_MS for jotaiAtomCache, then up to WRITE_ONCE_MS for a write.
 * Subscriptions on a store captured this way poll every 100 ms.
 */
async function captureViaWriteOnce(): Promise<JotaiStore> {
  let cache = getAtomCache() ?? null;
  if (!cache) {
    console.log("[jotai-bridge] Waiting for jotaiAtomCache...");
    cache = await waitUntil(getAtomCache, { timeoutMs: ATOM_CACHE_WAIT_MS, intervalMs: 100 });
  }
  if (!cache) {
    console.warn("[jotai-bridge] jotaiAtomCache.cache not found");
    return makePolyfillStore();
  }

  let capturedGet: any = null;
  let capturedSet: any = null;

  const patched: any[] = [];
  const restorePatched = () => {
    for (const a of patched) {
      try {
        if (a.__origWrite) {
          a.write = a.__origWrite;
          delete a.__origWrite;
        }
      } catch {}
    }
  };

  for (const atom of cache.values()) {
    if (!atom || typeof atom.write !== "function" || atom.__origWrite) continue;
    const orig = atom.write;
    atom.__origWrite = orig;
    atom.write = function (get: any, set: any, ...args: any[]) {
      if (!capturedSet) {
        capturedGet = get;
        capturedSet = set;
        // Captured: put every atom back at once.
        restorePatched();
      }
      return orig.call(this, get, set, ...args);
    };
    patched.push(atom);
  }

  // Nudges some apps into running their effects.
  try {
    pageWindow.dispatchEvent?.(new pageWindow.Event("visibilitychange"));
  } catch {}

  const t0 = Date.now();
  while (!capturedSet && Date.now() - t0 < WRITE_ONCE_MS) {
    await sleep(50);
  }

  if (!capturedSet) {
    restorePatched();
    console.warn("[jotai-bridge] write-once: timeout, using a polyfill");
    return makePolyfillStore();
  }

  _lastCapturedVia = "write";
  return {
    get: (a: any) => capturedGet(a),
    set: (a: any, v: any) => capturedSet(a, v),
    sub: (a: any, cb: () => void) => {
      let last: any;
      try {
        last = capturedGet(a);
      } catch {}
      const id = setInterval(() => {
        let curr: any;
        try {
          curr = capturedGet(a);
        } catch {
          return;
        }
        if (curr !== last) {
          last = curr;
          try {
            cb();
          } catch {}
        }
      }, 100);
      return () => clearInterval(id as any);
    },
  };
}

const STORE_OWNER = "aries-mod";

async function rawCapture(): Promise<JotaiStore> {
  return findStoreViaFiber() ?? captureViaWriteOnce();
}

/** The game's store, captured on first call (shared bridge, then fiber, then write-once, then polyfill). */
export async function ensureStore(): Promise<JotaiStore> {
  // A polyfill is never final: later calls try again.
  if (_store && !_store.__polyfill) return _store;

  if (_captureInProgress) {
    // Wait out the longest possible capture (cache wait + write wait) plus a cushion.
    await waitUntil(() => _store, { timeoutMs: ATOM_CACHE_WAIT_MS + WRITE_ONCE_MS + 1000, intervalMs: 25 });
    if (_store && !_store.__polyfill) return _store;
  }

  _captureInProgress = true;
  try {
    // Through the cross-mod bridge: when the standalone Community Hub (or any
    // mod speaking the protocol) already captured the store on this page, its
    // store is reused instead of running a second capture. A failed capture
    // releases the bridge slot so a later call can retry.
    _store = await acquireSharedStore(STORE_OWNER, rawCapture);
    return _store;
  } catch (e) {
    _captureError = e;
    throw e;
  } finally {
    _captureInProgress = false;
  }
}

export function isStoreCaptured() {
  return !!_store && !_store.__polyfill;
}

export function getCapturedInfo() {
  return { via: _lastCapturedVia, polyfill: !!_store?.__polyfill, error: _captureError };
}

/* ================================ Read, write =============================== */

export async function jGet<T = any>(atom: any): Promise<T> {
  const s = await ensureStore();
  return s.get(atom) as T;
}

export async function jSet(atom: any, value: any): Promise<void> {
  const s = await ensureStore();
  await s.set(atom, value);
}

/** Subscribes to an atom; resolves to the unsubscribe function. */
export async function jSub(atom: any, cb: () => void): Promise<() => void> {
  const s = await ensureStore();
  return s.sub(atom, cb);
}

/* ============================== Atoms by label ============================== */

/** Every atom whose debugLabel matches `regex`. */
export function findAtomsByLabel(regex: RegExp): any[] {
  const cache = getAtomCache();
  if (!cache) return [];
  const out: any[] = [];
  for (const a of cache.values()) {
    const label = a?.debugLabel || a?.label || "";
    if (regex.test(String(label))) out.push(a);
  }
  return out;
}

/** The atom with exactly this label, or null. */
export function getAtomByLabel(label: string): any | null {
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return findAtomsByLabel(new RegExp("^" + escape(label) + "$"))[0] || null;
}

/* ============================== Waiting for one ============================= */

const ATOM_POLL_MS = 250;
const DEFAULT_ATOM_WAIT_MS = 10 * 60_000;

type PendingWaiter = {
  label: string;
  expiresAt: number;
  keepGoing?: () => boolean;
  resolve: (atom: any | null) => void;
};

// One timer serves every pending wait. It stops as soon as nobody is waiting
// and starts again when needed.
const pendingWaiters = new Set<PendingWaiter>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function pollPendingWaiters(): void {
  const now = Date.now();
  for (const waiter of Array.from(pendingWaiters)) {
    const atom = getAtomByLabel(waiter.label);
    const givenUp = now >= waiter.expiresAt || (waiter.keepGoing && !waiter.keepGoing());
    if (atom || givenUp) {
      pendingWaiters.delete(waiter);
      waiter.resolve(atom ?? null);
    }
  }
  if (!pendingWaiters.size && pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

/**
 * Resolves with the atom once the game has registered `label`, or null when
 * `timeoutMs` (10 minutes by default) runs out or `keepGoing` turns false.
 *
 * The mod starts at document-start, long before the game registers its atoms,
 * and capturing the store does not wait for them. Subscribing to a label that
 * does not exist yet does nothing and raises nothing, so anything that starts
 * early has to wait for its atom first.
 */
export function waitForAtom(
  label: string,
  opts: { timeoutMs?: number; keepGoing?: () => boolean } = {},
): Promise<any | null> {
  return new Promise((resolve) => {
    pendingWaiters.add({
      label,
      expiresAt: Date.now() + (opts.timeoutMs ?? DEFAULT_ATOM_WAIT_MS),
      keepGoing: opts.keepGoing,
      resolve,
    });
    if (pollTimer === null) pollTimer = setInterval(pollPendingWaiters, ATOM_POLL_MS);
  });
}
