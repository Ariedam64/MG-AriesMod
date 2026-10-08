// He comes over to ask his question, and stays until it is answered.
//
// Two reasons, both real. A question asked from across the garden is read by
// nobody: the bubble shows above his head, off screen. And wandering back to
// work without waiting for the answer would look like he lost interest.
//
// Nothing here triggers an action. Coming over and waiting is movement: the
// confirmation is untouched, and `proposals.ts` keeps it.

import { CompanionService } from "..";

/**
 * The walk to the player in progress, with the question behind it.
 *
 * The promise is kept, not just the id: a second call for the same question
 * must wait for the SAME arrival, not set off again. Two concurrent `walkTo`
 * would steal each other's task, the first cancelling the second as it ends.
 */
let attending: { proposalId: string; arrival: Promise<void> } | null = null;

async function walkOver(): Promise<void> {
  try {
    await CompanionService.comeToPlayer();
  } catch {
    // A failed walk must not take the question down with it.
  }
  // The task would pin him to his arrival tile; attention makes him follow
  // the player until the answer.
  CompanionService.releaseTask();
  CompanionService.holdAttention();
}

/**
 * Goes to ask in person, and stays by the player.
 *
 * `false` while the companion is not out yet: at startup a question can come
 * before he does. Nothing is remembered then, so the caller can retry.
 *
 * Resolves once he is there, so whatever must show in the game, bubble or
 * emote, can wait for his arrival.
 */
export function attendToQuestion(proposalId: string): Promise<boolean> {
  if (attending?.proposalId === proposalId) return attending.arrival.then(() => true);
  if (!CompanionService.isRunning()) return Promise.resolve(false);

  const arrival = walkOver();
  attending = { proposalId, arrival };
  return arrival.then(() => true);
}

/** No question waiting any more: he goes back to his mode. */
export function stopAttending(): void {
  attending = null;
  if (CompanionService.isHoldingAttention()) CompanionService.releaseAttention();
}
