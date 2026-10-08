// Watches for hungry pets.
//
// The companion asks, it does not act: the proposal it opens waits for a
// confirmation like every other one. That is the whole difference between an
// alert and an automation, and why this watch never calls the run directly
// (see `chat/proposals.ts`).

import { CompanionService } from ".";
import { CompanionChat } from "./chat";
import { attendToQuestion, stopAttending } from "./chat/attend";
import { forGame } from "./chat/bubbleTags";
import { feedBubble, feedSignature, type FeedCandidate } from "./chat/feed";
import { findFeedable } from "./chat/feedRead";
import { PetsService } from "../pets/pets";
import { loadCompanionSettings } from "./state";
import { defineWatcher } from "./watch";

/**
 * Safety net, not the main source.
 *
 * Pet state is pushed to us and that push triggers the check, almost as soon
 * as a pet drops under the threshold. This period only catches what the push
 * misses, and drops a question that went stale meanwhile.
 */
const POLL_MS = 30_000;

/**
 * Pet changes come in bursts, since hunger drops continuously. The burst is
 * let through before looking, rather than reading the game on every twitch.
 */
const SETTLE_MS = 1500;

/**
 * A declined question does not come back before this.
 *
 * Without it, saying no would see the proposal reappear on the next round,
 * which is nagging rather than warning.
 */
const REASK_COOLDOWN_MS = 10 * 60 * 1000;

/** Checks right away, while the watch runs. */
let checkNow: (() => void) | null = null;

/**
 * Checks now.
 *
 * Called when a setting changes: lowering the threshold, or switching him
 * off, must show at once, not at the next poll.
 */
export function checkFeedNow(): void {
  checkNow?.();
}

export const feedWatch = defineWatcher("feed", (scope) => {
  let settleTimer: number | null = null;
  /** The last situation proposed, and when: so the question is not repeated. */
  let lastOfferedSignature = "";
  let lastOfferedAtMs = 0;
  /**
   * The question already said out loud.
   *
   * Not the same as `lastOfferedSignature`, which says the question was
   * *asked*. A question asked while the companion is not in the game yet was
   * announced to nobody, and still has to be once he arrives.
   */
  let announcedProposalId: string | null = null;

  /**
   * Says it to the player, out loud.
   *
   * The thread gets the question either way; this is only the in-game version,
   * for whoever is not looking at the menu. The walk over happens in
   * `attendToQuestion`, for EVERY question: two walks at once would steal each
   * other's task.
   */
  async function speakInPerson(picks: FeedCandidate[]): Promise<void> {
    try {
      // Forced: the thread message was just spoken as a bubble, and the burst
      // guard would swallow this one, which is the one written to be read
      // above his head.
      const line = forGame(feedBubble(picks));
      await CompanionService.say(line.message, { force: true, tags: line.tags });
    } catch {
      // A failed announcement must not take the proposal down with it.
    }
  }

  /**
   * Announces the question in the game, or keeps it for later.
   *
   * At startup the watch runs before the companion is out: `autoStart` is not
   * awaited, and borrowing an NPC needs the room loaded. The question then
   * reached the thread with nobody to carry it, and nothing picked it up again.
   * So it is retried on every round while the question stands.
   */
  async function announceIfNeeded(picks: FeedCandidate[]): Promise<void> {
    if (picks.length === 0) return;

    const proposal = CompanionChat.getProposal();
    if (proposal?.commandId !== "feed" || proposal.id === announcedProposalId) return;

    // False while he is not out: nothing is remembered and the next round
    // retries. Otherwise it resolves once he is there, so the bubble shows on
    // screen.
    if (!(await attendToQuestion(proposal.id))) return;

    announcedProposalId = proposal.id;
    await speakInPerson(picks);
  }

  /** Nothing left waiting: he goes back to his mode. */
  function releaseIfIdle(): void {
    if (!CompanionChat.getProposal()) stopAttending();
  }

  async function check(): Promise<void> {
    if (!scope.active) return;
    const settings = loadCompanionSettings();

    // Companion off: nobody is there to warn about anything, and a question
    // still waiting goes with him, since answering it would put someone who is
    // not there to work.
    if (!settings.enabled) {
      CompanionChat.withdrawProposal();
      stopAttending();
      lastOfferedSignature = "";
      announcedProposalId = null;
      return;
    }

    // A stale question would block the watch for good: it is dropped even when
    // the alerts are off.
    CompanionChat.dropStaleProposal();

    const pending = CompanionChat.getProposal();
    const alertsOn = settings.feedAlerts;
    // The game is only read when there is a reason to: a waiting question that
    // must still have a point, or alerts that are on.
    if (pending?.commandId !== "feed" && !alertsOn) {
      releaseIfIdle();
      return;
    }

    const picks = await findFeedable().catch(() => []);

    // The player fed them, or changed team: the question drops, and he goes
    // back to what he was doing instead of waiting on a pointless answer.
    if (pending?.commandId === "feed") {
      const withdrawn = CompanionChat.withdrawFeedIfSettled(new Set(picks.map((pick) => pick.petId)));
      // The situation changed, so these pets deserve a new warning if they get
      // hungry again: the anti-nagging delay must not cover them.
      if (withdrawn) lastOfferedSignature = "";
      // Otherwise the question still stands: if he was not there to carry it,
      // now is the time to catch up.
      else await announceIfNeeded(picks);
    }
    releaseIfIdle();

    if (!alertsOn) return;

    if (picks.length === 0) {
      // Sorted out: next time it happens, it deserves a warning again.
      lastOfferedSignature = "";
      return;
    }

    const signature = feedSignature(picks);
    const now = Date.now();
    if (signature === lastOfferedSignature && now - lastOfferedAtMs < REASK_COOLDOWN_MS) return;

    // `offerFeed` holds back when a question is already open or a batch runs:
    // the situation only counts as proposed once it really was.
    const offered = await CompanionChat.offerFeed(() => findFeedable());
    if (!offered) return;

    lastOfferedSignature = signature;
    lastOfferedAtMs = now;
    await announceIfNeeded(picks);
  }

  const runCheck = () => void check().catch(() => {});

  /** Folds a burst of changes into one check. */
  function scheduleCheck(): void {
    if (settleTimer !== null) return;
    settleTimer = window.setTimeout(() => {
      settleTimer = null;
      runCheck();
    }, SETTLE_MS);
  }

  try {
    scope.add(PetsService.onPetsChange(scope.live(scheduleCheck)));
  } catch {
    // Without the push, the poll is enough: slower, but the watch holds.
  }
  // Answering a question must free him without waiting for the next round.
  // True for every question, not just hunger: this is the only chat
  // subscription that always runs.
  scope.add(CompanionChat.subscribe(scope.live(releaseIfIdle)));
  scope.every(POLL_MS, runCheck);

  checkNow = () => {
    lastOfferedSignature = "";
    runCheck();
  };
  scope.add(() => {
    checkNow = null;
    if (settleTimer !== null) window.clearTimeout(settleTimer);
    settleTimer = null;
  });

  runCheck();
});
