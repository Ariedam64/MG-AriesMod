// src/services/companion/speech.ts
// Remplace le texte que le jeu fait dire au PNJ détourné.
//
// Point d'interception
// --------------------
// L'action « Talk » du jeu se résume à :
//   set(npcChatBubblesAtom, { [npcId]: { seq, playerId, message, timestamp, tags } })
// Aucun réseau. En enveloppant le `write` de cet atom primitif, on réécrit
// `message` AVANT qu'il ne soit stocké : la réplique d'origine n'existe donc
// jamais, et rien ne clignote — contrairement à une réécriture après coup, où le
// rendu afficherait le texte du jeu pendant une frame.
//
// Pourquoi pas `fakeAtoms`
// ------------------------
// `fakeAtoms` patche `read()` et appelle l'original SANS receveur. Le `read` et
// le `write` par défaut de Jotai s'appuient sur `this` : les invoquer détachés
// les casse. On enveloppe donc ici à la main, avec une fonction classique et
// `.call(this, …)`.
//
// Réservation : ce module est le seul à envelopper `npcChatBubblesAtom.write`.
// Deux enveloppes concurrentes se marcheraient dessus au démontage.

import { getAtomByLabel } from "../../store/jotai";

const CHAT_BUBBLES_LABEL = "npcChatBubblesAtom";

/**
 * Marque les bulles que le mod écrit lui-même (`Companion.say`). Sans elle, nos
 * propres messages repasseraient par le résolveur et seraient réécrits.
 */
export const AUTHORED_BY_MOD = "ariesAuthored";

type BubbleEntry = { playerId?: string; message?: string; [key: string]: unknown };
type BubblePayload = Record<string, BubbleEntry>;

/** Rend le texte à dire, ou `null` pour laisser passer celui du jeu. */
export type MessageResolver = (npcId: string, originalMessage: string) => string | null;

type Wrapped = { atom: any; original: (...args: unknown[]) => unknown };

let wrapped: Wrapped | null = null;
let resolver: MessageResolver | null = null;
/** playerId dont les répliques doivent être réécrites. */
let targetNpcId: string | null = null;

/**
 * Réécrit le payload sortant si — et seulement si — il concerne notre PNJ.
 * Les bulles des autres PNJ passent inchangées.
 */
function rewritePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!targetNpcId || !resolver) return payload;

  const entries = payload as BubblePayload;
  const entry = entries[targetNpcId];
  if (!entry || typeof entry !== "object") return payload;
  if (entry[AUTHORED_BY_MOD] === true) return payload;

  const original = typeof entry.message === "string" ? entry.message : "";
  let replacement: string | null = null;
  try {
    replacement = resolver(targetNpcId, original);
  } catch {
    return payload;
  }
  if (!replacement || replacement === original) return payload;

  return { ...entries, [targetNpcId]: { ...entry, message: replacement } };
}

/**
 * Installe l'enveloppe. Idempotent : réappeler ne fait que remplacer la cible et
 * le résolveur, sans empiler les enveloppes.
 */
export function installSpeechRewriter(npcId: string, resolve: MessageResolver): boolean {
  targetNpcId = npcId;
  resolver = resolve;
  if (wrapped) return true;

  const atom = getAtomByLabel(CHAT_BUBBLES_LABEL);
  if (!atom || typeof atom.write !== "function") return false;

  const original = atom.write as (...args: unknown[]) => unknown;
  // Fonction classique (pas fléchée) : le `write` par défaut de Jotai lit `this`.
  atom.write = function (this: unknown, get: unknown, set: unknown, update: unknown, ...rest: unknown[]) {
    // Le jeu écrit toujours une valeur ; on ne touche pas aux mises à jour
    // fonctionnelles, dont on ne peut pas connaître le résultat sans l'appliquer.
    const next = typeof update === "function" ? update : rewritePayload(update);
    return original.call(this, get, set, next, ...rest);
  };

  wrapped = { atom, original };
  return true;
}

/** Retire l'enveloppe et restaure le `write` d'origine. Sûr à appeler plusieurs fois. */
export function uninstallSpeechRewriter(): void {
  targetNpcId = null;
  resolver = null;
  if (!wrapped) return;
  try {
    wrapped.atom.write = wrapped.original;
  } catch {}
  wrapped = null;
}

export function isSpeechRewriterInstalled(): boolean {
  return wrapped !== null;
}
