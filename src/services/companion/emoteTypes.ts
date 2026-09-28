// src/services/companion/emoteTypes.ts
// Les emotes du jeu, en valeurs nues.
//
// Séparé de `emote.ts`, qui traverse le pont d'état dès l'import : les règles
// qui décident QUELLE emote jouer doivent rester vérifiables hors navigateur.

/**
 * Les emotes du jeu, telles que son enum les numérote.
 *
 * Relevé dans le bundle live, chunk `RoomConnection` :
 * `Idle=-1, Clapping=0, Laughing=1, Angered=2, Crying=3, Questioning=4, Love=5`.
 * La barre du chat n'expose que 0 à 5 ; `-1` est la posture de repos, et c'est
 * aussi ce que la couche avatar applique à toute vue absente du dico.
 */
export const EmoteType = {
  Idle: -1,
  Clapping: 0,
  Laughing: 1,
  Angered: 2,
  Crying: 3,
  Questioning: 4,
  Love: 5,
} as const;

export type EmoteType = (typeof EmoteType)[keyof typeof EmoteType];

/**
 * Ce que lit `emoteSourceAtom` : les entrées du chat de la room, et la durée
 * d'affichage d'une emote.
 *
 * Le jeu ne stocke plus les emotes nulle part (bundle 1299, chunk emoteAtoms).
 * Il les recalcule à partir des entrées `kind: "emote"` du chat : la plus
 * récente de chaque joueur s'affiche, jusqu'à `lastTimestampMs` plus la durée.
 * `playerEmoteTypesAtom`, que le mod écrivait, a disparu avec ce changement, et
 * son écriture ne faisait plus rien.
 */
type EmoteSource = { entries: unknown[]; displayDurationMs: number; [key: string]: unknown };

/**
 * Avance donnée à la date de nos entrées.
 *
 * L'horloge du jeu est calée sur le serveur et le mod n'y a pas accès : une
 * entrée datée de notre `Date.now()` pourrait naître déjà expirée. Datée dans
 * le futur, elle reste affichée, et c'est `emote.ts` qui la retire à la fin de
 * la pose.
 */
const ENTRY_LEAD_MS = 60_000;

/** Entrée de chat qui fait poser le companion. */
export function companionEmoteEntry(playerId: string, emote: EmoteType, now: number) {
  return { kind: "emote", playerId, emoteType: emote, lastTimestampMs: now + ENTRY_LEAD_MS };
}

/**
 * Ajoute nos entrées à la source des emotes, APRÈS celles du jeu : le jeu
 * retient la plus récente de chaque joueur en partant de la fin.
 *
 * Seul le calcul des emotes lit cette source ; le fil du chat lit l'état de
 * room directement, donc nos entrées n'y apparaissent pas.
 */
export function mergeEmoteSource(real: unknown, fake: { entries?: unknown[] } | null | undefined): EmoteSource {
  const base = real && typeof real === "object" ? (real as EmoteSource) : ({} as EmoteSource);
  const entries = Array.isArray(base.entries) ? base.entries : [];
  const ours = Array.isArray(fake?.entries) ? fake!.entries : [];
  return { ...base, entries: ours.length ? [...entries, ...ours] : entries };
}

/**
 * Durée de l'animation Talking d'un PNJ après chaque bulle.
 *
 * Relevé dans le bundle live (1299) : `pulseNpcTalking` allume Talking à chaque
 * bulle et l'éteint au bout de `xu = 3e3`, en repartant de zéro si une autre
 * bulle arrive entre-temps.
 */
export const NPC_TALKING_MS = 3000;

/** Un souffle après la fin de Talking, pour ne pas tomber pile sur l'extinction. */
const TALKING_MARGIN_MS = 150;

/**
 * Éteint Talking sur l'avatar d'un PNJ. Rend `true` si c'est fait.
 *
 * Le système `avatar` du jeu (bundle 1299) tient ses vues dans `views`, une Map
 * playerId -> vue, et `stopNpcTalking(id, vue)` annule le compte à rebours de
 * 3 s avant d'éteindre Talking : c'est la voie à prendre, sinon le minuteur du
 * jeu le rallumerait pour rien. À défaut, on éteint la vue elle-même.
 */
export function cutTalking(avatarSystem: unknown, playerId: string): boolean {
  const system = avatarSystem as {
    views?: { get?: (id: string) => unknown };
    stopNpcTalking?: (id: string, view: unknown) => void;
  } | null;
  if (!system || typeof system.views?.get !== "function") return false;
  const view = system.views.get(playerId) as { setTalking?: (on: boolean) => void } | undefined;
  if (!view) return false;
  try {
    if (typeof system.stopNpcTalking === "function") {
      system.stopNpcTalking(playerId, view);
      return true;
    }
    if (typeof view.setTalking === "function") {
      view.setTalking(false);
      return true;
    }
  } catch {}
  return false;
}

/**
 * Attente avant de pouvoir jouer une pose.
 *
 * Talking et l'emote se superposent mal : la bouche continue de bouger sous la
 * pose, et le tutoriel du jeu éteint d'ailleurs Talking chaque fois qu'il fait
 * poser un PNJ. Quand on sait l'éteindre nous-mêmes (`canCutTalking`, cf.
 * `cutTalking`), la pose remplace la parole et part tout de suite. Sinon, on
 * attend qu'il ait fini de parler.
 */
export function emoteStartDelay(lastSpokeAt: number | null, now: number, canCutTalking = false): number {
  if (canCutTalking) return 0;
  if (lastSpokeAt === null) return 0;
  return Math.max(0, lastSpokeAt + NPC_TALKING_MS + TALKING_MARGIN_MS - now);
}
