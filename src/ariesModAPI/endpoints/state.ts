// ariesModAPI/endpoints/state.ts
// Endpoint collect-state + logique de payload (déplacé depuis utils/payload.ts)

import { Atoms, player as playerAtom } from "../../store/atoms";
import type { GardenState } from "../../store/atoms";
import { shareGlobal, pageWindow } from "../../utils/page-context";
import { readAriesPath, hasApiKey } from "../../utils/localStorage";
import { getLocalVersion } from "../../utils/version";
import {
  readAccountId,
  readSlotId,
  resolveMyAccountId,
  selectSlotForAccount,
  findPlayerByAccountId,
} from "../../utils/playerIdentity";
import { httpPost } from "../client/http";
import { MAX_UNCHANGED_TICKS_BEFORE_FORCE_SEND, DEFAULT_HEARTBEAT_INTERVAL } from "../config";

// ========== Types ==========

export type PlayerStatePayload = {
  playerName: string | null;
  avatar?: string[] | null;
  modVersion: string | null;
  coins: number | null;
  room: {
    id: string | null;
    isPrivate: boolean | null;
    playersCount: number;
    userSlots: Array<{
      name: string | null;
      discordAvatarUrl: string | null;
      playerId: string | null;
      coins: number | null;
    }>;
  };
  state: {
    garden: GardenState | null;
    inventory: any | null;
    stats: Record<string, any> | null;
    activityLog: any[] | null;
    journal: any | null;
  };
};

export type BuildPlayerStatePayloadOptions = {
  playerId?: string | null;
  slotIndex?: number;
  roomIsPrivate?: boolean | null;
};

// ========== Helper Functions ==========

function clampPlayers(n: unknown): number {
  const value = Math.floor(Number(n));
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(6, value));
}

function findPlayersDeep(state: any): any[] {
  if (!state || typeof state !== "object") return [];
  const out: any[] = [];
  const seen = new Set<any>();
  const stack = [state];

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
    seen.add(cur);
    for (const key of Object.keys(cur)) {
      const value = (cur as any)[key];
      if (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item) => item && typeof item === "object")
      ) {
        const looksLikePlayer = value.some((item) => "id" in item && "name" in item);
        if (looksLikePlayer && /player/i.test(key)) {
          out.push(...(value as any[]));
        }
      }
      if (value && typeof value === "object") {
        stack.push(value);
      }
    }
  }

  const byId = new Map<string, any>();
  for (const entry of out) {
    if (entry?.id) {
      byId.set(String(entry.id), entry);
    }
  }
  return [...byId.values()];
}

function getPlayersArray(state: any): any[] {
  const direct = state?.fullState?.data?.players ?? state?.data?.players ?? state?.players;
  return Array.isArray(direct) ? direct : findPlayersDeep(state);
}

function getSlotsArray(state: any): any[] {
  const raw =
    state?.child?.data?.userSlots ??
    state?.fullState?.child?.data?.userSlots ??
    state?.data?.userSlots;

  if (Array.isArray(raw)) return raw;

  if (raw && typeof raw === "object") {
    const entries = Object.entries(raw as Record<string, any>);
    entries.sort((a, b) => {
      const ai = Number(a[0]);
      const bi = Number(b[0]);
      if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
      return a[0].localeCompare(b[0]);
    });
    return entries.map(([, value]) => value);
  }

  return [];
}

/**
 * Notre id de compte, résolu depuis le player atom avec la liste des joueurs en
 * repli. Renvoie null tant que l'identité n'est pas connue : tout ce qui
 * remonte au serveur doit s'arrêter là plutôt que de deviner.
 */
async function getMyAccountId(state?: any): Promise<string | null> {
  try {
    const me = await playerAtom.get();
    const snapshot = state ?? (await Atoms.root.state.get());
    return resolveMyAccountId(me, getPlayersArray(snapshot));
  } catch {
    return null;
  }
}

/** Le joueur d'un slot : d'abord par compte, puis par id de room du slot. */
function resolvePlayer(players: any[], slot: any, accountId: string | null): any | null {
  const byAccount = findPlayerByAccountId(players, accountId ?? readSlotId(slot));
  if (byAccount) return byAccount;

  const slotRoomId = slot?.playerId ?? slot?.data?.playerId ?? null;
  if (slotRoomId != null) {
    const normalized = String(slotRoomId);
    for (const player of players) {
      if (player && typeof player === "object" && String(player.id ?? "") === normalized) {
        return player;
      }
    }
  }

  // Pas de repli sur players[0] : cela mettait le nom d'un autre joueur sur
  // notre propre ligne de leaderboard.
  return null;
}

function normalizeActivityLog(slotData: any): any[] | null {
  const logs =
    slotData?.activityLog ?? slotData?.activityLogs ?? slotData?.activitylog;
  return Array.isArray(logs) ? logs : null;
}

// ========== Build Payload ==========

/**
 * Construit le payload d'état du joueur pour l'envoyer à l'API
 * @param options - Options de construction
 * @returns Payload d'état ou null
 */
