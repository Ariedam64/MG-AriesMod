// src/services/room.ts
// Gestion des rooms publiques : lecture des états + join depuis l'UI.

import {
  requestRoomEndpoint,
  joinRoom,
  isDiscordSurface as detectDiscordSurface,
  type JoinRoomResult,
  type RoomInfoPayload,
} from "../utils/api";
import { fetchRemoteRooms, type RemoteRoomsPayload } from "../utils/publicRooms";
import { readAriesPath, writeAriesPath } from "../utils/localStorage";
import { readAccountId } from "../utils/playerIdentity";

const MAX_PLAYERS = 6;

export interface PublicRoomPlayer {
  id?: string;
  databaseUserId?: string;
  name: string;
  isConnected: boolean;
  discordAvatarUrl?: string;
  isHost: boolean;
}

export interface PublicRoomDefinition {
  name: string;
  idRoom: string;
  category: string;
}

export interface PublicRoomStatus extends PublicRoomDefinition {
  players: number;
  capacity: number;
  isFull: boolean;
  lastUpdatedAt: number;
  currentGame?: string;
  hostPlayerId?: string;
  playerDetails: PublicRoomPlayer[];
  error?: string;
}

function deriveCategoryFromName(name: string): string {
  const match = /^([a-zA-Z]+)/.exec(name);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  return "other";
}

interface PublicRoomsState {
  definitions: PublicRoomDefinition[];
  categoryOrder: string[];
}

function deriveCategoryOrder(
  definitions: PublicRoomDefinition[],
  preferredOrder: string[] = [],
): string[] {
  const available = new Set(definitions.map((room) => room.category));
  const seen = new Set<string>();
  const order: string[] = [];

  for (const category of preferredOrder) {
    if (!available.has(category)) continue;
    if (seen.has(category)) continue;
    seen.add(category);
    order.push(category);
  }

  for (const room of definitions) {
    if (seen.has(room.category)) continue;
    seen.add(room.category);
    order.push(room.category);
  }

  return order;
}

function createStateFromDefinitions(
  definitions: PublicRoomDefinition[],
  preferredOrder: string[] = [],
): PublicRoomsState {
  const cloned = definitions.map((room) => ({ ...room }));
  return {
    definitions: cloned,
    categoryOrder: deriveCategoryOrder(cloned, preferredOrder),
  } satisfies PublicRoomsState;
}

function cloneState(state: PublicRoomsState): PublicRoomsState {
  return {
    definitions: state.definitions.map((room) => ({ ...room })),
    categoryOrder: [...state.categoryOrder],
  } satisfies PublicRoomsState;
}

const INITIAL_PUBLIC_ROOMS_STATE = createStateFromDefinitions([]);

let publicRoomsState: PublicRoomsState = cloneState(INITIAL_PUBLIC_ROOMS_STATE);

let remoteRoomsStatus: "idle" | "pending" | "fulfilled" | "rejected" = "idle";
let remoteRoomsPromise: Promise<void> | null = null;

function parseRemoteRoomsPayload(payload: RemoteRoomsPayload): PublicRoomsState | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload.publicRooms;
  if (!record || typeof record !== "object") {
    return null;
  }

  const definitions: PublicRoomDefinition[] = [];
  const categoryOrder: string[] = [];

  for (const [rawCategory, entries] of Object.entries(record)) {
    if (!Array.isArray(entries) || !entries.length) {
      continue;
    }

    const categoryName = typeof rawCategory === "string" ? rawCategory.trim() : "";
    if (!categoryName) {
      continue;
    }

    if (!categoryOrder.includes(categoryName)) {
      categoryOrder.push(categoryName);
    }

    for (const entry of entries) {
      if (typeof entry !== "string") {
        continue;
      }

      const separatorIndex = entry.indexOf(":");
      if (separatorIndex <= 0) {
        continue;
      }

      const name = entry.slice(0, separatorIndex).trim();
      const idRoom = entry.slice(separatorIndex + 1).trim();

      if (!name || !idRoom) {
        continue;
      }

      definitions.push({
        name,
        idRoom,
        category: categoryName,
      });
    }
  }

  if (!definitions.length) {
    return null;
  }

  return createStateFromDefinitions(definitions, categoryOrder);
}

function setPublicRoomsState(next: PublicRoomsState): void {
  publicRoomsState = cloneState(next);
}

