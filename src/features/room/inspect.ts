// Opens another player's inventory, journal, stats or activity log in the
// game's own modals, with a toast when there is nothing to show.

import { toastSimple } from "../../ui/toast";
import { fakeActivityLog, fakeInventory, fakeJournal, fakeStats } from "../../game/fakeModal";
import { skipNextActivityLogHistoryReopen } from "../activityLog/history";
import { activityLogsOfSlot, hasJournalData, inventoryOfSlot, journalOfSlot, statsOfSlot } from "./roomState";
import { playerSlot } from "./players";

const errorText = (error: unknown, fallback: string): string =>
  (error as { message?: string } | null)?.message || fallback;

export async function openInventoryPreview(playerId: string, playerName?: string): Promise<void> {
  try {
    const inv = inventoryOfSlot(await playerSlot(playerId));
    if (!inv) {
      await toastSimple("Inventory", "No inventory object found for this player.", "error");
      return;
    }
    if (inv.items.length === 0) {
      await toastSimple("Inventory", "Inventory is empty for this player.", "info");
      return;
    }
    try {
      await fakeInventory.show(inv, { open: true });
    } catch (error) {
      await toastSimple("Inventory", errorText(error, "Failed to open inventory"), "error");
      return;
    }
    if (playerName) await toastSimple("Inventory", `${playerName}'s inventory displayed.`, "info");
  } catch (error) {
    await toastSimple("Inventory", errorText(error, "Failed to open inventory."), "error");
  }
}

export async function openJournal(playerId: string, playerName?: string): Promise<void> {
  try {
    const journal = journalOfSlot(await playerSlot(playerId));
    if (!journal || !hasJournalData(journal)) {
      await toastSimple("Journal", "No journal data for this player.", "error");
      return;
    }
    try {
      await fakeJournal.show(journal, { open: true });
    } catch (error) {
      await toastSimple("Journal", errorText(error, "Failed to open journal."), "error");
      return;
    }
    if (playerName) await toastSimple("Journal", `${playerName}'s journal displayed.`, "info");
  } catch (error) {
    await toastSimple("Journal", errorText(error, "Failed to open journal."), "error");
  }
}

export async function openStats(playerId: string, playerName?: string): Promise<void> {
  try {
    const stats = statsOfSlot(await playerSlot(playerId));
    if (!stats) {
      await toastSimple("Stats", "No stats found for this player.", "error");
      return;
    }
    // Stats opens the activityLog modal: without the skip, the history
    // watcher would swap our own logs over this player's data.
    skipNextActivityLogHistoryReopen();
    await fakeStats.show(stats, { open: true });
    if (playerName) await toastSimple("Stats", `${playerName}'s stats displayed.`, "info");
  } catch (error) {
    await toastSimple("Stats", errorText(error, "Failed to open stats modal."), "error");
  }
}

export async function openActivityLog(playerId: string, playerName?: string): Promise<void> {
  try {
    const logs = activityLogsOfSlot(await playerSlot(playerId));
    if (!logs || logs.length === 0) {
      await toastSimple("Activity log", "No activity logs for this player.", "info");
      return;
    }
    skipNextActivityLogHistoryReopen();
    await fakeActivityLog.show(logs, { open: true });
    if (playerName) await toastSimple("Activity log", `${playerName}'s activity log displayed.`, "info");
  } catch (error) {
    await toastSimple("Activity log", errorText(error, "Failed to open activity log."), "error");
  }
}
