// ariesModAPI/types/index.ts
// Types centralisés pour l'API Aries Mod

import type { GardenState } from "../../store/atoms";

// ========== Common Types ==========

export interface StreamHandle {
  close(): void;
}

// ========== Room Types ==========

export interface RoomUserSlot {
  name: string;
  avatarUrl: string | null;
}

export interface Room {
  id: string;
  isPrivate: boolean;
  playersCount: number;
  lastUpdatedAt: string;
  lastUpdatedByPlayerId: string | null;
  userSlots?: RoomUserSlot[];
}

export interface RoomSearchResult {
  room: Room;
  matchedSlots: RoomUserSlot[];
}

// ========== Player Types ==========

export interface PlayerViewState {
  garden: GardenState | null;
  inventory: any | null;
  stats: Record<string, any> | null;
  activityLog: any[] | null;
  journal: any | null;
  activityLogs?: any[] | null;
}

export interface PlayerLeaderboardEntry {
  rank: number | null;
  total: number | null;
  value: number | null;
  row?: LeaderboardRow | null;
  coins?: number | null;
  eggsHatched?: number | null;
}

export interface PlayerLeaderboard {
  coins?: PlayerLeaderboardEntry | null;
  eggsHatched?: PlayerLeaderboardEntry | null;
  eggs?: PlayerLeaderboardEntry | null;
}

export interface PlayerPrivacyPayload {
  showGarden: boolean;
  showInventory: boolean;
  showCoins: boolean;
  showActivityLog: boolean;
  showJournal: boolean;
  hideRoomFromPublicList: boolean;
  showStats: boolean;
}

export interface PlayerView {
  playerId: string;
  playerName: string | null;
  avatarUrl: string | null;
  avatar?: string[] | null;
  coins: number | null;
  leaderboard?: PlayerLeaderboard | null;
  room: any | null;
  hasModInstalled: boolean;
  modVersion?: string | null;
  isOnline: boolean;
  lastEventAt: string | null;
  privacy: PlayerPrivacyPayload;
  state?: PlayerViewState;
  badges?: string[] | null;
}

export type PlayerViewSection =
  | "profile"
  | "garden"
  | "inventory"
  | "stats"
  | "activityLog"
  | "journal"
  | "leaderboard"
  | "room";

export interface PlayerRoomResult {
  playerName: string;
  avatarUrl: string | null;
  roomId: string;
  roomPlayersCount: number;
}

export interface ModPlayerSummary {
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  avatar: string[] | null;
  lastEventAt: string | null;
  isOnline: boolean;
  badges?: string[] | null;
}

// ========== Friend Types ==========

export interface FriendSummary {
  playerId: string;
  playerName: string | null;
  avatarUrl: string | null;
  avatar: string[] | null;
  lastEventAt: string | null;
  isOnline: boolean;
  roomId: string | null;
  badges?: string[] | null;
}

export interface IncomingRequestView extends PlayerView {
  createdAt: string;
}

export interface FriendRequestIncoming {
  fromPlayerId: string;
  otherPlayerId: string;
  badges?: string[] | null;
  createdAt: string;
}

export interface FriendRequestOutgoing {
  toPlayerId: string;
  otherPlayerId: string;
  playerName?: string | null;
  avatarUrl?: string | null;
  badges?: string[] | null;
  createdAt: string;
}

export interface FriendRequestsResult {
  playerId: string;
  incoming: FriendRequestIncoming[];
  outgoing: FriendRequestOutgoing[];
}

export type FriendAction = "accept" | "reject";

// ========== Friend Stream Events ==========

export interface FriendRequestStreamConnected {
  playerId: string;
}

export interface FriendRequestStreamRequest {
  requesterId: string;
  requesterName?: string | null;
  requesterAvatarUrl?: string | null;
  requesterBadges?: string[] | null;
  targetId: string;
  targetName?: string | null;
  targetAvatarUrl?: string | null;
  targetBadges?: string[] | null;
  createdAt: string;
}

export interface FriendRequestStreamResponse {
  requesterId: string;
  requesterName?: string | null;
  requesterAvatarUrl?: string | null;
  requesterBadges?: string[] | null;
  requesterIsOnline?: boolean;
  requesterRoomId?: string | null;
  responderId: string;
  responderName?: string | null;
  responderAvatarUrl?: string | null;
  responderBadges?: string[] | null;
  responderIsOnline?: boolean;
  responderRoomId?: string | null;
  action: FriendAction;
  updatedAt: string;
}

