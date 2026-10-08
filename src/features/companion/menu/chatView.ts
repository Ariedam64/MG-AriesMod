// Draws the chat thread, modelled on the Community Hub chat.
//
// Presentation only: nothing here reads the game or sends a command.
//
// The thread is not symmetric. The player does not type: their bubbles are
// *commands* they triggered, shown on the right. The companion answers on the
// left. `system` messages (progress, refusals, cancellations) are nobody's
// words: they show centred, like an event log.

import { color } from "../../../ui/kit/theme";
import type { BubbleTag } from "../chat/bubbleTags";
import type { ChatMessage } from "../chat/log";
import { renderTagged, tagIcons } from "./chatIcons";
import { styled } from "./dom";
import { fillWithPortrait } from "./npcAvatar";

/** Two messages from the same author within this window are drawn together. */
const GROUP_WINDOW_MS = 2 * 60 * 1000;

const AVATAR_PX = 26;
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
  return [...tagIcons(icons, sizePx), styled("span", {}, text)];
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

export function dateSeparator(label: string): HTMLElement {
  const line = () => styled("div", { flex: "1", height: "1px", background: color.border });
  const text = styled(
    "div",
    {
      fontSize: "10px",
      fontWeight: "600",
      color: color.textDim,
      whiteSpace: "nowrap",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
    },
    label,
  );
  const wrap = styled("div", { display: "flex", alignItems: "center", gap: "10px", margin: "10px 0 6px" });
  wrap.append(line(), text, line());
  return wrap;
}

/** A centred event line: progress, refusal, cancellation. */
function systemLine(text: string, icons?: BubbleTag[], positioned = false): HTMLElement {
  const line = styled("div", {
    alignSelf: "center",
    fontSize: "11px",
    color: color.textDim,
    textAlign: "center",
    padding: "2px 8px",
    maxWidth: "90%",
  });
  // These lines carry the news as it comes ("this pet was fed", "a Bee came
  // out"): that is where a thumbnail tells the most.
  line.append(...contentOf(text, icons, positioned, SYSTEM_ICON_PX));
  return line;
}

/** What it takes to draw the portrait: the identity for the outfit, the name for the fallback. */
export type NpcIdentityView = { npcId: string | null; name: string | null };

/**
 * The companion's portrait: the one of the NPC whose look he borrows.
 *
 * Composed from its cosmetics, like the game composes its characters. The
 * initial goes first and stays as the fallback: the outfit arrives
 * asynchronously, and may not arrive at all.
 */
function avatar(identity: NpcIdentityView | null, sizePx = AVATAR_PX): HTMLElement {
  const el = styled("div", {
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    flexShrink: "0",
    borderRadius: "50%",
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${Math.round(sizePx * 0.45)}px`,
    fontWeight: "600",
    color: color.accent,
    background: color.accentHover,
  });

  const name = (identity?.name ?? "").trim();
  if (name) el.textContent = name.charAt(0).toUpperCase();
  fillWithPortrait(el, identity?.npcId ?? null);
  return el;
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

  const row = styled("div", {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
    justifyContent: outgoing ? "flex-end" : "flex-start",
    ...(flags.isFirstInGroup ? {} : { marginTop: "-4px" }),
  });

  if (!outgoing) row.append(flags.isLastInGroup ? avatar(identity) : styled("div", { width: `${AVATAR_PX}px`, flexShrink: "0" }));

  const column = styled("div", {
    maxWidth: "78%",
    display: "flex",
    flexDirection: "column",
    gap: flags.isLastInGroup ? "3px" : "0",
    alignItems: outgoing ? "flex-end" : "flex-start",
  });

  const bubble = styled("div", {
    padding: "7px 11px",
    borderRadius: outgoing ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
    fontSize: "12.5px",
    lineHeight: "1.5",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    background: outgoing ? color.accentSoft : color.hoverBg,
    border: `1px solid ${outgoing ? color.accentBorder : color.border}`,
    color: color.text,
  });
  bubble.append(...contentOf(message.text, message.icons, message.positioned, BUBBLE_ICON_PX));
  column.append(bubble);

  if (flags.isLastInGroup) {
    column.append(styled("div", { fontSize: "10px", color: color.textDim }, formatMessageTime(message.atMs)));
  }

  row.append(column);
  return row;
}

type ChatHeader = {
  root: HTMLElement;
  setStatus(text: string, busy: boolean): void;
  /** The borrowed NPC is only known once the companion has started. */
  setIdentity(identity: NpcIdentityView): void;
};

/** A conversation header: who is talking on the left, their state underneath. */
export function chatHeader(name: string): ChatHeader {
  const root = styled("div", {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderBottom: `1px solid ${color.border}`,
  });

  const portraitSlot = styled("div", { display: "flex", flexShrink: "0" });
  portraitSlot.append(avatar(null, 32));

  const title = styled("div", { fontSize: "13px", fontWeight: "600", color: color.text }, name);
  const status = styled("div", { fontSize: "11px", color: color.textDim });
  const info = styled("div", { display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" });
  info.append(title, status);
  root.append(portraitSlot, info);

  let shownIdentity: string | null = null;

  return {
    root,
    setStatus(text, busy) {
      status.textContent = text;
      status.style.color = busy ? color.accent : color.textDim;
    },
    setIdentity(identity) {
      // Redrawing the portrait on every render would compose it again.
      if (identity.npcId === shownIdentity) return;
      shownIdentity = identity.npcId;
      portraitSlot.replaceChildren(avatar(identity, 32));
      title.textContent = identity.name || name;
    },
  };
}

/** The thread's container: a fixed height so the layout does not jump. */
export function threadBody(): HTMLElement {
  const body = styled("div", {
    height: "300px",
    overflowY: "auto",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  });
  body.className = "qmm-scroll";
  return body;
}

/** A placeholder while nothing has been said yet. */
export function emptyThread(text: string): HTMLElement {
  const wrap = styled("div", {
    margin: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    color: color.textDim,
    textAlign: "center",
  });
  wrap.append(styled("div", { fontSize: "12px", maxWidth: "220px", lineHeight: "1.5" }, text));
  return wrap;
}

/** The bottom bar: it stands in for an input field, and only sends actions. */
export function actionBar(): HTMLElement {
  return styled("div", {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px",
    padding: "8px 10px",
    borderTop: `1px solid ${color.border}`,
  });
}

/** A quiet note in the action bar. */
export function barHint(text: string, tone: "dim" | "warn" = "dim"): HTMLElement {
  return styled("div", { fontSize: "11px", color: tone === "warn" ? color.warn : color.textDim, marginLeft: "auto" }, text);
}
