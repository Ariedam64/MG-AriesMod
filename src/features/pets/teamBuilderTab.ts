// The Team Builder tab of the Pets menu: scans the pets the player owns and
// proposes ready-to-save teams per goal, in Active and AFK variants. The
// scoring lives in teamBuilder.ts; this file only draws it.

import { getPetMaxStrength, getPetStrength } from "../../data/rules/petValue";
import { button } from "../../ui/kit/button";
import { pill } from "../../ui/kit/badges";
import { card } from "../../ui/kit/card";
import { collapsibleCard } from "../../ui/kit/layout";
import { toastSimple } from "../../ui/toast";
import { abilityDots } from "./abilityChips";
import { getAbilityChipColors } from "./abilityChipColors";
import { PetsService, type InventoryPet } from "./pets";
import { petIcon } from "./petIcon";
import { ensurePetsStyles } from "./styles";
import { buildSuggestedTeams, type SuggestedTeam, type UnusedPetInfo } from "./teamBuilder";
import { renderTeamStats } from "./teamStatsView";

const MINI_ICON_PX = 24;

function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

// One line per pet: icon, name (cut with an ellipsis), strength, ability
// dots. A second line is what made the cards tall before.
function renderPetChip(pet: InventoryPet | undefined): HTMLElement {
  const chip = document.createElement("div");
  chip.className = "pt-chip";
  chip.appendChild(petIcon(pet ?? null, MINI_ICON_PX));
  chip.appendChild(span("pt-chip__name", pet ? (pet.name || pet.petSpecies || "?") : "-"));

  if (pet) {
    const strength = getPetStrength(pet);
    const maxStrength = getPetMaxStrength(pet);
    const strBadge = span(strength >= maxStrength && maxStrength > 0 ? "pt-str is-max" : "pt-str", `${strength}/${maxStrength}`);
    strBadge.title = "Strength (current/max). Teams rank by max strength.";
    chip.appendChild(strBadge);
    chip.appendChild(abilityDots(pet.abilities, { size: 9, gap: 4 }));
  }

  return chip;
}

// The native pet-team name field caps at 16 characters, and most category
// labels alone already exceed that. So the saved name is a compact, truncated
// version, separate from the full label shown in the card header.
const TEAM_NAME_MAX_LENGTH = 16;

// Count by Unicode code point, not UTF-16 code unit, so a single emoji isn't
// counted as 2 characters and truncation never splits a surrogate pair.
function charLength(text: string): number {
  return Array.from(text).length;
}

function truncateChars(text: string, maxLength: number): string {
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;
  if (maxLength <= 1) return chars.slice(0, Math.max(0, maxLength)).join("");
  return `${chars.slice(0, maxLength - 1).join("")}…`;
}

// Weather-exclusive categories carry the weather name as a "(...)" suffix on
// their label (e.g. "Mutation: Ambershine (Amber Moon)"). Reusing it keeps a
// weather team's title saying which weather it needs, attached to the shorter
// ability name instead of the full category label.
function weatherSuffix(label: string): string {
  return label.match(/\([^)]+\)$/)?.[0] ?? "";
}

// Terser weather names for the saved-team-name attempt, where every
// character counts toward the game's 16-char limit.
const SHORT_WEATHER: Record<string, string> = {
  Frost: "Frost",
  Dawn: "Dawn",
  "Amber Moon": "Moon",
  Thunderstorm: "Storm",
};

function shortWeatherSuffix(label: string): string {
  const full = weatherSuffix(label);
  if (!full) return "";
  const inner = full.slice(1, -1);
  return `(${SHORT_WEATHER[inner] ?? inner})`;
}

// A terse name (category.shortLabel, e.g. "Plant") tried before the full
// ability name: short enough that most single categories, and even a
// two-category merge ("Plant + Egg"), still fit the 16-char limit without
// falling back to icons.
function shortCategoryLabel(team: SuggestedTeam): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const c of team.categories) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const weather = shortWeatherSuffix(c.label);
    names.push(weather ? `${c.shortLabel} ${weather}` : c.shortLabel);
  }
  return names.join(" + ");
}

// The real ability name (e.g. "Amberlit Granter") reads shorter and more
// direct than the goal-category label ("Mutation: Ambershine"). Deduped in
// case a merge ever lands on the same ability twice.
function abilityLabel(team: SuggestedTeam): string {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const c of team.categories) {
    if (seen.has(c.abilityId)) continue;
    seen.add(c.abilityId);
    const name = PetsService.getAbilityName(c.abilityId) || c.label;
    const weather = weatherSuffix(c.label);
    names.push(weather ? `${name} ${weather}` : name);
  }
  return names.join(" + ");
}

function buildSaveName(team: SuggestedTeam, isAfk: boolean): string {
  const suffix = isAfk ? " AFK" : "";
  const budget = Math.max(1, TEAM_NAME_MAX_LENGTH - charLength(suffix));

  // Try shortest first (e.g. "Plant + Egg", "Amber (Moon)"), then the full
  // ability name, before giving up on text entirely.
  const shortLabel = shortCategoryLabel(team);
  if (charLength(shortLabel) <= budget) return `${shortLabel}${suffix}`;

  const fullLabel = abilityLabel(team);
  if (charLength(fullLabel) <= budget) return `${fullLabel}${suffix}`;

  // Neither fits. A truncated half-word ("Plant Growth S…") is no more
  // readable than the icons, so go straight to icons only.
  const icons = team.categories.map((c) => c.icon).join("");
  return `${truncateChars(icons, budget)}${suffix}`;
}

