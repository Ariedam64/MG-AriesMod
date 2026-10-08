// The chosen activity log filter, remembered across sessions.
//
// Filtering happens on the data, not on the Pixi rows: the modal draws
// whatever `myData.activityLogs` holds and rebuilds itself, "Show more"
// included, whenever that changes. So applying a filter means handing the
// modal the classified subset of the local history.

import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { shareGlobal } from "../../platform/pageContext";
import { fakeActivityLog } from "../../game/fakeModal";
import { classifyEntryAction, type ActionKey } from "./classification";
import { getActivityLogHistory, type ActivityLogEntry } from "./history";

const FILTER_STORAGE_KEY = "activityLog.filter";

let activeFilter: ActionKey = loadPersistedFilter();
let modalOpen = false;

function loadPersistedFilter(): ActionKey {
  try {
    return readAriesPath<string>(FILTER_STORAGE_KEY) || "all";
  } catch {
    return "all";
  }
}

export function getActiveFilter(): ActionKey {
  return activeFilter;
}

/** The whole local history narrowed to `filter`; "all" returns it unfiltered. */
function computeFilteredHistory(filter: ActionKey): ActivityLogEntry[] {
  const history = getActivityLogHistory();
  if (filter === "all") return history;
  return history.filter((entry) => classifyEntryAction(entry.action) === filter);
}

/** What the modal should show: the remembered filter applied to the whole history. */
export function filteredHistory(): ActivityLogEntry[] {
  return computeFilteredHistory(activeFilter);
}

/** Tells the filter whether the activity log modal is up, so a new filter reaches it at once. */
export function setActivityLogModalOpen(open: boolean): void {
  modalOpen = open;
}

export function isActivityLogModalOpen(): boolean {
  return modalOpen;
}

export function setActiveFilter(filter: ActionKey): void {
  if (filter === activeFilter) return;
  activeFilter = filter;
  try {
    writeAriesPath(FILTER_STORAGE_KEY, String(filter));
  } catch {}
  if (!modalOpen) return;
  fakeActivityLog.show(filteredHistory(), { open: false }).catch(() => {});
}

shareGlobal("__MG_ACTIVITY_LOG_FILTER_DEBUG__", {
  get activeFilter() {
    return activeFilter;
  },
  get modalOpen() {
    return modalOpen;
  },
  getActiveFilter,
  setActiveFilter,
  computeFilteredHistory,
});
