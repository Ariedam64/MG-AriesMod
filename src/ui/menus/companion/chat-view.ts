// src/ui/menus/companion/chat-view.ts
// Rendu du fil de discussion, calé sur le chat du Community Hub.
//
// Purement présentationnel : rien ici ne lit le jeu ni n'envoie de commande.
//
// Le fil n'est pas symétrique. Le joueur n'écrit pas : ses bulles sont des
// *commandes* qu'il a déclenchées, et elles s'affichent à droite. Le companion
// répond à gauche. Les messages `system` (progression, refus, annulation) ne
// sont l'énoncé de personne : ils s'affichent centrés, comme un fil d'événement.

import { BORDER, TEAL, TEXT, TEXT_DIM, WARN, css } from "../panel-ui";
import { fillWithPortrait } from "./npc-avatar";
import type { ChatMessage } from "../../../services/companion/chat/log";
import type { BubbleTag } from "../../../services/companion/chat/bubbleTags";
import { renderTagged, tagIcons } from "./chat-icons";

/** Deux messages du même auteur dans cette fenêtre sont collés visuellement. */
export const GROUP_WINDOW_MS = 2 * 60 * 1000;

const AVATAR_PX = 26;
/** Assez grand pour se lire, assez petit pour ne pas bousculer la ligne. */
const BUBBLE_ICON_PX = 18;
const SYSTEM_ICON_PX = 15;
const OUTGOING_BG = "rgba(94,234,212,0.14)";
const OUTGOING_BORDER = "rgba(94,234,212,0.22)";
const OUTGOING_TEXT = "#d1fae5";
const INCOMING_BG = "rgba(255,255,255,0.06)";
const ALERT_BG = "rgba(251,191,36,0.10)";
const ALERT_BORDER = "rgba(251,191,36,0.28)";

/**
 * Le contenu d'un message : ses vignettes et son texte.
 *
 * Deux dispositions, selon ce qu'on sait. Quand le texte porte le balisage, on
 * le découpe et chaque icône va à sa place, contre ce qu'elle désigne. Sinon
 * les vignettes viennent d'une bulle écrite pour une autre phrase : on les
 * groupe devant, faute de savoir où elles allaient.
 */
function contentOf(text: string, icons: BubbleTag[] | undefined, positioned: boolean | undefined, sizePx: number): Node[] {
  if (positioned) return renderTagged(text, icons, sizePx);

  const label = document.createElement("span");
  label.textContent = text;
  return [...tagIcons(icons, sizePx), label];
}

/** Un message centré n'appartient à aucune colonne : il ne se groupe pas. */
export function isCentered(message: ChatMessage): boolean {
  return message.kind === "system";
}

export function isSameGroup(previous: ChatMessage, current: ChatMessage): boolean {
  if (isCentered(previous) || isCentered(current)) return false;
  if (previous.from !== current.from) return false;
  return current.atMs - previous.atMs < GROUP_WINDOW_MS;
}

