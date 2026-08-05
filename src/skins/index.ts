// Skin system entrypoint: loads stored skins and keeps the game's textures
// pointed at them.

import { getSpriteState } from '../sprite/index';
import { getAriesStorage, updateAriesStorage } from '../utils/localStorage';
import {
  applySkinTexture,
  collectGameMatches,
  forgetAppliedState,
  revertAll,
  type StageIndex,
} from './applier';
import { buildSkinCanvas } from './compositor';
import { rebakeAll } from './gameCaches';
import { installSkinsDebug } from './debug';
import { deleteSkin, clearSkins, listSkins, putSkin, MAX_SKIN_FILE_BYTES } from './store';
import { groupTargets, loadTargets } from './targets';
import type { SkinApplyResult, SkinEntry, SkinTarget, SkinnableObject } from './types';

const SKINS_CHANGED_EVENT = 'gemini:skins-changed';
const RENDERER_WATCH_MS = 2_000;
/**
 * A texture only becomes reachable once the game has actually built it, which
 * for most objects means the player has seen one. Re-running the pass on a
 * slow cadence picks those up without any per-frame cost.
 */
const RETRY_PASS_MS = 5_000;
/** Retry passes granted per transition before giving up (~1 min at RETRY_PASS_MS). */
const MAX_RETRY_PASSES = 12;

export interface SkinsSnapshot {
  ready: boolean;
  enabled: boolean;
  entries: Map<string, SkinEntry>;
  results: Map<string, SkinApplyResult>;
  objects: SkinnableObject[];
  error: string | null;
  /** Baked textures re-composited on the last transition; null if that cache was unreachable. */
  rebaked: number | null;
}

const snapshot: SkinsSnapshot = {
  ready: false,
  enabled: true,
  entries: new Map(),
  results: new Map(),
  objects: [],
  error: null,
  rebaked: null,
};

const skinCanvases = new Map<string, HTMLCanvasElement>();

let started = false;
let watchId: number | null = null;
let retryId: number | null = null;
let lastRenderer: unknown = null;
let applyChain: Promise<void> = Promise.resolve();
let retriesLeft = MAX_RETRY_PASSES;

export function getSkinsSnapshot(): SkinsSnapshot {
  return snapshot;
}

function notifyChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(SKINS_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

/** Subscribes to skin state changes. Returns an idempotent unsubscribe. */
export function onSkinsChanged(listener: () => void): () => void {
  window.addEventListener(SKINS_CHANGED_EVENT, listener);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    window.removeEventListener(SKINS_CHANGED_EVENT, listener);
  };
}

export function areSkinsEnabled(): boolean {
  return snapshot.enabled;
}

export async function setSkinsEnabled(enabled: boolean): Promise<void> {
  snapshot.enabled = enabled;
  updateAriesStorage(current => {
    current.skins = { ...(current.skins || {}), enabled };
  });
  await reapply();
}

/**
 * Serialised: building skin canvases is async, so two overlapping runs (a fast
 * double-click in the menu) could otherwise finish out of order and leave the
 * stale result applied.
 */
function reapply(): Promise<void> {
  applyChain = applyChain
    .then(() => runApply())
    .catch(error => {
      snapshot.error = error instanceof Error ? error.message : String(error);
      notifyChanged();
    });
  return applyChain;
}

/**
 * One display-list walk per pass, computed only if a skin actually needs it.
 *
 * The walk visits ~30k nodes; most skins now resolve straight from Pixi's
 * texture cache, so a pass with nothing to apply must not pay for it.
 */
function sharedStageIndex(): () => StageIndex {
  let cached: StageIndex | null = null;
  return () => (cached ??= collectGameMatches());
}

