import { loadCompanionSettings } from "../../state";
import { variantIcons } from "../bubbleIcons";
import { compose, spaced, type BubbleLine } from "../bubbleTags";
import { ask, post, type ChatCommand, type ChatRequest } from "../conversation";
import { teamName } from "../crew";
import type { HarvestScope } from "../gardenRead";
import { describeSelection, groupVariants, selectionSignature, type HarvestRow } from "../harvest";
import { executeHarvestBatch } from "../harvestRun";
import { teamPromise, withTeam } from "../proposals";

/** Reads the batch again at confirmation, to notice it changed. */
type ScopeProvider = () => Promise<HarvestScope>;

type HarvestAsk = { provider: ScopeProvider };
type HarvestHeld = HarvestAsk & { rows: HarvestRow[] };

/**
 * A harvest question's bubble: the main variant, then the sentence.
 *
 * One variant for the whole batch: the one seen most in the basket. A bubble
 * listing them all would not fit its line. Mutation chips carry their own
 * names, so the sentence does not name them.
 */
function harvestBubble(rows: HarvestRow[], sentence: string): BubbleLine {
  const top = groupVariants(rows)[0];
  if (!top) return compose(sentence);
  return compose(...spaced(variantIcons(top.species, top.mutations)), " ", sentence);
}

const harvestCommand: ChatCommand<HarvestAsk, HarvestHeld> = {
  id: "harvest",
  acceptance: "Yes, go ahead",

  async propose({ provider }) {
    let scope: HarvestScope;
    try {
      scope = await provider();
    } catch {
      post("companion", "system", "Could not see your garden just now.");
      return;
    }

    const rows = scope.rows;
    if (rows.length === 0) {
      // An empty garden and a fully locked one look alike from outside:
      // telling them apart saves hunting for a fault that is not there.
      post(
        "companion",
        "reply",
        scope.lockedOut > 0 ? `Your Locker is holding all ${scope.lockedOut}. Nothing I can pick.` : "Nothing is ripe right now.",
      );
      return;
    }

    const team = loadCompanionSettings().harvestTeamId;
    const summary = describeSelection(rows);
    const held =
      scope.lockedOut > 0 ? ` I am leaving ${scope.lockedOut} locked one${scope.lockedOut === 1 ? "" : "s"} alone.` : "";
    const text = `I can see ${summary}.${held}${teamPromise(teamName(team))} Want me to pick them?`;
    ask(harvestCommand, { provider, rows }, {
      summary,
      size: rows.length,
      signature: withTeam(selectionSignature(rows), team),
      text,
      bubble: harvestBubble(rows, text),
    });
  },

  async signature({ provider }) {
    return withTeam(selectionSignature((await provider()).rows), loadCompanionSettings().harvestTeamId);
  },

  async execute({ rows }, run) {
    await run((reporter) => executeHarvestBatch(rows, reporter));
  },
};

/**
 * A harvest request. `provider` is called again at confirmation: it is what
 * notices the garden changed meanwhile.
 */
export function harvestRequest(label: string, provider: ScopeProvider): ChatRequest {
  return { label, propose: () => harvestCommand.propose({ provider }) };
}