function requestRemoteRoomsFetch(): Promise<void> | null {
  if (remoteRoomsStatus === "pending" || remoteRoomsStatus === "fulfilled" || remoteRoomsStatus === "rejected") {
    return remoteRoomsPromise;
  }

  if (typeof window === "undefined") {
    return null;
  }

  remoteRoomsStatus = "pending";
  remoteRoomsPromise = (async () => {
    try {
      const payload = await fetchRemoteRooms();
      const parsed = parseRemoteRoomsPayload(payload);
      if (parsed) {
        setPublicRoomsState(parsed);
      }
      remoteRoomsStatus = "fulfilled";
    } catch (error) {
      remoteRoomsStatus = "rejected";
      console.warn("[MagicGarden] Unable to load remote rooms list", error);
    }
  })();

  return remoteRoomsPromise;
}

async function ensureRemoteRoomsLoaded(): Promise<void> {
  const promise = requestRemoteRoomsFetch();
  if (promise) {
    await promise;
  }
}

interface StoredCustomRoomDefinition {
  name: string;
  idRoom: string;
}

function sanitizeRoomDefinition(room: StoredCustomRoomDefinition): PublicRoomDefinition | null {
  if (!room) return null;
  const name = typeof room.name === "string" ? room.name.trim() : "";
  const idRoom = typeof room.idRoom === "string" ? room.idRoom.trim() : "";
  if (!name || !idRoom) return null;
  return {
    name,
    idRoom,
    category: deriveCategoryFromName(name),
  } satisfies PublicRoomDefinition;
}

function loadStoredCustomRooms(): PublicRoomDefinition[] {
  const parsed = readAriesPath<StoredCustomRoomDefinition[]>("room.customRooms") ?? [];
  if (!Array.isArray(parsed)) return [];
  const result: PublicRoomDefinition[] = [];
  for (const entry of parsed) {
    const sanitized = sanitizeRoomDefinition(entry);
    if (sanitized) result.push(sanitized);
  }
  return result;
}

function persistCustomRooms(rooms: PublicRoomDefinition[]): void {
  const payload: StoredCustomRoomDefinition[] = rooms.map((room) => ({
    name: room.name,
    idRoom: room.idRoom,
  }));
  writeAriesPath("room.customRooms", payload);
}

let customRoomsCache: PublicRoomDefinition[] | null = null;

function getCustomRoomsCache(): PublicRoomDefinition[] {
  if (!customRoomsCache) {
    customRoomsCache = loadStoredCustomRooms();
  }
  return customRoomsCache.map((room) => ({ ...room }));
}

function setCustomRoomsCache(rooms: PublicRoomDefinition[]): void {
  customRoomsCache = rooms.map((room) => ({ ...room }));
  persistCustomRooms(customRoomsCache);
}

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function fetchStatusesFor(definitions: PublicRoomDefinition[]): Promise<PublicRoomStatus[]> {
  const now = Date.now();
  return Promise.all(
    definitions.map(async (def) => {
      try {
        const response = await requestRoomEndpoint<RoomInfoPayload>(def.idRoom, {
          endpoint: "info",
          timeoutMs: 10_000,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload =
          response.parsed ??
          (() => {
            try {
              return JSON.parse(response.body) as RoomInfoPayload;
            } catch {
              return undefined;
            }
          })();

        const players = clampPlayerCount(typeof payload?.numPlayers === "number" ? payload.numPlayers : 0);
        const capacity = MAX_PLAYERS;
        const currentGame =
          typeof payload?.currentGame === "string" && payload.currentGame.trim().length
            ? payload.currentGame.trim()
            : undefined;
        const hostPlayerId =
          typeof payload?.hostPlayerId === "string" && payload.hostPlayerId.trim().length
            ? payload.hostPlayerId.trim()
            : undefined;
        const playerDetails = normalizeRoomPlayers(payload?.players, hostPlayerId);
        return {
          ...def,
          players,
          capacity,
          isFull: players >= capacity,
          lastUpdatedAt: now,
          currentGame,
          hostPlayerId,
          playerDetails,
        } satisfies PublicRoomStatus;
      } catch (error) {
        const message = normalizeError(error);
        return {
          ...def,
          players: 0,
          capacity: MAX_PLAYERS,
          isFull: false,
          lastUpdatedAt: now,
          hostPlayerId: undefined,
          playerDetails: [],
          error: message,
        } satisfies PublicRoomStatus;
      }
    }),
  );
}

function clampPlayerCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_PLAYERS, Math.floor(value)));
}

