// Pieces the three settings screens (feed, harvest, hatching) share.

import { button } from "../../../ui/kit/button";
import { select } from "../../../ui/kit/fields";
import type { Modal } from "../../../ui/kit/modal";
import { PetsService } from "../../pets/pets";
import { part } from "./dom";

/** A `<select>` cannot hold `null`: the empty string means "leave my team alone". */
const NO_TEAM = "";

/** What the screens say under the team pickers when the player built no team. */
export const NO_TEAMS_HINT = "No pet teams yet. Build one in the Pets tab.";

type TeamSelect = {
  el: HTMLSelectElement;
  /** True when the player has no team built. */
  readonly empty: boolean;
};

/**
 * A work team picker.
 *
 * A team deleted since it was picked must not leave the picker on a ghost
 * value: it falls back on "leave my team alone", the safe behaviour.
 */
export function teamSelect(current: string | null, onPick: (teamId: string | null) => void): TeamSelect {
  const el = select({ small: true, width: "150px" });
  el.append(new Option("Leave my team alone", NO_TEAM));

  let teams: Array<{ id: string; name: string }> = [];
  try {
    teams = PetsService.getTeams().map((team) => ({ id: team.id, name: team.name }));
  } catch {
    teams = [];
  }
  for (const team of teams) el.append(new Option(team.name, team.id));

  el.value = current && teams.some((team) => team.id === current) ? current : NO_TEAM;
  el.addEventListener("change", () => onPick(el.value === NO_TEAM ? null : el.value));

  return { el, empty: teams.length === 0 };
}

/** The explanation under a screen's settings. */
export function settingsHint(text: string): HTMLElement {
  return part("div", "qws-cmp-hint", text);
}

/** The footer's Back button, which returns to wherever the screen was opened from. */
export function addBackButton(modal: Modal, back: () => void): void {
  modal.footer.append(
    button("Back", {
      size: "sm",
      onClick: () => {
        modal.close();
        back();
      },
    }),
  );
}
