// src/store/hub.ts
import { Store, Unsubscribe } from "./api";

/* ================================== utils path ================================== */

type Path = string | Array<string | number>;

function toPathArray(path?: Path): Array<string | number> {
  if (!path) return [];
  return Array.isArray(path) ? path.slice() : path.split(".").map(k => (k.match(/^\d+$/) ? Number(k) : k));
}

function getAtPath<T = any>(root: any, path?: Path): T {
  const segs = toPathArray(path);
  let cur = root;
  for (const s of segs) {
    if (cur == null) return undefined as any;
    cur = (cur as any)[s as any];
  }
  return cur as T;
}

function setAtPath(root: any, path: Path, nextValue: any) {
  const segs = toPathArray(path);
  if (!segs.length) return nextValue;
  const clone = Array.isArray(root) ? root.slice() : { ...(root ?? {}) };
  let cur: any = clone;
  for (let i = 0; i < segs.length - 1; i++) {
    const key = segs[i];
    const src = cur[key as any];
    const obj = typeof src === "object" && src !== null
      ? (Array.isArray(src) ? src.slice() : { ...src })
      : {};
    cur[key as any] = obj;
    cur = obj;
  }
  cur[segs[segs.length - 1] as any] = nextValue;
  return clone;
}

const eq = {
  shallow(a: any, b: any) {
    if (Object.is(a, b)) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const ka = Object.keys(a); const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!Object.is(a[k], b[k])) return false;
    return true;
  },
  idSet(a: string[], b: string[]) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    const sa = new Set(a);
    for (const id of b) if (!sa.has(id)) return false;
    return true;
  },
};

/* ============================== vue générique (path) ============================== */

export type View<T> = {
  label: string;
  get(): Promise<T>;
  set(next: T): Promise<void>;
  update(fn: (prev: T) => T): Promise<T>;
  onChange(cb: (next: T, prev?: T) => void, isEqual?: (a: T, b: T) => boolean): Promise<Unsubscribe>;
  onChangeNow(cb: (next: T, prev?: T) => void, isEqual?: (a: T, b: T) => boolean): Promise<Unsubscribe>;
  /** créer un canal de signatures sur cette vue */
  asSignature<K extends string | number = string>(opts: SignatureOpts<T, K>): SignatureChannel<T, K>;
};

type MakeViewOpts<TSrc, T> = {
  /** chemin dans la source. ex: "child.data.shops.seed.inventory" */
  path?: Path;
  /** writer: "replace" (par défaut) | "merge-shallow" | custom */
  write?: "replace" | "merge-shallow" | ((next: T, prevSrc: TSrc | undefined) => TSrc);
};

export function makeView<TSrc = any, T = any>(
  sourceLabel: string,
  opts: MakeViewOpts<TSrc, T> = {}
): View<T> {
  const { path, write = "replace" } = opts;

  async function get(): Promise<T> {
    const src = await Store.select<TSrc>(sourceLabel);
    return (path ? getAtPath<T>(src, path) : (src as any)) as T;
  }

  async function set(next: T) {
    if (typeof write === "function") {
        const prev = await Store.select<TSrc>(sourceLabel);  
        const raw = write(next, prev);                         
        return Store.set(sourceLabel, raw);
    }
    const prev = await Store.select<any>(sourceLabel);
    const raw = path ? setAtPath(prev, path, next) : next;
    if (write === "merge-shallow" && !path && prev && typeof prev === "object" && typeof next === "object") {
        return Store.set(sourceLabel, { ...prev, ...(next as any) });
    }
    return Store.set(sourceLabel, raw);
  }


  async function update(fn: (prev: T) => T) {
    const prev = await get();
    const next = fn(prev);
    await set(next);
    return next;
  }

  async function onChange(cb: (next: T, prev?: T) => void, isEqual: (a: T, b: T) => boolean = Object.is) {
    let prev: T | undefined;
    return Store.subscribe<TSrc>(sourceLabel, (src) => {
      const v = (path ? getAtPath<T>(src, path) : (src as any)) as T;
      if (typeof prev === "undefined" || !isEqual(prev as T, v)) {
        const p = prev;
        prev = v;
        cb(v, p);
      }
    });
  }

  async function onChangeNow(cb: (next: T, prev?: T) => void, isEqual: (a: T, b: T) => boolean = Object.is) {
    let prev: T | undefined;
    return Store.subscribeImmediate<TSrc>(sourceLabel, (src) => {
      const v = (path ? getAtPath<T>(src, path) : (src as any)) as T;
      if (typeof prev === "undefined" || !isEqual(prev as T, v)) {
        const p = prev;
        prev = v;
        cb(v, p);
      }
    });
  }

  function asSignature<K extends string | number = string>(opts: SignatureOpts<T, K>): SignatureChannel<T, K> {
    return makeSignatureChannel<T, K>(sourceLabel, path, opts);
  }

  return { label: sourceLabel + (path ? ":" + toPathArray(path).join(".") : ""), get, set, update, onChange, onChangeNow, asSignature };
}

/* ========================== canal de signatures générique ========================== */

export type SignatureOpts<TView, K extends string | number> = {
  /**
   * Comment collecter les entrées à signer :
   * - "auto" (défaut) : si Array -> itère items; si Record -> Object.entries()
   * - "array" | "record" : forcer le mode
   */
  mode?: "auto" | "array" | "record";
  /** Clé logique d’une entrée (sinon: index pour array, property name pour record) */
  key?: (item: any, indexOrKey: number | string, whole: TView) => K;
  /**
   * Signature d’une entrée. Si non fourni:
   * - si fields est fourni → signature basée sur ces champs
   * - sinon → JSON.stringify(item) (simple mais verbeux)
   */
  sig?: (item: any, indexOrKey: number | string, whole: TView) => string;
  /** Liste de champs à prendre pour la signature, ex: ["species"] ou ["id","stage","watered"] */
  fields?: Array<string>;
};

