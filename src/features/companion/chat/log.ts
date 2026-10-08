// The companion's conversation log: the message shape and a bounded thread.
//
// Always returns a new log and never mutates the one given, so the menu can
// compare references to know whether to redraw.

import type { BubbleTag } from "./bubbleTags";

export type ChatAuthor = "companion" | "you";

/**
 * `command` is the only kind the player sends: they do not type, they trigger
 * an action, and the thread keeps a trace of it.
 */
export type ChatKind = "command" | "reply" | "report" | "system";

type MessageBody = {
  from: ChatAuthor;
  kind: ChatKind;
  text: string;
  atMs: number;
  /** The proposal attached, waiting for a confirmation. */
  proposalId?: string;
  /**
   * The message's thumbnails in the thread.
   *
   * The same descriptions as the in-game bubbles: one source for both
   * renderings, or one would end up saying something else. The thread draws
   * them from the mod's atlas, the bubble with the game's markup.
   */
  icons?: BubbleTag[];
  /**
   * `text` carries the `<0/>` markup and each icon goes in its place.
   *
   * False when the thumbnails come from a bubble: they then gather in front of
   * the text, since there is no knowing where they went in a sentence that is
   * not theirs.
   */
  positioned?: boolean;
};

export type ChatMessage = MessageBody & { id: string };

/** Past this, the oldest messages are forgotten. */
export const MAX_MESSAGES = 200;

export type ChatLog = {
  messages: ChatMessage[];
  /** Incremented on every append: gives stable, ordered ids. */
  nextSeq: number;
};

export function emptyLog(): ChatLog {
  return { messages: [], nextSeq: 1 };
}

export function append(log: ChatLog, message: MessageBody): ChatLog {
  const entry: ChatMessage = {
    id: `m${log.nextSeq}`,
    atMs: message.atMs,
    from: message.from,
    kind: message.kind,
    text: message.text,
    ...(message.proposalId ? { proposalId: message.proposalId } : {}),
    ...(message.icons && message.icons.length > 0 ? { icons: message.icons } : {}),
    ...(message.positioned ? { positioned: true } : {}),
  };
  const messages = [...log.messages, entry];
  return {
    messages: messages.length > MAX_MESSAGES ? messages.slice(messages.length - MAX_MESSAGES) : messages,
    nextSeq: log.nextSeq + 1,
  };
}

/** Removes the proposal attached to a message once it is dealt with. */
export function clearProposal(log: ChatLog, proposalId: string): ChatLog {
  let changed = false;
  const messages = log.messages.map((entry) => {
    if (entry.proposalId !== proposalId) return entry;
    changed = true;
    const { proposalId: _dropped, ...rest } = entry;
    return rest;
  });
  return changed ? { ...log, messages } : log;
}
