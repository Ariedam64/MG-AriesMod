// src/services/companion/chat/log.ts
// Journal de conversation du companion : modèle de message + journal borné.
//
// Module PUR : rend toujours un nouveau journal, ne mute jamais l'entrée. Ça
// permet à l'UI de comparer les références pour savoir si elle doit redessiner.

export type ChatAuthor = "companion" | "you";

/**
 * `command` est le seul type émis par le joueur : il ne tape pas de texte, il
 * déclenche une action, et le fil en garde la trace.
 */
export type ChatKind = "alert" | "command" | "reply" | "report" | "system";

export type ChatMessage = {
  id: string;
  atMs: number;
  from: ChatAuthor;
  kind: ChatKind;
  text: string;
  /** Proposition attachée, en attente de confirmation. */
  proposalId?: string;
};

/** Au-delà, les plus anciens messages sont oubliés. */
export const MAX_MESSAGES = 200;

export type ChatLog = {
  messages: ChatMessage[];
  /** Incrémenté à chaque ajout : donne des identifiants stables et ordonnés. */
  nextSeq: number;
};

export function emptyLog(): ChatLog {
  return { messages: [], nextSeq: 1 };
}

export type NewMessage = {
  from: ChatAuthor;
  kind: ChatKind;
  text: string;
  atMs: number;
  proposalId?: string;
};

export function append(log: ChatLog, message: NewMessage): ChatLog {
  const entry: ChatMessage = {
    id: `m${log.nextSeq}`,
    atMs: message.atMs,
    from: message.from,
    kind: message.kind,
    text: message.text,
    ...(message.proposalId ? { proposalId: message.proposalId } : {}),
  };
  const messages = [...log.messages, entry];
  return {
    messages: messages.length > MAX_MESSAGES ? messages.slice(messages.length - MAX_MESSAGES) : messages,
    nextSeq: log.nextSeq + 1,
  };
}

/**
 * Évite qu'une alerte répétée noie le fil.
 *
 * Les sources d'alertes réémettent souvent le même état à chaque
 * rafraîchissement ; sans ce filtre, « 3 pets ont faim » apparaîtrait toutes les
 * dix secondes jusqu'à ce qu'on les nourrisse.
 */
export function appendAlertOnce(log: ChatLog, message: NewMessage, withinMs: number): ChatLog {
  const cutoff = message.atMs - withinMs;
  const duplicate = log.messages.some(
    (entry) => entry.kind === "alert" && entry.text === message.text && entry.atMs >= cutoff
  );
  return duplicate ? log : append(log, message);
}

/** Retire la proposition attachée à un message, une fois traitée. */
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
