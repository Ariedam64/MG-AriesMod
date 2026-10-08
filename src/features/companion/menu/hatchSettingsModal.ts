// Hatching settings: which team he hatches with, which he sells with.
//
// Two teams and nothing else. What to keep is chosen in the Hatch popup, when
// the hatch starts and the bag is in sight; only what does not depend on one
// hatch lives here.

import { CompanionService } from "..";
import { settingRow } from "../../../ui/kit/layout";
import { openModal } from "../../../ui/kit/modal";
import { loadCompanionSettings, markReviewed } from "../state";
import { NO_TEAMS_HINT, addBackButton, settingsHint, teamSelect } from "./settingsParts";

export function openHatchSettingsModal(host: HTMLElement, back: () => void): void {
  // Opening the screen is enough: leaving it as it is is a choice, and
  // reminding them forever would be nagging.
  markReviewed("hatch");

  const modal = openModal({ host, title: "Hatching", widthPx: 460 });
  const settings = loadCompanionSettings();

  const hatchTeam = teamSelect(settings.hatchTeamId, (teamId) => {
    void CompanionService.applySettings({ hatchTeamId: teamId });
  });

  const sellTeam = teamSelect(settings.hatchSellTeamId, (teamId) => {
    void CompanionService.applySettings({ hatchSellTeamId: teamId });
  });

  modal.body.append(
    settingRow("Team to wear while hatching", "For abilities that change what hatches.", hatchTeam.el).row,
    settingRow("Team to wear while selling", "Only during the sale. Yours comes straight back after.", sellTeam.el).row,
    settingsHint(
      hatchTeam.empty
        ? NO_TEAMS_HINT
        : "The game will not sell a pet on your active team, so a smaller team frees the rest. He asks first, and puts yours back after.",
    ),
  );
  addBackButton(modal, back);
}
