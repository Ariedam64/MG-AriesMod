// Harvest settings: which team he picks with.
//
// What he harvests is chosen in the Harvest popup, request by request. Only
// what holds for every harvest lives here.

import { CompanionService } from "..";
import { settingRow } from "../../../ui/kit/layout";
import { loadCompanionSettings, markReviewed } from "../state";
import { openCompanionModal } from "./dom";
import { NO_TEAMS_HINT, addBackButton, settingsHint, teamSelect } from "./settingsParts";

export function openHarvestSettingsModal(host: HTMLElement, back: () => void): void {
  markReviewed("harvest");

  const modal = openCompanionModal({ host, title: "Harvest", widthPx: 460 });
  const settings = loadCompanionSettings();

  const team = teamSelect(settings.harvestTeamId, (teamId) => {
    void CompanionService.applySettings({ harvestTeamId: teamId });
  });

  modal.body.append(
    settingRow("Harvest team", "Worn while he picks, for abilities that pay off on harvest.", team.el).row,
    settingsHint(
      team.empty
        ? NO_TEAMS_HINT
        : "He names the team before he picks, and puts yours back after. What he may pick still comes from your Locker.",
    ),
  );
  addBackButton(modal, back);
}
