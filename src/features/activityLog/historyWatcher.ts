// Keeps the stored history in step with the game's activity log, and swaps the
// stored (filtered) history in whenever the player opens the modal.

import { ACTIVITY_LOG_MODAL_ID, fakeActivityLog } from "../../game/fakeModal";
import { Atoms, myActivityLog } from "../../game/store/atoms";
import { pageWindow } from "../../platform/pageContext";
import { Subscriptions } from "../../lib/emitter";
import { filteredHistory } from "./filter";
import { normalizeEntries, syncHistory, type ActivityLogEntry } from "./history";

// Shared with the standalone Community Hub: when it opens a friend's activity
// log it sets this page global so our watcher skips one reopen.
const SKIP_NEXT_REOPEN_GLOBAL = "__MG_SKIP_NEXT_ACTIVITY_LOG_REOPEN__";

let skipNextReopen = false;

/** The next time the modal opens, it shows someone else's data: leave it alone. */
export function skipNextActivityLogHistoryReopen(): void {
  skipNextReopen = true;
}

function consumeReopenSkip(): boolean {
  const w = pageWindow as unknown as Record<string, unknown>;
  const sharedSkip = w[SKIP_NEXT_REOPEN_GLOBAL] === true;
  if (!skipNextReopen && !sharedSkip) return false;
  skipNextReopen = false;
  if (sharedSkip) delete w[SKIP_NEXT_REOPEN_GLOBAL];
  return true;
}

async function showStoredHistory(): Promise<void> {
  try {
    // The modal just opened by itself, so only the data is swapped. Opening it
    // again would also select the Logs tab, and since v1396 the same modal may
    // have been opened on Stats.
    await fakeActivityLog.show(filteredHistory(), { open: false });
  } catch {}
}

export async function startActivityLogHistoryWatcher(): Promise<() => void> {
  const subs = new Subscriptions();
  let lastSnapshot: ActivityLogEntry[] = [];

  const ingest = (logs: unknown, prev?: unknown) => {
    try {
      const prevSnapshot = typeof prev !== "undefined" ? normalizeEntries(prev) : lastSnapshot;
      const nextSnapshot = normalizeEntries(logs);
      syncHistory(prevSnapshot, nextSnapshot);
      lastSnapshot = nextSnapshot;
    } catch {}
  };

  try {
    ingest(await myActivityLog.get());
  } catch {}

  try {
    subs.add(await myActivityLog.onChange((next, prev) => ingest(next, prev)));
  } catch {}

  let lastModal: string | null = null;
  try {
    lastModal = (await Atoms.ui.activeModal.get()) ?? null;
  } catch {}

  try {
    subs.add(
      await Atoms.ui.activeModal.onChange(async (modalId: string | null) => {
        const cur = modalId ?? null;
        const justOpened = cur === ACTIVITY_LOG_MODAL_ID && lastModal !== ACTIVITY_LOG_MODAL_ID;
        lastModal = cur;
        if (justOpened && !consumeReopenSkip()) await showStoredHistory();
      }),
    );
  } catch {}

  return () => subs.dispose();
}