async function runApply(): Promise<void> {
  const targets = await loadTargets();
  snapshot.results = new Map();
  skinCanvases.clear();
  retriesLeft = MAX_RETRY_PASSES;
  revertAll();

  if (!snapshot.enabled) {
    // Disabling is a transition too: the baked composites still hold the skin
    // until they are re-composited from the restored atlas textures.
    snapshot.rebaked = rebakeAll();
    snapshot.error = null;
    notifyChanged();
    return;
  }

  const index = sharedStageIndex();

  for (const entry of snapshot.entries.values()) {
    const target = targets.get(entry.frameKey);
    if (!target || !target.skinnable) {
      snapshot.results.set(entry.frameKey, {
        frameKey: entry.frameKey,
        applied: false,
        error: target?.blockedReason ?? 'Frame not found in the game atlases',
      });
      continue;
    }

    try {
      const canvas = await buildSkinCanvas(target, entry.blob);
      skinCanvases.set(entry.frameKey, canvas);
      const ok = applySkinTexture(target, canvas, index);
      snapshot.results.set(entry.frameKey, {
        frameKey: entry.frameKey,
        applied: ok,
        error: ok ? undefined : 'Waiting for the game to draw this object',
      });
    } catch (error) {
      snapshot.results.set(entry.frameKey, {
        frameKey: entry.frameKey,
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Once, after every skin is in place — each entry costs a GPU render.
  snapshot.rebaked = rebakeAll();

  snapshot.error = null;
  notifyChanged();
}

/**
 * Retries the skins still waiting for their texture to exist.
 *
 * Capped: a skin for an object the player never places would otherwise walk the
 * whole display list every few seconds for the rest of the session. It resumes
 * from scratch on the next real transition.
 */
async function retryPending(): Promise<void> {
  if (!snapshot.enabled || retriesLeft <= 0) return;
  const pending = [...snapshot.results.values()].filter(result => !result.applied);
  if (!pending.length) return;
  retriesLeft -= 1;

  const targets = await loadTargets();
  const index = sharedStageIndex();
  let changed = false;
  for (const result of pending) {
    const canvas = skinCanvases.get(result.frameKey);
    const target = targets.get(result.frameKey);
    if (!canvas || !target) continue;
    if (!applySkinTexture(target, canvas, index)) continue;
    snapshot.results.set(result.frameKey, { frameKey: result.frameKey, applied: true });
    changed = true;
  }
  if (!changed) return;
  snapshot.rebaked = rebakeAll();
  notifyChanged();
}

export async function importSkin(frameKey: string, file: File): Promise<void> {
  const targets = await loadTargets();
  const target = targets.get(frameKey);
  if (!target) throw new Error(`Unknown frame: ${frameKey}`);
  if (!target.skinnable) throw new Error(target.blockedReason || 'Frame cannot be skinned');
  if (file.size > MAX_SKIN_FILE_BYTES) {
    throw new Error(`File too large (max ${Math.round(MAX_SKIN_FILE_BYTES / 1024 / 1024)} MB)`);
  }

  // Decode before persisting: storing a file the compositor cannot read would
  // produce a skin that silently never shows up.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Unreadable image (PNG, WebP, JPEG or GIF)');
  }
  bitmap.close?.();

  const entry = await putSkin(frameKey, file);
  snapshot.entries.set(frameKey, entry);
  await reapply();
}

export async function removeSkin(frameKey: string): Promise<void> {
  await deleteSkin(frameKey);
  snapshot.entries.delete(frameKey);
  await reapply();
}

export async function removeAllSkins(): Promise<void> {
  await clearSkins();
  snapshot.entries.clear();
  await reapply();
}

/**
 * Re-applies skins after the game rebuilds its renderer (WebGL context loss on
 * alt-tab, which src/sprite/index.ts already recovers from). The old textures
 * are dead objects by then, so the stored originals are dropped rather than
 * restored.
 */
function startTimers(): void {
  const pageWin: any = (globalThis as any).unsafeWindow || (globalThis as any);

  if (watchId === null) {
    lastRenderer = getSpriteState().renderer;
    watchId = pageWin.setInterval(() => {
      const current = getSpriteState().renderer;
      if (!current || current === lastRenderer) return;
      lastRenderer = current;
      if (!snapshot.entries.size) return;
      console.info('[MG Skins] renderer recreated, re-applying skins');
      forgetAppliedState();
      void reapply();
    }, RENDERER_WATCH_MS);
  }

  if (retryId === null) {
    retryId = pageWin.setInterval(() => {
      void retryPending().catch(error => {
        console.warn('[MG Skins] retry pass failed', error);
      });
    }, RETRY_PASS_MS);
  }
}

export function stopSkins(): void {
  const pageWin: any = (globalThis as any).unsafeWindow || (globalThis as any);
  if (watchId !== null) {
    pageWin.clearInterval(watchId);
    watchId = null;
  }
  if (retryId !== null) {
    pageWin.clearInterval(retryId);
    retryId = null;
  }
  revertAll();
  started = false;
}

/** Safe to call more than once; only the first call does the work. */
export async function initSkins(): Promise<void> {
  if (started) return;
  started = true;

  snapshot.enabled = getAriesStorage().skins?.enabled !== false;
  installSkinsDebug();

  try {
    const targets = await loadTargets();
    snapshot.objects = groupTargets(targets);
    const rows = await listSkins();
    snapshot.entries = new Map(rows.map(row => [row.frameKey, row]));
    snapshot.ready = true;
    notifyChanged();
    startTimers();
    if (snapshot.entries.size) await reapply();
  } catch (error) {
    snapshot.error = error instanceof Error ? error.message : String(error);
    snapshot.ready = true;
    notifyChanged();
  }
}

export type { SkinTarget, SkinnableObject, SkinEntry, SkinApplyResult };
