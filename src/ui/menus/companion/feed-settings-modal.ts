// src/ui/menus/companion/feed-settings-modal.ts
// Réglages du nourrissage : quand il s'inquiète, et avec quoi.

import { CompanionService } from "../../../services/companion";
import { checkFeedNow } from "../../../services/companion/chat/feedWatch";
import { loadCompanionSettings, markReviewed } from "../../../services/companion/state";
import { TEXT_DIM, button, css, numberField, toggle } from "../panel-ui";
import { settingRow } from "../panel-layout";
import { openModal } from "./modal";
import { openSettingsModal } from "./settings-modal";

/** Bornes du seuil : hors de là, la valeur ne veut plus rien dire. */
const MIN_PCT = 1;
const MAX_PCT = 90;

export function openFeedSettingsModal(host: HTMLElement): void {
  markReviewed("feed");

  const modal = openModal({ host, title: "Pet feed", widthPx: 440 });
  const settings = loadCompanionSettings();

  const alerts = toggle(settings.feedAlerts, (on) => {
    void CompanionService.applySettings({ feedAlerts: on }).then(checkFeedNow);
  });

  const threshold = numberField(MIN_PCT, MAX_PCT, 1, settings.feedThresholdPct);
  threshold.addEventListener("change", () => {
    const value = Math.max(MIN_PCT, Math.min(MAX_PCT, Math.round(Number(threshold.value) || MIN_PCT)));
    threshold.value = String(value);
    void CompanionService.applySettings({ feedThresholdPct: value }).then(checkFeedNow);
  });

  const fromGarden = toggle(settings.feedFromGarden, (on) => {
    void CompanionService.applySettings({ feedFromGarden: on }).then(checkFeedNow);
  });

  const note = document.createElement("div");
  css(note, { fontSize: "11px", lineHeight: "1.5", color: TEXT_DIM });
  note.textContent =
    "He only speaks up when he has something to give. He always asks first.";

  modal.body.append(
    settingRow("Tell me when a pet is starving", "He offers, and waits for your answer.", alerts).row,
    settingRow("Warn below", `Fullness that worries him (${MIN_PCT} to ${MAX_PCT}).`, threshold).row,
    settingRow(
      "May pick from the garden",
      "Lets him pick a ripe crop when the bag is empty. Your Locker still applies.",
      fromGarden
    ).row,
    note
  );

  modal.footer.append(
    button("Back", "neutral", () => {
      modal.close();
      openSettingsModal(host);
    })
  );
}
