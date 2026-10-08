// Whether the companion is free to act on its own. Every behaviour that
// speaks up unprompted (reactions, wandering, emote mirroring, AFK) asks the
// same questions, so they are answered once here.

import { CompanionService } from ".";
import { CompanionChat } from "./chat";
import { loadCompanionSettings } from "./state";

/** The companion is enabled and allowed to comment on its own. */
export function reactionsEnabled(): boolean {
  try {
    const settings = loadCompanionSettings();
    return settings.enabled && settings.reactions;
  } catch {
    return false;
  }
}

/** The chat holds him: a batch is running, or a question waits for an answer. */
export function chatHolds(): boolean {
  try {
    return CompanionChat.isRunning() || CompanionChat.getProposal() !== null;
  } catch {
    return false;
  }
}

/** Not out, or busy elsewhere: on a task, waiting on an answer, or running a batch. */
export function companionBusy(): boolean {
  return !CompanionService.isRunning() || CompanionService.isBusy() || chatHolds();
}
