// src/ui/menus/companion/feed-modal.ts
// Aperçu du nourrissage : quels pets ont faim, et avec quoi.
//
// Le choix de ce qu'un pet accepte appartient à l'onglet Pets, comme le choix
// de ce qui est récoltable appartient au Locker. Ici on ne fait que montrer ce
// qui en découle.

import type { HarvestRequest } from "../../../services/companion/chat";
import { findFeedable, type FeedCandidate } from "../../../services/companion/chat/petFeed";
import { BORDER, CARD_BG, TEAL, TEXT, TEXT_DIM, WARN, button, css } from "../panel-ui";
import { speciesIcon } from "./harvest-chips";
import { openModal } from "./modal";
import { settingsNotice } from "./settings-notice";
import { openFeedSettingsModal } from "./feed-settings-modal";

const REFRESH_MS = 5000;
const CROP_ICON_PX = 26;

export function openFeedModal(host: HTMLElement, onAsk: (request: HarvestRequest) => void): void {
  let picks: FeedCandidate[] = [];

  const modal = openModal({
    host,
    title: "Who needs feeding?",
    widthPx: 420,
    onClose: () => clearInterval(timer),
  });

  const list = document.createElement("div");
  css(list, { display: "flex", flexDirection: "column", gap: "7px" });

  const empty = document.createElement("div");
  css(empty, { fontSize: "12px", color: TEXT_DIM, padding: "10px 2px", lineHeight: "1.5" });
  empty.textContent = "Nobody is hungry, or I have nothing they eat.";

  const notice = settingsNotice(
    "feed",
    "Pet feed is not set up. I warn below 10% and may pick from the garden.",
    () => {
      modal.close();
      openFeedSettingsModal(host);
    }
  );

  modal.body.append(notice.root, list, empty);

  const askButton = button("Ask to feed them", "accent", () => {
    onAsk({
      kind: "feed",
      label: picks.length === 1 ? `Feed ${picks[0].petName}` : "Feed my hungry pets",
      // Rappelé à la confirmation : c'est ce qui détecte qu'un pet a été nourri
      // entre-temps, ou que le crop prévu a disparu.
      provider: () => findFeedable(),
    });
    modal.close();
  });
  css(askButton, { marginLeft: "auto" });
  modal.footer.append(askButton);

  function row(candidate: FeedCandidate): HTMLElement {
    const line = document.createElement("div");
    css(line, {
      display: "flex",
      alignItems: "center",
      gap: "10px",
      padding: "9px 11px",
      borderRadius: "12px",
      border: `1px solid ${BORDER}`,
      background: CARD_BG,
    });

    const text = document.createElement("div");
    css(text, { display: "flex", flexDirection: "column", gap: "2px", flex: "1", minWidth: "0" });

    const name = document.createElement("div");
    css(name, { fontSize: "12.5px", color: TEXT });
    name.textContent = candidate.petName;

    const meta = document.createElement("div");
    css(meta, { fontSize: "11px", color: candidate.hungerPct <= 5 ? WARN : TEXT_DIM });
    meta.textContent =
      candidate.source.kind === "garden"
        ? `${candidate.hungerPct}% left, I would pick a ${candidate.source.species}`
        : `${candidate.hungerPct}% left, I have a ${candidate.source.species} in the bag`;

    text.append(name, meta);

    const icon = speciesIcon(candidate.source.species, CROP_ICON_PX);
    icon.title = candidate.source.species;

    line.append(text, icon);
    return line;
  }

  function render(): void {
    if (!modal.isOpen()) return;
    list.innerHTML = "";
    for (const candidate of picks) list.append(row(candidate));
    empty.style.display = picks.length === 0 ? "" : "none";
    askButton.disabled = picks.length === 0;
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
