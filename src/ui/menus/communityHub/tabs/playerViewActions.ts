// src/ui/menus/communityHub/tabs/playerViewActions.ts
import type { PlayerView } from "../../../../ariesModAPI";
import { fetchPlayerJournal } from "../../../../ariesModAPI";
import { style, ensureSharedStyles, CH_EVENTS } from "../shared";

// ===== Preview Modal Management =====

let currentPreviewModal: HTMLElement | null = null;
let currentPreviewType: "garden" | "inventory" | "stats" | "activityLog" | "journal" | null = null;

/**
 * Check if a preview is currently active
 */
export function isPreviewActive(): boolean {
  return currentPreviewModal !== null;
}

/**
 * Find the community hub panel in the DOM
 */
function findCommunityHubPanel(): HTMLElement | null {
  return document.querySelector(".qws-ch-panel") as HTMLElement | null;
}

function createPreviewModal(
  type: "garden" | "inventory" | "stats" | "activityLog" | "journal",
  playerName: string,
  onStop: () => void
): HTMLElement {
  ensureSharedStyles();
  const modal = document.createElement("div");
  modal.className = "qws-preview-modal";
  style(modal, {
    position: "fixed",
    top: "80px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: "10000",
    padding: "12px 20px",
    background: "rgba(15,17,21,0.95)",
    border: "1px solid rgba(94,234,212,0.3)",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.4), 0 0 0 1px rgba(94,234,212,0.1) inset",
    backdropFilter: "blur(10px)",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    minWidth: "300px",
    animation: "qws-preview-slide-in 0.3s ease-out",
  });

  // Icon & Label
  const iconLabel = document.createElement("div");
  style(iconLabel, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flex: "1",
  });

  const icon = document.createElement("div");
  style(icon, {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
    background: "#5eead4",
    boxShadow: "0 0 8px rgba(94,234,212,0.6)",
    animation: "qws-preview-pulse 2s ease-in-out infinite",
  });

  const label = document.createElement("div");
  style(label, {
    fontSize: "13px",
    fontWeight: "600",
    color: "#e7eef7",
  });

  const typeLabels = {
    garden: "Garden",
    inventory: "Inventory",
    stats: "Stats",
    activityLog: "Activity Log",
    journal: "Journal",
  };

  label.textContent = `Previewing ${typeLabels[type]} — ${playerName}`;

  iconLabel.append(icon, label);

  // Stop button
  const stopButton = document.createElement("button");
  stopButton.textContent = "Stop";
  style(stopButton, {
    padding: "6px 16px",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "8px",
    background: "rgba(239,68,68,0.1)",
    color: "#ef4444",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transition: "all 120ms ease",
  });

  stopButton.onmouseenter = () => {
    style(stopButton, {
      background: "rgba(239,68,68,0.2)",
      borderColor: "rgba(239,68,68,0.5)",
    });
  };

  stopButton.onmouseleave = () => {
    style(stopButton, {
      background: "rgba(239,68,68,0.1)",
      borderColor: "rgba(239,68,68,0.3)",
    });
  };

  stopButton.onclick = onStop;

  modal.append(iconLabel, stopButton);

  return modal;
}

function showPreviewModal(
  type: "garden" | "inventory" | "stats" | "activityLog" | "journal",
  playerName: string,
  onStop: () => void
) {
  // Remove existing modal if any
  if (currentPreviewModal) {
    currentPreviewModal.remove();
    currentPreviewModal = null;
  }

  // Close community hub panel with proper event
  window.dispatchEvent(new CustomEvent(CH_EVENTS.CLOSE));

  currentPreviewType = type;
  currentPreviewModal = createPreviewModal(type, playerName, onStop);
  document.body.appendChild(currentPreviewModal);
}

function hidePreviewModal() {
  if (currentPreviewModal) {
    currentPreviewModal.remove();
    currentPreviewModal = null;
  }
  currentPreviewType = null;

  // Reopen community hub panel with proper event
  window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
}

// ===== View Actions =====

/**
 * Preview a player's garden using the editor preview system
 */
