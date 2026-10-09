import { Atoms } from "../../game/store/atoms";
import { pageWindow } from "../pageContext";
import { hasApiKey } from "../storage";
import { readSlotId } from "../../game/playerIdentity";
import { postToAriesApi } from "./http";
import {
  buildPlayerStatePayload,
  getMyAccountId,
  getSlotsArray,
  type PlayerStatePayload,
} from "./playerStatePayload";

// The heartbeat: the player's state goes to POST /collect-state once a minute,
// skipped while nothing changed, but at least every fifth tick so an AFK
// player still shows as online.
const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;
const MAX_UNCHANGED_TICKS_BEFORE_FORCE_SEND = 5;
const MAX_INITIAL_RETRIES = 3;

/** The payload as compared between ticks. Feeding a pet alone does not count as a change. */
function snapshotPayloadForComparison(payload: PlayerStatePayload): string | null {
  try {
    const log = payload.state.activityLog;
    const activityLog = Array.isArray(log) ? log.filter((entry) => entry?.action !== "feedPet") : null;
    return JSON.stringify({ ...payload, state: { ...payload.state, activityLog } });
  } catch (error) {
    console.error("[PlayerPayload] Failed to snapshot payload for comparison", error);
    return null;
  }
}

/** POSTs the state to /collect-state. True when the server took it. */
async function sendPlayerState(
  payload: PlayerStatePayload | null,
): Promise<boolean> {
  if (!payload) return false;

  const { playerId, avatarUrl, ...cleanPayload } = payload as any;

  // When not authenticated, include playerId in body so the server can identify the player
  if (!hasApiKey()) {
    const myAccountId = await getMyAccountId();
    if (!myAccountId) {
      // Without an identity the server cannot attach this payload to anyone.
      // Send nothing rather than let it land on another account.
      console.error("[api] sendPlayerState skipped - player identity unknown");
      return false;
    }
    (cleanPayload as any).playerId = myAccountId;
  }

  const status = await postToAriesApi("collect-state", cleanPayload);
  if (status === 204) return true;
  if (status === 429) {
    console.error("[api] sendPlayerState rate-limited");
  } else if (status === 401) {
    console.error("[api] sendPlayerState unauthorized - invalid or missing API key");
  }
  return false;
}

let gameReadyWatcherInitialized = false;
let gameReadyTriggered = false;
let unwatchState: (() => void) | null = null;
let preferredReportingIntervalMs: number | undefined;

async function tryInitializeReporting(state?: any): Promise<void> {
  if (gameReadyTriggered) return;

  const snapshot = state ?? (await Atoms.root.state.get());
  const players = Array.isArray(snapshot?.data?.players) ? snapshot.data.players : [];
  if (players.length === 0) return;

  // Our slot must be there before starting. The guard used to depend on the
  // identity, so a null identity switched it off instead of blocking; an
  // unknown identity now simply prevents the start.
  const myAccountId = await getMyAccountId(snapshot);
  if (!myAccountId) return;

  const slots = getSlotsArray(snapshot);
  const mySlotExists = slots.some((slot) => readSlotId(slot) === myAccountId);
  if (!mySlotExists) return;

  gameReadyTriggered = true;
  startPlayerStateReporting(preferredReportingIntervalMs);
}

export function startPlayerStateReportingWhenGameReady(intervalMs?: number): void {
  if (gameReadyWatcherInitialized) return;

  // Claim the collect-state heartbeat. The standalone Community Hub checks
  // this page global (at startup and on every tick) and stands down, so when
  // both mods run only Arie's Mod reports.
  try {
    (pageWindow as unknown as Record<string, unknown>).__MG_COLLECT_STATE_OWNER__ = "aries-mod";
  } catch {}

  gameReadyWatcherInitialized = true;
  preferredReportingIntervalMs = intervalMs;
  void tryInitializeReporting();
  // The room state changes many times a second; once reporting has started
  // there is nothing left to watch for.
  void Atoms.root.state
    .onChange((next) => {
      if (gameReadyTriggered) {
        unwatchState?.();
        return;
      }
      void tryInitializeReporting(next);
    })
    .then((unsubscribe) => {
      unwatchState = unsubscribe;
      if (gameReadyTriggered) unsubscribe();
    })
    .catch(() => {});
}

let payloadReportingTimer: ReturnType<typeof setInterval> | null = null;
let isPayloadReporting = false;
let lastSentPayloadSnapshot: string | null = null;
let unchangedSnapshotCount = 0;
let initialSendRetries = 0;

async function buildAndSendPlayerState(): Promise<void> {
  if (isPayloadReporting) return;
  isPayloadReporting = true;
  try {
    const payload = await buildPlayerStatePayload();
    if (!payload || !payload.room.id) {
      if (initialSendRetries < MAX_INITIAL_RETRIES) {
        initialSendRetries += 1;
        setTimeout(() => void buildAndSendPlayerState(), 10_000);
      }
      return;
    }

    const snapshot = snapshotPayloadForComparison(payload);

    let mustSend = false;

    if (snapshot === null) {
      mustSend = true;
    } else if (lastSentPayloadSnapshot === null) {
      mustSend = true;
    } else if (snapshot !== lastSentPayloadSnapshot) {
      mustSend = true;
    } else if (unchangedSnapshotCount + 1 >= MAX_UNCHANGED_TICKS_BEFORE_FORCE_SEND) {
      // Keep-alive for an AFK player.
      mustSend = true;
    }

    if (!mustSend) {
      if (snapshot !== null) {
        unchangedSnapshotCount += 1;
      }
      return;
    }

    const ok = await sendPlayerState(payload);
    if (ok) {
      if (snapshot !== null) {
        lastSentPayloadSnapshot = snapshot;
        unchangedSnapshotCount = 0;
      }
    }
  } catch (error) {
    console.error("[PlayerPayload] Failed to send payload:", error);
  } finally {
    isPayloadReporting = false;
  }
}

function startPlayerStateReporting(
  intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS,
): void {
  if (payloadReportingTimer !== null) return;
  const normalizedMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_HEARTBEAT_INTERVAL_MS;

  void buildAndSendPlayerState();
  payloadReportingTimer = setInterval(() => {
    void buildAndSendPlayerState();
  }, normalizedMs);
}

// Force an immediate send when auth is gained (the player signs in through the
// standalone Community Hub) so the server sees the API key at once. Safe:
// Arie's Mod owns the heartbeat (see startPlayerStateReportingWhenGameReady).
window.addEventListener("qws-friend-overlay-auth-update", () => {
  if (!hasApiKey()) return;
  lastSentPayloadSnapshot = null;
  unchangedSnapshotCount = 0;
  void buildAndSendPlayerState();
});
