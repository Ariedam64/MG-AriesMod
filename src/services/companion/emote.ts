// src/services/companion/emote.ts
// Fait jouer une emote au PNJ du companion.
//
// Comment ça marche
// -----------------
// Le jeu tient un dico `{ playerId -> emote }` dans `playerEmoteTypesAtom`, et
// la couche avatar le rediffuse sur TOUTES ses vues, PNJ compris :
//
//   onPlayerEmoteTypesChanged() {
//     let t = get(playerEmoteTypesAtom);
//     for (let [id, view] of this.views) view.setEmoteType(t[id] ?? Idle);
//   }
//
// C'est la même map de vues que celle qui porte les bulles, et notre companion
// y a son entrée sous son `npcId`. Écrire dedans suffit donc à l'animer.
//
// Ce que ça n'est pas
// -------------------
// Rien ne part sur le réseau. Le jeu, lui, n'alimente cet atom qu'en recevant
// un événement `Emote` du serveur ; personne d'autre ne voit donc l'emote, et
// le son — joué au même endroit, à la réception — ne se déclenche pas non plus.
// C'est du décor local, au même titre que les trajets du companion.
//
// Réservation : ce module est le seul à écrire `playerEmoteTypesAtom`.

import { makeAtom } from "../../store/hub";
import { EmoteType } from "./emoteTypes";

const EMOTES_LABEL = "playerEmoteTypesAtom";

const playerEmotes = makeAtom<Record<string, number>>(EMOTES_LABEL);

/**
 * Durée d'une emote, alignée sur ce que le jeu s'impose.
 *
 * Son `emote_emoteCooldownSeconds` vaut 1,5 s, et c'est aussi le délai au bout
 * duquel il retire l'entrée qu'il vient d'écrire. Ce retrait n'est pas un
 * détail : rien ne ramène une vue au repos toute seule, donc sans lui l'avatar
 * resterait figé dans la pose jusqu'à la prochaine emote.
 */
const EMOTE_DURATION_MS = 1500;

let releaseTimer: number | null = null;
/** PNJ dont une emote est en cours, pour savoir quoi remettre au repos. */
let posing: string | null = null;

function record(previous: unknown): Record<string, number> {
  return previous && typeof previous === "object" ? (previous as Record<string, number>) : {};
}

/** Retire notre entrée sans toucher à celles des autres joueurs. */
async function rest(playerId: string): Promise<void> {
  try {
    await playerEmotes.update((previous) => {
      const current = record(previous);
      if (!(playerId in current)) return current;
      const next = { ...current };
      delete next[playerId];
      return next;
    });
  } catch {
    // Le PNJ garde sa pose une seconde de trop : ça ne vaut pas un incident.
  }
}

function cancelPending(): void {
  if (releaseTimer === null) return;
  window.clearTimeout(releaseTimer);
  releaseTimer = null;
}

/**
 * Joue une emote, et la retire d'elle-même.
 *
 * L'écriture fusionne le dico plutôt que de le remplacer : les emotes des
 * autres joueurs y vivent aussi, et les effacer ferait retomber au repos
 * quelqu'un qui vient de cliquer.
 */
export async function playEmote(
  playerId: string,
  emote: EmoteType,
  durationMs = EMOTE_DURATION_MS
): Promise<void> {
  if (!playerId || emote === EmoteType.Idle) return;

  // Une emote qui en interrompt une autre reprend le compte à zéro, sinon le
  // minuteur de la première remettrait la seconde au repos avant l'heure.
  cancelPending();
  posing = playerId;

  try {
    await playerEmotes.update((previous) => ({ ...record(previous), [playerId]: emote }));
  } catch {
    posing = null;
    return;
  }

  releaseTimer = window.setTimeout(() => {
    releaseTimer = null;
    posing = null;
    void rest(playerId);
  }, durationMs);
}

/**
 * Remet le PNJ au repos tout de suite.
 *
 * À appeler à l'arrêt du companion : notre entrée survivrait sinon à sa
 * disparition, et figerait dans la dernière pose le vrai PNJ qu'on lui
 * empruntait.
 */
export async function stopEmote(): Promise<void> {
  cancelPending();
  const playerId = posing;
  posing = null;
  if (playerId) await rest(playerId);
}