export async function viewGarden(player: PlayerView): Promise<void> {
  const state = player.state as any;
  if (!state?.garden) {
    console.warn("[PlayerViewActions] No garden data available for player", player.playerId);
    return;
  }

  const garden = state.garden;

  // Call the global preview function (from EditorService)
  const previewFn = (window as any).qwsEditorPreviewFriendGarden;
  if (typeof previewFn !== "function") {
    console.error("[PlayerViewActions] qwsEditorPreviewFriendGarden not available");
    return;
  }

  try {
    const success = await previewFn(garden);
    if (!success) {
      console.error("[PlayerViewActions] Failed to preview garden");
      return;
    }

    // Show modal
    showPreviewModal("garden", player.playerName || "Unknown", async () => {
      await stopViewGarden();
    });
  } catch (error) {
    console.error("[PlayerViewActions] Error previewing garden:", error);
  }
}

/**
 * Stop garden preview
 */
export async function stopViewGarden(): Promise<void> {
  const clearFn = (window as any).qwsEditorClearFriendGardenPreview;
  if (typeof clearFn !== "function") {
    console.error("[PlayerViewActions] qwsEditorClearFriendGardenPreview not available");
    return;
  }

  try {
    await clearFn();
    hidePreviewModal();
  } catch (error) {
    console.error("[PlayerViewActions] Error stopping garden preview:", error);
  }
}

/**
 * View a player's inventory using fake modal
 */
export async function viewInventory(player: PlayerView): Promise<void> {
  const state = player.state as any;
  if (!state?.inventory) {
    console.warn("[PlayerViewActions] No inventory data available for player", player.playerId);
    return;
  }

  const {
    fakeInventoryShow,
    waitInventoryPanelClosed,
    fakeInventoryHide,
  } = await import("../../../../services/fakeModal");

  try {
    // Close community hub
    window.dispatchEvent(new CustomEvent(CH_EVENTS.CLOSE));

    // Show the inventory modal with player's data
    await fakeInventoryShow(state.inventory, { open: true });

    // Wait for modal to close
    await waitInventoryPanelClosed();

    // Cleanup and reopen community hub
    await fakeInventoryHide();
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  } catch (error) {
    console.error("[PlayerViewActions] Error viewing inventory:", error);
    // Ensure community hub reopens on error
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  }
}

/**
 * View a player's stats using fake modal
 */
export async function viewStats(player: PlayerView): Promise<void> {
  const state = player.state as any;
  if (!state?.stats) {
    console.warn("[PlayerViewActions] No stats data available for player", player.playerId);
    return;
  }

  const {
    fakeStatsShow,
    waitStatsModalClosed,
    fakeStatsHide,
  } = await import("../../../../services/fakeModal");

  try {
    // Close community hub
    window.dispatchEvent(new CustomEvent(CH_EVENTS.CLOSE));

    // Show the stats modal with player's data
    await fakeStatsShow(state.stats, { open: true });

    // Wait for modal to close
    await waitStatsModalClosed();

    // Cleanup and reopen community hub
    await fakeStatsHide();
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  } catch (error) {
    console.error("[PlayerViewActions] Error viewing stats:", error);
    // Ensure community hub reopens on error
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  }
}

/**
 * View a player's activity log using fake modal
 */
export async function viewActivityLog(player: PlayerView): Promise<void> {
  const state = player.state as any;
  if (!state?.activityLog) {
    console.warn("[PlayerViewActions] No activity log data available for player", player.playerId);
    return;
  }

  const {
    fakeActivityLogShow,
    waitActivityLogModalClosed,
    fakeActivityLogHide,
  } = await import("../../../../services/fakeModal");
  const { skipNextActivityLogHistoryReopen } = await import("../../../../services/activityLogHistory");

  try {
    // Close community hub
    window.dispatchEvent(new CustomEvent(CH_EVENTS.CLOSE));

    // Prevent the history watcher from overriding the friend's logs with local ones
    skipNextActivityLogHistoryReopen();

    // Show the activity log modal with player's data
    await fakeActivityLogShow(state.activityLog, { open: true });

    // Wait for modal to close
    await waitActivityLogModalClosed();

    // Cleanup and reopen community hub
    await fakeActivityLogHide();
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  } catch (error) {
    console.error("[PlayerViewActions] Error viewing activity log:", error);
    // Ensure community hub reopens on error
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  }
}

