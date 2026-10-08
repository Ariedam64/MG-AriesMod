import { seedIcon } from "../bubbleIcons";
import { compose } from "../bubbleTags";
import { ask, post, type ChatCommand, type ChatRequest } from "../conversation";
import { countByItem, plantSignature, summarizePlan, type PlantAssignment } from "../plant";
import { executePlantBatch } from "../plantRun";

/** Replays the drawn plan against the garden as it is now, keeping what still fits. */
type PlantProvider = () => Promise<PlantAssignment[]>;

type PlantAsk = { provider: PlantProvider };
type PlantHeld = PlantAsk & { plan: PlantAssignment[] };

const plantCommand: ChatCommand<PlantAsk, PlantHeld> = {
  id: "plant",
  acceptance: "Yes, plant them",

  /**
   * Asks about the plan, cut down to what still stands.
   *
   * The player drew the plan; the provider does not reinvent it, it holds it
   * against the garden. A plan that became empty means the tiles filled up or
   * the seeds ran out, and that gets said rather than asking a pointless question.
   */
  async propose({ provider }) {
    let plan: PlantAssignment[];
    try {
      plan = await provider();
    } catch {
      post("companion", "system", "Could not see your garden just now.");
      return;
    }

    if (plan.length === 0) {
      post("companion", "reply", "Nothing left of that plan. Tiles filled up, or seeds ran out.");
      return;
    }

    const summary = summarizePlan(plan);
    const text = `That is ${summary}. Want me to get started?`;
    // The kind planted most carries the icon. An egg has no seed in the
    // catalog, so `seedIcon` gives null and the bubble stays plain.
    const most = countByItem(plan)[0];
    ask(plantCommand, { provider, plan }, {
      summary,
      size: plan.length,
      signature: plantSignature(plan),
      text,
      bubble: compose(most?.kind === "seed" ? seedIcon(most.id) : null, " ", text),
    });
  },

  async signature({ provider }) {
    return plantSignature(await provider());
  },

  async execute({ plan }, run) {
    await run((reporter) => executePlantBatch(plan, reporter));
  },
};

/** A planting request. `provider` is called again at confirmation, to notice a tile filled up meanwhile. */
export function plantRequest(label: string, provider: PlantProvider): ChatRequest {
  return { label, propose: () => plantCommand.propose({ provider }) };
}
