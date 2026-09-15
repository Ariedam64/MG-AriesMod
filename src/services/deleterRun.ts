// src/services/deleterRun.ts
//
// Runs a bulk delete one category at a time: pull out of storage only what the
// inventory cannot already cover, destroy that category, then move on.
//
// Doing a category at a time is what keeps the run safe against the inventory
// entry cap. Seeds and decor stack without limit, so a withdrawal costs at most
// one entry, and only while that category is being emptied, so peak usage is
// one slot no matter how many categories were picked.

import {
  getInventoryEntryCount,
  hasRoomForWithdrawal,
  planWithdrawal,
  type DeleterEntry,
} from "./deleterSources";

/** Let the server apply a withdrawal before the deletes start landing. */
const WITHDRAW_SETTLE_MS = 180;

export interface DeleterSelectionEntry {
  /** Raw game id: `species` for seeds, `decorId` for decor. */
  id: string;
  label: string;
  qty: number;
  /** Units of this entry that have to come out of storage first. */
  fromStorage: number;
}

export interface DeleterKind {
  /** Progress event namespace, e.g. `qws:seeddeleter`. */
  eventPrefix: string;
  /** Toast title, e.g. "Seed deleter". */
  toastTitle: string;
  /** Plural unit noun, e.g. "seeds". */
  unitNoun: string;
  /** Storage the withdrawals come from, e.g. "SeedSilo". */
  storageId: string;
  /** Field the progress events carry the current id under. */
  targetKey: "species" | "decorId";
  loadEntries(): Promise<DeleterEntry[]>;
  /** Destroys one unit. Throwing aborts the whole run. */
  deleteOne(id: string, delayMs: number): Promise<void>;
  /** Pulls `qty` units of `id` back into the inventory. */
  withdraw(id: string, storageId: string, qty: number): Promise<void>;
  /** Whether the Misc "Keep 1 slot free" guard is on. */
  isGuardEnabled(): boolean;
  toast(title: string, message: string, kind: "info" | "error" | "success"): void;
}

