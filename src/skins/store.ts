// Persistence for user-imported skins.
//
// Images live in a dedicated IndexedDB database rather than the shared
// `aries_mod` localStorage blob: that blob carries the mod's entire config and
// localStorage caps at ~5 MB for the whole origin, so a couple of imported
// PNGs would be enough to blow away every user's settings.
//
// The *original* file is stored, never a pre-resized copy. Atlas rectangles
// change whenever the game ships new art, so the fitting is redone at compose
// time against the current rect instead of being baked in at import time.

import type { SkinEntry } from './types';

const DB_NAME = 'aries_skins';
const DB_VERSION = 1;
const STORE_NAME = 'entries';

/** Import ceiling. Well above any atlas frame, low enough to keep IDB sane. */
export const MAX_SKIN_FILE_BYTES = 4 * 1024 * 1024;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'frameKey' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
  // A failed open must not poison every later call with the same rejection.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function runTransaction<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    db =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = work(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
      }),
  );
}

export async function listSkins(): Promise<SkinEntry[]> {
  const rows = await runTransaction<SkinEntry[]>('readonly', store => store.getAll() as IDBRequest<SkinEntry[]>);
  return Array.isArray(rows) ? rows : [];
}

export async function putSkin(frameKey: string, blob: Blob): Promise<SkinEntry> {
  const entry: SkinEntry = { frameKey, blob };
  await runTransaction('readwrite', store => store.put(entry));
  return entry;
}

export async function deleteSkin(frameKey: string): Promise<void> {
  await runTransaction('readwrite', store => store.delete(frameKey));
}

export async function clearSkins(): Promise<void> {
  await runTransaction('readwrite', store => store.clear());
}
