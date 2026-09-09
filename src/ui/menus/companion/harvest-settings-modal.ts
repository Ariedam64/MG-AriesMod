// src/ui/menus/companion/harvest-settings-modal.ts
// Réglages de la récolte : avec quelle équipe il cueille.
//
// Ce qu'il récolte se choisit dans la popup Harvest, demande par demande. Ici
// ne vit que ce qui vaut pour toutes les récoltes.

import { CompanionService } from "../../../services/companion";
import { loadCompanionSettings, markReviewed } from "../../../services/companion/state";
import { TEXT_DIM, button, css } from "../panel-ui";
import { settingRow } from "../panel-layout";
import { NO_TEAMS_HINT, teamSelect } from "./team-select";
import { openModal } from "./modal";
import { openSettingsModal } from "./settings-modal";

export function openHarvestSettingsModal(host: HTMLElement): void {
  markReviewed("harvest");

  const modal = openModal({ host, title: "Harvest", widthPx: 460 });
  const settings = loadCompanionSettings();

  const team = teamSelect(settings.harvestTeamId, (teamId) => {
    void CompanionService.applySettings({ harvestTeamId: teamId });
  });

  const note = document.createElement("div");
  css(note, { fontSize: "11px", lineHeight: "1.5", color: TEXT_DIM });
  note.textContent = team.empty
    ? NO_TEAMS_HINT
    : "He names the team before he picks, and puts yours back after. What he may pick still comes from your Locker.";

  modal.body.append(
    settingRow(
      "Team to wear while harvesting",
      "For abilities that pay off on harvest.",
      team.el
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
