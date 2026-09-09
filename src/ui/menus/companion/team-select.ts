// src/ui/menus/companion/team-select.ts
// Le choix d'une équipe de travail, partagé par les écrans de réglages.
//
// Trois écrans le réutilisent — récolte, couvée, vente — et la subtilité qu'ils
// partagent tient en une ligne : une équipe supprimée depuis le dernier réglage
// ne doit pas laisser le sélecteur sur une valeur fantôme. On retombe alors sur
// « ne pas y toucher », qui est le comportement sûr.

import { PetsService } from "../../../services/pets";
import { TEXT, css } from "../panel-ui";

/** Un `<select>` ne porte pas `null` : la chaîne vide dit « laisse mon équipe ». */
const NO_TEAM = "";

export type TeamSelect = {
  el: HTMLSelectElement;
  /** Vrai quand le joueur n'a aucune équipe montée. */
  readonly empty: boolean;
};

export function teamSelect(current: string | null, onPick: (teamId: string | null) => void): TeamSelect {
  const el = document.createElement("select");
  el.className = "qws-pnl-select";
  css(el, { fontSize: "12px", color: TEXT, minWidth: "150px" });

  const none = document.createElement("option");
  none.value = NO_TEAM;
  none.textContent = "Leave my team alone";
  el.append(none);

  let teams: Array<{ id: string; name: string }> = [];
  try {
    teams = PetsService.getTeams().map((team) => ({ id: team.id, name: team.name }));
  } catch {
    teams = [];
  }

  for (const team of teams) {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.name;
    el.append(option);
  }

  el.value = current && teams.some((team) => team.id === current) ? current : NO_TEAM;
  el.addEventListener("change", () => onPick(el.value === NO_TEAM ? null : el.value));

  return { el, empty: teams.length === 0 };
}

/** Ce qu'on dit sous les sélecteurs quand le joueur n'a monté aucune équipe. */
export const NO_TEAMS_HINT = "No pet teams yet. Build one in the Pets tab.";
