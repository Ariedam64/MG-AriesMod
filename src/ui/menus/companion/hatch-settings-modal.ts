// src/ui/menus/companion/hatch-settings-modal.ts
// Réglages de la couvée : avec quelle équipe il ouvre, avec quelle il vend.
//
// Deux équipes et rien d'autre. Ce qu'on garde se choisit dans la popup Hatch,
// au moment où on lance la couvée et où on voit ce qu'il y a dans le sac ; ici
// ne vit que ce qui ne dépend pas d'une couvée en particulier.

import { CompanionService } from "../../../services/companion";
import { loadCompanionSettings, markReviewed } from "../../../services/companion/state";
import { TEXT_DIM, button, css } from "../panel-ui";
import { settingRow } from "../panel-layout";
import { NO_TEAMS_HINT, teamSelect } from "./team-select";
import { openModal } from "./modal";
import { openSettingsModal } from "./settings-modal";

export function openHatchSettingsModal(host: HTMLElement): void {
  // Ouvrir l'écran suffit : ne rien y changer est un choix, et le rappeler
  // indéfiniment reviendrait à harceler.
  markReviewed("hatch");

  const modal = openModal({ host, title: "Hatching", widthPx: 460 });
  const settings = loadCompanionSettings();

  const hatchTeam = teamSelect(settings.hatchTeamId, (teamId) => {
    void CompanionService.applySettings({ hatchTeamId: teamId });
  });

  const sellTeam = teamSelect(settings.hatchSellTeamId, (teamId) => {
    void CompanionService.applySettings({ hatchSellTeamId: teamId });
  });

  const note = document.createElement("div");
  css(note, { fontSize: "11px", lineHeight: "1.5", color: TEXT_DIM });
  note.textContent = hatchTeam.empty
    ? NO_TEAMS_HINT
    : "The game will not sell a pet on your active team, so a smaller team frees the rest. He asks first, and puts yours back after.";

  modal.body.append(
    settingRow("Team to wear while hatching", "For abilities that change what hatches.", hatchTeam.el).row,
    settingRow("Team to wear while selling", "Only during the sale. Yours comes straight back after.", sellTeam.el)
      .row,
    note
  );

  modal.footer.append(
    button("Back", "neutral", () => {
      modal.close();
      openSettingsModal(host);
    })
  );
}
