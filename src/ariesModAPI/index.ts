// ariesModAPI/index.ts
// Point d'entrée public de l'Aries Mod API

// ========== Configuration ==========
export { API_BASE_URL, API_ORIGIN } from "./config";

// ========== Types ==========
export type {
  Room,
  PlayerView,
  FriendSummary,
  DirectMessage,
  GroupSummary,
  GroupDetails,
  GroupMember,
  GroupMessage,
  GroupRole,
  GroupMessageEvent,
  GroupReadEvent,
  GroupMemberAddedEvent,
  GroupMemberRemovedEvent,
  GroupUpdatedEvent,
  GroupDeletedEvent,
  GroupRoleChangedEvent,
  WelcomePayload,
  WelcomeGroupMember,
  StreamHandle,
  PlayerPrivacyPayload,
  LeaderboardRow,
  LeaderboardCategoryData,
  LeaderboardData,
  LeaderboardPetJournalResponse,
  ItemLeaderboardType,
  PlayerJournalResponse,
  PlayerJournalPetEntry,
  PlayerJournalVariantEntry,
  PlayerJournalAbilityEntry,
  ModPlayerSummary,
} from "./types";

// ========== Auth ==========
export {
  requestApiKey,
  ensureApiKey,
  hasApiKey,
  getApiKey,
  setApiKey,
  initAuthBridgeIfNeeded,
  promptApiAuthOnStartup,
} from "./auth";

// ========== Endpoints ==========
export { fetchAvailableRooms } from "./endpoints/rooms";
export { fetchPlayerView, fetchPlayersView, fetchPlayerDetailsComplete } from "./endpoints/players";
export {
  fetchLeaderboardCoins,
  fetchLeaderboardEggsHatched,
  fetchLeaderboardCoinsRank,
  fetchLeaderboardEggsHatchedRank,
  fetchLeaderboardPetJournal,
  fetchLeaderboardPetJournalRank,
  fetchLeaderboardItems,
  fetchPlayerJournal,
} from "./endpoints/leaderboard";
export { searchPlayersByName, searchRoomsByPlayerName, fetchModPlayers } from "./endpoints/search";
export {
  sendFriendRequest,
  respondFriendRequest,
  cancelFriendRequest,
  removeFriend,
  fetchFriendsSummary,
  fetchFriendsWithViews,
  fetchFriendRequests,
  fetchIncomingRequestsWithViews,
  fetchOutgoingRequestsWithViews,
} from "./endpoints/friends";
export { sendMessage, fetchMessagesThread, markMessagesRead } from "./endpoints/messages";
export {
  createGroup,
  fetchGroups,
  fetchPublicGroups,
  fetchGroupDetails,
  updateGroupName,
  updateGroupVisibility,
  deleteGroup,
  addGroupMember,
  removeGroupMember,
  leaveGroup,
  joinGroup,
  changeGroupMemberRole,
  sendGroupMessage,
  fetchGroupMessages,
  markGroupMessagesAsRead,
} from "./endpoints/groups";
export { fetchPrivacy, updatePrivacy } from "./endpoints/privacy";
export {
  buildPlayerStatePayload,
  logPlayerStatePayload,
  sendPlayerState,
  startPlayerStateReporting,
  stopPlayerStateReporting,
  startPlayerStateReportingWhenGameReady,
  triggerPlayerStateSyncNow,
} from "./endpoints/state";

// ========== Cache ==========
export {
  getCachedFriendsWithViews,
  getCachedPlayerDetails,
  getCachedIncomingRequestsWithViews,
  getCachedOutgoingRequests,
  updatePlayerDetailsCache,
  addFriendToCache,
  removeFriendFromCache,
  addIncomingRequestToCache,
  removeIncomingRequestFromCache,
  addOutgoingRequestToCache,
  removeOutgoingRequestFromCache,
  updateFriendPrivacyInCache,
  updateFriendRoomInCache,
  getIncomingRequestsCount,
} from "./cache/friends";
export {
  onWelcome,
  getWelcomeCache,
  getCachedPublicRooms,
  getCachedPublicGroups,
  getCachedModPlayers,
  getCachedMyProfile,
  updateCachedMyProfilePrivacy,
  updateCachedGroups,
  updateCachedPublicGroups,
  getCachedGroupMembers,
  updateCachedGroupMembers,
  getCachedLeaderboard,
  updateLeaderboardCache,
  getCachedTotalPets,
  setCachedTotalPets,
} from "./cache/welcome";
export type { CachedFriendConversation, CachedGroupConversation, CachedDirectMessage, CachedGroupMessage, MessageStatus } from "./cache/conversations";
export {
  getCachedFriendConversations,
  getCachedFriendConversationMessages,
  updateFriendConversationsCache,
  addMessageToFriendConversationCache,
  removeMessageFromFriendConversationCache,
  updatePendingFriendMessage,
  markFriendConversationAsRead,
  removeFriendConversationFromCache,
  getCachedGroupConversations,
  getCachedGroupConversationMessages,
  updateGroupConversationsCache,
  addMessageToGroupConversationCache,
  removeMessageFromGroupConversationCache,
  updatePendingGroupMessage,
  markGroupConversationAsRead,
  removeGroupConversationFromCache,
  ensureGroupConversationExists,
  incrementFriendConversationUnread,
  incrementGroupConversationUnread,
  getTotalFriendUnreadCount,
  getTotalGroupUnreadCount,
} from "./cache/conversations";

// ========== Streams ==========
export { openFriendRequestsStream } from "./streams/friends";
export { openMessagesStream } from "./streams/messages";
export { openGroupsStream } from "./streams/groups";
export { openPresenceStream } from "./streams/presence";

// ========== Client utilities ==========
export { pauseDiscordLongPolls, resumeDiscordLongPolls, withDiscordPollPause } from "./client/events";

// ========== Initialization ==========
export {
  initializeStreamsWhenReady,
  areStreamsInitialized,
  getCurrentPlayerId,
  forceStopStreams,
  forceRestartStreams,
} from "./init";
