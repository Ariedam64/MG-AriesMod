// ariesModAPI/endpoints/leaderboard.ts
// Endpoints pour les leaderboards

import { httpGet } from "../client/http";
import type {
  LeaderboardRow,
  LeaderboardResponse,
  LeaderboardRankResponse,
  LeaderboardPetJournalResponse,
  PlayerJournalResponse,
  ItemLeaderboardType,
} from "../types";

/**
 * Récupère le leaderboard des coins
 * @param params - Paramètres optionnels (query, limit, offset, myPlayerId)
 * @returns Entrées du leaderboard + rang du joueur si myPlayerId fourni
 */
export async function fetchLeaderboardCoins(params?: {
  query?: string;
  limit?: number;
  offset?: number;
  myPlayerId?: string;
}): Promise<{ rows: LeaderboardRow[]; myRank: LeaderboardRow | null }> {
  const { query, limit = 15, offset = 0, myPlayerId } = params || {};
  const queryParams: Record<string, string | number> = { limit, offset };
  if (query && query.trim()) {
    queryParams.query = query.trim();
  }
  if (myPlayerId) {
    queryParams.myPlayerId = myPlayerId;
  }
  const { status, data } = await httpGet<LeaderboardResponse>("leaderboard/coins", queryParams);
  if (status !== 200 || !data || !Array.isArray(data.rows)) return { rows: [], myRank: null };
  return { rows: data.rows, myRank: data.myRank ?? null };
}

/**
 * Récupère le leaderboard des œufs éclos
 * @param params - Paramètres optionnels (query, limit, offset, myPlayerId)
 * @returns Entrées du leaderboard + rang du joueur si myPlayerId fourni
 */
export async function fetchLeaderboardEggsHatched(params?: {
  query?: string;
  limit?: number;
  offset?: number;
  myPlayerId?: string;
}): Promise<{ rows: LeaderboardRow[]; myRank: LeaderboardRow | null }> {
  const { query, limit = 15, offset = 0, myPlayerId } = params || {};
  const queryParams: Record<string, string | number> = { limit, offset };
  if (query && query.trim()) {
    queryParams.query = query.trim();
  }
  if (myPlayerId) {
    queryParams.myPlayerId = myPlayerId;
  }
  const { status, data } = await httpGet<LeaderboardResponse>(
    "leaderboard/eggs-hatched",
    queryParams,
  );
  if (status !== 200 || !data || !Array.isArray(data.rows)) return { rows: [], myRank: null };
  return { rows: data.rows, myRank: data.myRank ?? null };
}

/**
 * Récupère le rang d'un joueur dans le leaderboard des coins
 * @param playerId - ID du joueur
 * @returns Rang du joueur ou null
 */
export async function fetchLeaderboardCoinsRank(
  playerId: string,
): Promise<LeaderboardRankResponse | null> {
  if (!playerId) return null;
  const { status, data } = await httpGet<LeaderboardRankResponse>("leaderboard/coins/rank", {
    playerId,
  });
  if (status !== 200 || !data) return null;
  return data;
}

/**
 * Récupère le rang d'un joueur dans le leaderboard des œufs éclos
 * @param playerId - ID du joueur
 * @returns Rang du joueur ou null
 */
export async function fetchLeaderboardEggsHatchedRank(
  playerId: string,
): Promise<LeaderboardRankResponse | null> {
  if (!playerId) return null;
  const { status, data } = await httpGet<LeaderboardRankResponse>(
    "leaderboard/eggs-hatched/rank",
    { playerId },
  );
  if (status !== 200 || !data) return null;
  return data;
}

/**
 * Récupère le leaderboard du journal pets (% de complétion).
 * @param params - Paramètres optionnels (query, limit, offset, myPlayerId)
 * @returns Entrées du leaderboard + rang du joueur + nombre total de pets dans le jeu
 */
export async function fetchLeaderboardPetJournal(params?: {
  query?: string;
  limit?: number;
  offset?: number;
  myPlayerId?: string;
}): Promise<{
  rows: LeaderboardRow[];
  myRank: LeaderboardRow | null;
  totalPets: number | null;
}> {
  const { query, limit = 15, offset = 0, myPlayerId } = params || {};
  const queryParams: Record<string, string | number> = { limit, offset };
  if (query && query.trim()) {
    queryParams.query = query.trim();
  }
  if (myPlayerId) {
    queryParams.myPlayerId = myPlayerId;
  }
  const { status, data } = await httpGet<LeaderboardPetJournalResponse>(
    "leaderboard/pet-journal",
    queryParams,
  );
  if (status !== 200 || !data || !Array.isArray(data.rows)) {
    return { rows: [], myRank: null, totalPets: null };
  }
  return {
    rows: data.rows,
    myRank: data.myRank ?? null,
    totalPets: data.meta?.totalPets ?? null,
  };
}

/**
 * Récupère le rang d'un joueur dans le leaderboard du journal pets
 * @param playerId - ID du joueur
 * @returns Rang du joueur ou null
 */
export async function fetchLeaderboardPetJournalRank(
  playerId: string,
): Promise<LeaderboardRankResponse | null> {
  if (!playerId) return null;
  const { status, data } = await httpGet<LeaderboardRankResponse>(
    "leaderboard/pet-journal/rank",
    { playerId },
  );
  if (status !== 200 || !data) return null;
  return data;
}

/**
 * Récupère le leaderboard du stock détenu d'un item (graine, œuf, outil, décor, produce).
 * @param params - type + id requis, autres optionnels (query, limit, offset, myPlayerId)
 * @returns Entrées du leaderboard + rang du joueur si myPlayerId fourni
 */
export async function fetchLeaderboardItems(params: {
  type: ItemLeaderboardType;
  id: string;
  query?: string;
  limit?: number;
  offset?: number;
  myPlayerId?: string;
}): Promise<{ rows: LeaderboardRow[]; myRank: LeaderboardRow | null }> {
  const { type, id, query, limit = 50, offset = 0, myPlayerId } = params;
  if (!type || !id) return { rows: [], myRank: null };
  const queryParams: Record<string, string | number> = { type, id, limit, offset };
  if (query && query.trim()) {
    queryParams.query = query.trim();
  }
  if (myPlayerId) {
    queryParams.myPlayerId = myPlayerId;
  }
  const { status, data } = await httpGet<LeaderboardResponse>("leaderboard/items", queryParams);
  if (status !== 200 || !data || !Array.isArray(data.rows)) return { rows: [], myRank: null };
  return { rows: data.rows, myRank: data.myRank ?? null };
}

/**
 * Récupère le journal complet d'un joueur (pets/produce loggés)
 * @param playerId - ID du joueur
 * @returns Journal + score + meta, ou un objet d'erreur typé pour 403/404
 */
export async function fetchPlayerJournal(
  playerId: string,
): Promise<
  | { ok: true; data: PlayerJournalResponse }
  | { ok: false; status: number; reason: "private" | "not_found" | "error" }
> {
  if (!playerId) return { ok: false, status: 400, reason: "error" };
  const { status, data } = await httpGet<PlayerJournalResponse>("get-player-journal", {
    playerId,
  });
  if (status === 200 && data) return { ok: true, data };
  if (status === 403) return { ok: false, status, reason: "private" };
  if (status === 404) return { ok: false, status, reason: "not_found" };
  return { ok: false, status, reason: "error" };
}
