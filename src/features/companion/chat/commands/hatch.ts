// Hatching, and the sale that sometimes follows it.
//
// The two are separate questions on purpose. After a hatch he looks, says,
// and asks about the sale; after a sale he offers to resume hatching. He never
// sells or reopens on his own: asking is not acting, and it is the only way to
// chain the two without becoming an automaton.

import { loadCompanionSettings } from "../../state";
import { eggIcon, petRowIcons } from "../bubbleIcons";
import { compose, spaced } from "../bubbleTags";
import { ask, post, type ChatCommand, type ChatRequest } from "../conversation";
import { teamName } from "../crew";
import {
  afterHatchNote,
  petSignature,
  slotSignature,
  summarizeHatch,
  summarizeSell,
  toFavourite,
  toSell,
  type HatchStop,
  type KeepRules,
} from "../hatch";
import { readHatchScope } from "../hatchRead";
import { executeHatchBatch } from "../hatchRun";
import { teamPromise, withTeam } from "../proposals";
import { executeSellBatch, type SellPlan } from "../sellRun";

/** Reads the ready eggs again at confirmation. */
type HatchProvider = () => Promise<number[]>;
/** Works out again who would go and who would be protected, at confirmation. */
type SellProvider = () => Promise<SellPlan>;

/** `rules` travel with the request: the sale that follows sorts by them. */
type HatchAsk = { provider: HatchProvider; rules: KeepRules };
type HatchHeld = HatchAsk & { slots: number[] };

type SellAsk = { provider: SellProvider; rules: KeepRules };
type SellHeld = SellAsk & { plan: SellPlan };

function hatchProvider(): HatchProvider {
  return async () => (await readHatchScope()).readySlots;
}

/**
 * The sale batch, rebuilt on every call.
 *
 * The sale team is read here rather than captured earlier: the player may
 * have changed it between starting the hatch and being asked to sell.
 */
function sellProvider(rules: KeepRules): SellProvider {
  return async () => {
    const scope = await readHatchScope();
    return {
      favourite: toFavourite(scope.pets, rules),
      sell: toSell(scope.pets, rules),
      teamId: loadCompanionSettings().hatchSellTeamId,
    };
  };
}

const sellSignature = (plan: SellPlan) => withTeam(`${petSignature(plan.sell)}/${petSignature(plan.favourite)}`, plan.teamId);

const hatchCommand: ChatCommand<HatchAsk, HatchHeld> = {
  id: "hatch",
  acceptance: "Yes, open them",

  /**
   * Asks about the eggs ready now.
   *
   * The keep rules play no part here: what is ripe gets opened. They travel
   * with the request because the sale after it will use them.
   */
  async propose({ provider, rules }) {
    let slots: number[];
    try {
      slots = await provider();
    } catch {
      post("companion", "system", "Could not see your eggs just now.");
      return;
    }

    if (slots.length === 0) {
      post("companion", "reply", "Nothing is ready to hatch right now.");
      return;
    }

    const team = loadCompanionSettings().hatchTeamId;
    const summary = summarizeHatch(slots);
    // The kind of egg is only known by reading the garden again, and a mixed
    // batch has no single icon: the icon only shows for a single kind.
    const kinds = await readHatchScope()
      .then((scope) => scope.eggIds)
      .catch(() => [] as string[]);
    const text = `${summary}.${teamPromise(teamName(team))} Want me to open them?`;
    ask(hatchCommand, { provider, rules, slots }, {
      summary,
      size: slots.length,
      signature: withTeam(slotSignature(slots), team),
      text,
      bubble: compose(kinds.length === 1 ? eggIcon(kinds[0]) : null, " ", text),
    });
  },

  async signature({ provider }) {
    return withTeam(slotSignature(await provider()), loadCompanionSettings().hatchTeamId);
  },

  async execute({ slots, rules }, run) {
    let stop: HatchStop = "done";
    await run(async (reporter) => {
      stop = await executeHatchBatch(slots, reporter);
    });
    await afterHatch(rules, stop);
  },
};

const sellCommand: ChatCommand<SellAsk, SellHeld> = {
  id: "sell",
  // A sale cannot be undone: the answer names it.
  acceptance: "Yes, sell them",

  /**
   * Asks about the sale: who would go, who would be kept safe first.
   *
   * The team swap is part of the question when there is one: it touches the
   * player's team, so it cannot slip into a yes that never mentioned it.
   */
  async propose({ provider, rules }) {
    let plan: SellPlan;
    try {
      plan = await provider();
    } catch {
      post("companion", "system", "Could not go through your bag just now.");
      return;
    }

    if (plan.sell.length === 0) {
      post("companion", "reply", "Nothing in your bag is up for sale.");
      return;
    }

    const summary = summarizeSell(plan.sell);
    const keeping = plan.favourite.length > 0 ? ` I would favourite the ${plan.favourite.length} you keep first.` : "";
    const text = `That would be ${summary}.${keeping}${teamPromise(teamName(plan.teamId))} Should I?`;
    // The two species sold most carry the icon. A composed render per pet
    // would make no sense here: it is a count, not a presentation.
    ask(sellCommand, { provider, rules, plan }, {
      summary,
      size: plan.sell.length,
      signature: sellSignature(plan),
      text,
      bubble: compose(...spaced(petRowIcons(plan.sell)), " ", text),
    });
  },

  async signature({ provider }) {
    return sellSignature(await provider());
  },

  async execute({ plan, rules }, run) {
    const stopped = await run((reporter) => executeSellBatch(plan, reporter));
    // Stopping a sale and being asked about hatching straight away would be
    // a nuisance. The hatch already holds back in that case, the sale did not.
    if (!stopped) await afterSell(rules);
  },
};

/** After a hatch he looks, says, and asks about the sale. He does not sell. */
async function afterHatch(rules: KeepRules, stop: HatchStop): Promise<void> {
  if (stop === "cancelled") return;

  const scope = await readHatchScope().catch(() => null);
  if (!scope) return;

  const sellable = toSell(scope.pets, rules);
  const note = afterHatchNote(stop, scope.readySlots.length, rules, sellable.length);
  if (note) post("companion", "system", note);
  if (sellable.length === 0) return;

  await sellCommand.propose({ provider: sellProvider(rules), rules });
}

/** After a sale he offers to resume hatching. He does not resume it. */
async function afterSell(rules: KeepRules): Promise<void> {
  const provider = hatchProvider();
  const slots = await provider().catch(() => [] as number[]);
  if (slots.length === 0) return;

  post("companion", "system", "There is room again.");
  await hatchCommand.propose({ provider, rules });
}

/** A hatching request. The eggs are read again at confirmation, to notice one hatched or ripened meanwhile. */
export function hatchRequest(label: string, rules: KeepRules): ChatRequest {
  return { label, propose: () => hatchCommand.propose({ provider: hatchProvider(), rules }) };
}
