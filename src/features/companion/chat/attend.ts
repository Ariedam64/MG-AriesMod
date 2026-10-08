// src/services/companion/chat/attend.ts
// Il vient poser sa question, et il reste là tant qu'on n'a pas répondu.
//
// Deux raisons, et les deux comptent. Une question posée depuis l'autre bout du
// jardin n'est lue par personne : la bulle s'affiche au-dessus de sa tête, donc
// hors écran. Et repartir travailler sans attendre la réponse donnerait
// l'impression qu'il s'en désintéresse.
//
// Rien ici ne déclenche d'action. Venir et attendre, c'est du déplacement : la
// confirmation reste entière, et c'est `chat/proposals.ts` qui la garde.

import { CompanionService } from "..";

/**
 * Trajet en cours vers le joueur, avec la question qui l'a motivé.
 *
 * On retient la promesse et pas seulement l'identifiant : un second appel pour
 * la même question doit attendre la MÊME arrivée, pas repartir. Deux `walkTo`
 * concurrents se voleraient la tâche, et le premier annulerait le second en se
 * terminant.
 */
let attending: { proposalId: string; arrival: Promise<void> } | null = null;

async function walkOver(): Promise<void> {
  try {
    await CompanionService.comeToPlayer();
  } catch {
    // Un trajet raté ne doit pas emporter la question, qui est l'essentiel.
  }
  // La tâche l'immobiliserait sur sa case d'arrivée ; l'attention, elle, le
  // fait suivre le joueur jusqu'à la réponse.
  CompanionService.releaseTask();
  CompanionService.holdAttention();
}

/**
 * Va poser la question en personne, et reste auprès du joueur.
 *
 * Rend `false` quand le companion n'est pas encore incarné — au démarrage, une
 * question peut arriver avant lui. On ne retient alors rien, pour que
 * l'appelant puisse retenter au tour suivant.
 *
 * La promesse ne se résout qu'une fois sur place : ce qui doit se voir en jeu,
 * bulle comme emote, a donc de quoi attendre l'arrivée.
 */
export function attendToQuestion(proposalId: string): Promise<boolean> {
  if (attending?.proposalId === proposalId) return attending.arrival.then(() => true);
  if (!CompanionService.isRunning()) return Promise.resolve(false);

  const arrival = walkOver();
  attending = { proposalId, arrival };
  return arrival.then(() => true);
}

/** Plus de question en attente : il retourne à son mode. */
export function stopAttending(): void {
  attending = null;
  if (CompanionService.isHoldingAttention()) CompanionService.releaseAttention();
}
