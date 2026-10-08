// src/services/companion/emote.ts
// Fait jouer une emote au PNJ du companion.
//
// Comment ça marche
// -----------------
// Le jeu ne stocke plus les emotes : il les recalcule à partir des entrées
// `kind: "emote"` du chat de la room, que lit `emoteSourceAtom` (bundle 1299,
// chunk emoteAtoms). La couche avatar applique ensuite le résultat à TOUTES ses
// vues, PNJ compris :
//
//   onPlayerEmoteTypesChanged() {
//     let t = get(<emotes calculées depuis emoteSourceAtom>);
//     for (let [id, view] of this.views) view.setEmoteType(t[id] ?? Idle);
//   }
//
// On patche donc la lecture de `emoteSourceAtom` (via `fakeAtoms`, comme
// `injection.ts` le fait pour les positions) pour y ajouter une entrée au nom
// de notre PNJ. Le tick du companion force le recalcul à l'instant voulu.
//
// Avant ce détour, le mod écrivait `playerEmoteTypesAtom`. Le jeu a supprimé
// cet atom en passant au calcul depuis le chat, et l'écriture ne faisait plus
// rien, sans la moindre erreur : aucune emote du companion ne s'affichait.
//
// Ce que ça n'est pas
// -------------------
// Rien ne part sur le réseau, et nos entrées n'apparaissent pas dans le fil du
// chat, qui lit l'état de room directement. Personne d'autre ne voit la pose,
// et le son, joué à la réception d'une vraie emote, ne se déclenche pas.
//
// Réservation : ce module est le seul à poser un fake sur `emoteSourceAtom`.

import { fakeHide, fakeShow, fakeUpdate, type FakeConfig } from "../../game/fakeAtoms";
import { COMPANION_TICK_LABEL, bumpTick, ensureTickAtom } from "./tick";
import { getWorldSystem } from "../../game/pixi/tileObjects";
import { EmoteType, companionEmoteEntry, cutTalking, emoteStartDelay, mergeEmoteSource } from "./emoteTypes";

const EMOTE_SOURCE_LABEL = "emoteSourceAtom";

/**
 * Système `avatar` du jeu, qui tient la vue de chaque joueur et PNJ.
 *
 * Atteint par le registre de systèmes que la capture du système de tuiles a
 * gardé (les deux sont posés sur la même scope monde). `null` quand ce
 * registre manque : on retombe alors sur l'attente de la fin de Talking.
 */
function avatarSystem(): any | null {
  try {
    return getWorldSystem("avatar");
  } catch {
    return null;
  }
}

type EmotePatch = { entries: unknown[] };

const EMOTE_PATCH: FakeConfig<any> = {
  label: EMOTE_SOURCE_LABEL,
  // Sans elle, le recalcul n'aurait lieu qu'au prochain changement de l'état
  // de room : la pose partirait en retard, et le retour au repos aussi.
  extraDeps: [COMPANION_TICK_LABEL],
  merge: (real: unknown, fake: EmotePatch) => mergeEmoteSource(real, fake),
};

/**
 * Durée d'une emote, alignée sur ce que le jeu s'impose.
 *
 * Son `emote_emoteCooldownSeconds` vaut 1,5 s. Nos entrées étant datées dans le
 * futur (cf. `companionEmoteEntry`), c'est nous qui les retirons au bout de ce
 * délai ; rien d'autre ne ramènerait l'avatar au repos.
 */
const EMOTE_DURATION_MS = 1500;

let installed = false;
let releaseTimer: number | null = null;
/** PNJ dont une emote est en cours, pour savoir quoi remettre au repos. */
let posing: string | null = null;
/** Pose en attente de la fin de Talking. La plus récente remplace la précédente. */
let startTimer: number | null = null;
/** Dernière bulle de chaque PNJ, pour savoir quand Talking s'éteint. */
const lastSpokeAt = new Map<string, number>();

/**
 * Note qu'un PNJ vient de parler.
 *
 * Appelé par `speech.ts` pour chaque bulle de notre PNJ, celles du jeu comme
 * celles du mod : le jeu relance Talking pour toutes, sans distinction.
 */
