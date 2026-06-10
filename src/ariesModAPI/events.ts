// src/ariesModAPI/events.ts
// Event name constants dispatched by the API layer (qws: prefix).
// Moved here from ui/menus/communityHub/shared.ts when the Community Hub was
// extracted into its own userscript. The standalone hub listens to the same
// names, so events dispatched here keep working across mod boundaries.

export const CH_EVENTS = {
  OPEN: "qws:community-hub-open",
  CLOSE: "qws:community-hub-close",
  FRIENDS_REFRESH: "qws:friends-refresh",
  FRIEND_REQUESTS_REFRESH: "qws:friend-requests-refresh",
  PRIVACY_UPDATED: "qws:privacy-updated",
  ROOM_CHANGED: "qws:room-changed",
  CONVERSATIONS_REFRESH: "qws:conversations-refresh",
  GROUPS_REFRESH: "qws:groups-refresh",
  OPEN_FRIEND_CHAT: "qws:open-friend-chat",
  OPEN_GROUP_CHAT: "qws:open-group-chat",
  PRESENCE_UPDATED: "qws:presence-updated",
} as const;
