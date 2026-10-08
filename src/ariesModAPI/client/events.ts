// ariesModAPI/client/events.ts
// Unified event stream - choisit automatiquement SSE (web) ou long polling (Discord)

import { isDiscordActivityContext } from "../../utils/discordCsp";
import type { StreamHandle, UnifiedSubscriber } from "../types";

type UnifiedConnection = {
  playerId: string;
  mode: "sse" | "poll";
  subscribers: Set<UnifiedSubscriber>;
  handle: StreamHandle | null;
  lastEventId: number;
  connectedNotified: boolean;
  closed: boolean;
  pollPaused: boolean;
  pollAbort?: () => void;
  pollKick?: () => void;
  pollRunning: boolean;
  pollToken: number;
};

const _unifiedConnections = new Map<string, UnifiedConnection>();







// ========== Pause/Resume for Discord Long Polling ==========

let _pollPauseDepth = 0;

function pauseDiscordLongPolls(): void {
  if (!isDiscordActivityContext()) return;
  _pollPauseDepth += 1;
  for (const conn of _unifiedConnections.values()) {
    if (conn.mode !== "poll") continue;
    conn.pollPaused = true;
    conn.pollToken += 1;
    conn.pollRunning = false;
    conn.pollAbort?.();
  }
}

function resumeDiscordLongPolls(): void {
  if (!isDiscordActivityContext()) return;
  _pollPauseDepth = Math.max(0, _pollPauseDepth - 1);
  if (_pollPauseDepth > 0) return;
  for (const conn of _unifiedConnections.values()) {
    if (conn.mode !== "poll") continue;
    conn.pollPaused = false;
    conn.pollKick?.();
  }
}

export async function withDiscordPollPause<T>(fn: () => Promise<T>): Promise<T> {
  if (!isDiscordActivityContext()) return await fn();
  pauseDiscordLongPolls();
  try {
    return await fn();
  } finally {
    resumeDiscordLongPolls();
  }
}
