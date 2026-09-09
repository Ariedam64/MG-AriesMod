// src/services/companion/chat/batch.ts
// Ce que tout lot d'actions partage : sa cadence, et la façon d'en rendre compte.
//
// Le déroulé de chaque commande vit dans son propre `*Run.ts`, mais tous
// parlent au chat de la même manière — sinon la façade devrait connaître les
// détails de chacun, et c'est elle qui porte la conformité.

/** Ce qu'un lot en cours peut dire au chat, et lui demander. */
export type BatchReporter = {
  say(kind: "reply" | "system" | "report", text: string): void;
  /** Vrai quand le joueur a demandé l'arrêt du lot en cours. */
  stopped(): boolean;
  progress(done: number, total: number): void;
};

/** Délai entre deux actions : on ne mitraille pas le serveur. */
export const ACTION_DELAY_MS = 500;

/** Temps laissé au serveur pour publier son état avant qu'on le relise. */
export const SETTLE_MS = 700;

/** Fréquence des messages de progression, en nombre d'actions. */
export const PROGRESS_EVERY = 10;

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
