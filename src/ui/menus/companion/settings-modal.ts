// src/ui/menus/companion/settings-modal.ts
// Réglages du companion, groupés par sujet.
//
// Ce qui se règle *par action* vit ici, pas dans l'onglet Behavior : celui-ci
// porte ce qu'est le companion (actif, mode, apparence), pas ce qu'il fait.
//
// Un groupe jamais ouvert est signalé : c'est le même avertissement que porte
// la popup de l'action concernée, pour qu'on puisse le régler d'un côté comme
// de l'autre.

import { loadCompanionSettings, type SettingsGroup } from "../../../services/companion/state";
import { describeKeep, hasAnyRule } from "../../../services/companion/chat/hatch";
import { teamName } from "../../../services/companion/chat/teamSwap";
import { openFeedSettingsModal } from "./feed-settings-modal";
import { openHarvestSettingsModal } from "./harvest-settings-modal";
import { openHatchSettingsModal } from "./hatch-settings-modal";
import { menuCard, openModal } from "./modal";

/** Ce qu'on dit d'une équipe de travail, réglée ou non. */
function teamLine(teamId: string | null, verb: string): string {
  const name = teamName(teamId);
  return name ? `Wears ${name} to ${verb}.` : `Keeps your team on while ${verb}.`;
}

export function openSettingsModal(host: HTMLElement): void {
  const modal = openModal({ host, title: "Settings", widthPx: 440 });
  const settings = loadCompanionSettings();
  const unseen = (group: SettingsGroup): string =>
    settings.reviewedSettings.includes(group) ? "" : " Not set up yet.";

  const feedDetail = settings.feedAlerts
    ? `Warns below ${settings.feedThresholdPct}%${settings.feedFromGarden ? ", may pick from the garden" : ", from the bag only"}.`
    : "Off. He stays quiet about hungry pets.";

  const keeping = hasAnyRule(settings.hatchKeepRules)
    ? `Keeps ${describeKeep(settings.hatchKeepRules)}.`
    : "Nothing set to keep yet.";

  modal.body.append(
    menuCard({
      name: "Pet feed",
      detail: `${feedDetail}${unseen("feed")}`,
      onClick: () => {
        modal.close();
        openFeedSettingsModal(host);
      },
    }),
    menuCard({
      name: "Harvest",
      detail: `${teamLine(settings.harvestTeamId, "harvest")}${unseen("harvest")}`,
      onClick: () => {
        modal.close();
        openHarvestSettingsModal(host);
      },
    }),
    menuCard({
      name: "Hatching",
      detail: `${keeping} ${teamLine(settings.hatchSellTeamId, "sell")}${unseen("hatch")}`,
      onClick: () => {
        modal.close();
        openHatchSettingsModal(host);
      },
    })
  );
}
