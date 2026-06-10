// ariesModAPI/endpoints/groups.ts
// Endpoints pour la gestion des groupes

import { httpGet, httpPost, httpPatch, httpDelete } from "../client/http";
import type { GroupSummary, GroupDetails, GroupMessage, GroupRole } from "../types";
import { optimistic } from "../optimistic";
import { CH_EVENTS } from "../events";
import {
  getCachedGroups,
  getCachedPublicGroups,
  removeGroupFromWelcomeCache,
  addGroupToWelcomeCache,
  removePublicGroupFromWelcomeCache,
  updateGroupInWelcomeCache,
  updateCachedGroups,
  updateCachedPublicGroups,
} from "../cache/welcome";
import { removeGroupConversationFromCache } from "../cache/conversations";

/**
 * Crée un nouveau groupe
 * @param params - Paramètres du groupe
 * @returns Le groupe créé ou null en cas d'erreur
 */
export async function createGroup(params: {
  name: string;
  isPublic?: boolean;
}): Promise<GroupSummary | null> {
  const { name, isPublic } = params;
  if (!name) return null;
  const { status, data } = await httpPost<GroupSummary>("groups", { name, isPublic });
  if (status >= 200 && status < 300 && data) return data;
  if (status === 401) console.error("[api] createGroup unauthorized");
  return null;
}

/**
 * Récupère la liste des groupes du joueur
 * @returns Liste des groupes
 */
export async function fetchGroups(): Promise<GroupSummary[]> {
  const { status, data } = await httpGet<
    GroupSummary[] | { playerId?: string; groups?: GroupSummary[] }
  >("groups");
  if (status !== 200 || !data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.groups)) return data.groups;
  return [];
}

/**
 * Récupère la liste des groupes publics que le joueur n'a pas encore rejoints
 * @param options - Options de recherche et pagination
 * @returns Liste des groupes publics
 */