export interface FriendRequestStreamCancelled {
  requesterId: string;
  requesterName?: string | null;
  requesterAvatarUrl?: string | null;
  targetId: string;
  targetName?: string | null;
  targetAvatarUrl?: string | null;
  cancelledAt?: string;
}

export interface FriendRequestStreamAccepted {
  requesterId: string;
  requesterName?: string | null;
  requesterAvatarUrl?: string | null;
  responderId: string;
  responderName?: string | null;
  responderAvatarUrl?: string | null;
  updatedAt: string;
}

export interface FriendRequestStreamRejected {
  requesterId: string;
  requesterName?: string | null;
  requesterAvatarUrl?: string | null;
  responderId: string;
  responderName?: string | null;
  responderAvatarUrl?: string | null;
  updatedAt: string;
}

export interface FriendRequestStreamRemoved {
  removerId: string;
  removerName?: string | null;
  removerAvatarUrl?: string | null;
  removedId: string;
  removedName?: string | null;
  removedAvatarUrl?: string | null;
  removedAt: string;
}

export interface FriendRequestsStreamHandlers {
  onConnected?: (payload: FriendRequestStreamConnected) => void;
  onRequest?: (payload: FriendRequestStreamRequest) => void;
  onResponse?: (payload: FriendRequestStreamResponse) => void;
  onCancelled?: (payload: FriendRequestStreamCancelled) => void;
  onAccepted?: (payload: FriendRequestStreamAccepted) => void;
  onRejected?: (payload: FriendRequestStreamRejected) => void;
  onRemoved?: (payload: FriendRequestStreamRemoved) => void;
  onError?: (event: Event) => void;
}

// ========== Leaderboard Types ==========

export interface LeaderboardRow {
  playerId: string | null;
  playerName: string | null;
  avatarUrl: string | null;
  avatar: string[] | null;
  coins: number | null;
  eggsHatched: number | null;
  lastEventAt: string | null;
}

export interface LeaderboardResponse {
  rows: LeaderboardRow[];
  myRank?: LeaderboardRow | null;
}

export interface LeaderboardRankResponse {
  rank: number;
  total: number;
  row: LeaderboardRow | null;
}

// ========== Group Types ==========

export type GroupRole = "owner" | "admin" | "member";

export interface GroupSummary {
  id: string;
  name: string;
  ownerId: string;
  isPublic?: boolean;
  role?: GroupRole;
  memberCount?: number;
  membersCount?: number;
  previewMembers?: Array<{
    playerId: string;
    playerName?: string | null;
    discordAvatarUrl?: string | null;
    avatarUrl?: string | null;
    avatar?: string[] | null;
    badges?: string[] | null;
  }>;
  unreadCount?: number;
  createdAt?: string;
  updatedAt?: string;
  lastMessageAt?: string | null;
  [key: string]: any;
}

export interface GroupMember {
  playerId: string;
  name?: string | null;
  avatarUrl?: string | null;
  avatar?: string[] | null;
  badges?: string[] | null;
  joinedAt?: string;
  lastEventAt?: string | null;
  isOnline?: boolean;
  roomId?: string | null;
  role?: GroupRole;
  [key: string]: any;
}

export interface GroupDetails {
  group?: GroupSummary;
  members?: GroupMember[];
  [key: string]: any;
}

export interface GroupMessage {
  id: number;
  groupId: string;
  senderId: string;
  senderName?: string | null;
  senderAvatarUrl?: string | null;
  text?: string;
  body?: string;
  createdAt: string;
  readAt?: string | null;
  [key: string]: any;
}

export interface GroupActor {
  playerId: string;
  name?: string | null;
  avatar?: string[] | null;
  avatarUrl?: string | null;
}

export interface GroupMessageEvent {
  groupId: number;
  message: {
    id: number;
    senderId: string;
    sender: GroupActor;
    body: string;
    createdAt: string;
  };
}

export interface GroupReadEvent {
  groupId: number;
  readerId: string;
  reader: GroupActor;
  messageId: number;
  readAt: string;
}

