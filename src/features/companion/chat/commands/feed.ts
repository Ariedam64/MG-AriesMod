import { ask, post, type ChatCommand, type ChatRequest } from "../conversation";
import { describeFeed, feedBubble, feedQuestion, feedSignature, type FeedCandidate } from "../feed";
import { executeFeedBatch } from "../feedRun";

/** Finds the hungry pets again at confirmation. */
export type FeedProvider = () => Promise<FeedCandidate[]>;

type FeedAsk = { provider: FeedProvider };
export type FeedHeld = FeedAsk & { picks: FeedCandidate[] };

export const feedCommand: ChatCommand<FeedAsk, FeedHeld> = {
  id: "feed",
  acceptance: "Yes, feed them",

  async propose({ provider }) {
    let picks: FeedCandidate[];
    try {
      picks = await provider();
    } catch {
      post("companion", "system", "Could not check on your pets just now.");
      return;
    }

    if (picks.length === 0) {
      post("companion", "reply", "Your pets are fine, or I have nothing they eat.");
      return;
    }

    // The thread names every pet; the bubble, too narrow for a list, counts.
    const listed = feedQuestion(picks);
    ask(feedCommand, { provider, picks }, {
      summary: describeFeed(picks),
      size: picks.length,
      signature: feedSignature(picks),
      text: listed.message,
      bubble: feedBubble(picks),
      thread: listed,
    });
  },

  async signature({ provider }) {
    return feedSignature(await provider());
  },

  async execute({ picks }, run) {
    await run((reporter) => executeFeedBatch(picks, reporter));
  },
};

/** A feeding request. `provider` is called again at confirmation, to notice a pet was fed meanwhile. */
export function feedRequest(label: string, provider: FeedProvider): ChatRequest {
  return { label, propose: () => feedCommand.propose({ provider }) };
}
