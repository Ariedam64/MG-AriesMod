// ariesModAPI/types/index.ts
// Types centralisés pour l'API Aries Mod


// ========== Common Types ==========

export interface StreamHandle {
  close(): void;
}

































































export type UnifiedSubscriber = {
  onConnected?: (payload: { playerId: string; lastEventId?: number }) => void;
  onEvent: (eventName: string, data: any) => void;
  onError?: (event: Event) => void;
};