export interface GroupMemberAddedEvent {
  groupId: number;
  groupName?: string;
  member: GroupActor;
  addedBy?: string;
  createdAt?: string;
}

export interface GroupMemberRemovedEvent {
  groupId: number;
  member: GroupActor;
  removedBy?: string;
  removedAt?: string;
}

export interface GroupUpdatedEvent {
  groupId: number;
  name: string;
  actor: GroupActor;
  updatedAt: string;
}

export interface GroupDeletedEvent {
  groupId: number;
  deletedBy: string;
  actor: GroupActor;
  deletedAt: string;
}

export interface GroupRoleChangedEvent {
  groupId: number;
  member: GroupActor;
  oldRole: GroupRole;
  newRole: GroupRole;
  changedBy: string;
  changedAt: string;
}

export interface GroupEventHandlers {
  onConnected?: (payload: { playerId: string; lastEventId?: number }) => void;
  onMessage?: (payload: GroupMessageEvent) => void;
  onMemberAdded?: (payload: GroupMemberAddedEvent) => void;
  onMemberRemoved?: (payload: GroupMemberRemovedEvent) => void;
  onUpdated?: (payload: GroupUpdatedEvent) => void;
  onDeleted?: (payload: GroupDeletedEvent) => void;
  onRoleChanged?: (payload: GroupRoleChangedEvent) => void;
  onRead?: (payload: GroupReadEvent) => void;
  onError?: (event: Event) => void;
}

// ========== Message Types ==========

export interface DirectMessage {
  id: number;
  conversationId: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  deliveredAt: string;
  readAt: string | null;
}

export interface MessagesReadResult {
  updated: number;
}

export interface ReadReceipt {
  conversationId: string;
  readerId: string;
  upToId: number;
  readAt: string;
}

export interface GroupReadReceipt {
  groupId: number;
  readerId: string;
  messageId: number;
  readAt: string;
}

export interface MessagesStreamHandlers {
  onConnected?: (payload: { playerId: string }) => void;
  onMessage?: (message: DirectMessage) => void;
  onRead?: (receipt: ReadReceipt) => void;
  onError?: (event: Event) => void;
}

// ========== Presence Types ==========

export interface PresencePayload {
  playerId: string;
  online: boolean;
  lastEventAt: string;
  roomId: string | null;
}

// ========== Welcome Event ==========

export interface WelcomeFriend {
  playerId: string;
  name: string | null;
  avatarUrl: string | null;
  avatar: string[] | null;
  badges?: string[] | null;
  lastEventAt: string | null;
  isOnline: boolean;
  roomId: string | null;
}

export interface WelcomeFriendRequest {
  fromPlayerId?: string;
  toPlayerId?: string;
  otherPlayerId: string;
  playerName?: string | null;
  avatarUrl?: string | null;
  badges?: string[] | null;
  createdAt: string;
}