function normalizeRoomPlayers(
  value: RoomInfoPayload["players"],
  hostPlayerId?: string,
): PublicRoomPlayer[] {
  if (!Array.isArray(value)) return [];

  const normalized: PublicRoomPlayer[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;

    const id = typeof entry.id === "string" && entry.id.trim().length ? entry.id.trim() : undefined;
    // Le jeu a renommé ce champ en `discordUserId`. Le lire sous les deux noms,
    // sinon `isHost` perd un de ses deux critères et l'hôte n'est plus marqué.
    const databaseUserId = readAccountId(entry) ?? undefined;
    const rawName = typeof entry.name === "string" ? entry.name.trim() : "";
    const name = rawName || "Unknown player";
    const isConnected = typeof entry.isConnected === "boolean" ? entry.isConnected : false;
    const discordAvatarUrl =
      typeof entry.discordAvatarUrl === "string" && entry.discordAvatarUrl.trim().length
        ? entry.discordAvatarUrl.trim()
        : undefined;

    normalized.push({
      id,
      databaseUserId,
      name,
      isConnected,
      discordAvatarUrl,
      isHost: Boolean(hostPlayerId && (id === hostPlayerId || databaseUserId === hostPlayerId)),
    });
  }

  return normalized;
}

function normalizeError(error: unknown): string {
  if (!error) return "Erreur inconnue.";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message || "Erreur inconnue.";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export const RoomService = {
  getPublicRooms(): PublicRoomDefinition[] {
    void requestRemoteRoomsFetch();
    return publicRoomsState.definitions.map((room) => ({ ...room }));
  },

  getPublicRoomsCategoryOrder(): string[] {
    void requestRemoteRoomsFetch();
    return [...publicRoomsState.categoryOrder];
  },

  getCustomRooms(): PublicRoomDefinition[] {
    return getCustomRoomsCache();
  },

  addCustomRoom(room: { name: string; idRoom: string }):
    | { ok: true; room: PublicRoomDefinition }
    | { ok: false; error: string } {
    const name = typeof room.name === "string" ? room.name.trim() : "";
    const idRoom = typeof room.idRoom === "string" ? room.idRoom.trim() : "";

    if (!name) {
      return { ok: false, error: "Room name is required." };
    }

    if (!idRoom) {
      return { ok: false, error: "Room identifier is required." };
    }

    const normalizedName = normalizeIdentifier(name);
    const normalizedId = normalizeIdentifier(idRoom);

    const allRooms = [...this.getPublicRooms(), ...getCustomRoomsCache()];
    if (allRooms.some((existing) => normalizeIdentifier(existing.idRoom) === normalizedId)) {
      return { ok: false, error: "This room already exists." };
    }

    if (allRooms.some((existing) => normalizeIdentifier(existing.name) === normalizedName)) {
      return { ok: false, error: "A room with this name already exists." };
    }

    const definition: PublicRoomDefinition = {
      name,
      idRoom,
      category: deriveCategoryFromName(name),
    };

    const next = [...getCustomRoomsCache(), definition];
    setCustomRoomsCache(next);
    return { ok: true, room: { ...definition } };
  },

  removeCustomRoom(idRoom: string): boolean {
    const normalizedId = normalizeIdentifier(idRoom);
    const rooms = getCustomRoomsCache();
    const filtered = rooms.filter((room) => normalizeIdentifier(room.idRoom) !== normalizedId);
    if (filtered.length === rooms.length) {
      return false;
    }
    setCustomRoomsCache(filtered);
    return true;
  },

  async fetchPublicRoomsStatus(): Promise<PublicRoomStatus[]> {
    await ensureRemoteRoomsLoaded();
    const definitions = publicRoomsState.definitions.map((room) => ({ ...room }));
    return fetchStatusesFor(definitions);
  },

  async fetchCustomRoomsStatus(): Promise<PublicRoomStatus[]> {
    const definitions = this.getCustomRooms();
    if (!definitions.length) return [];
    return fetchStatusesFor(definitions);
  },

  canJoinPublicRoom(room: PublicRoomStatus): boolean {
    if (room.error) return false;
    if (room.isFull) return false;
    if (this.isDiscordActivity()) return false;
    return true;
  },

  isDiscordActivity(): boolean {
    return detectDiscordSurface();
  },

  joinPublicRoom(room: Pick<PublicRoomStatus, "idRoom">): JoinRoomResult {
    const result = joinRoom(room.idRoom, { siteFallbackOnDiscord: true, preferSoft:false });
    if (!result.ok) {
    }
    return result;
  },
};

export type RoomServiceType = typeof RoomService;
