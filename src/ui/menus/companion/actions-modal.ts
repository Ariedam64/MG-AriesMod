// src/ui/menus/companion/actions-modal.ts
// Ce que le companion sait faire, et ce qu'il peut faire là, maintenant.
//
// Une action indisponible reste visible mais grisée, avec la raison : la faire
// disparaître laisserait croire qu'elle n'existe pas.

import type { HarvestRequest } from "../../../services/companion/chat";
import { readHarvestable } from "../../../services/companion/chat/gardenRead";
import { reviewFeeding, type FeedReview } from "../../../services/companion/chat/petFeed";
import { readPlantScope } from "../../../services/companion/chat/plantRead";
import { EMPTY_SCOPE, type PlantScope } from "../../../services/companion/chat/plant";
import { EMPTY_HATCH_SCOPE, readHatchScope, type HatchScope } from "../../../services/companion/chat/hatchRead";
import { css } from "../panel-ui";
import { openHarvestModal } from "./harvest-modal";
import { openFeedModal } from "./feed-modal";
import { openPlantModal } from "./plant-modal";
import { openHatchModal } from "./hatch-modal";
import { menuCard, openModal } from "./modal";

type ActionRow = {
  name: string;
  /** Ce que l'action fait, en une ligne. */
  description: string;
  /** Rendu quand l'action ne peut rien faire pour l'instant. */
  unavailable: string | null;
  run(): void;
};

export function openActionsModal(host: HTMLElement, onAsk: (request: HarvestRequest) => void): void {
  const modal = openModal({ host, title: "What can you do?", widthPx: 420 });

  const list = document.createElement("div");
  css(list, { display: "flex", flexDirection: "column", gap: "8px" });
  modal.body.append(list);

  function renderRows(rows: ActionRow[]): void {
    if (!modal.isOpen()) return;
    list.innerHTML = "";
    for (const action of rows) {
      list.append(
        menuCard({
          name: action.name,
          detail: action.unavailable ?? action.description,
          disabled: action.unavailable !== null,
          onClick: () => {
            modal.close();
            action.run();
          },
        })
      );
    }
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
        description: "Pick what your Locker lets me touch.",
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
        description: "Feed a pet something it likes.",
        // « Rien à faire » recouvrait trois situations : on dit laquelle.
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
        description: "Draw where your seeds and eggs go.",
        // Deux blocages bien distincts : rien à semer, ou nulle part où semer.
        unavailable:
          plantable.items.length === 0
            ? "You have no seeds and no eggs."
            : freeTiles === 0
              ? "Your plot is full."
              : null,
        run: () => openPlantModal(host, onAsk),
      },
      {
        name: "Hatch",
        description: "Open ripe eggs and sort what hatches.",
        // Un sac déjà plein n'est pas « rien à faire » : c'est une éclosion qui
        // ne donnerait rien, et ça se dit autrement.
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

  // Rendu immédiat pour que la popup ne s'ouvre pas vide, puis état réel.
  renderRows([
    { name: "Harvest", description: "Pick what your Locker lets me touch.", unavailable: "Checking...", run: () => {} },
    { name: "Feed a pet", description: "Feed a pet something it likes.", unavailable: "Checking...", run: () => {} },
    { name: "Plant", description: "Draw where your seeds and eggs go.", unavailable: "Checking...", run: () => {} },
    { name: "Hatch", description: "Open ripe eggs and sort what hatches.", unavailable: "Checking...", run: () => {} },
  ]);
  void refresh();
}