export type SignatureChannel<TView, K extends string | number> = {
  /** Notifie quand **au moins une** clé change de signature */
  sub(cb: (p: { value: TView; changedKeys: K[] }) => void): Promise<Unsubscribe>;
  /** Notifie seulement si la signature de `key` change */
  subKey(key: K, cb: (p: { value: TView }) => void): Promise<Unsubscribe>;
  /** Notifie si l’une des clés demandées change */
  subKeys(keys: K[], cb: (p: { value: TView; changedKeys: K[] }) => void): Promise<Unsubscribe>;
};

function stablePick(obj: any, fields: string[]): string {
  const out: any = {};
  for (const f of fields) {
    // support "a.b.c"
    const v = getAtPath(obj, f.includes(".") ? f : [f]);
    out[f] = v;
  }
  try { return JSON.stringify(out); } catch { return String(out); }
}

function makeSignatureChannel<TView, K extends string | number>(
  sourceLabel: string,
  path: Path | undefined,
  opts: SignatureOpts<TView, K>
): SignatureChannel<TView, K> {
  const mode = opts.mode ?? "auto";

  function computeSig(whole: TView): { sig: Map<K, string>; keys: K[] } {
    const base: any = whole;
    const value = path ? getAtPath<any>(base, path) : base;

    const sig = new Map<K, string>();
    if (value == null) return { sig, keys: [] };

    if ((mode === "array" || (mode === "auto" && Array.isArray(value))) && Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        const key = (opts.key ? opts.key(item, i, whole) : (i as any)) as K;
        const s = opts.sig
          ? opts.sig(item, i, whole)
          : opts.fields
            ? stablePick(item, opts.fields)
            : (() => { try { return JSON.stringify(item); } catch { return String(item); } })();
        sig.set(key, s);
      }
    } else {
      // record
      for (const [k, item] of Object.entries(value as Record<string, any>)) {
        const key = (opts.key ? opts.key(item, k, whole) : (k as any)) as K;
        const s = opts.sig
          ? opts.sig(item, k, whole)
          : opts.fields
            ? stablePick(item, opts.fields)
            : (() => { try { return JSON.stringify(item); } catch { return String(item); } })();
        sig.set(key, s);
      }
    }
    return { sig, keys: Array.from(sig.keys()) };
  }

  function mapEqual(a?: Map<K, string> | null, b?: Map<K, string> | null) {
    if (a === b) return true;
    if (!a || !b || a.size !== b.size) return false;
    for (const [k, v] of a) if (b.get(k) !== v) return false;
    return true;
  }

  async function sub(cb: (p: { value: TView; changedKeys: K[] }) => void): Promise<Unsubscribe> {
    let prevSig: Map<K, string> | null = null;
    return Store.subscribeImmediate<TView>(sourceLabel, (src) => {
      const whole = (path ? getAtPath<any>(src, path) : (src as any)) as TView;
      const { sig } = computeSig(whole);
      if (!mapEqual(prevSig, sig)) {
        // calc changes
        const allKeys = new Set<K>([
          ...(prevSig ? (Array.from(prevSig.keys()) as K[]) : []),
          ...(Array.from(sig.keys()) as K[]),
        ]);
        const changed: K[] = [];
        for (const k of allKeys) if ((prevSig?.get(k) ?? "__NONE__") !== (sig.get(k) ?? "__NONE__")) changed.push(k);
        prevSig = sig;
        cb({ value: whole, changedKeys: changed });
      }
    });
  }

  async function subKey(key: K, cb: (p: { value: TView }) => void): Promise<Unsubscribe> {
    let last = "__INIT__";
    return sub(({ value, changedKeys }) => {
      if (changedKeys.includes(key)) cb({ value });
    });
  }

  async function subKeys(keys: K[], cb: (p: { value: TView; changedKeys: K[] }) => void): Promise<Unsubscribe> {
    const wanted = new Set(keys);
    return sub(({ value, changedKeys }) => {
      const hit = changedKeys.filter(k => wanted.has(k));
      if (hit.length) cb({ value, changedKeys: hit });
    });
  }

  return { sub, subKey, subKeys };
}

/* =============================== helpers facultatifs =============================== */

export const HubEq = eq;
export function makeAtom<T = any>(label: string) {
  return makeView<T, T>(label);
}

/**
 * Atom désigné par plusieurs noms possibles, le premier trouvé gagne.
 *
 * Le jeu renomme parfois un atom d’une version à l’autre. Comme un label
 * introuvable ne provoque aucune erreur — `set` et `subscribe` deviennent
 * simplement des no-ops — la fonctionnalité concernée s’arrête sans le moindre
 * signe. Lister l’ancien nom en repli garde le mod fonctionnel pendant la
 * transition (bundle en cache, rollback du jeu).
 *
 * Le nom retenu est mémorisé dès qu’il est résolu ; tant qu’aucun ne l’est, on
 * retente à chaque appel plutôt que de figer un mauvais choix au boot, avant
 * que les atoms du jeu ne soient enregistrés.
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
    set: async next => (await pick()).set(next),
    update: async fn => (await pick()).update(fn),
    onChange: async (cb, isEqual) => (await pick()).onChange(cb, isEqual),
    onChangeNow: async (cb, isEqual) => (await pick()).onChangeNow(cb, isEqual),
    asSignature: opts => makeView<T, T>(resolved?.label ?? labels[0]).asSignature(opts),
  };
}