export async function buildPlayerStatePayload(
  options: BuildPlayerStatePayloadOptions = {},
): Promise<PlayerStatePayload | null> {
  try {
    const state = await Atoms.root.state.get();
    if (!state || typeof state !== "object") return null;

    const players = getPlayersArray(state);
    const normalizedPlayers = Array.isArray(players) ? players : [];
    const slots = getSlotsArray(state).filter((slot) => !!slot);

    const coinsById = new Map<string, number | null>();
    for (const slot of slots) {
      const slotData = slot?.data ?? slot;
      const normalizedSlotId = readSlotId(slot);
      if (normalizedSlotId == null) continue;
      const coinCandidate =
        slotData?.coinsCount ??
        slotData?.data?.coinsCount ??
        slot?.coinsCount ??
        slot?.data?.coinsCount ??
        slotData?.coins ??
        slot?.coins ??
        null;
      const coinValue = Number(coinCandidate);
      coinsById.set(normalizedSlotId, Number.isFinite(coinValue) ? coinValue : null);
    }

    const userSlots = normalizedPlayers.map((player) => {
      // Uniquement l'id de compte : `player.id` est un id de room éphémère, et
      // le remonter comme playerId crée un compte fantôme à chaque join.
      const slotId = readAccountId(player);
      const coins = slotId ? coinsById.get(slotId) ?? null : null;
      return {
        name: typeof player?.name === "string" ? player.name : null,
        discordAvatarUrl:
          typeof player?.discordAvatarUrl === "string" ? player.discordAvatarUrl : null,
        playerId: slotId,
        coins,
      };
    });

    if (slots.length === 0) return null;

    const myAccountId = options.playerId ?? (await getMyAccountId(state));
    const slot = selectSlotForAccount(slots, {
      slotIndex: options.slotIndex,
      accountId: myAccountId,
    }) as any;

    if (!slot || typeof slot !== "object") {
      return null;
    }

    const slotData = slot.data ?? slot;
    if (!slotData || typeof slotData !== "object") return null;

    const resolvedPlayer = resolvePlayer(normalizedPlayers, slot, myAccountId ?? null);

    const playerName = resolvedPlayer?.name ?? slotData?.name ?? slot?.name ?? null;

    const avatarRaw =
      resolvedPlayer?.cosmetic?.avatar ??
      slotData?.cosmetic?.avatar ??
      slot?.cosmetic?.avatar ??
      null;
    const avatar =
      Array.isArray(avatarRaw) && avatarRaw.length > 0
        ? avatarRaw.map((entry) => String(entry))
        : null;

    const coinCandidate =
      slotData?.coinsCount ?? slot?.coinsCount ?? slotData?.coins ?? slot?.coins ?? null;
    const coinValue = Number(coinCandidate);
    const coinsRaw = Number.isFinite(coinValue) ? coinValue : null;

    const roomId =
      (state?.data?.roomId as string) ??
      (state?.fullState?.data?.roomId as string) ??
      (state?.roomId as string) ??
      null;

    let playersCount =
      normalizedPlayers.length > 0 ? normalizedPlayers.length : slots.length;
    try {
      const atomValue = await Atoms.server.numPlayers.get();
      playersCount = clampPlayers(atomValue);
    } catch {
      // fallback sur derived count
    }

    const persistedActivityLog = readAriesPath<any[]>("activityLog.history");
    const activityLog = Array.isArray(persistedActivityLog)
      ? persistedActivityLog
      : normalizeActivityLog(slotData);

    const journalEntry =
      slotData?.journal ??
      slotData?.data?.journal ??
      slot?.journal ??
      slot?.data?.journal ??
      null;

    const localVersion = getLocalVersion();
    const modVersion = localVersion ? `Arie's mod ${localVersion}` : null;

    const payload: PlayerStatePayload = {
      playerName: playerName ?? null,
      avatar: avatar ?? null,
      modVersion: modVersion,
      coins: coinsRaw,
      room: {
        id: roomId,
        isPrivate: options.roomIsPrivate ?? null,
        playersCount,
        userSlots,
      },
      state: {
        garden: slotData?.garden ?? null,
        inventory: slotData?.inventory ?? slot?.inventory ?? null,
        stats:
          typeof slotData?.stats === "object" && slotData?.stats
            ? slotData.stats
            : null,
        activityLog: activityLog ?? null,
        journal: journalEntry ?? null,
      },
    };

    return payload;
  } catch (error) {
    console.error("[PlayerPayload] buildPlayerStatePayload failed", error);
    return null;
  }
}

export async function logPlayerStatePayload(
  options?: BuildPlayerStatePayloadOptions,
): Promise<PlayerStatePayload | null> {
  return buildPlayerStatePayload(options);
}

shareGlobal("buildPlayerStatePayload", buildPlayerStatePayload);
shareGlobal("logPlayerStatePayload", logPlayerStatePayload);

