// src/testing/fakes/atoms.ts
import {
  ensureStore,
  findAtomsByLabel,
  getAtomByLabel,
  jGet,
  jSub,
} from "../store/jotai";

type AnyAtom = any;

export type GateConfig = {
  label: string;
  isOpen?: (value: any) => boolean;
  openAction?: () => Promise<void>;
  closeAction?: () => Promise<void>;
  autoDisableOnClose?: boolean;
};

export type FakeConfig<T = any> = {
  label: string;
  merge?: (real: T, fake: T) => T;
  gate?: GateConfig;
  extraDeps?: string[];
};

type FakeState = {
  config: FakeConfig;
  enabled: boolean;
  payload: any | null;
  patched: Map<AnyAtom, { readKey: string; orig: Function }>;
  unsubGate?: () => void;
  autoTimer?: any;
  installed: boolean;
};

const _fakeRegistry = new Map<string, FakeState>();

/* ============================ Utilitaires ============================ */

function _atomsByExactLabel(label: string): AnyAtom[] {
  try {
    return findAtomsByLabel(new RegExp("^" + label + "$"));
  } catch {
    return [];
  }
}

function _findReadKey(atom: AnyAtom): string {
  if (atom && typeof atom.read === "function") return "read";
  for (const k of Object.keys(atom || {})) {
    const v = (atom as any)[k];
    if (typeof v === "function" && k !== "write" && k !== "onMount" && k !== "toString") {
      const ar = (v as Function).length;
      if (ar === 1 || ar === 2) return k;
    }
  }
  throw new Error("Impossible de localiser la fonction read() de l'atom");
}

function _getState(label: string): FakeState | null {
  return _fakeRegistry.get(label) || null;
}

async function _forceRepaintViaGate(gate?: GateConfig) {
  if (!gate?.closeAction || !gate?.openAction) return;
  await gate.closeAction();
  await new Promise((r) => setTimeout(r, 0));
  await gate.openAction();
}

/* ======================== Installation du "fake" ======================= */

async function _ensureFakeInstalled<T = any>(config: FakeConfig<T>): Promise<FakeState> {
  const key = config.label;
  const existing = _fakeRegistry.get(key);
  if (existing?.installed) return existing;

  const atoms = _atomsByExactLabel(config.label);
  if (!atoms.length) {
    throw new Error(`${config.label} introuvable`);
  }

  const state: FakeState =
    existing ??
    ({
      config,
      enabled: false,
      payload: null,
      patched: new Map(),
      installed: false,
    } as FakeState);

  let gateAtom: AnyAtom | null = null;
  if (config.gate?.label) gateAtom = getAtomByLabel(config.gate.label);

  for (const a of atoms) {
    const readKey = _findReadKey(a);
    // @ts-ignore – Jotai interne; on capture la fonction read originale
    const orig: Function = (a as any)[readKey];

    // Patch de read()
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    (a as any)[readKey] = (get: any) => {
      // Force la prise en compte de la gate et des deps
      try {
        if (gateAtom) get(gateAtom);
      } catch (err) {
      }
      for (const dep of config.extraDeps || []) {
        try {
          const d = getAtomByLabel(dep);
          d && get(d);
        } catch (err) {
        }
      }

      const real = orig(get);
      if (!state.enabled || state.payload == null) return real;
      return config.merge ? (config.merge as any)(real, state.payload) : state.payload;
    };

    state.patched.set(a, { readKey, orig });
  }

  // Auto-disable si la gate se ferme (facultatif)
  if (gateAtom && config.gate?.autoDisableOnClose) {
    state.unsubGate = await jSub(gateAtom, async () => {
      let v: any;
      try {
        v = await jGet(gateAtom);
      } catch (err) {
        v = null;
      }
      const isOpen = config.gate?.isOpen ? config.gate.isOpen(v) : !!v;
      if (!isOpen && state.enabled) state.enabled = false;
    });
  }

  state.installed = true;
  _fakeRegistry.set(key, state);
  return state;
}

/* ========================= Prime (force re-eval) ======================== */

/**
 * Force Jotai to re-evaluate all patched atoms via store.get().
 * This registers the gate dependency in Jotai's graph AND caches
 * the current (possibly fake) value so React picks it up instantly.
 */
async function _primePatched(st: FakeState) {
  const store = await ensureStore();
  for (const atom of st.patched.keys()) {
    try {
      store.get(atom);
    } catch {
      // Ignore prewarm errors
    }
  }
}

/* =============================== API =============================== */


export async function fakeShow<T = any>(
  config: FakeConfig<T>,
  payload: T,
  options?: { merge?: boolean; openGate?: boolean; autoRestoreMs?: number }
) {
  await ensureStore();
  const st = await _ensureFakeInstalled<T>(config);
  st.payload = payload;
  st.enabled = true;

  if (options?.merge && !config.merge) {
    // @ts-ignore – fallback: sans merge custom, on remplace simplement
    config.merge = (_real: any, fake: any) => fake;
  }

  // Prime: force Jotai to re-evaluate patched atoms so the gate
  // dependency is registered and the fake value is cached in the store.
  // This eliminates the delay between modal open and data display.
  await _primePatched(st);

  if (options?.openGate && config.gate?.openAction) await config.gate.openAction();

  if (st.autoTimer) {
    clearTimeout(st.autoTimer);
    st.autoTimer = null;
  }
  if (options?.autoRestoreMs && options.autoRestoreMs > 0) {
    st.autoTimer = setTimeout(() => {
      void fakeHide(config.label);
    }, options.autoRestoreMs);
  }
}

/** Met à jour le payload du fake (doit être déjà installé) */
export async function fakeUpdate<T = any>(label: string, nextPayload: T) {
  const st = _getState(label);
  if (!st?.installed) throw new Error(`Fake ${label} non installé`);
  st.payload = nextPayload;
  await _forceRepaintViaGate(st.config.gate);
}

/** Désactive le fake, mais laisse les patches installés (read() reste hooké) */
export async function fakeHide(label: string) {
  const st = _getState(label);
  if (!st) return;
  st.enabled = false;
  st.payload = null;
  if (st.autoTimer) {
    clearTimeout(st.autoTimer);
    st.autoTimer = null;
  }
  await _forceRepaintViaGate(st.config.gate);
}

export async function fakeDispose(label: string) {
  const st = _getState(label);
  if (!st) return;
  for (const [a, meta] of st.patched) {
    try {
      (a as any)[meta.readKey] = meta.orig;
    } catch (err) {
    }
  }
  st.patched.clear();
  st.enabled = false;
  st.payload = null;
  if (st.unsubGate) {
    try {
      st.unsubGate();
    } catch (err) {
    }
    st.unsubGate = undefined;
  }
  if (st.autoTimer) {
    clearTimeout(st.autoTimer);
    st.autoTimer = undefined;
  }
  _fakeRegistry.delete(label);
}

export function fakeIsEnabled(label: string) {
  return !!_getState(label)?.enabled;
}