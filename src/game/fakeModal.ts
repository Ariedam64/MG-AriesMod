import { fakeShow, fakeHide, type FakeConfig } from "./fakeAtoms";
import { Atoms } from "./store/atoms";
import { modalNameOf } from "./modalState";
import { ACTIVITY_LOG_MODAL_ID, activityLogOpenTarget, activityLogTabOf, type ActivityLogTab } from "./activityLogModalLayout";

/**
 * Opening the game's own modals, and opening them on data the mod supplies
 * (another player's inventory, journal, stats or activity log) by faking the
 * atoms they read while they are open.
 */

type ModalId = string;
type ShowOpts = { open?: boolean; autoRestoreMs?: number };

export { ACTIVITY_LOG_MODAL_ID };
export const JOURNAL_MODAL_ID: ModalId = "journal";
const INVENTORY_MODAL_ID: ModalId = "inventory";

/* ================================ Modal I/O ================================ */

export async function openModal(modalId: ModalId) {
  try {
    const current = await Atoms.ui.activeModal.get();
    if (current && current !== modalId) {
      await Atoms.ui.activeModal.set(null);
      await Atoms.ui.inventoryModalIsActive.set(false);
      await new Promise((r) => requestAnimationFrame(r));
    }
    await Atoms.ui.activeModal.set(modalId);
    await Atoms.ui.inventoryModalIsActive.set(modalId === INVENTORY_MODAL_ID);
  } catch {}
}

/**
 * Closes `modalId` only if it is still the active one, so a modal the player
 * opened in the meantime survives. Without an argument it closes whatever is
 * open (auth gate and the like).
 */
export async function closeModal(modalId?: ModalId) {
  try {
    if (modalId) {
      const current = await Atoms.ui.activeModal.get();
      if (current !== modalId) return;
    }
    await Atoms.ui.activeModal.set(null);
    if (modalId === INVENTORY_MODAL_ID || !modalId) {
      await Atoms.ui.inventoryModalIsActive.set(false);
    }
  } catch {}
}

/** `value` is the raw atom value the gates see, `{ modal, openId }` since v1342. */
function isModalOpen(value: any, modalId: ModalId) {
  return modalNameOf(value) === modalId;
}

async function isModalOpenAsync(modalId: ModalId): Promise<boolean> {
  try {
    return isModalOpen(await Atoms.ui.activeModal.get(), modalId);
  } catch {
    return false;
  }
}