export function formatMessageTime(atMs: number): string {
  try {
    return new Date(atMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

/** Étiquette de séparateur : « Today », « Yesterday », sinon la date. */
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
  const wrap = document.createElement("div");
  css(wrap, { display: "flex", alignItems: "center", gap: "10px", margin: "10px 0 6px" });

  const line = () => {
    const el = document.createElement("div");
    css(el, { flex: "1", height: "1px", background: BORDER });
    return el;
  };

  const text = document.createElement("div");
  css(text, {
    fontSize: "10px",
    fontWeight: "600",
    color: TEXT_DIM,
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  });
  text.textContent = label;

  wrap.append(line(), text, line());
  return wrap;
}

/** Ligne d'événement centrée : progression, refus, annulation. */
export function systemLine(text: string, icons?: BubbleTag[], positioned = false): HTMLElement {
  const line = document.createElement("div");
  css(line, {
    alignSelf: "center",
    fontSize: "11px",
    color: TEXT_DIM,
    textAlign: "center",
    padding: "2px 8px",
    maxWidth: "90%",
  });

  // Ces lignes portent les nouvelles au fil de l'eau : « ce pet a été nourri »,
  // « un Bee est sorti ». C'est là que la vignette apprend le plus.
  line.append(...contentOf(text, icons, positioned, SYSTEM_ICON_PX));
  return line;
}

/**
 * Portrait du companion : celui du PNJ dont il emprunte l'apparence.
 *
 * Composé depuis ses cosmétiques, comme le jeu compose ses personnages.
 * L'initiale est posée d'abord et sert de repli : la tenue arrive de façon
 * asynchrone, et peut ne pas arriver du tout.
 */
function avatar(identity: NpcIdentityView | null, sizePx = AVATAR_PX): HTMLElement {
  const el = document.createElement("div");
  css(el, {
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
    color: TEAL,
    background: "linear-gradient(135deg, rgba(94,234,212,0.25), rgba(59,130,246,0.25))",
  });

  const name = (identity?.name ?? "").trim();
  if (name) el.textContent = name.charAt(0).toUpperCase();
  fillWithPortrait(el, identity?.npcId ?? null);
  return el;
}

function spacer(): HTMLElement {
  const el = document.createElement("div");
  css(el, { width: `${AVATAR_PX}px`, flexShrink: "0" });
  return el;
}

/** De quoi dessiner le portrait : l'identité pour la tenue, le nom pour le repli. */
export type NpcIdentityView = { npcId: string | null; name: string | null };

export type BubbleFlags = {
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
};

/**
 * Une ligne du fil : avatar (dernier du groupe seulement) + bulle + horodatage.
 *
 * L'avatar n'apparaît que sur le dernier message d'un groupe, avec un
 * espaceur ailleurs : sans lui, les bulles d'un même groupe se décaleraient
 * les unes par rapport aux autres.
 */
export function messageRow(message: ChatMessage, flags: BubbleFlags, identity: NpcIdentityView | null = null): HTMLElement {
  if (isCentered(message)) return systemLine(message.text, message.icons, message.positioned);

  const outgoing = message.from === "you";
  const alerting = message.kind === "alert";

  const row = document.createElement("div");
  css(row, {
    display: "flex",
    gap: "8px",
    alignItems: "flex-end",
    justifyContent: outgoing ? "flex-end" : "flex-start",
    ...(flags.isFirstInGroup ? {} : { marginTop: "-4px" }),
  });

  if (!outgoing) row.append(flags.isLastInGroup ? avatar(identity) : spacer());

  const column = document.createElement("div");
  css(column, {
    maxWidth: "78%",
    display: "flex",
    flexDirection: "column",
    gap: flags.isLastInGroup ? "3px" : "0",
    alignItems: outgoing ? "flex-end" : "flex-start",
  });

  const bubble = document.createElement("div");
  css(bubble, {
    padding: "7px 11px",
    borderRadius: outgoing ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
    fontSize: "12.5px",
    lineHeight: "1.5",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
    background: outgoing ? OUTGOING_BG : alerting ? ALERT_BG : INCOMING_BG,
    border: `1px solid ${outgoing ? OUTGOING_BORDER : alerting ? ALERT_BORDER : BORDER}`,
    color: outgoing ? OUTGOING_TEXT : TEXT,
  });
  bubble.append(...contentOf(message.text, message.icons, message.positioned, BUBBLE_ICON_PX));
  column.append(bubble);

  if (flags.isLastInGroup) {
    const stamp = document.createElement("div");
    css(stamp, { fontSize: "10px", color: TEXT_DIM });
    stamp.textContent = formatMessageTime(message.atMs);
    column.append(stamp);
  }

  row.append(column);
  return row;
}

export type ChatHeader = {
  root: HTMLElement;
  setStatus(text: string, busy: boolean): void;
  /** Le PNJ emprunté n'est connu qu'une fois le companion démarré. */
  setIdentity(identity: NpcIdentityView): void;
};

/** En-tête façon conversation : interlocuteur à gauche, son état en sous-titre. */
export function chatHeader(name: string): ChatHeader {
  const root = document.createElement("div");
  css(root, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderBottom: `1px solid ${BORDER}`,
  });

  const portraitSlot = document.createElement("div");
  css(portraitSlot, { display: "flex", flexShrink: "0" });
  portraitSlot.append(avatar(null, 32));

  const info = document.createElement("div");
  css(info, { display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" });

  const title = document.createElement("div");
  css(title, { fontSize: "13px", fontWeight: "600", color: TEXT });
  title.textContent = name;

  const status = document.createElement("div");
  css(status, { fontSize: "11px", color: TEXT_DIM });

  info.append(title, status);
  root.append(portraitSlot, info);

  let shownIdentity: string | null = null;

  return {
    root,
    setStatus(text, busy) {
      status.textContent = text;
      css(status, { color: busy ? TEAL : TEXT_DIM });
    },
    setIdentity(identity) {
      // Refaire le portrait à chaque rendu relancerait la composition.
      if (identity.npcId === shownIdentity) return;
      shownIdentity = identity.npcId;
      portraitSlot.replaceChildren(avatar(identity, 32));
      title.textContent = identity.name || name;
    },
  };
}

/** Conteneur du fil : hauteur fixe pour que la mise en page ne saute pas. */
export function threadBody(): HTMLElement {
  const body = document.createElement("div");
  body.className = "qws-pnl-scroll";
  css(body, {
    height: "300px",
    overflowY: "auto",
    padding: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  });
  return body;
}

/** Placeholder tant qu'aucun message n'a été échangé. */
export function emptyThread(text: string): HTMLElement {
  const wrap = document.createElement("div");
  css(wrap, {
    margin: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "8px",
    color: TEXT_DIM,
    textAlign: "center",
  });

  const label = document.createElement("div");
  css(label, { fontSize: "12px", maxWidth: "220px", lineHeight: "1.5" });
  label.textContent = text;

  wrap.append(label);
  return wrap;
}

/** Barre du bas : elle remplace le champ de saisie, on n'y envoie que des actions. */
export function actionBar(): HTMLElement {
  const bar = document.createElement("div");
  css(bar, {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px",
    padding: "8px 10px",
    borderTop: `1px solid ${BORDER}`,
  });
  return bar;
}

/** Note discrète dans la barre d'actions. */
export function barHint(text: string, tone: "dim" | "warn" = "dim"): HTMLElement {
  const hint = document.createElement("div");
  css(hint, { fontSize: "11px", color: tone === "warn" ? WARN : TEXT_DIM, marginLeft: "auto" });
  hint.textContent = text;
  return hint;
}
