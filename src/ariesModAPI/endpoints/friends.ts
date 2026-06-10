// ariesModAPI/endpoints/friends.ts
// Endpoints pour la gestion des amis et demandes d'ami

import { httpGet, httpPost } from "../client/http";
import type {
  FriendSummary,
  FriendRequestsResult,
  FriendAction,
  PlayerView,
} from "../types";
import { fetchPlayersView } from "./players";
import {
  getCachedFriendsWithViews,
  getCachedIncomingRequestsWithViews,
  getCachedOutgoingRequests,
  updateFriendsViewCache,
  updateFriendsCache,
  updateOutgoingRequestsCache,
  updateIncomingRequestsCache,
  addOutgoingRequestToCache,
  removeOutgoingRequestFromCache,
  removeIncomingRequestFromCache,
  addFriendToCache,
  removeFriendFromCache,
} from "../cache/friends";
import { optimistic } from "../optimistic";
import { CH_EVENTS } from "../events";

/**
 * Envoie une demande d'ami à un joueur (optimistic)
 * @param toPlayerId - ID du joueur cible
 * @returns true si la demande a été envoyée avec succès
 */
export async function sendFriendRequest(toPlayerId: string): Promise<boolean> {
  if (!toPlayerId) return false;

  const snapshot = getCachedOutgoingRequests();

  const result = await optimistic({
    apply: () => {
      addOutgoingRequestToCache({
        toPlayerId,
        otherPlayerId: toPlayerId,
        createdAt: new Date().toISOString(),
      });
    },
    revert: () => updateOutgoingRequestsCache(snapshot),
    request: async () => {
      const { status } = await httpPost<null>("friend-request", { toPlayerId });
      if (status === 409) { console.warn("[api] friend-request conflict (already exists)"); return true; }
      if (status === 204) return true;
      throw new Error(`sendFriendRequest failed: ${status}`);
    },
    events: [CH_EVENTS.FRIEND_REQUESTS_REFRESH],
    onError: "Failed to send friend request.",
  });

  return result === true;
}

/**
 * Répond à une demande d'ami (accepter ou rejeter) (optimistic)
 * @param params - Paramètres de la réponse
 * @returns true si la réponse a été enregistrée avec succès
 */
export async function respondFriendRequest(params: {
  otherPlayerId: string;
  action: FriendAction;
}): Promise<boolean> {
  const { otherPlayerId, action } = params;
  if (!otherPlayerId) return false;

  // Snapshot BEFORE mutation
  const incomingSnapshot = getCachedIncomingRequestsWithViews();
  const friendsSnapshot = getCachedFriendsWithViews();

  // Get request data for the accept case
  const requestData = incomingSnapshot.find((r) => r.playerId === otherPlayerId);

  const events = [CH_EVENTS.FRIEND_REQUESTS_REFRESH];
  if (action === "accept") events.push(CH_EVENTS.FRIENDS_REFRESH);

  const result = await optimistic({
    apply: () => {
      removeIncomingRequestFromCache(otherPlayerId);
      if (action === "accept" && requestData) {
        addFriendToCache({
          playerId: otherPlayerId,
          playerName: requestData.playerName,
          avatarUrl: requestData.avatarUrl,
          avatar: requestData.avatar,
          lastEventAt: requestData.lastEventAt ?? null,
          isOnline: requestData.isOnline ?? false,
          roomId: requestData.room ?? null,
        });
      }
    },
    revert: () => {
      updateIncomingRequestsCache(incomingSnapshot);
      updateFriendsViewCache(friendsSnapshot);
    },
    request: async () => {
      const { status } = await httpPost<null>("friend-respond", { otherPlayerId, action });
      if (status === 204) return true;
      throw new Error(`respondFriendRequest failed: ${status}`);
    },
    events,
    onError: `Failed to ${action} friend request.`,
  });

  return result === true;
}

/**
 * Annule une demande d'ami sortante (optimistic)
 * @param otherPlayerId - ID du joueur cible
 * @returns true si l'annulation a réussi
 */
export async function cancelFriendRequest(otherPlayerId: string): Promise<boolean> {
  if (!otherPlayerId) return false;

  const snapshot = getCachedOutgoingRequests();

  const result = await optimistic({
    apply: () => removeOutgoingRequestFromCache(otherPlayerId),
    revert: () => updateOutgoingRequestsCache(snapshot),
    request: async () => {
      const { status } = await httpPost<null>("friend-cancel", { otherPlayerId });
      if (status === 204) return true;
      throw new Error(`cancelFriendRequest failed: ${status}`);
    },
    events: [CH_EVENTS.FRIEND_REQUESTS_REFRESH],
    onError: "Failed to cancel friend request.",
  });

  return result === true;
}

/**
 * Supprime un ami de la liste (optimistic)
 * @param otherPlayerId - ID de l'ami à supprimer
 * @returns true si la suppression a réussi
 */
