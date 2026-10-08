export type FriendSettings = {
  showOnlineFriendsOnly: boolean;
  hideRoomFromPublicList: boolean;
  messageSoundEnabled: boolean;
  friendRequestSoundEnabled: boolean;
  showGarden: boolean;
  showInventory: boolean;
  showCoins: boolean;
  showActivityLog: boolean;
  showJournal: boolean;
  showStats: boolean;
};


export const DEFAULT_FRIEND_SETTINGS: FriendSettings = {
  showOnlineFriendsOnly: false,
  hideRoomFromPublicList: false,
  messageSoundEnabled: true,
  friendRequestSoundEnabled: true,
  showGarden: true,
  showInventory: true,
  showCoins: true,
  showActivityLog: true,
  showJournal: true,
  showStats: true,
};