/**
 * View a player's journal using fake modal
 */
export async function viewJournal(player: PlayerView): Promise<void> {
  const state = player.state as any;
  if (!state?.journal) {
    console.warn("[PlayerViewActions] No journal data available for player", player.playerId);
    return;
  }

  const {
    fakeJournalShow,
    waitJournalModalClosed,
    fakeJournalHide,
  } = await import("../../../../services/fakeModal");

  try {
    // Close community hub
    window.dispatchEvent(new CustomEvent(CH_EVENTS.CLOSE));

    // Show the journal modal with player's data
    await fakeJournalShow(state.journal, { open: true });

    // Wait for modal to close
    await waitJournalModalClosed();

    // Cleanup and reopen community hub
    await fakeJournalHide();
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  } catch (error) {
    console.error("[PlayerViewActions] Error viewing journal:", error);
    // Ensure community hub reopens on error
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
  }
}

/**
 * Result returned by viewJournalById so callers can show a contextual error.
 */
export type ViewJournalByIdResult =
  | { ok: true }
  | { ok: false; reason: "private" | "not_found" | "error"; status?: number };

/**
 * View a player's journal directly from their playerId (no preloaded PlayerView state required).
 *
 * Fetches /get-player-journal then opens the in-game journal modal via fakeJournalShow,
 * with the same close/reopen-community-hub lifecycle as viewJournal.
 *
 * Returns an `ok: false` result on 403 (private) / 404 (not found) / other errors so the
 * caller can display an appropriate inline message. The community hub is only closed once
 * we know the fetch succeeded — on error we leave it open.
 */
export async function viewJournalById(playerId: string): Promise<ViewJournalByIdResult> {
  if (!playerId || playerId === "null") {
    return { ok: false, reason: "not_found" };
  }

  const result = await fetchPlayerJournal(playerId);
  if (!result.ok) {
    console.warn(
      `[PlayerViewActions] Cannot view journal for ${playerId}: ${result.reason} (status ${result.status})`,
    );
    return { ok: false, reason: result.reason, status: result.status };
  }

  const journal = result.data?.journal;
  if (!journal) {
    return { ok: false, reason: "error" };
  }

  const {
    fakeJournalShow,
    waitJournalModalClosed,
    fakeJournalHide,
  } = await import("../../../../services/fakeModal");

  try {
    // Close community hub before opening the in-game modal
    window.dispatchEvent(new CustomEvent(CH_EVENTS.CLOSE));

    await fakeJournalShow(journal, { open: true });
    await waitJournalModalClosed();
    await fakeJournalHide();

    // Reopen community hub after the user closes the journal
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
    return { ok: true };
  } catch (error) {
    console.error("[PlayerViewActions] Error viewing journal by id:", error);
    window.dispatchEvent(new CustomEvent(CH_EVENTS.OPEN));
    return { ok: false, reason: "error" };
  }
}

/**
 * Stop any active preview
 */
export async function stopAnyPreview(): Promise<void> {
  if (currentPreviewType === "garden") {
    await stopViewGarden();
  }

  // For fake modals, we need to check and close them if they're open
  try {
    const {
      isInventoryPanelOpen,
      fakeInventoryHide,
      isJournalModalOpen,
      fakeJournalHide,
      isStatsModalOpenAsync,
      fakeStatsHide,
      isActivityLogModalOpenAsync,
      fakeActivityLogHide,
    } = await import("../../../../services/fakeModal");

    if (await isInventoryPanelOpen()) {
      await fakeInventoryHide();
    }
    if (await isJournalModalOpen()) {
      await fakeJournalHide();
    }
    if (await isStatsModalOpenAsync()) {
      await fakeStatsHide();
    }
    if (await isActivityLogModalOpenAsync()) {
      await fakeActivityLogHide();
    }
  } catch (error) {
    console.error("[PlayerViewActions] Error stopping fake modal previews:", error);
  }

  hidePreviewModal();
}