export async function removeFriend(otherPlayerId: string): Promise<boolean> {
  if (!otherPlayerId) return false;

  const snapshot = getCachedFriendsWithViews();

  const result = await optimistic({
    apply: () => removeFriendFromCache(otherPlayerId),
    revert: () => updateFriendsViewCache(snapshot),
    request: async () => {
      const { status } = await httpPost<null>("friend-remove", { otherPlayerId });
      if (status === 204) return true;
      throw new Error(`removeFriend failed: ${status}`);
    },
    events: [CH_EVENTS.FRIENDS_REFRESH],
    onError: "Failed to remove friend.",
  });

  return result === true;
}

/**
 * Récupère la liste des amis (summary)
 * @param playerId - ID du joueur (conservé pour compatibilité API, non utilisé)
 * @returns Liste des amis
 */
export async function fetchFriendsSummary(playerId: string): Promise<FriendSummary[]> {
  const { status, data } = await httpGet<{
    playerId: string;
    friends: Array<{
      playerId: string;
      name: string | null;
      avatarUrl: string | null;
      avatar: string[] | null;
      lastEventAt: string | null;
      isOnline: boolean;
      roomId: string | null;
    }>;
  }>("list-friends");

  if (status !== 200 || !data || !Array.isArray(data.friends)) {
    updateFriendsCache([]);
    return [];
  }

  const result: FriendSummary[] = data.friends.map((f) => ({
    playerId: f.playerId,
    playerName: f.name,
    avatarUrl: f.avatarUrl,
    avatar: Array.isArray(f.avatar) ? f.avatar : null,
    lastEventAt: f.lastEventAt,
    isOnline: Boolean(f.isOnline),
    roomId: f.roomId,
  }));

  updateFriendsCache(result);
  return [...result];
}

/**
 * Récupère les IDs des amis
 * @param playerId - ID du joueur
 * @returns Liste des IDs d'amis
 */
export async function fetchFriendsIds(playerId: string): Promise<string[]> {
  const friends = await fetchFriendsSummary(playerId);
  return friends.map((f) => f.playerId);
}

/**
 * Récupère les amis avec leurs vues complètes
 * @param playerId - ID du joueur
 * @returns Liste des vues des amis
 */
export async function fetchFriendsWithViews(playerId: string): Promise<PlayerView[]> {
  const friendIds = await fetchFriendsIds(playerId);
  if (friendIds.length === 0) {
    return [];
  }

  const result = await fetchPlayersView(friendIds, { sections: ["profile", "room"] });
  return result;
}

/**
 * Récupère les demandes d'ami (entrantes et sortantes)
 * @param playerId - ID du joueur (conservé pour compatibilité API, non utilisé)
 * @returns Demandes d'ami entrantes et sortantes
 */
export async function fetchFriendRequests(playerId: string): Promise<FriendRequestsResult> {
  if (!playerId) return { playerId: "", incoming: [], outgoing: [] };

  const { status, data } = await httpGet<FriendRequestsResult>("list-friend-requests");
  if (status !== 200 || !data)
    return { playerId, incoming: [], outgoing: [] };

  const result: FriendRequestsResult = {
    playerId: data.playerId ?? playerId,
    incoming: Array.isArray(data.incoming) ? data.incoming : [],
    outgoing: Array.isArray(data.outgoing) ? data.outgoing : [],
  };

  updateOutgoingRequestsCache(result.outgoing);
  return result;
}

/**
 * Récupère les demandes entrantes avec leurs vues complètes
 * @param playerId - ID du joueur
 * @returns Liste des vues des demandes entrantes
 */
export async function fetchIncomingRequestsWithViews(playerId: string): Promise<PlayerView[]> {
  const { incoming } = await fetchFriendRequests(playerId);
  const ids = incoming.map((r) => r.fromPlayerId);
  if (ids.length === 0) {
    updateIncomingRequestsCache([]);
    return [];
  }

  const result = await fetchPlayersView(ids, { sections: ["profile"] });

  // Map to IncomingRequestView with createdAt
  const enriched = result.map((view) => {
    const request = incoming.find((r) => r.fromPlayerId === view.playerId);
    return {
      ...view,
      createdAt: request?.createdAt || new Date().toISOString(),
    };
  });

  updateIncomingRequestsCache(enriched);
  return [...result];
}

/**
 * Récupère les demandes sortantes avec leurs vues complètes
 * @param playerId - ID du joueur
 * @returns Liste des vues des demandes sortantes
 */
export async function fetchOutgoingRequestsWithViews(playerId: string): Promise<PlayerView[]> {
  const { outgoing } = await fetchFriendRequests(playerId);
  const ids = outgoing.map((r) => r.toPlayerId);
  if (ids.length === 0) return [];
  return fetchPlayersView(ids, { sections: ["profile"] });
}
