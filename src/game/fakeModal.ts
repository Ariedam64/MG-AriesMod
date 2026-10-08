// src/features/inventory/fakeInventory.ts
// ⇒ Générique "fakeModal" + helpers spécifiques "inventory" & "journal"
// Fix: un seul patch partagé sur myData (merge générique) pour éviter les conflits
// quand on alterne Inventaire ⇄ Journal.

import { fakeShow, fakeHide, type FakeConfig } from "./fakeAtoms";
import { Atoms } from "./store/atoms";
import { modalNameOf } from "./modalState";
import { activityLogOpenTarget, activityLogTabOf, type ActivityLogTab } from "./activityLogModalLayout";

/* --------------------------------- Types -------------------------------- */
export type ModalId = string;
export type InvPayload = { items?: any[]; favoritedItemIds?: string[] } | any;


/* ------------------------------- Modal I/O ------------------------------- */

export async function openModal(modalId: ModalId) {
  try {
    const current = await Atoms.ui.activeModal.get();
    if (current && current !== modalId) {
      await Atoms.ui.activeModal.set(null);
      await Atoms.ui.inventoryModalIsActive.set(false);
      await new Promise(r => requestAnimationFrame(r));
    }
    await Atoms.ui.activeModal.set(modalId);
    await Atoms.ui.inventoryModalIsActive.set(modalId === "inventory");
  } catch (err) {
  }
}

export async function closeModal(modalId?: ModalId) {
  // Si on cible une modal précise, on ne ferme QUE si elle est toujours active.
  // Évite de tuer une modal que l'utilisateur a ouverte entretemps. Sans argument,
  // on garde le comportement "force close" (auth gate, etc.).
  try {
    if (modalId) {
      const current = await Atoms.ui.activeModal.get();
      if (current !== modalId) return;
    }
    await Atoms.ui.activeModal.set(null);
    if (modalId === "inventory" || !modalId) {
      await Atoms.ui.inventoryModalIsActive.set(false);
    }
  } catch (err) {
  }
}

/** `value` is the raw atom value the gates see, `{ modal, openId }` since v1342. */
function isModalOpen(value: any, modalId: ModalId) {
  return modalNameOf(value) === modalId;
}

async function isModalOpenAsync(modalId: ModalId): Promise<boolean> {
  try {
    const v = await Atoms.ui.activeModal.get();
    return isModalOpen(v, modalId);
  } catch (err) {
    return false;
  }
}

async function waitModalClosed(modalId: ModalId, timeoutMs = 120000): Promise<boolean> {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    try {
      const v = await Atoms.ui.activeModal.get();
      if (!isModalOpen(v, modalId)) return true;
    } catch {
      // si l'atom n'est pas lisible, on considère "fermée"
      return true;
    }
    await new Promise(r => setTimeout(r, 80));
  }
  return false;
}

/* --------------------------- Helpers de gate ---------------------------- */



const mergeMyData = (real: any, patch: any) => {
  const base = real && typeof real === "object" ? real : {};
  const add  = patch && typeof patch === "object" ? patch : {};
  return { ...base, ...add };
};

/* ------------------------------- API générique ------------------------------- */


/* ============================ Patchs partagés / spécifiques ============================ */
/**
 * Patch PARTAGÉ sur myData:
 *  - merge générique: { ...real, ...patch }
 *  - gate: actif si inventory, journal, stats ou activityLog est ouvert
 *  => plus de conflit de merge quand on switch.
 */
const SHARED_MYDATA_PATCH: FakeConfig<any> = {
  label: Atoms.data.myData.label,
  merge: mergeMyData,
  gate: {
    label: Atoms.ui.activeModal.label,
    isOpen: (v) => ["inventory", "journal", "activityLog"].includes(modalNameOf(v) ?? ""),
    autoDisableOnClose: true,
  },
};

/** Patch SPÉCIFIQUE sur myInventoryAtom (utile pour l’UI inventaire). */
const INVENTORY_ATOM_PATCH: FakeConfig<any> = {
  label: Atoms.inventory.myInventory.label,
  merge: (_real: any, fake: any) => fake,
  gate: {
    label: Atoms.ui.activeModal.label,
    isOpen: (v) => modalNameOf(v) === "inventory",
    autoDisableOnClose: true,
  },
};

/* ============================ Spécifique INVENTORY ============================ */

const INVENTORY_MODAL_ID: ModalId = "inventory";

async function openInventoryPanel() {
  return openModal(INVENTORY_MODAL_ID);
}

export async function closeInventoryPanel() {
  return closeModal(INVENTORY_MODAL_ID);
}

export function isInventoryOpen(v: any) {
  return isModalOpen(v, INVENTORY_MODAL_ID);
}

export async function isInventoryPanelOpen(): Promise<boolean> {
  return isModalOpenAsync(INVENTORY_MODAL_ID);
}

export async function waitInventoryPanelClosed(timeoutMs = 120000): Promise<boolean> {
  return waitModalClosed(INVENTORY_MODAL_ID, timeoutMs);
}