export interface WelcomeGroup {
  id: number;
  name: string;
  ownerId: string;
  role: string;
  memberCount: number;
  previewMembers: Array<{
    playerId: string;
    playerName?: string | null;
    discordAvatarUrl?: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface WelcomeFriendConversation {
  conversationId: string;
  otherPlayerId: string;
  otherPlayerName?: string | null;
  otherPlayerAvatarUrl?: string | null;
  messages: Array<{
    id: number;
    senderId: string;
    recipientId: string;
    body: string;
    createdAt: string;
    readAt: string | null;
  }>;
  unreadCount: number;
}

export interface WelcomeGroupConversation {
  groupId: number;
  groupName: string;
  messages: Array<{
    id: number;
    senderId: string;
    body: string;
    createdAt: string;
  }>;
  unreadCount: number;
}

export interface WelcomeConversations {
  friends: WelcomeFriendConversation[];
  groups: WelcomeGroupConversation[];
}

export interface PrivacySettings {
  showGarden: boolean;
  showInventory: boolean;
  showCoins: boolean;
  showActivityLog: boolean;
  showJournal: boolean;
  showStats: boolean;
  hideRoomFromPublicList: boolean;
}

export interface MyProfile {
  playerId: string;
  name: string;
  avatarUrl?: string | null;
  avatar?: string[] | null;
  badges?: string[] | null;
  privacy: PrivacySettings;
}

export interface WelcomeGroupMember {
  playerId: string;
  name: string | null;
  avatarUrl: string | null;
  avatar: string[] | null;
  badges?: string[] | null;
  lastEventAt: string | null;
  roomId: string | null;
  isOnline: boolean;
  groupIds: number[];
}

export interface WelcomePayload {
  friends: WelcomeFriend[];
  friendRequests: {
    incoming: WelcomeFriendRequest[];
    outgoing: WelcomeFriendRequest[];
  };
  modPlayers?: Array<{
    playerId: string;
    playerName: string;
    avatarUrl?: string | null;
    avatar?: string[] | null;
    lastEventAt?: string | null;
    badges?: string[] | null;
  }>;
  groups: WelcomeGroup[];
  groupMembers?: WelcomeGroupMember[];
  publicGroups?: Array<{
    id: number;
    name: string;
    ownerId: string;
    memberCount: number;
    previewMembers: Array<{
      playerId: string;
      playerName?: string | null;
      discordAvatarUrl?: string | null;
      avatar?: string[] | null;
      badges?: string[] | null;
    }>;
    createdAt: string;
    updatedAt: string;
  }>;
  conversations: WelcomeConversations;
  publicRooms?: Room[];
  myProfile?: MyProfile;
  leaderboard?: {
    coins: {
      top: LeaderboardRow[];
      myRank: LeaderboardRow | null;
    };
    eggsHatched: {
      top: LeaderboardRow[];
      myRank: LeaderboardRow | null;
    };
    petJournal?: {
      top: LeaderboardRow[];
      myRank: LeaderboardRow | null;
      meta?: { totalPets?: number };
    };
  };
}

// ========== AI Chat Types ==========

export interface AiMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface AiChatResponse {
  userMessageId: number;
  assistantMessageId: number;
  response: string;
  createdAt: string;
}

export interface AiHistoryResponse {
  messages: AiMessage[];
}

export interface AiMessageEvent {
  userMessageId: number;
  assistantMessageId: number;
  response: string;
  createdAt: string;
}

// ========== Internal Types ==========

export interface UnifiedEvent {
  id: number;
  type: string;
  data: any;
  ts: string;
}

export interface UnifiedPollResponse {
  playerId: string;
  lastEventId: number;
  serverSessionId: string;
  events: UnifiedEvent[];
}

export type UnifiedSubscriber = {
  onConnected?: (payload: { playerId: string; lastEventId?: number }) => void;
  onEvent: (eventName: string, data: any) => void;
  onError?: (event: Event) => void;
};

// ========== Leaderboard Types ==========

export interface LeaderboardRow {
  playerId: string | null;       // "null" string for anonymous players
  playerName: string | null;     // "anonymous" for anonymous players
  avatarUrl: string | null;
  avatar: string[] | null;
  badges?: string[] | null;
  rank: number;
  total: number;                 // The value for the category (coins or eggsHatched)
  rankChange: number | null;     // +2, -3, 0, null (no snapshot yet)
}

export interface LeaderboardCategoryData {
  top: LeaderboardRow[];
  myRank: LeaderboardRow | null;
}

export interface LeaderboardData {
  coins: LeaderboardCategoryData;
  eggsHatched: LeaderboardCategoryData;
  petJournal: LeaderboardCategoryData;
}

/**
 * Types d'items supportés par le leaderboard `/leaderboard/items`.
 * Note: `Seed` et `Produce` partagent `species` mais sont distingués via `itemType` côté serveur.
 */
export type ItemLeaderboardType = "Seed" | "Egg" | "Tool" | "Decor" | "Produce";

export interface LeaderboardPetJournalResponse {
  rows: LeaderboardRow[];
  myRank?: LeaderboardRow | null;
  meta?: { totalPets?: number };
}

export interface PlayerJournalVariantEntry {
  variant: string;
  createdAt: number;
}

export interface PlayerJournalAbilityEntry {
  ability: string;
  createdAt: number;
}

export interface PlayerJournalPetEntry {
  variantsLogged: PlayerJournalVariantEntry[];
  abilitiesLogged?: PlayerJournalAbilityEntry[];
}

export interface PlayerJournalResponse {
  journal: {
    pets?: Record<string, PlayerJournalPetEntry>;
    produce?: Record<string, unknown>;
  };
  score?: {
    total: number;
    rank: number;
  };
  meta?: { totalPets?: number };
}
