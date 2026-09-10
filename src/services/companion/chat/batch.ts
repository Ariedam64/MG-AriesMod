// src/services/companion/chat/batch.ts
// Ce que tout lot d'actions partage : sa cadence, et la façon d'en rendre compte.
//
// Le déroulé de chaque commande vit dans son propre `*Run.ts`, mais tous
// parlent au chat de la même manière — sinon la façade devrait connaître les
// détails de chacun, et c'est elle qui porte la conformité.

import type { BubbleLine } from "./bubbleTags";

/** Ce qu'un lot en cours peut dire au chat, et lui demander. */
export type BatchReporter = {
  /**
   * `spoken` est la version pour la bulle, quand elle mérite une icône.
   *
   * Le fil du menu rend du texte brut : il afficherait le balisage `<0/>` en
   * toutes lettres. Les deux sorties disent donc la même chose, la bulle en
   * plus court et en images.
   */
  say(kind: "reply" | "system" | "report", text: string, spoken?: BubbleLine, force?: boolean): void;
  /** Vrai quand le joueur a demandé l'arrêt du lot en cours. */
  stopped(): boolean;
  progress(done: number, total: number): void;
};

/**
 * Écart minimum entre deux commandes : on ne mitraille pas le serveur.
 *
 * C'est un plancher, pas une addition — voir `pacer`, qui n'attend que ce qui
 * manque. Volontairement plus large que les automatisations déjà en place dans
 * le mod, qui tournent à 100 ms depuis longtemps sans que le serveur bronche :
 * le companion n'a rien à gagner à courir, et cette marge absorbe une latence
 * inhabituelle sans jamais perdre une commande.
 */
export const ACTION_DELAY_MS = 350;

/**
 * Cadence d'un lot : garantit l'écart, sans le payer deux fois.
 *
 * Dormir `ACTION_DELAY_MS` après chaque action revenait à additionner l'attente
 * au trajet. Or le companion marche déjà jusqu'à la case suivante, et ce
 * déplacement espace les envois exactement autant qu'un sommeil. On mesure donc
 * l'écart réel depuis la dernière commande et on ne comble que le manque : sur
 * un jardin où les crops se suivent, l'attente tombe souvent à zéro sans que le
 * plancher soit entamé.
 */
export function pacer(minGapMs = ACTION_DELAY_MS): { mark(): void; wait(): Promise<void> } {
  let lastAt = 0;
  return {
    /** À appeler juste après un envoi. */
    mark(): void {
      lastAt = Date.now();
    },
    /** Attend ce qui manque pour respecter l'écart. À appeler juste avant un envoi. */
    async wait(): Promise<void> {
      const missing = minGapMs - (Date.now() - lastAt);
      if (missing > 0) await sleep(missing);
    },
  };
}

/** Temps laissé au serveur pour publier son état avant qu'on le relise. */
export const SETTLE_MS = 700;

/** Fréquence des messages de progression, en nombre d'actions. */
export const PROGRESS_EVERY = 10;

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
