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
