/**
 * Rules that features hang on the messages the game sends to the server.
 *
 * Keyed on the message type the game uses (`HarvestCrop`, `PurchaseShopItem`,
 * ...), whether the message travels inside a `QuinoaCommand` envelope or flat.
 * The socket hook calls `runOutgoing` once per message the game sends; the
 * mod's own commands never go through here, so a rule cannot block or count
 * what the mod itself sent.
 *
 * Two kinds of handler:
 *
 * - a rule decides. It can let the message through (return nothing), drop it,
 *   or hand back a replacement. Rules for one type run in the order they were
 *   registered and the first drop ends the chain, so a later rule never sees a
 *   message an earlier one blocked.
 * - an observer only watches. Observers run after every rule has let the
 *   message through, with the message as it will be sent. Counting goes here,
 *   so a blocked message is never counted.
 */

type OutgoingVerdict = void | "drop" | { replace: unknown };
export type OutgoingRule = (message: any) => OutgoingVerdict;
export type OutgoingObserver = (message: any) => void;

const rules = new Map<string, OutgoingRule[]>();
const observers = new Map<string, OutgoingObserver[]>();

function addHandler<T>(map: Map<string, T[]>, type: string, handler: T): () => void {
  const list = map.get(type);
  if (list) list.push(handler);
  else map.set(type, [handler]);

  return () => {
    const current = map.get(type);
    if (!current) return;
    const index = current.indexOf(handler);
    if (index !== -1) current.splice(index, 1);
    if (current.length === 0) map.delete(type);
  };
}

/** Adds a rule for one message type. Returns the function that removes it. */
export function interceptOutgoing(type: string, rule: OutgoingRule): () => void {
  return addHandler(rules, type, rule);
}

/** Watches the messages of one type that actually leave. Returns the function that stops it. */
export function observeOutgoing(type: string, observer: OutgoingObserver): () => void {
  return addHandler(observers, type, observer);
}

/**
 * Runs the rules, then the observers, for one outgoing message. Returns the
 * message to send (the same object when nothing replaced it), or null when a
 * rule dropped it. A handler that throws is skipped, never fatal to the send.
 */
export function runOutgoing(message: any): any | null {
  const type = message?.type;
  if (typeof type !== "string" || !type) return message;

  let current = message;
  for (const rule of [...(rules.get(type) ?? [])]) {
    try {
      const verdict = rule(current);
      if (verdict === "drop") return null;
      if (verdict && typeof verdict === "object") current = verdict.replace;
    } catch {
      // A broken rule must not take the player's action with it.
    }
  }

  for (const observer of [...(observers.get(type) ?? [])]) {
    try {
      observer(current);
    } catch {
      // Same as above.
    }
  }
  return current;
}