/** Active les fakes d’inventaire et ouvre la modale si demandé. */
export async function fakeInventoryShow(
  payload: InvPayload,
  opts?: { open?: boolean; autoRestoreMs?: number }
) {
  const shouldOpen = opts?.open !== false;

  // 1) Patch partagé dans myData → { inventory: payload }
  await fakeShow(SHARED_MYDATA_PATCH, { inventory: payload }, {
    openGate: false,
    autoRestoreMs: opts?.autoRestoreMs,
  });

  // 2) Patch spécifique dans myInventoryAtom
  await fakeShow(INVENTORY_ATOM_PATCH, payload, {
    openGate: false,
    autoRestoreMs: opts?.autoRestoreMs,
  });

  if (shouldOpen) await openInventoryPanel();
}

/** Désactive les fakes d’inventaire. */
export async function fakeInventoryHide() {
  await fakeHide(INVENTORY_ATOM_PATCH.label);
  await fakeHide(SHARED_MYDATA_PATCH.label);
  await closeInventoryPanel();
}

/**
 * Désactive les fakes d'inventaire SANS fermer la modal.
 * Utile quand le mod a fini son flow mais que l'utilisateur est encore
 * potentiellement en train de regarder l'inventaire — on lui rend la vraie
 * donnée sous les yeux au lieu de lui yank la modal.
 */
export async function fakeInventoryDisable() {
  await fakeHide(INVENTORY_ATOM_PATCH.label);
  await fakeHide(SHARED_MYDATA_PATCH.label);
}

/* =============================== Spécifique JOURNAL =============================== */

export const JOURNAL_MODAL_ID: ModalId = "journal";

async function openJournalModal() {
  return openModal(JOURNAL_MODAL_ID);
}



export async function isJournalModalOpen(): Promise<boolean> {
  return isModalOpenAsync(JOURNAL_MODAL_ID);
}

export async function waitJournalModalClosed(timeoutMs = 120000): Promise<boolean> {
  return waitModalClosed(JOURNAL_MODAL_ID, timeoutMs);
}

/** Active le fake du journal (via patch partagé myData) et ouvre la modale si demandé. */
export async function fakeJournalShow(
  payload?: any,
  opts?: { open?: boolean; autoRestoreMs?: number }
) {
  const shouldOpen = opts?.open !== false;

  // Par sécurité: on s'assure que le patch inventaire spécifique ne reste pas actif
  await fakeHide(INVENTORY_ATOM_PATCH.label);

  await fakeShow(SHARED_MYDATA_PATCH, { journal: payload ?? {} }, {
    openGate: false,
    autoRestoreMs: opts?.autoRestoreMs,
  });

  if (shouldOpen) await openJournalModal();
}


/* ===================== Activity log et Stats : une seule modale ===================== */
// Depuis v1396 la modale `stats` n'existe plus : Stats est un onglet de la
// modale `activityLog`, choisi par `activityLogTabAtom`. On écrit l'onglet puis
// la modale, dans l'ordre du jeu. Si la modale est déjà ouverte, elle suit
// l'onglet d'elle-même.

export const ACTIVITY_LOG_MODAL_ID: ModalId = "activityLog";

async function openActivityLogTab(tab: ActivityLogTab) {
  const target = activityLogOpenTarget(tab);
  try { await Atoms.ui.activityLogTab.set(target.tab); } catch {}
  return openModal(target.modal);
}

async function isActivityLogTabOpen(tab: ActivityLogTab): Promise<boolean> {
  if (!(await isModalOpenAsync(ACTIVITY_LOG_MODAL_ID))) return false;
  try { return activityLogTabOf(await Atoms.ui.activityLogTab.get()) === tab; } catch { return false; }
}

/* =============================== Spécifique STATS =============================== */

async function openStatsModal() {
  return openActivityLogTab("stats");
}


export async function isStatsModalOpenAsync(): Promise<boolean> {
  return isActivityLogTabOpen("stats");
}

/** Attend la fermeture de la modale, pas un changement d'onglet. */
export async function waitStatsModalClosed(timeoutMs = 120000): Promise<boolean> {
  return waitModalClosed(ACTIVITY_LOG_MODAL_ID, timeoutMs);
}

export async function fakeStatsShow(payload?: any, opts?: { open?: boolean; autoRestoreMs?: number }) {
  const shouldOpen = opts?.open !== false;

  await fakeShow(SHARED_MYDATA_PATCH, { stats: payload ?? {} }, {
    openGate: false,
    autoRestoreMs: opts?.autoRestoreMs,
  });

  if (shouldOpen) await openStatsModal();
}


/* ============================ Spécifique ACTIVITY LOG ============================ */

async function openActivityLogModal() {
  return openActivityLogTab("logs");
}



export async function isActivityLogModalOpenAsync(): Promise<boolean> {
  return isModalOpenAsync(ACTIVITY_LOG_MODAL_ID);
}

export async function waitActivityLogModalClosed(timeoutMs = 120000): Promise<boolean> {
  return waitModalClosed(ACTIVITY_LOG_MODAL_ID, timeoutMs);
}

export async function fakeActivityLogShow(payload?: any, opts?: { open?: boolean; autoRestoreMs?: number }) {
  const shouldOpen = opts?.open !== false;

  await fakeShow(SHARED_MYDATA_PATCH, { activityLogs: payload ?? [] }, {
    openGate: false,
    autoRestoreMs: opts?.autoRestoreMs,
  });

  if (shouldOpen) await openActivityLogModal();
}



