// What the companion can do, and what he can do right now.
//
// An unavailable action stays visible but greyed out, with the reason: hiding
// it would suggest it does not exist.

import { menuCard } from "../../../ui/kit/modal";
import type { ChatRequest } from "../chat";
import { reviewFeeding, type FeedReview } from "../chat/feedRead";
import { readHarvestable } from "../chat/gardenRead";
import { EMPTY_HATCH_SCOPE, readHatchScope, type HatchScope } from "../chat/hatchRead";
import { EMPTY_SCOPE, type PlantScope } from "../chat/plant";
import { readPlantScope } from "../chat/plantRead";
import { openCompanionModal, part } from "./dom";
import { openFeedModal } from "./feedModal";
import { openHarvestModal } from "./harvestModal";
import { openHatchModal } from "./hatchModal";
import { openPlantModal } from "./plantModal";

type ActionRow = {
  name: string;
  /** What the action does, in one line. */
  description: string;
  /** Shown when the action cannot do anything right now. */
  unavailable: string | null;
  run(): void;
};

const DESCRIPTIONS = {
  harvest: "Pick what your Locker lets me touch.",
  feed: "Feed a pet something it likes.",
  plant: "Draw where your seeds and eggs go.",
  hatch: "Open ripe eggs and sort what hatches.",
};

export function openActionsModal(host: HTMLElement, onAsk: (request: ChatRequest) => void): void {
  const modal = openCompanionModal({ host, title: "What can you do?", widthPx: 420 });

  const list = part("div", "qws-cmp-list");
  modal.body.append(list);

  function renderRows(rows: ActionRow[]): void {
    if (!modal.isOpen()) return;
    list.replaceChildren(
      ...rows.map((action) =>
        menuCard({
          name: action.name,
          detail: action.unavailable ?? action.description,
          disabled: action.unavailable !== null,
          onClick: () => {
            modal.close();
            action.run();
          },
        }),
      ),
    );
  }

  async function refresh(): Promise<void> {
    if (!modal.isOpen()) return;

    const [harvestable, feedable, plantable, hatchable] = await Promise.all([
      readHarvestable().catch(() => ({ rows: [], lockedOut: 0 })),
      reviewFeeding().catch((): FeedReview => ({ candidates: [], hungry: 0, waitingOnGardenRule: 0 })),
      readPlantScope().catch((): PlantScope => EMPTY_SCOPE),
      readHatchScope().catch((): HatchScope => EMPTY_HATCH_SCOPE),
    ]);
    if (!modal.isOpen()) return;

    const freeTiles = plantable.tiles.filter((tile) => !plantable.occupied.has(tile)).length;

    renderRows([
      {
        name: "Harvest",
        description: DESCRIPTIONS.harvest,
        unavailable:
          harvestable.rows.length > 0
            ? null
            : harvestable.lockedOut > 0
              ? "Everything ripe is locked right now."
              : "Nothing is ripe yet.",
        run: () => openHarvestModal(host, onAsk),
      },
      {
        name: "Feed a pet",
        description: DESCRIPTIONS.feed,
        // "Nothing to do" used to cover three cases: it says which.
        unavailable:
          feedable.candidates.length > 0
            ? null
            : feedable.waitingOnGardenRule > 0
              ? `${feedable.waitingOnGardenRule} could eat from the garden, but that is off in Settings.`
              : feedable.hungry > 0
                ? `${feedable.hungry} hungry, but I have nothing they eat.`
                : "No pet is hungry enough.",
        run: () => openFeedModal(host, onAsk),
      },
      {
        name: "Plant",
        description: DESCRIPTIONS.plant,
        // Two distinct blocks: nothing to sow, or nowhere to sow it.
        unavailable:
          plantable.items.length === 0 ? "You have no seeds and no eggs." : freeTiles === 0 ? "Your plot is full." : null,
        run: () => openPlantModal(host, onAsk),
      },
      {
        name: "Hatch",
        description: DESCRIPTIONS.hatch,
        // A bag already full is not "nothing to do": it is a hatch that would
        // give nothing, and that is said differently.
        unavailable:
          hatchable.readySlots.length === 0
            ? hatchable.totalEggs > 0
              ? `${hatchable.totalEggs} still growing.`
              : "No eggs in the ground."
            : hatchable.inventoryCount >= hatchable.capacity
              ? "Your bag is full."
              : null,
        run: () => openHatchModal(host, onAsk),
      },
    ]);
  }

  // Drawn at once so the popup does not open empty, then the real state.
  const checking = (name: string, description: string): ActionRow => ({
    name,
    description,
    unavailable: "Checking...",
    run: () => {},
  });
  renderRows([
    checking("Harvest", DESCRIPTIONS.harvest),
    checking("Feed a pet", DESCRIPTIONS.feed),
    checking("Plant", DESCRIPTIONS.plant),
    checking("Hatch", DESCRIPTIONS.hatch),
  ]);
  void refresh();
}
