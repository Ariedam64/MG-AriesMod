// Notification sound system for Community Hub
// Plays a notification sound when new messages/requests arrive

import { getAudioUrlSafe } from "../../../utils/discordCsp";
import { readAriesPath, writeAriesPath } from "../../../utils/localStorage";
import { getTotalFriendUnreadCount, getTotalGroupUnreadCount, getCachedGroupConversations, getIncomingRequestsCount } from "../../../ariesModAPI";

const NOTIFICATION_SOUND_URL = "https://cdn.pixabay.com/audio/2025/09/09/audio_3023b9bde2.mp3";
const NOTIFICATION_VOLUME = 0.2; // 20%
const STORAGE_PATH = "notifications.soundEnabled";

// Cached audio element
let audioElement: HTMLAudioElement | null = null;
let audioUrlSafe: string | null = null;
let audioReady = false;

// Track last known counts to detect increases
let lastFriendUnreadCount = 0;
let lastGroupUnreadCount = 0;
let lastRequestsCount = 0;

/**
 * Initializes the notification sound system by preloading the audio.
 * Call this once when the Community Hub is created.
 *
 * IMPORTANT: This function initializes counts synchronously first,
 * then loads audio async and plays once if there are existing notifications.
 */
export async function initNotificationSound(): Promise<void> {
  // Initialize counts IMMEDIATELY (synchronous) with current values
  // This prevents the first updateAllBadges() call from triggering a sound
  lastFriendUnreadCount = getTotalFriendUnreadCount();
  lastGroupUnreadCount = getTotalGroupUnreadCount();
  lastRequestsCount = getIncomingRequestsCount();

  const initialTotal = lastFriendUnreadCount + lastGroupUnreadCount + lastRequestsCount;

  try {
    // Get safe URL for Discord CSP (async)
    audioUrlSafe = await getAudioUrlSafe(NOTIFICATION_SOUND_URL);

    // Preload audio element
    audioElement = new Audio();
    audioElement.volume = NOTIFICATION_VOLUME;
    audioElement.preload = "auto";
    audioElement.src = audioUrlSafe;

    // Mark audio as ready
    audioReady = true;

    // If there were notifications at launch, play sound once
    if (initialTotal > 0) {
      playNotificationSound();
    }
  } catch (error) {
    console.error("[NotificationSound] Failed to initialize:", error);
  }
}

/**
 * Returns whether notification sound is enabled in settings.
 */
export function isNotificationSoundEnabled(): boolean {
  const value = readAriesPath<boolean>(STORAGE_PATH, true); // Default: true
  return value === true;
}

/**
 * Sets whether notification sound is enabled.
 */
export function setNotificationSoundEnabled(enabled: boolean): void {
  writeAriesPath(STORAGE_PATH, enabled);
}

/**
 * Plays the notification sound (if enabled).
 * This is called when new notifications arrive.
 */
export function playNotificationSound(): void {
  const enabled = isNotificationSoundEnabled();

  if (!enabled) {
    return;
  }

  if (!audioReady || !audioElement || !audioUrlSafe) {
    console.warn("[NotificationSound] Audio not ready yet");
    return;
  }

  try {
    // Reset to start and play
    audioElement.currentTime = 0;
    const playPromise = audioElement.play();

    // Handle autoplay restrictions
    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.warn("[NotificationSound] Play failed (autoplay restriction?):", error);
      });
    }
  } catch (error) {
    console.error("[NotificationSound] Failed to play:", error);
  }
}

/**
 * Returns the total unread count for unmuted groups only.
 */
export function getUnmutedGroupUnreadCount(): number {
  const mutedIds = getMutedGroupIds();
  if (mutedIds.length === 0) return getTotalGroupUnreadCount();
  const conversations = getCachedGroupConversations();
  return conversations.reduce((sum, c) => {
    if (mutedIds.includes(c.groupId)) return sum;
    return sum + (c.unreadCount ?? 0);
  }, 0);
}

/**
 * Checks if notification counts have increased and plays sound if so.
 * Call this when conversation/request data refreshes.
 * Muted groups are excluded from the sound trigger.
 *
 * @param friendUnread - Current friend messages unread count
 * @param groupUnread - Current group messages unread count (unmuted only)
 * @param requestsCount - Current incoming requests count
 */
export function checkAndPlayNotificationSound(
  friendUnread: number,
  groupUnread: number,
  requestsCount: number
): void {
  // Calculate total counts
  const currentTotal = friendUnread + groupUnread + requestsCount;
  const lastTotal = lastFriendUnreadCount + lastGroupUnreadCount + lastRequestsCount;

  // If count increased, play sound once
  if (currentTotal > lastTotal) {
    playNotificationSound();
  }

  // Update tracked counts
  lastFriendUnreadCount = friendUnread;
  lastGroupUnreadCount = groupUnread;
  lastRequestsCount = requestsCount;
}

// ── Muted groups ─────────────────────────────────────────────────────────────

const MUTED_GROUPS_PATH = "notifications.mutedGroupIds";

/**
 * Returns the list of muted group IDs.
 */
export function getMutedGroupIds(): number[] {
  return readAriesPath<number[]>(MUTED_GROUPS_PATH, []) ?? [];
}

/**
 * Returns whether a specific group is muted.
 */
export function isGroupMuted(groupId: number): boolean {
  return getMutedGroupIds().includes(groupId);
}

/**
 * Toggles mute state for a group. Returns the new muted state.
 */
export function toggleGroupMute(groupId: number): boolean {
  const current = getMutedGroupIds();
  const index = current.indexOf(groupId);
  if (index === -1) {
    writeAriesPath(MUTED_GROUPS_PATH, [...current, groupId]);
    return true;
  } else {
    writeAriesPath(MUTED_GROUPS_PATH, current.filter((id) => id !== groupId));
    return false;
  }
}

/**
 * Resets the tracked counts (e.g., when user manually clears all).
 */
export function resetNotificationCounts(): void {
  lastFriendUnreadCount = 0;
  lastGroupUnreadCount = 0;
  lastRequestsCount = 0;
}

/**
 * Cleanup function to call when Community Hub is destroyed.
 */
export function cleanupNotificationSound(): void {
  if (audioElement) {
    audioElement.pause();
    audioElement.src = "";
    audioElement = null;
  }
  audioUrlSafe = null;
  audioReady = false;
  resetNotificationCounts();
}
