// The feeding preview: which pets are hungry, and with what.
//
// What a pet accepts is chosen in the Pets tab, as what may be harvested is
// chosen in the Locker. This only shows what follows from it.

import { button } from "../../../ui/kit/button";
import type { ChatRequest } from "../chat";
import { feedRequest } from "../chat/commands/feed";
import type { FeedCandidate } from "../chat/feed";
import { findFeedable } from "../chat/feedRead";
import { openCompanionModal, part } from "./dom";
import { openFeedSettingsModal } from "./feedSettingsModal";
import { speciesIcon } from "./harvestChips";
import { settingsNotice } from "./settingsNotice";
import { openSettingsModal } from "./settingsModal";

const REFRESH_MS = 5000;
const CROP_ICON_PX = 26;

function row(candidate: FeedCandidate): HTMLElement {
  const line = part("div", "qws-cmp-item");

  const sub = part(
    "div",
    candidate.hungerPct <= 5 ? "qws-cmp-item__sub is-warn" : "qws-cmp-item__sub",
    candidate.source.kind === "garden"
      ? `${candidate.hungerPct}% left, I would pick a ${candidate.source.species}`
      : `${candidate.hungerPct}% left, I have a ${candidate.source.species} in the bag`,
  );
  const text = part("div", "qws-cmp-item__text");
  text.append(part("div", "qws-cmp-item__title", candidate.petName), sub);

  const icon = speciesIcon(candidate.source.species, CROP_ICON_PX);
  icon.title = candidate.source.species;

  line.append(text, icon);
  return line;
}

export function openFeedModal(host: HTMLElement, onAsk: (request: ChatRequest) => void): void {
  let picks: FeedCandidate[] = [];

  const modal = openCompanionModal({
    host,
    title: "Who needs feeding?",
    widthPx: 420,
    onClose: () => clearInterval(timer),
  });

  const list = part("div", "qws-cmp-list");
  const empty = part("div", "qws-cmp-empty", "Nobody is hungry, or I have nothing they eat.");

  const notice = settingsNotice("feed", "Pet feed is not set up. I warn below 10% and may pick from the garden.", () => {
    modal.close();
    openFeedSettingsModal(host, () => openSettingsModal(host));
  });

  modal.body.append(notice, list, empty);

  const askButton = button("Ask to feed them", {
    size: "sm",
    variant: "primary",
    onClick: () => {
      // The pets are looked for again at confirmation: that is what notices a
      // pet fed meanwhile, or a crop that went.
      onAsk(feedRequest(picks.length === 1 ? `Feed ${picks[0].petName}` : "Feed my hungry pets", () => findFeedable()));
      modal.close();
    },
  });
  askButton.classList.add("qws-cmp-foot-end");
  modal.footer.append(askButton);

  function render(): void {
    if (!modal.isOpen()) return;
    list.replaceChildren(...picks.map(row));
    list.hidden = picks.length === 0;
    empty.hidden = picks.length > 0;
    askButton.setEnabled(picks.length > 0);
  }

  async function refresh(): Promise<void> {
    if (!modal.isOpen()) return;
    picks = await findFeedable().catch(() => []);
    if (!modal.isOpen()) return;
    render();
  }

  const timer = window.setInterval(() => void refresh(), REFRESH_MS);
  render();
  void refresh();
}
