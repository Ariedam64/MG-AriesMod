// ariesModAPI/init.ts
// Initialisation centralisée des streams et synchronisation du state global

import { hasApiKey } from "../utils/localStorage";
import { openFriendRequestsStream } from "./streams/friends";
import { openMessagesStream } from "./streams/messages";
import { openGroupsStream } from "./streams/groups";
import { openPresenceStream } from "./streams/presence";
import type { StreamHandle } from "./types";

type StreamManager = {
  handles: StreamHandle[];
  playerId: string | null;
  initialized: boolean;
};

const _manager: StreamManager = {
  handles: [],
  playerId: null,
  initialized: false,
};

/**
 * Démarre tous les streams d'événements (SSE ou long polling selon le contexte)
 * Le playerId sera récupéré automatiquement depuis l'API lors de l'événement "connected"
 */
function startAllStreams(): void {
  if (_manager.initialized) {
    return;
  }

  // Utiliser un playerId temporaire, l'API nous renverra le vrai dans "connected"
  const tempPlayerId = "auto";
  _manager.playerId = tempPlayerId;
  _manager.initialized = true;

  // Stream friend requests
  try {
    const friendHandle = openFriendRequestsStream(tempPlayerId);
    _manager.handles.push(friendHandle);
  } catch (error) {
    console.error("[AriesAPI] Failed to start friend requests stream:", error);
  }

  // Stream messages
  try {
    const messagesHandle = openMessagesStream(tempPlayerId);
    _manager.handles.push(messagesHandle);
  } catch (error) {
    console.error("[AriesAPI] Failed to start messages stream:", error);
  }

  // Stream groups
  try {
    const groupsHandle = openGroupsStream(tempPlayerId);
    _manager.handles.push(groupsHandle);
  } catch (error) {
    console.error("[AriesAPI] Failed to start groups stream:", error);
  }

  // Stream presence
  try {
    const presenceHandle = openPresenceStream(tempPlayerId);
    _manager.handles.push(presenceHandle);
  } catch (error) {
    console.error("[AriesAPI] Failed to start presence stream:", error);
  }
}

/**
 * Arrête tous les streams actifs
 */
function stopAllStreams(): void {
  if (_manager.handles.length === 0) return;

  console.log(`[AriesAPI] Stopping ${_manager.handles.length} active streams`);

  for (const handle of _manager.handles) {
    try {
      handle.close();
    } catch (error) {
      console.error("[AriesAPI] Failed to close stream:", error);
    }
  }

  _manager.handles = [];
  _manager.playerId = null;
  _manager.initialized = false;
}

/**
 * Initialise les streams immédiatement
 * Le playerId sera détecté automatiquement par l'API
 */
export function initializeStreamsWhenReady(): void {
  if (!hasApiKey()) {
    return;
  }
  startAllStreams();
}

/**
 * Vérifie si les streams sont initialisés
 */
export function areStreamsInitialized(): boolean {
  return _manager.initialized;
}

/**
 * Récupère l'ID du joueur actuel
 */
export function getCurrentPlayerId(): string | null {
  return _manager.playerId;
}

/**
 * Met à jour l'ID du joueur actuel (appelé par les streams lors de "connected")
 */
export function updateCurrentPlayerId(playerId: string): void {
  if (playerId && playerId !== "auto") {
    _manager.playerId = playerId;
  }
}

/**
 * Force l'arrêt de tous les streams
 */
export function forceStopStreams(): void {
  stopAllStreams();
}

/**
 * Force le redémarrage des streams
 */
export function forceRestartStreams(): void {
  stopAllStreams();
  startAllStreams();
}

// NOTE: streams are no longer auto-started on "qws-friend-overlay-auth-update".
// The standalone Community Hub userscript owns the backend streams now; this
// module is kept for its exports but must stay passive in Arie's Mod.

// Nettoyer les streams lors de la déconnexion
window.addEventListener("beforeunload", () => {
  stopAllStreams();
});