export interface DeleterController {
  getSelection(): DeleterSelectionEntry[];
  setSelection(entries: DeleterSelectionEntry[]): void;
  clearSelection(): void;
  run(delayMs: number): Promise<void>;
  isRunning(): boolean;
  isPaused(): boolean;
  pause(): void;
  resume(): void;
  cancel(): void;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const formatNum = (n: number) =>
  new Intl.NumberFormat("en-US").format(Math.max(0, Math.floor(n || 0)));

export function createDeleterController(kind: DeleterKind): DeleterController {
  const selection = new Map<string, DeleterSelectionEntry>();

  let running = false;
  let paused = false;
  let cancelled = false;
  let resumeWaiter: (() => void) | null = null;

  const emit = (suffix: string, detail?: unknown) => {
    try {
      window.dispatchEvent(new CustomEvent(`${kind.eventPrefix}:${suffix}`, { detail }));
    } catch {}
  };

  /** Blocks while paused; throws once cancelled so the run unwinds. */
  async function gate(): Promise<void> {
    while (paused && !cancelled) {
      await new Promise<void>((resolve) => {
        resumeWaiter = resolve;
      });
      resumeWaiter = null;
    }
    if (cancelled) throw new Error("cancelled");
  }

  /**
   * Refuses a withdrawal that would need an inventory entry there is no room
   * for. Read fresh: the player keeps playing while the run works.
   */
  async function ensureRoom(plan: ReturnType<typeof planWithdrawal>): Promise<boolean> {
    if (plan.fromStorage <= 0) return true;
    const count = await getInventoryEntryCount();
    return hasRoomForWithdrawal(plan, count, kind.isGuardEnabled());
  }

  async function run(delayMs: number): Promise<void> {
    if (running) {
      kind.toast(kind.toastTitle, "Deletion already in progress.", "info");
      return;
    }
    if (selection.size === 0) {
      kind.toast(kind.toastTitle, `No ${kind.unitNoun} selected.`, "info");
      return;
    }

    // Re-read rather than trusting the snapshot the popup was built from: the
    // player may have planted, sold or stored something since.
    const entries = await kind.loadEntries();
    const byId = new Map(entries.map((entry) => [entry.id, entry]));

    const tasks: Array<{ entry: DeleterEntry; qty: number }> = [];
    for (const picked of selection.values()) {
      const entry = byId.get(picked.id);
      if (!entry) continue;
      const qty = Math.min(Math.max(0, Math.floor(picked.qty)), entry.total);
      if (qty > 0) tasks.push({ entry, qty });
    }

    const total = tasks.reduce((sum, task) => sum + task.qty, 0);
    if (total <= 0) {
      kind.toast(kind.toastTitle, "Nothing left to delete.", "info");
      return;
    }

    // Pre-flight, before touching anything: the first category that needs a
    // withdrawal tells us whether there is room to start at all.
    const firstWithdrawal = tasks
      .map((task) => planWithdrawal(task.entry, task.qty))
      .find((plan) => plan.fromStorage > 0);
    if (firstWithdrawal && !(await ensureRoom(firstWithdrawal))) {
      kind.toast(
        kind.toastTitle,
        "Your inventory is full. Free one slot and try again.",
        "error",
      );
      return;
    }

    running = true;
    paused = false;
    cancelled = false;

    let done = 0;
    try {
      kind.toast(
        kind.toastTitle,
        `Deleting ${formatNum(total)} ${kind.unitNoun} across ${tasks.length} categories...`,
        "info",
      );

      for (const task of tasks) {
        await gate();

        const plan = planWithdrawal(task.entry, task.qty);
        if (plan.fromStorage > 0) {
          if (!(await ensureRoom(plan))) {
            kind.toast(
              kind.toastTitle,
              `Stopped at ${task.entry.label}, your inventory filled up.`,
              "error",
            );
            break;
          }
          await kind.withdraw(task.entry.id, kind.storageId, plan.fromStorage);
          await sleep(WITHDRAW_SETTLE_MS);
        }

        for (let i = 0; i < task.qty; i++) {
          await gate();
          await kind.deleteOne(task.entry.id, delayMs);
          done += 1;
          emit("progress", {
            done,
            total,
            [kind.targetKey]: task.entry.id,
            label: task.entry.label,
            remainingForCategory: task.qty - i - 1,
          });
          if (delayMs > 0 && i < task.qty - 1) await sleep(delayMs);
        }
      }

      selection.clear();
      emit("done", { total: done, categories: tasks.length });
      kind.toast(
        kind.toastTitle,
        done > 0
          ? `Deleted ${formatNum(done)} ${kind.unitNoun} (${tasks.length} categories).`
          : `No ${kind.unitNoun} were deleted.`,
        done > 0 ? "success" : "info",
      );
    } catch (error) {
      const message = (error as Error)?.message === "cancelled"
        ? `Cancelled after ${formatNum(done)} ${kind.unitNoun}.`
        : (error as Error)?.message || "Deletion failed.";
      emit("error", { message });
      kind.toast(kind.toastTitle, message, "error");
    } finally {
      running = false;
      paused = false;
      cancelled = false;
      resumeWaiter = null;
    }
  }

  return {
    getSelection: () => Array.from(selection.values()),
    setSelection(entries) {
      selection.clear();
      for (const entry of entries) {
        if (entry && entry.id && entry.qty > 0) selection.set(entry.id, { ...entry });
      }
    },
    clearSelection: () => selection.clear(),
    run,
    isRunning: () => running,
    isPaused: () => paused,
    pause() {
      if (!running || paused) return;
      paused = true;
      emit("paused");
    },
    resume() {
      if (!running || !paused) return;
      paused = false;
      resumeWaiter?.();
      emit("resumed");
    },
    cancel() {
      if (!running) return;
      cancelled = true;
      paused = false;
      resumeWaiter?.();
    },
  };
}
