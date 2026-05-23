// ariesModAPI/cache/welcome.ts
// Cache pour l'événement welcome et callbacks

import type { WelcomePayload, WelcomeGroup, WelcomeGroupMember } from "../types";

// ========== Cache & Callbacks ==========

let _welcomeCache: WelcomePayload | null = null;
const _welcomeCallbacks = new Set<(data: WelcomePayload) => void>();

/**
 * Enregistre un callback qui sera appelé lors de la réception d'un événement welcome
 * @param callback - Fonction à appeler
 * @returns Fonction de nettoyage pour retirer le callback
 */
export function onWelcome(callback: (data: WelcomePayload) => void): () => void {
  _welcomeCallbacks.add(callback);
  // Si les données welcome sont déjà disponibles, appeler immédiatement
  if (_welcomeCache) {
    try {
      callback(_welcomeCache);
    } catch {}
  }
  return () => _welcomeCallbacks.delete(callback);
}

/**
 * Récupère le cache welcome actuel
 * @returns Le cache welcome ou null
 */
export function getWelcomeCache(): WelcomePayload | null {
  return _welcomeCache;
}

/**
 * Notifie tous les callbacks qu'un événement welcome a été reçu
 * @param data - Données du welcome
 */
export function notifyWelcome(data: WelcomePayload): void {
  _welcomeCache = data;

  console.log("[Welcome] Received welcome event:", {
    friendsCount: data.friends?.length || 0,
    outgoingCount: data.friendRequests?.outgoing?.length || 0,
    incomingCount: data.friendRequests?.incoming?.length || 0,
    groupsCount: data.groups?.length || 0,
    publicGroupsCount: data.publicGroups?.length || 0,
    publicRoomsCount: data.publicRooms?.length || 0,
    modPlayersCount: data.modPlayers?.length || 0,
    hasModPlayersField: "modPlayers" in data,
    modPlayersValue: data.modPlayers,
  });

  for (const cb of _welcomeCallbacks) {
    try {
      cb(data);
    } catch {}
  }
}

/**
 * Récupère les rooms publiques du cache welcome
 * @returns Liste des rooms publiques ou null
 */
export function getCachedPublicRooms() {
  return _welcomeCache?.publicRooms || null;
}

/**
 * Récupère les mod players du cache welcome
 * @returns Liste des mod players ou null
 */
export function getCachedModPlayers() {
  return _welcomeCache?.modPlayers || null;
}

/**
 * Récupère les groupes publics du cache welcome
 * @returns Liste des groupes publics ou null
 */
export function getCachedPublicGroups() {
  return _welcomeCache?.publicGroups || null;
}

/**
 * Récupère le profil du joueur du cache welcome
 * @returns Le profil du joueur ou null
 */
export function getCachedMyProfile() {
  return _welcomeCache?.myProfile || null;
}

/**
 * Met à jour les privacy settings dans le cache welcome (sans re-notifier les callbacks)
 * @param privacy - Nouveaux privacy settings
 */
export function updateCachedMyProfilePrivacy(
  privacy: import("../types").PlayerPrivacyPayload,
): void {
  if (_welcomeCache?.myProfile) {
    _welcomeCache.myProfile.privacy = privacy;
  }
}

/**
 * Met à jour les groupes du joueur dans le cache welcome
 * @param groups - Nouvelle liste de groupes
 */
export function updateCachedGroups(groups: import("../types").WelcomeGroup[]): void {
  if (_welcomeCache) {
    _welcomeCache.groups = groups;
  }
}

/**
 * Met à jour les groupes publics dans le cache welcome
 * @param publicGroups - Nouvelle liste de groupes publics
 */
export function updateCachedPublicGroups(publicGroups: Array<{
  id: number;
  name: string;
  ownerId: string;
  memberCount: number;
  previewMembers: Array<{
    playerId: string;
    playerName?: string | null;
    discordAvatarUrl?: string | null;
    avatar?: string[] | null;
  }>;
  createdAt: string;
  updatedAt: string;
}>): void {
  if (_welcomeCache) {
    _welcomeCache.publicGroups = publicGroups;
  }
}

// ========== Group Mutations (optimistic) ==========

export function getCachedGroups(): WelcomeGroup[] {
  return _welcomeCache?.groups ? [..._welcomeCache.groups] : [];
}

export function removeGroupFromWelcomeCache(groupId: number): void {
  if (!_welcomeCache?.groups) return;
  _welcomeCache.groups = _welcomeCache.groups.filter((g) => g.id !== groupId);
}

export function addGroupToWelcomeCache(group: WelcomeGroup): void {
  if (!_welcomeCache) return;
  if (!_welcomeCache.groups) _welcomeCache.groups = [];
  if (_welcomeCache.groups.some((g) => g.id === group.id)) return;
  _welcomeCache.groups = [..._welcomeCache.groups, group];
}

export function removePublicGroupFromWelcomeCache(groupId: number): void {
  if (!_welcomeCache?.publicGroups) return;
  _welcomeCache.publicGroups = _welcomeCache.publicGroups.filter((g) => g.id !== groupId);
}

export function updateGroupInWelcomeCache(
  groupId: number,
  updates: Partial<Pick<WelcomeGroup, "name" | "role">>,
): void {
  if (!_welcomeCache?.groups) return;
  _welcomeCache.groups = _welcomeCache.groups.map((g) =>
    g.id === groupId ? { ...g, ...updates } : g,
  );
}

// ========== Group Members Cache ==========

let _cachedGroupMembers: WelcomeGroupMember[] | null = null;

export function getCachedGroupMembers(): WelcomeGroupMember[] {
  return _cachedGroupMembers ? [..._cachedGroupMembers] : [];
}

export function updateCachedGroupMembers(members: WelcomeGroupMember[]): void {
  _cachedGroupMembers = members;
}

export function updateGroupMemberPresenceInCache(
  playerId: string,
  isOnline: boolean,
  lastEventAt: string | null,
  roomId?: string | null,
): void {
  if (!_cachedGroupMembers) return;
  _cachedGroupMembers = _cachedGroupMembers.map((m) =>
    m.playerId === playerId
      ? { ...m, isOnline, lastEventAt, ...(roomId !== undefined ? { roomId } : {}) }
      : m,
  );
}

export function updateGroupMemberRoomInCache(
  playerId: string,
  roomId: string | null,
): void {
  if (!_cachedGroupMembers) return;
  _cachedGroupMembers = _cachedGroupMembers.map((m) =>
    m.playerId === playerId ? { ...m, roomId } : m,
  );
}

// ========== Leaderboard Cache ==========

let _cachedLeaderboard: import("../types").LeaderboardData | null = null;

export function getCachedLeaderboard(): import("../types").LeaderboardData | null {
  return _cachedLeaderboard;
}

export function updateLeaderboardCache(data: import("../types").LeaderboardData): void {
  _cachedLeaderboard = data;
}

// ========== Total Pets Cache (used by pet-journal leaderboard) ==========

let _cachedTotalPets: number | null = null;

export function getCachedTotalPets(): number | null {
  return _cachedTotalPets;
}

export function setCachedTotalPets(value: number | null): void {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    _cachedTotalPets = value;
  }
}