export async function fetchPublicGroups(options?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<GroupSummary[]> {
  const { status, data } = await httpGet<{ groups: GroupSummary[] }>("groups/public", {
    search: options?.search,
    limit: options?.limit,
    offset: options?.offset,
  });
  if (status !== 200 || !data) return [];
  if (Array.isArray(data.groups)) return data.groups;
  return [];
}

/**
 * Récupère les détails d'un groupe
 * @param groupId - ID du groupe
 * @returns Détails du groupe ou null
 */
export async function fetchGroupDetails(groupId: string): Promise<GroupDetails | null> {
  if (!groupId) return null;
  const { status, data } = await httpGet<GroupDetails>(`groups/${groupId}`);
  if (status !== 200 || !data) return null;
  return data;
}

/**
 * Renomme un groupe (optimistic)
 * @param params - Paramètres de renommage
 * @returns true si le renommage a réussi
 */
export async function updateGroupName(params: {
  groupId: string;
  name: string;
}): Promise<boolean> {
  const { groupId, name } = params;
  if (!groupId || !name) return false;

  const groupsSnapshot = getCachedGroups();

  const result = await optimistic({
    apply: () => updateGroupInWelcomeCache(Number(groupId), { name }),
    revert: () => updateCachedGroups(groupsSnapshot),
    request: async () => {
      const { status } = await httpPatch<null>(`groups/${groupId}`, { name });
      if (status >= 200 && status < 300) return true;
      throw new Error(`updateGroupName failed: ${status}`);
    },
    events: [CH_EVENTS.GROUPS_REFRESH],
    onError: "Failed to rename group.",
  });

  return result === true;
}

/**
 * Change la visibilité d'un groupe (public/privé) (optimistic)
 * @param params - Paramètres de changement de visibilité
 * @returns true si le changement a réussi
 */
export async function updateGroupVisibility(params: {
  groupId: string;
  isPublic: boolean;
}): Promise<boolean> {
  const { groupId, isPublic } = params;
  if (!groupId) return false;

  const groupsSnapshot = getCachedGroups();

  const result = await optimistic({
    apply: () => updateGroupInWelcomeCache(Number(groupId), {}),
    revert: () => updateCachedGroups(groupsSnapshot),
    request: async () => {
      const { status } = await httpPatch<null>(`groups/${groupId}`, { isPublic });
      if (status >= 200 && status < 300) return true;
      throw new Error(`updateGroupVisibility failed: ${status}`);
    },
    events: [CH_EVENTS.GROUPS_REFRESH],
    onError: "Failed to update group visibility.",
  });

  return result === true;
}

/**
 * Supprime un groupe (optimistic)
 * @param params - Paramètres de suppression
 * @returns true si la suppression a réussi
 */
export async function deleteGroup(params: { groupId: string }): Promise<boolean> {
  const { groupId } = params;
  if (!groupId) return false;

  const groupsSnapshot = getCachedGroups();

  const result = await optimistic({
    apply: () => {
      removeGroupFromWelcomeCache(Number(groupId));
      removeGroupConversationFromCache(Number(groupId));
    },
    revert: () => updateCachedGroups(groupsSnapshot),
    request: async () => {
      const { status } = await httpDelete<null>(`groups/${groupId}`, {});
      if (status >= 200 && status < 300) return true;
      throw new Error(`deleteGroup failed: ${status}`);
    },
    events: [CH_EVENTS.GROUPS_REFRESH, CH_EVENTS.CONVERSATIONS_REFRESH],
    onError: "Failed to delete group.",
  });

  return result === true;
}

/**
 * Ajoute un membre à un groupe
 * @param params - Paramètres d'ajout
 * @returns true si l'ajout a réussi
 */
export async function addGroupMember(params: {
  groupId: string;
  memberId: string;
}): Promise<boolean> {
  const { groupId, memberId } = params;
  if (!groupId || !memberId) return false;
  const { status } = await httpPost<null>(`groups/${groupId}/members`, { memberId });
  if (status === 401) console.error("[api] addGroupMember unauthorized");
  return status >= 200 && status < 300;
}

/**
 * Retire un membre d'un groupe
 * @param params - Paramètres de retrait
 * @returns true si le retrait a réussi
 */
export async function removeGroupMember(params: {
  groupId: string;
  memberId: string;
}): Promise<boolean> {
  const { groupId, memberId } = params;
  if (!groupId || !memberId) return false;
  const { status } = await httpDelete<null>(`groups/${groupId}/members/${memberId}`, {});
  if (status === 401) console.error("[api] removeGroupMember unauthorized");
  return status >= 200 && status < 300;
}

/**
 * Quitte un groupe (optimistic)
 * @param params - Paramètres de départ
 * @returns true si le départ a réussi
 */
export async function leaveGroup(params: { groupId: string }): Promise<boolean> {
  const { groupId } = params;
  if (!groupId) return false;

  const groupsSnapshot = getCachedGroups();

  const result = await optimistic({
    apply: () => {
      removeGroupFromWelcomeCache(Number(groupId));
      removeGroupConversationFromCache(Number(groupId));
    },
    revert: () => updateCachedGroups(groupsSnapshot),
    request: async () => {
      const { status } = await httpPost<null>(`groups/${groupId}/leave`, {});
      if (status >= 200 && status < 300) return true;
      throw new Error(`leaveGroup failed: ${status}`);
    },
    events: [CH_EVENTS.GROUPS_REFRESH, CH_EVENTS.CONVERSATIONS_REFRESH],
    onError: "Failed to leave group.",
  });

  return result === true;
}

/**
 * Envoie un message dans un groupe
 * @param params - Paramètres du message
 * @returns Le message envoyé ou null en cas d'erreur
 */
export async function sendGroupMessage(params: {
  groupId: string;
  text: string;
}): Promise<GroupMessage | null> {
  const { groupId, text } = params;
  if (!groupId || !text) return null;
  const { status, data } = await httpPost<GroupMessage>(`groups/${groupId}/messages`, {
    text,
  });
  if (status >= 200 && status < 300 && data) return data;
  if (status === 401) console.error("[api] sendGroupMessage unauthorized");
  return null;
}

/**
 * Récupère les messages d'un groupe
 * @param groupId - ID du groupe
 * @param options - Options de pagination
 * @returns Liste des messages
 */
export async function fetchGroupMessages(
  groupId: string,
  options?: { afterId?: number; beforeId?: number; limit?: number },
): Promise<GroupMessage[]> {
  if (!groupId) return [];
  const { status, data } = await httpGet<GroupMessage[]>(`groups/${groupId}/messages`, {
    afterId: options?.afterId,
    beforeId: options?.beforeId,
    limit: options?.limit,
  });
  if (status !== 200 || !Array.isArray(data)) return [];
  return data;
}

/**
 * Marque les messages d'un groupe comme lus
 * @param params - Paramètres de lecture
 * @returns true si la lecture a été enregistrée
 */
export async function markGroupMessagesAsRead(params: {
  groupId: string;
  messageId: number;
}): Promise<boolean> {
  const { groupId, messageId } = params;
  if (!groupId || !messageId) return false;
  const { status } = await httpPost<null>(`groups/${groupId}/messages/read`, {
    messageId,
  });
  if (status === 401) console.error("[api] markGroupMessagesAsRead unauthorized");
  return status === 204 || (status >= 200 && status < 300);
}

/**
 * Rejoint un groupe public (optimistic)
 * @param params - Paramètres de rejointe
 * @returns true si le joueur a rejoint le groupe
 */
export async function joinGroup(params: { groupId: string }): Promise<boolean> {
  const { groupId } = params;
  if (!groupId) return false;

  const groupsSnapshot = getCachedGroups();
  const publicGroupsSnapshot = getCachedPublicGroups() ?? [];

  // Find the group in public groups to move it to my groups
  const publicGroup = publicGroupsSnapshot.find((g) => g.id === Number(groupId));

  const result = await optimistic({
    apply: () => {
      removePublicGroupFromWelcomeCache(Number(groupId));
      if (publicGroup) {
        addGroupToWelcomeCache({
          id: publicGroup.id,
          name: publicGroup.name,
          ownerId: publicGroup.ownerId,
          role: "member",
          memberCount: (publicGroup.memberCount ?? 0) + 1,
          previewMembers: publicGroup.previewMembers ?? [],
          createdAt: publicGroup.createdAt,
          updatedAt: publicGroup.updatedAt,
        });
      }
    },
    revert: () => {
      updateCachedGroups(groupsSnapshot);
      updateCachedPublicGroups(publicGroupsSnapshot);
    },
    request: async () => {
      const { status } = await httpPost<null>(`groups/${groupId}/join`, {});
      if (status === 204 || (status >= 200 && status < 300)) return true;
      throw new Error(`joinGroup failed: ${status}`);
    },
    events: [CH_EVENTS.GROUPS_REFRESH],
    onError: "Failed to join group.",
  });

  return result === true;
}

/**
 * Change le rôle d'un membre dans un groupe
 * @param params - Paramètres de changement de rôle
 * @returns Les infos du changement de rôle ou null en cas d'erreur
 */
export async function changeGroupMemberRole(params: {
  groupId: string;
  memberId: string;
  role: GroupRole;
}): Promise<{ memberId: string; oldRole: GroupRole; newRole: GroupRole } | null> {
  const { groupId, memberId, role } = params;
  if (!groupId || !memberId || !role) return null;
  if (role === "owner") {
    console.error("[api] changeGroupMemberRole - cannot set role to owner");
    return null;
  }
  const { status, data } = await httpPatch<{
    memberId: string;
    oldRole: GroupRole;
    newRole: GroupRole;
  }>(`groups/${groupId}/members/${memberId}/role`, { role });
  if (status >= 200 && status < 300 && data) return data;
  if (status === 401) console.error("[api] changeGroupMemberRole unauthorized");
  if (status === 403) console.error("[api] changeGroupMemberRole forbidden - insufficient permissions");
  if (status === 409) console.error("[api] changeGroupMemberRole conflict - member already has this role");
  return null;
}