// ========== Payload Comparison ==========

function sanitizeActivityLogForCompare(
  log: PlayerStatePayload["state"]["activityLog"] | undefined | null,
): PlayerStatePayload["state"]["activityLog"] | null {
  if (!Array.isArray(log)) return null;
  return log.filter((entry) => entry?.action !== "feedPet");
}

function sanitizeStateForComparison(
  state: PlayerStatePayload["state"],
): PlayerStatePayload["state"] {
  const sanitizedActivityLog = sanitizeActivityLogForCompare(state.activityLog ?? null);
  if (sanitizedActivityLog === state.activityLog) {
    return state;
  }
  return {
    ...state,
    activityLog: sanitizedActivityLog,
  };
}

function snapshotPayloadForComparison(payload: PlayerStatePayload): string | null {
  try {
    const sanitizedState = sanitizeStateForComparison(payload.state);
    const clone: PlayerStatePayload = {
      ...payload,
      state: sanitizedState,
    };
    return JSON.stringify(clone);
  } catch (error) {
    console.error("[PlayerPayload] Failed to snapshot payload for comparison", error);
    return null;
  }
}

// ========== Send Player State ==========

/**
 * Envoie l'état du joueur à l'API (POST /collect-state)
 * @param payload - Payload d'état du joueur
 * @returns true si l'envoi a réussi
 */
export async function sendPlayerState(
  payload: PlayerStatePayload | null,
): Promise<boolean> {
  if (!payload) return false;

  const { playerId, avatarUrl, ...cleanPayload } = payload as any;

  // When not authenticated, include playerId in body so the server can identify the player
  if (!hasApiKey()) {
    const myAccountId = await getMyAccountId();
    if (!myAccountId) {
      // Sans identité, le serveur ne peut rattacher ce payload à personne. Ne
      // rien envoyer plutôt que de le laisser atterrir sur un autre compte.
      console.error("[api] sendPlayerState skipped - player identity unknown");
      return false;
    }
    (cleanPayload as any).playerId = myAccountId;
  }

  const { status } = await httpPost<null>("collect-state", cleanPayload);
  if (status === 204) return true;
  if (status === 429) {
    console.error("[api] sendPlayerState rate-limited");
  } else if (status === 401) {
    console.error("[api] sendPlayerState unauthorized - invalid or missing API key");
  }
  return false;
}

// ========== Heartbeat & Reporting ==========

let gameReadyWatcherInitialized = false;
let gameReadyTriggered = false;
let preferredReportingIntervalMs: number | undefined;

async function tryInitializeReporting(state?: any): Promise<void> {
  if (gameReadyTriggered) return;

  const snapshot = state ?? (await Atoms.root.state.get());
  const players = Array.isArray(snapshot?.data?.players) ? snapshot.data.players : [];
  if (players.length === 0) return;

  // Vérifier que notre slot est présent avant de démarrer. Le garde-fou était
  // conditionné à l'identité, donc une identité nulle le désactivait au lieu de
  // bloquer : maintenant une identité inconnue empêche simplement le démarrage.
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
  void Atoms.root.state.onChange((next) => {
    void tryInitializeReporting(next);
  });
}

// Heartbeat state
let payloadReportingTimer: ReturnType<typeof setInterval> | null = null;
let isPayloadReporting = false;
let lastSentPayloadSnapshot: string | null = null;
let unchangedSnapshotCount = 0;
let initialSendRetries = 0;
const MAX_INITIAL_RETRIES = 3;

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
      // 5ème tick identique → keep-alive AFK
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

export function startPlayerStateReporting(
  intervalMs: number = DEFAULT_HEARTBEAT_INTERVAL,
): void {
  if (payloadReportingTimer !== null) return;
  const normalizedMs = Number.isFinite(intervalMs) && intervalMs > 0 ? intervalMs : DEFAULT_HEARTBEAT_INTERVAL;

  void buildAndSendPlayerState();
  payloadReportingTimer = setInterval(() => {
    void buildAndSendPlayerState();
  }, normalizedMs);
}

export function stopPlayerStateReporting(): void {
  if (payloadReportingTimer === null) return;
  clearInterval(payloadReportingTimer);
  payloadReportingTimer = null;
}

export type TriggerPlayerStateSyncOptions = {
  force?: boolean;
};

export async function triggerPlayerStateSyncNow(
  options: TriggerPlayerStateSyncOptions = {},
): Promise<void> {
  if (options.force) {
    lastSentPayloadSnapshot = null;
    unchangedSnapshotCount = 0;
  }
  await buildAndSendPlayerState();
}

// Force an immediate re-sync when auth is gained (e.g. the user authenticates
// through the Community Hub) so the next send includes the auth token. Safe:
// Arie's Mod owns the heartbeat (see startPlayerStateReportingWhenGameReady).
window.addEventListener("qws-friend-overlay-auth-update", () => {
  if (hasApiKey()) {
    void triggerPlayerStateSyncNow({ force: true });
  }
});
