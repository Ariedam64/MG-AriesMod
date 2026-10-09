// What the collect-state heartbeat sends: the player's slot, garden,
// inventory, stats and recent activity, read out of the room state.

import { Atoms, player as playerAtom } from "../../game/store/atoms";
import type { GardenState } from "../../game/store/atoms";
import { shareGlobal } from "../pageContext";
import { readAriesPath } from "../storage";
import { getLocalVersion } from "../modVersion";
import {
  readAccountId,
  readSlotId,
  resolveMyAccountId,
  selectSlotForAccount,
  findPlayerByAccountId,
} from "../../game/playerIdentity";

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

type BuildPlayerStatePayloadOptions = {
  playerId?: string | null;
  slotIndex?: number;
  roomIsPrivate?: boolean | null;
};

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

export function getSlotsArray(state: any): any[] {
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
 * Our account id, from the player atom with the player list as a fallback.
 * Null while the identity is unknown: anything sent to the server must stop
 * there rather than guess.
 */
export async function getMyAccountId(state?: any): Promise<string | null> {
  try {
    const me = await playerAtom.get();
    const snapshot = state ?? (await Atoms.root.state.get());
    return resolveMyAccountId(me, getPlayersArray(snapshot));
  } catch {
    return null;
  }
}

/** The player of a slot: by account first, then by the slot's room id. */
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

  // No fallback to players[0]: that put another player's name on our own
  // leaderboard row.
  return null;
}

function normalizeActivityLog(slotData: any): any[] | null {
  const logs =
    slotData?.activityLog ?? slotData?.activityLogs ?? slotData?.activitylog;
  return Array.isArray(logs) ? logs : null;
}

/** The player's state as the API expects it, or null when it cannot be read yet. */
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
      // Account id only: `player.id` is a short-lived room id, and sending it
      // as playerId created a ghost account on every join.
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
      // Keep the count derived from the players list.
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
      modVersion,
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

// Exposed for diagnosis from the console.
shareGlobal("buildPlayerStatePayload", buildPlayerStatePayload);
shareGlobal("logPlayerStatePayload", buildPlayerStatePayload);
