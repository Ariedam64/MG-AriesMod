import { CompanionService } from ".";
import { afkWatch } from "./afkWatch";
import { emoteMirrorWatch } from "./emoteMirrorWatch";
import { feedWatch } from "./feedWatch";
import { reactionWatch } from "./reactionWatch";
import { wanderWatch } from "./wanderWatch";

/**
 * Brings the companion back if it was out last session, and starts the
 * watches that make him feel alive.
 *
 * The watches only ever speak or ask: nothing runs without a confirmation
 * (see `chat/proposals.ts`). They run even while he is put away, so their
 * readings stay current and nothing old is taken for news when he returns.
 */
export function startCompanion(): void {
  CompanionService.autoStart();
  // Hungry pets: he offers to feed them.
  feedWatch.start();
  // Unprompted comments: weather, sales, milestones, time played.
  reactionWatch.start();
  // He goes to look at what grows, answers the player's emotes, and dozes off
  // when the player steps away.
  wanderWatch.start();
  emoteMirrorWatch.start();
  afkWatch.start();
}