async function waitModalClosed(modalId: ModalId, timeoutMs = 120000): Promise<boolean> {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    try {
      if (!isModalOpen(await Atoms.ui.activeModal.get(), modalId)) return true;
    } catch {
      // An unreadable atom counts as closed.
      return true;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

/* ============================== Faked atoms =============================== */

/**
 * One patch on myData shared by every faked modal, merged as
 * `{ ...real, ...patch }` and active while any of them is open. A single patch
 * is what keeps switching between them from fighting over the merge.
 */
const SHARED_MYDATA_PATCH: FakeConfig<any> = {
  label: Atoms.data.myData.label,
  merge: (real: any, patch: any) => ({
    ...(real && typeof real === "object" ? real : {}),
    ...(patch && typeof patch === "object" ? patch : {}),
  }),
  gate: {
    label: Atoms.ui.activeModal.label,
    isOpen: (v) => ["inventory", "journal", "activityLog"].includes(modalNameOf(v) ?? ""),
    autoDisableOnClose: true,
  },
};

/** The inventory UI also reads myInventoryAtom directly, so it gets its own patch. */
const INVENTORY_ATOM_PATCH: FakeConfig<any> = {
  label: Atoms.inventory.myInventory.label,
  merge: (_real: any, fake: any) => fake,
  gate: {
    label: Atoms.ui.activeModal.label,
    isOpen: (v) => modalNameOf(v) === INVENTORY_MODAL_ID,
    autoDisableOnClose: true,
  },
};

type FakeModal = {
  /** Fakes the data and, unless `open: false`, opens the modal on it. */
  show(payload?: any, opts?: ShowOpts): Promise<void>;
  isOpen(): Promise<boolean>;
  waitClosed(timeoutMs?: number): Promise<boolean>;
};

function defineFakeModal(spec: {
  /** The key under myData the modal reads. */
  field: string;
  /** What to fake when `show` gets no payload. */
  empty?: unknown;
  /** The modal whose closing `waitClosed` waits for. */
  modal: ModalId;
  open: () => Promise<void>;
  isOpen?: () => Promise<boolean>;
  /** "patch" fakes myInventoryAtom too; "clear" drops a leftover inventory patch first. */
  inventoryAtom?: "patch" | "clear";
}): FakeModal {
  return {
    async show(payload, opts) {
      const fakeOpts = { openGate: false, autoRestoreMs: opts?.autoRestoreMs };
      if (spec.inventoryAtom === "clear") await fakeHide(INVENTORY_ATOM_PATCH.label);
      await fakeShow(SHARED_MYDATA_PATCH, { [spec.field]: payload ?? spec.empty }, fakeOpts);
      if (spec.inventoryAtom === "patch") await fakeShow(INVENTORY_ATOM_PATCH, payload, fakeOpts);
      if (opts?.open !== false) await spec.open();
    },
    isOpen: spec.isOpen ?? (() => isModalOpenAsync(spec.modal)),
    waitClosed: (timeoutMs) => waitModalClosed(spec.modal, timeoutMs),
  };
}

/* ================================ Inventory =============================== */

/**
 * Drops the inventory fake but leaves the modal open: when the mod's flow is
 * done while the player may still be looking, the real data comes back under
 * their eyes instead of the modal vanishing.
 */
async function disableFakeInventory() {
  await fakeHide(INVENTORY_ATOM_PATCH.label);
  await fakeHide(SHARED_MYDATA_PATCH.label);
}

const closeInventory = () => closeModal(INVENTORY_MODAL_ID);

export const fakeInventory = {
  ...defineFakeModal({
    field: "inventory",
    modal: INVENTORY_MODAL_ID,
    open: () => openModal(INVENTORY_MODAL_ID),
    inventoryAtom: "patch",
  }),
  disable: disableFakeInventory,
  close: closeInventory,
  /** Drops the fake and closes the inventory. */
  async hide() {
    await disableFakeInventory();
    await closeInventory();
  },
};

/** Whether a raw active modal value is the inventory. */
export function isInventoryOpen(v: any) {
  return isModalOpen(v, INVENTORY_MODAL_ID);
}

/* ================================= Journal ================================ */

export const fakeJournal = defineFakeModal({
  field: "journal",
  empty: {},
  modal: JOURNAL_MODAL_ID,
  open: () => openModal(JOURNAL_MODAL_ID),
  inventoryAtom: "clear",
});

/* ========================= Activity log and stats ========================= */

// Since v1396 the `stats` modal no longer exists: Stats is a tab of the
// `activityLog` modal, picked by `activityLogTabAtom`. The tab is written
// first, then the modal, in the game's order; an already open modal follows
// the tab by itself.

async function openActivityLogTab(tab: ActivityLogTab) {
  const target = activityLogOpenTarget(tab);
  try { await Atoms.ui.activityLogTab.set(target.tab); } catch {}
  return openModal(target.modal);
}

export const fakeStats = defineFakeModal({
  field: "stats",
  empty: {},
  // Waits for the modal to close, not for a change of tab.
  modal: ACTIVITY_LOG_MODAL_ID,
  open: () => openActivityLogTab("stats"),
  async isOpen() {
    if (!(await isModalOpenAsync(ACTIVITY_LOG_MODAL_ID))) return false;
    try { return activityLogTabOf(await Atoms.ui.activityLogTab.get()) === "stats"; } catch { return false; }
  },
});

export const fakeActivityLog = defineFakeModal({
  field: "activityLogs",
  empty: [],
  modal: ACTIVITY_LOG_MODAL_ID,
  open: () => openActivityLogTab("logs"),
});
