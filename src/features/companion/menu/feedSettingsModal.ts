// Feeding settings: when he worries, and with what.

import { CompanionService } from "..";
import { numberInput } from "../../../ui/kit/fields";
import { settingRow } from "../../../ui/kit/layout";
import { openModal } from "../../../ui/kit/modal";
import { switchInput } from "../../../ui/kit/toggles";
import { checkFeedNow } from "../feedWatch";
import { loadCompanionSettings, markReviewed } from "../state";
import { addBackButton, settingsHint } from "./settingsParts";

/** The threshold's bounds: outside them the value means nothing. */
const MIN_PCT = 1;
const MAX_PCT = 90;

export function openFeedSettingsModal(host: HTMLElement, back: () => void): void {
  markReviewed("feed");

  const modal = openModal({ host, title: "Pet feed", widthPx: 440 });
  const settings = loadCompanionSettings();

  const alerts = switchInput(settings.feedAlerts, (on) => {
    void CompanionService.applySettings({ feedAlerts: on }).then(checkFeedNow);
  });

  const threshold = numberInput(MIN_PCT, MAX_PCT, 1, settings.feedThresholdPct);
  threshold.addEventListener("change", () => {
    const value = Math.max(MIN_PCT, Math.min(MAX_PCT, Math.round(Number(threshold.value) || MIN_PCT)));
    threshold.value = String(value);
    void CompanionService.applySettings({ feedThresholdPct: value }).then(checkFeedNow);
  });

  const fromGarden = switchInput(settings.feedFromGarden, (on) => {
    void CompanionService.applySettings({ feedFromGarden: on }).then(checkFeedNow);
  });

  modal.body.append(
    settingRow("Tell me when a pet is starving", "He offers, and waits for your answer.", alerts).row,
    settingRow("Warn below", `Fullness that worries him (${MIN_PCT} to ${MAX_PCT}).`, threshold.wrap).row,
    settingRow(
      "May pick from the garden",
      "Lets him pick a ripe crop when the bag is empty. Your Locker still applies.",
      fromGarden,
    ).row,
    settingsHint("He only speaks up when he has something to give. He always asks first."),
  );
  addBackButton(modal, back);
}
