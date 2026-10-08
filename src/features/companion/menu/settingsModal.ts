// The companion's settings, grouped by subject.
//
// What is set *per action* lives here, not in the Behavior tab, which holds
// what the companion is (on, mode, look), not what he does. A group never
// opened is flagged: it is the same warning the action's popup carries, so it
// can be set up from either side.

import { menuCard, openModal } from "../../../ui/kit/modal";
import { teamName } from "../chat/crew";
import { describeKeep, hasAnyRule } from "../chat/hatch";
import { loadCompanionSettings, type SettingsGroup } from "../state";
import { openFeedSettingsModal } from "./feedSettingsModal";
import { openHarvestSettingsModal } from "./harvestSettingsModal";
import { openHatchSettingsModal } from "./hatchSettingsModal";

/** What is said about a work team, set or not. */
function teamLine(teamId: string | null, verb: string): string {
  const name = teamName(teamId);
  return name ? `Wears ${name} to ${verb}.` : `Keeps your team on while ${verb}.`;
}

export function openSettingsModal(host: HTMLElement): void {
  const modal = openModal({ host, title: "Settings", widthPx: 440 });
  const settings = loadCompanionSettings();
  const unseen = (group: SettingsGroup): string => (settings.reviewedSettings.includes(group) ? "" : " Not set up yet.");
  // Each screen's Back button comes back here.
  const back = () => openSettingsModal(host);

  const feedDetail = settings.feedAlerts
    ? `Warns below ${settings.feedThresholdPct}%${settings.feedFromGarden ? ", may pick from the garden" : ", from the bag only"}.`
    : "Off. He stays quiet about hungry pets.";

  const keeping = hasAnyRule(settings.hatchKeepRules)
    ? `Keeps ${describeKeep(settings.hatchKeepRules)}.`
    : "Nothing set to keep yet.";

  const entry = (name: string, detail: string, open: (host: HTMLElement, back: () => void) => void) =>
    menuCard({
      name,
      detail,
      onClick: () => {
        modal.close();
        open(host, back);
      },
    });

  modal.body.append(
    entry("Pet feed", `${feedDetail}${unseen("feed")}`, openFeedSettingsModal),
    entry("Harvest", `${teamLine(settings.harvestTeamId, "harvest")}${unseen("harvest")}`, openHarvestSettingsModal),
    entry("Hatching", `${keeping} ${teamLine(settings.hatchSellTeamId, "sell")}${unseen("hatch")}`, openHatchSettingsModal),
  );
}