function renderTeamCard(team: SuggestedTeam, petsById: Map<string, InventoryPet>): HTMLElement {
  const isAfk = team.mode === "afk";

  const saveBtn = button("Save", {
    size: "sm",
    tooltip: "Save as a new team in the Teams tab",
    onClick: () => {
      const name = buildSaveName(team, isAfk);
      const created = PetsService.createTeam(name);
      PetsService.saveTeam({ id: created.id, slots: [...team.petIds, null, null].slice(0, 3) });
      void toastSimple("Team saved", name, "success");
    },
  });
  const actions: HTMLElement[] = [saveBtn];
  if (isAfk) {
    const afk = pill("AFK", "warn");
    afk.title = "Every ability here works while you are away.";
    actions.unshift(afk);
  }

  const teamCard = card(abilityLabel(team), { tone: isAfk ? "accent" : "default", actions });
  teamCard.root.classList.add("pt-suggest");

  // The left strip shows the ability colours the team is built around (the
  // same palette as the ability dots), blended top to bottom when the team
  // merges more than one category.
  const stripColors = team.categories.map((c) => getAbilityChipColors(c.abilityId).bg);
  const strip = document.createElement("div");
  strip.className = "pt-suggest__strip";
  strip.style.background = stripColors.length > 1 ? `linear-gradient(180deg, ${stripColors.join(", ")})` : stripColors[0];
  teamCard.root.appendChild(strip);

  const petsCol = document.createElement("div");
  petsCol.className = "pt-suggest__pets";
  for (const id of team.petIds) {
    petsCol.appendChild(renderPetChip(petsById.get(id)));
  }
  teamCard.body.appendChild(petsCol);

  // What the team is worth at these pets' strengths, for the goal it was built
  // for only: a Crop Size team reports Crop Size, not every unrelated ability
  // its pets carry.
  const teamPets = team.petIds
    .map((id) => petsById.get(id))
    .filter((pet): pet is InventoryPet => Boolean(pet));
  teamCard.body.appendChild(renderTeamStats(teamPets, { focusAbilityIds: team.focusAbilityIds }));

  return teamCard.root;
}

function unusedReasonText(info: UnusedPetInfo): string {
  if (info.untracked) return "no tracked ability";
  const parts = info.outrankedIn.slice();
  if (info.outrankedAsSustain) parts.push("Sustain");
  return `outranked in: ${parts.join(", ")}`;
}

function renderUnusedRow(info: UnusedPetInfo): HTMLElement {
  const row = document.createElement("div");
  row.className = "pt-unused";
  row.appendChild(renderPetChip(info.pet));
  const reason = span("pt-unused__why", unusedReasonText(info));
  reason.title = reason.textContent ?? "";
  row.appendChild(reason);
  return row;
}

// Collapsed each time the tab draws: the list can get long, and it matters
// less than the suggested teams above.
function renderUnusedSection(unusedPets: UnusedPetInfo[]): HTMLElement {
  const section = collapsibleCard({
    title: `Not used in any team (${unusedPets.length})`,
    description: "Pets another one outranks, or with no ability a team is built on.",
    collapsed: true,
    onToggle: () => {},
  });
  for (const info of unusedPets) {
    section.body.appendChild(renderUnusedRow(info));
  }
  return section.root;
}

async function loadTeams(): Promise<{ teams: SuggestedTeam[]; sustainPet: InventoryPet | null; unusedPets: UnusedPetInfo[]; petsById: Map<string, InventoryPet> }> {
  const pets = await PetsService.getInventoryPets();
  const petsById = new Map(pets.map((p) => [p.id, p] as const));
  const { teams, sustainPet, unusedPets } = buildSuggestedTeams(pets);
  return { teams, sustainPet, unusedPets, petsById };
}

export function renderTeamBuilderTab(view: HTMLElement): void {
  ensurePetsStyles();
  view.replaceChildren();

  const wrap = document.createElement("div");
  wrap.className = "pt-tab";
  view.appendChild(wrap);

  const header = document.createElement("div");
  header.className = "pt-builder__bar";
  const refreshBtn = button("Refresh", { size: "sm", tooltip: "Look at your pets again" });
  header.append(span("pt-hint", "Teams made from the pets you own, best first. Save one to use it."), refreshBtn);
  wrap.appendChild(header);

  const scroller = document.createElement("div");
  scroller.className = "pt-scroll";
  const content = document.createElement("div");
  content.className = "pt-builder__grid";
  scroller.appendChild(content);
  wrap.appendChild(scroller);

  const message = (text: string) => content.replaceChildren(span("pt-empty", text));

  async function repaint() {
    message("Looking at your pets…");

    const { teams, unusedPets, petsById } = await loadTeams();
    if (!view.isConnected) return;

    content.replaceChildren();

    if (!teams.length) {
      message("No useful team found. Hatch pets with offensive abilities.");
      return;
    }

    for (const team of teams) {
      content.appendChild(renderTeamCard(team, petsById));
    }

    if (unusedPets.length) {
      content.appendChild(renderUnusedSection(unusedPets));
    }
  }

  refreshBtn.addEventListener("click", () => { void repaint(); });

  void repaint();
}
