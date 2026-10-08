// The feeding preview: which pets are hungry, and with what.
//
// What a pet accepts is chosen in the Pets tab, as what may be harvested is
// chosen in the Locker. This only shows what follows from it.

import { button } from "../../../ui/kit/button";
import { openModal } from "../../../ui/kit/modal";
import { color } from "../../../ui/kit/theme";
import type { ChatRequest } from "../chat";
import { feedRequest } from "../chat/commands/feed";
import type { FeedCandidate } from "../chat/feed";
import { findFeedable } from "../chat/feedRead";
import { styled } from "./dom";
import { openFeedSettingsModal } from "./feedSettingsModal";
import { speciesIcon } from "./harvestChips";
import { settingsNotice } from "./settingsNotice";
import { openSettingsModal } from "./settingsModal";

const REFRESH_MS = 5000;
const CROP_ICON_PX = 26;

function row(candidate: FeedCandidate): HTMLElement {
  const line = styled("div", {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "9px 11px",
    borderRadius: "12px",
    border: `1px solid ${color.border}`,
    background: color.cardBg,
  });

  const text = styled("div", { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "0" });
  text.append(
    styled("div", { fontSize: "12.5px", color: color.text }, candidate.petName),
    styled(
      "div",
      { fontSize: "11px", color: candidate.hungerPct <= 5 ? color.warn : color.textDim },
      candidate.source.kind === "garden"
        ? `${candidate.hungerPct}% left, I would pick a ${candidate.source.species}`
        : `${candidate.hungerPct}% left, I have a ${candidate.source.species} in the bag`,
    ),
  );

  const icon = speciesIcon(candidate.source.species, CROP_ICON_PX);
  icon.title = candidate.source.species;

  line.append(text, icon);
  return line;
}

export function openFeedModal(host: HTMLElement, onAsk: (request: ChatRequest) => void): void {
  let picks: FeedCandidate[] = [];

  const modal = openModal({
    host,
    title: "Who needs feeding?",
    widthPx: 420,
    onClose: () => clearInterval(timer),
  });

  const list = styled("div", { display: "flex", flexDirection: "column", gap: "7px" });
  const empty = styled(
    "div",
    { fontSize: "12px", color: color.textDim, padding: "10px 2px", lineHeight: "1.5" },
    "Nobody is hungry, or I have nothing they eat.",
  );

  const notice = settingsNotice("feed", "Pet feed is not set up. I warn below 10% and may pick from the garden.", () => {
    modal.close();
    openFeedSettingsModal(host, () => openSettingsModal(host));
  });

  modal.body.append(notice, list, empty);

  const askButton = button("Ask to feed them", {
    size: "sm",
    block: true,
    variant: "primary",
    onClick: () => {
      // The pets are looked for again at confirmation: that is what notices a
      // pet fed meanwhile, or a crop that went.
      onAsk(feedRequest(picks.length === 1 ? `Feed ${picks[0].petName}` : "Feed my hungry pets", () => findFeedable()));
      modal.close();
    },
  });
  askButton.style.marginLeft = "auto";
  modal.footer.append(askButton);

  function render(): void {
    if (!modal.isOpen()) return;
    list.replaceChildren(...picks.map(row));
    empty.style.display = picks.length === 0 ? "" : "none";
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