export function markSpoke(playerId: string, at = Date.now()): void {
  if (playerId) lastSpokeAt.set(playerId, at);
}

/** Pose nos entrées dans la source des emotes, et force le recalcul. */
async function writeEntries(entries: unknown[]): Promise<boolean> {
  const payload: EmotePatch = { entries };
  try {
    if (!installed) {
      // Le tick doit exister avant la première lecture patchée, sinon
      // `extraDeps` ne résout rien et la dépendance n'est jamais enregistrée.
      ensureTickAtom();
      await fakeShow(EMOTE_PATCH, payload);
      installed = true;
    } else {
      await fakeUpdate(EMOTE_SOURCE_LABEL, payload);
    }
    await bumpTick();
    return true;
  } catch {
    // Source introuvable (le jeu l'a encore renommée) : pas de pose, rien de pire.
    return false;
  }
}

/** Retire notre entrée : le jeu ne voit plus que les siennes. */
async function rest(): Promise<void> {
  if (!installed) return;
  await writeEntries([]);
}

function cancelPending(): void {
  if (releaseTimer === null) return;
  window.clearTimeout(releaseTimer);
  releaseTimer = null;
}

function cancelStart(): void {
  if (startTimer === null) return;
  window.clearTimeout(startTimer);
  startTimer = null;
}

/**
 * Joue une emote, et la retire d'elle-même.
 *
 * Talking et la pose se superposent mal : la bouche continue de bouger sous la
 * pose. Quand la vue du companion est à portée, on éteint Talking et la pose
 * part tout de suite, à la place de la parole. Sinon, on attend qu'il ait fini
 * de parler (cf. `emoteStartDelay`), en se recalant sur toute nouvelle bulle.
 * Une nouvelle pose demandée entre-temps remplace celle-ci.
 */
export async function playEmote(
  playerId: string,
  emote: EmoteType,
  durationMs = EMOTE_DURATION_MS
): Promise<void> {
  if (!playerId || emote === EmoteType.Idle) return;

  cancelStart();
  const avatar = avatarSystem();
  const canCut = !!avatar?.views?.has?.(playerId);
  const delay = emoteStartDelay(lastSpokeAt.get(playerId) ?? null, Date.now(), canCut);
  if (delay > 0) {
    startTimer = window.setTimeout(() => {
      startTimer = null;
      void playEmote(playerId, emote, durationMs);
    }, delay);
    return;
  }

  // Encore dans une pose : on repasse par le repos. Le jeu n'applique une
  // emote que si elle change, et réécrire la même valeur ne relancerait rien.
  if (releaseTimer !== null && posing === playerId) {
    cancelPending();
    await rest();
    await new Promise((resolve) => setTimeout(resolve, 60));
  }

  // Une emote qui en interrompt une autre reprend le compte à zéro, sinon le
  // minuteur de la première remettrait la seconde au repos avant l'heure.
  cancelPending();
  posing = playerId;

  // La pose remplace la parole : bouche qui bouge et points d'interrogation ne
  // vont pas ensemble. Une seconde passe rattrape une bulle que le jeu aurait
  // livrée juste après nous et qui aurait rallumé Talking.
  if (canCut) {
    cutTalking(avatar, playerId);
    window.setTimeout(() => {
      if (posing === playerId) cutTalking(avatarSystem(), playerId);
    }, 80);
  }

  if (!(await writeEntries([companionEmoteEntry(playerId, emote, Date.now())]))) {
    posing = null;
    return;
  }

  releaseTimer = window.setTimeout(() => {
    releaseTimer = null;
    posing = null;
    void rest();
  }, durationMs);
}

/**
 * Remet le PNJ au repos tout de suite, et retire le patch.
 *
 * À appeler à l'arrêt du companion : notre entrée survivrait sinon à sa
 * disparition, et figerait dans la dernière pose le vrai PNJ qu'on lui
 * empruntait.
 */
export async function stopEmote(): Promise<void> {
  cancelStart();
  cancelPending();
  posing = null;
  if (!installed) return;
  try {
    await fakeHide(EMOTE_SOURCE_LABEL);
    await bumpTick();
  } catch {}
  installed = false;
}
