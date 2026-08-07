// src/store/api.ts
import { ensureStore as ensureJotaiStore, getAtomByLabel, jGet, jSub, jSet } from "./jotai";

export type Unsubscribe = () => void;

// Le mod démarre en `@run-at document-start`, bien avant que le jeu ait
// enregistré ses atoms Jotai — et `ensureStore()` n'attend que la capture du
// store, pas la création des atoms. S'abonner à ce moment-là renvoyait un
// unsubscribe vide sans jamais s'abonner ni lever d'erreur : la feature
// concernée restait muette pour toute la session, sans le moindre signe.
// Les abonnements attendent donc que le label existe avant de s'attacher.
const ATOM_POLL_MS = 250;
const ATOM_WAIT_TIMEOUT_MS = 10 * 60_000;

type PendingWaiter = {
  label: string;
  expiresAt: number;
  resolve: (atom: unknown | null) => void;
};

// Un seul timer partagé pour toutes les attentes en cours : il s'arrête dès
// qu'il n'y a plus personne à servir, et redémarre au besoin.
const pendingWaiters = new Set<PendingWaiter>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function stopPoller(): void {
  if (pollTimer === null) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function pollPendingWaiters(): void {
  const now = Date.now();
  for (const waiter of Array.from(pendingWaiters)) {
    const atom = getAtomByLabel(waiter.label);
    if (atom) {
      pendingWaiters.delete(waiter);
      waiter.resolve(atom);
      continue;
    }
    if (now >= waiter.expiresAt) {
      pendingWaiters.delete(waiter);
      waiter.resolve(null);
    }
  }
  if (!pendingWaiters.size) stopPoller();
}

function ensurePoller(): void {
  if (pollTimer !== null) return;
  pollTimer = setInterval(pollPendingWaiters, ATOM_POLL_MS);
}

/** Résout dès que le label est enregistré, ou `null` si l'attente expire. */
function waitForAtom(label: string): Promise<unknown | null> {
  return new Promise((resolve) => {
    const waiter: PendingWaiter = {
      label,
      expiresAt: Date.now() + ATOM_WAIT_TIMEOUT_MS,
      resolve,
    };
    pendingWaiters.add(waiter);
    ensurePoller();
  });
}

export async function ensureStore() {
try { await ensureJotaiStore(); } catch {}
}

/**
 * Lit une valeur d'atom par label. Retourne fallback si indisponible.
 *
 * Volontairement non bloquant, contrairement aux abonnements : un `get()` doit
 * répondre tout de suite, quitte à rendre le fallback. Pour une valeur qui
 * n'existe pas encore au boot, passer par un abonnement.
 */
export async function select<T>(label: string, fallback?: T): Promise<T | undefined> {
await ensureStore();
const atom = getAtomByLabel(label);
if (!atom) return fallback;
try { return await jGet<T>(atom); } catch { return fallback; }
}

/**
 * Indique si un atom existe sous ce label dans le runtime du jeu.
 *
 * `select`/`set` ne font rien du tout quand le label est introuvable, sans
 * lever d'erreur — un renommage côté jeu casse donc une fonctionnalité en
 * silence. Ce test permet de choisir entre plusieurs noms possibles.
 */
export async function hasAtom(label: string): Promise<boolean> {
  await ensureStore();
  return !!getAtomByLabel(label);
}

/**
 * S'abonne à un atom par label. Callback appelé sur changements.
 *
 * Si le label n'existe pas encore, l'attache se fait plus tard, dès que le jeu
 * l'enregistre. L'unsubscribe rendu annule aussi bien l'attente que
 * l'abonnement réel, et reste sûr à appeler plusieurs fois.
 */
export async function subscribe<T>(label: string, cb: (value: T) => void): Promise<Unsubscribe> {
  await ensureStore();
  let cancelled = false;
  let attachedUnsub: Unsubscribe | null = null;

  const attach = async (atom: unknown): Promise<void> => {
    const unsub = await jSub(atom, async () => {
      try { cb(await jGet<T>(atom)); } catch {}
    });
    if (cancelled) {
      try { unsub(); } catch {}
      return;
    }
    attachedUnsub = unsub;
  };

  const atom = getAtomByLabel(label);
  if (atom) {
    await attach(atom);
  } else {
    void (async () => {
      const found = await waitForAtom(label);
      if (!found || cancelled) return;
      try { await attach(found); } catch {}
    })();
  }

  return () => {
    cancelled = true;
    const unsub = attachedUnsub;
    attachedUnsub = null;
    try { unsub?.(); } catch {}
  };
}

/**
 * Push la valeur courante puis écoute.
 *
 * L'ordre compte : on s'abonne d'abord, puis on lit — rien de ce qui survient
 * entre les deux n'est perdu. Quand l'atom arrive en retard, la valeur est
 * poussée au moment de l'attache, pas au boot : sinon l'abonné resterait sur le
 * vide lu trop tôt jusqu'au prochain changement, qui peut ne jamais venir.
 */
export async function subscribeImmediate<T>(label: string, cb: (value: T) => void): Promise<Unsubscribe> {
  await ensureStore();
  let cancelled = false;
  let attachedUnsub: Unsubscribe | null = null;

  const attach = async (atom: unknown): Promise<void> => {
    const unsub = await jSub(atom, async () => {
      try { cb(await jGet<T>(atom)); } catch {}
    });
    if (cancelled) {
      try { unsub(); } catch {}
      return;
    }
    attachedUnsub = unsub;
    try {
      const current = await jGet<T>(atom);
      if (!cancelled && current !== undefined) cb(current);
    } catch {}
  };

  const atom = getAtomByLabel(label);
  if (atom) {
    await attach(atom);
  } else {
    void (async () => {
      const found = await waitForAtom(label);
      if (!found || cancelled) return;
      try { await attach(found); } catch {}
    })();
  }

  return () => {
    cancelled = true;
    const unsub = attachedUnsub;
    attachedUnsub = null;
    try { unsub?.(); } catch {}
  };
}

export async function set(label: string, value: any) {
  await ensureStore();
  const atom = getAtomByLabel(label);
  if (!atom) return;
  await jSet(atom, value);
}
export const Store = { ensure: ensureStore, select, subscribe, subscribeImmediate, set, hasAtom };
