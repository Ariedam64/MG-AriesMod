// Draws the chat thread, modelled on the Community Hub chat.
//
// Presentation only: nothing here reads the game or sends a command.
//
// The thread is not symmetric. The player does not type: their bubbles are
// *commands* they triggered, shown on the right. The companion answers on the
// left. `system` messages (progress, refusals, cancellations) are nobody's
// words: they show centred, like an event log.

import { pill } from "../../../ui/kit/badges";
import type { BubbleTag } from "../chat/bubbleTags";
import type { ChatMessage } from "../chat/log";
import { renderTagged, tagIcons } from "./chatIcons";
import { part } from "./dom";
import { portrait, type NpcIdentityView } from "./portrait";

/** Two messages from the same author within this window are drawn together. */
const GROUP_WINDOW_MS = 2 * 60 * 1000;

const AVATAR_PX = 26;
const HEADER_AVATAR_PX = 38;
/** Big enough to read, small enough not to push the line around. */
const BUBBLE_ICON_PX = 18;
const SYSTEM_ICON_PX = 15;

/**
 * A message's content: its thumbnails and its text.
 *
 * When the text carries the markup, it is cut up and each icon goes in its
 * place, next to what it names. Otherwise the thumbnails come from a bubble
 * written for another sentence, and gather in front.
 */
function contentOf(text: string, icons: BubbleTag[] | undefined, positioned: boolean | undefined, sizePx: number): Node[] {
  if (positioned) return renderTagged(text, icons, sizePx);
  return [...tagIcons(icons, sizePx), document.createTextNode(text)];
}

/** A centred message belongs to no column: it never groups. */
function isCentered(message: ChatMessage): boolean {
  return message.kind === "system";
}

export function isSameGroup(previous: ChatMessage, current: ChatMessage): boolean {
  if (isCentered(previous) || isCentered(current)) return false;
  if (previous.from !== current.from) return false;
  return current.atMs - previous.atMs < GROUP_WINDOW_MS;
}

function formatMessageTime(atMs: number): string {
  try {
    return new Date(atMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** A separator label: "Today", "Yesterday", otherwise the date. */
export function formatDayLabel(atMs: number, nowMs: number): string {
  const startOfDay = (ms: number) => {
    const date = new Date(ms);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  };
  const days = Math.round((startOfDay(nowMs) - startOfDay(atMs)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  try {
    return new Date(atMs).toLocaleDateString([], { day: "numeric", month: "short" });
  } catch {
    return "";
  }
}

/** The day a run of messages starts, as a small centred label. */
export function dateSeparator(label: string): HTMLElement {
  return part("div", "qws-cmp-day", label);
}

/** A centred event line: progress, refusal, cancellation. */
function systemLine(text: string, icons?: BubbleTag[], positioned = false): HTMLElement {
  const line = part("div", "qws-cmp-system");
  // These lines carry the news as it comes ("this pet was fed", "a Bee came
  // out"): that is where a thumbnail tells the most.
  line.append(...contentOf(text, icons, positioned, SYSTEM_ICON_PX));
  return line;
}

type BubbleFlags = {
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
};

/**
 * One thread row: avatar (last of a group only), bubble and time.
 *
 * The avatar only shows on a group's last message, with a spacer elsewhere:
 * without it the bubbles of one group would not line up.
 */
export function messageRow(message: ChatMessage, flags: BubbleFlags, identity: NpcIdentityView | null = null): HTMLElement {
  if (isCentered(message)) return systemLine(message.text, message.icons, message.positioned);

  const outgoing = message.from === "you";
  const row = part("div", "qws-cmp-msg");
  row.classList.toggle("is-out", outgoing);
  row.classList.toggle("is-cont", !flags.isFirstInGroup);

  if (!outgoing) {
    if (flags.isLastInGroup) {
      row.append(portrait(identity, AVATAR_PX));
    } else {
      const gap = part("div", "qws-cmp-avatar-gap");
      gap.style.width = `${AVATAR_PX}px`;
      row.append(gap);
    }
  }

  const column = part("div", "qws-cmp-msg__col");
  const bubble = part("div", "qws-cmp-bubble");
  bubble.append(...contentOf(message.text, message.icons, message.positioned, BUBBLE_ICON_PX));
  column.append(bubble);
  if (flags.isLastInGroup) column.append(part("div", "qws-cmp-msg__time", formatMessageTime(message.atMs)));

  row.append(column);
  return row;
}

/** `ready`: he is out and free; `busy`: working or waiting on an answer; `idle`: not out. */
export type ChatStatusTone = "ready" | "busy" | "idle";

type ChatHeader = {
  root: HTMLElement;
  setStatus(text: string, tone: ChatStatusTone): void;
  /** The borrowed NPC is only known once the companion has started. */
  setIdentity(identity: NpcIdentityView): void;
};

/** A conversation header: who is talking on the left, their state underneath. */
export function chatHeader(name: string): ChatHeader {
  const root = part("div", "qws-cmp-chat__head");

  const portraitSlot = part("div", "qws-cmp-avatar-gap");
  portraitSlot.append(portrait(null, HEADER_AVATAR_PX, true));

  const title = part("div", "qws-cmp-chat__name", name);
  const dot = part("span", "qws-cmp-dot");
  const statusText = part("span", "");
  const status = part("div", "qws-cmp-chat__status");
  status.append(dot, statusText);
  const info = part("div", "qws-cmp-chat__who");
  info.append(title, status);
  root.append(portraitSlot, info);

  let shownIdentity: string | null = null;

  return {
    root,
    setStatus(text, tone) {
      statusText.textContent = text;
      status.classList.toggle("is-busy", tone === "busy");
      dot.classList.toggle("is-busy", tone === "busy");
      dot.classList.toggle("is-ok", tone === "ready");
    },
    setIdentity(identity) {
      // Redrawing the portrait on every render would compose it again.
      if (identity.npcId === shownIdentity) return;
      shownIdentity = identity.npcId;
      portraitSlot.replaceChildren(portrait(identity, HEADER_AVATAR_PX, true));
      title.textContent = identity.name || name;
    },
  };
}

/** The thread's container: a fixed height so the layout does not jump. */
export function threadBody(): HTMLElement {
  return part("div", "qws-cmp-thread qmm-scroll");
}

/** A placeholder while nothing has been said yet. */
export function emptyThread(text: string): HTMLElement {
  return part("div", "qws-cmp-empty", text);
}

/** The bottom bar: it stands in for an input field, and only sends actions. */
export function actionBar(): HTMLElement {
  return part("div", "qws-cmp-bar");
}

/** A quiet note at the end of the action bar. */
export function barHint(text: string, tone: "dim" | "warn" = "dim"): HTMLElement {
  const note = pill(text, tone === "warn" ? "warn" : undefined);
  note.classList.add("qws-cmp-bar__end");
  return note;
}
