// The companion's chat: what the menus, the on-screen question and the hunger
// watch talk to.
//
// The rules the mod keeps (see `proposals.ts`): nothing runs without a fresh
// human confirmation, and the run covers the exact batch that was proposed.
// No queue, no "always allow", no "do it again".

import type { Unsubscribe } from "../../../lib/emitter";
import { feedCommand, type FeedHeld, type FeedProvider } from "./commands/feed";
import {
  chatState,
  closeProposal,
  dropStaleProposal,
  heldFor,
  onChatChange,
  post,
  requestStop,
  runConfirmed,
  type ChatRequest,
  type RunProgress,
} from "./conversation";
import { isSettled } from "./feed";
import type { ChatLog } from "./log";
import { explain, verdict, type Proposal } from "./proposals";

export const CompanionChat = {
  getLog(): ChatLog {
    return chatState().log;
  },

  getProposal(): Proposal | null {
    return chatState().proposal;
  },

  getRun(): RunProgress | null {
    return chatState().run;
  },

  isRunning(): boolean {
    return chatState().run !== null;
  },

  subscribe(listener: () => void): Unsubscribe {
    return onChatChange(listener);
  },

  /** Drops a question it is too late to answer. */
  dropStaleProposal,

  /**
   * Drops the open question without a word.
   *
   * For when the companion stops existing: he has no reason to apologise for
   * taking a question back, he is not there to ask it. `withdrawFeedIfSettled`
   * comments because the situation changed under the player's eyes; here the
   * player just switched him off.
   */
  withdrawProposal(): void {
    const proposal = chatState().proposal;
    if (proposal) closeProposal(proposal.id);
  },

  /**
   * Drops the feeding question once it has no point left.
   *
   * The player fed the pets or changed team: leaving the question open would
   * keep the companion waiting by the player for a meaningless answer. Only
   * once NONE of the proposed pets still needs feeding: as long as one does,
   * the question stands, and the scope check at confirmation covers the rest.
   */
  withdrawFeedIfSettled(stillFeedable: Set<string>): boolean {
    const proposal = chatState().proposal;
    const held: FeedHeld | null = heldFor(feedCommand);
    if (!proposal || !held || !isSettled(held.picks, stillFeedable)) return false;
    closeProposal(proposal.id);
    post("companion", "system", "Never mind, your pets are sorted.");
    return true;
  },

  /**
   * A request from the player. Runs nothing: it asks the question.
   *
   * The request reads the game again at confirmation, to check the batch did
   * not change meanwhile.
   */
  async ask(request: ChatRequest): Promise<void> {
    post("you", "command", request.label);
    if (chatState().run) {
      post("companion", "system", "Hold on, still on the last batch.");
      return;
    }
    await request.propose();
  },

  /**
   * A question from the companion himself, unprompted.
   *
   * Asking is not acting: nothing goes until the confirmation is given. He
   * holds back when a question already waits or a batch runs, since talking
   * over himself would lose the previous one.
   */
  async offerFeed(provider: FeedProvider): Promise<boolean> {
    dropStaleProposal();
    if (chatState().run || chatState().proposal) return false;
    await feedCommand.propose({ provider });
    return chatState().proposal !== null;
  },

  /** Confirms and runs. The only path that triggers an action. */
  async confirm(proposalId: string): Promise<void> {
    const { proposal, held } = chatState();
    if (!proposal || proposal.id !== proposalId || !held) {
      post("companion", "system", explain("unknown"));
      return;
    }

    // A decision is a turn in the conversation: it belongs in the thread, on
    // the player's side, or the conversation has one speaker left.
    post("you", "command", held.acceptance);

    const signature = await held.signature().catch(() => null);
    if (signature === null) {
      post("companion", "system", "Could not check again, so I am not touching anything.");
      return;
    }

    const decision = verdict(proposal, signature, Date.now());
    if (!decision.ok) {
      // The scope moved or the proposal aged: ask again, do not run.
      closeProposal(proposalId);
      post("companion", "system", explain(decision.reason));
      if (decision.reason === "changed" || decision.reason === "expired") await held.repropose();
      return;
    }

    // The scope CAPTURED with the proposal runs, not the one just read: it is
    // what the player saw and confirmed.
    await runConfirmed(proposalId, held, proposal.size);
  },

  /** Drops the open question without running anything. */
  decline(proposalId: string): void {
    if (chatState().proposal?.id !== proposalId) return;
    closeProposal(proposalId);
    post("you", "command", "Not now");
    post("companion", "system", "Alright, leaving them be.");
  },

  /** Stops the running batch. */
  cancelRun(): void {
    requestStop();
  },
};

export type { ChatRequest } from "./conversation";
