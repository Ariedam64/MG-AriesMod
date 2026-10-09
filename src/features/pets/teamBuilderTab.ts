// The Team Builder tab of the Pets menu: scans the pets the player owns and
// proposes ready-to-save teams per goal, in Active and AFK variants. The
// scoring lives in teamBuilder.ts; this file only draws it.

import { getPetMaxStrength, getPetStrength } from "../../data/rules/petValue";
import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { flexRow } from "../../ui/kit/layout";
import { color } from "../../ui/kit/theme";
import { toastSimple } from "../../ui/toast";
import { abilityDots } from "./abilityChips";
import { getAbilityChipColors } from "./abilityChipColors";
import { PetsService, type InventoryPet } from "./pets";
import { petIcon } from "./petIcon";
import { buildSuggestedTeams, type SuggestedTeam, type UnusedPetInfo } from "./teamBuilder";
import { renderTeamStats } from "./teamStatsView";

const MINI_ICON_PX = 24;

// One line per pet: icon, name (cut with an ellipsis), strength, ability
// dots. A second line is what made the cards tall before.
function renderPetChip(pet: InventoryPet | undefined): HTMLElement {
  const chip = document.createElement("div");
  Object.assign(chip.style, {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    minWidth: "0",
    padding: "3px 4px",
    borderRadius: "6px",
    transition: "background 100ms ease",
  } as CSSStyleDeclaration);
  chip.onmouseenter = () => { chip.style.background = color.hoverBg; };
  chip.onmouseleave = () => { chip.style.background = "transparent"; };

  chip.appendChild(petIcon(pet ?? null, MINI_ICON_PX));

  const nameSpan = document.createElement("span");
  nameSpan.style.fontSize = "11px";
  nameSpan.style.fontWeight = "600";
  nameSpan.style.overflow = "hidden";
  nameSpan.style.textOverflow = "ellipsis";
  nameSpan.style.whiteSpace = "nowrap";
  nameSpan.style.flex = "1 1 auto";
  nameSpan.style.minWidth = "0";
  nameSpan.textContent = pet ? (pet.name || pet.petSpecies || "?") : "-";
  chip.appendChild(nameSpan);

  if (pet) {
    const strBadge = document.createElement("span");
    strBadge.textContent = `${getPetStrength(pet)}/${getPetMaxStrength(pet)}`;
    strBadge.title = "Strength (current/max). Teams rank by max strength.";
    Object.assign(strBadge.style, {
      fontSize: "10px",
      fontVariantNumeric: "tabular-nums",
      color: color.textSoft,
      background: color.hoverBg,
      padding: "1px 6px",
      borderRadius: "999px",
      flex: "0 0 auto",
    } as CSSStyleDeclaration);
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
  const glow = isAfk ? color.warn : color.sepia;
  const title = isAfk ? `${abilityLabel(team)} (AFK)` : abilityLabel(team);
  const teamCard = card(title, {
    tone: isAfk ? "accent" : "default",
    compactHeader: true,
    gap: 6,
  });
  Object.assign(teamCard.root.style, {
    padding: "8px 10px 10px",
    position: "relative",
    overflow: "hidden",
    transition: "transform 140ms ease, box-shadow 140ms ease",
  } as CSSStyleDeclaration);
  teamCard.root.onmouseenter = () => {
    teamCard.root.style.transform = "translateY(-2px)";
    teamCard.root.style.boxShadow = `0 4px 0 ${color.sandShade}, 0 0 0 2px ${glow}`;
  };
  teamCard.root.onmouseleave = () => {
    teamCard.root.style.transform = "none";
    teamCard.root.style.boxShadow = "";
  };

  // The left strip shows the ability colours the team is built around (the
  // same palette as the ability dots), blended top to bottom when the team
  // merges more than one category.
  const stripColors = team.categories.map((c) => getAbilityChipColors(c.abilityId).bg);
  const strip = document.createElement("div");
  Object.assign(strip.style, {
    position: "absolute",
    left: "0",
    top: "0",
    bottom: "0",
    width: "4px",
    background: stripColors.length > 1 ? `linear-gradient(180deg, ${stripColors.join(", ")})` : stripColors[0],
  } as CSSStyleDeclaration);
  teamCard.root.appendChild(strip);

  const petsCol = document.createElement("div");
  petsCol.style.display = "grid";
  petsCol.style.gap = "1px";
  for (const id of team.petIds) {
    petsCol.appendChild(renderPetChip(petsById.get(id)));
  }
  teamCard.body.appendChild(petsCol);

  // What the team is worth at these pets' strengths, for the goal it was built
  // for only: a Crop Size team reports Crop Size, not every unrelated ability
  // its pets carry. Collapsed by default, since the grid holds many cards.
  const teamPets = team.petIds
    .map((id) => petsById.get(id))
    .filter((pet): pet is InventoryPet => Boolean(pet));
  teamCard.body.appendChild(renderTeamStats(teamPets, { focusAbilityIds: team.focusAbilityIds }));

  const saveBtn = button("💾 Save", {
    variant: "primary",
    size: "sm",
    onClick: () => {
      const name = buildSaveName(team, isAfk);
      const created = PetsService.createTeam(name);
      PetsService.saveTeam({ id: created.id, slots: [...team.petIds, null, null].slice(0, 3) });
      void toastSimple("Team saved", name, "success");
    },
  });
  Object.assign(saveBtn.style, {
    marginTop: "2px",
    width: "84px",
    height: "24px",
    minHeight: "24px",
    maxHeight: "24px",
    boxSizing: "border-box",
    padding: "0",
    fontSize: "11px",
    lineHeight: "1",
    justifySelf: "center",
    alignSelf: "center",
    flexShrink: "0",
  } as CSSStyleDeclaration);
  teamCard.body.appendChild(saveBtn);

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
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "6px";
  row.style.padding = "3px 0";
  row.style.opacity = "0.75";

  row.appendChild(renderPetChip(info.pet));

  const reason = document.createElement("span");
  reason.textContent = unusedReasonText(info);
  reason.style.fontSize = "10px";
  reason.style.opacity = "0.7";
  reason.style.flex = "0 0 auto";
  reason.style.whiteSpace = "nowrap";
  reason.style.overflow = "hidden";
  reason.style.textOverflow = "ellipsis";
  reason.style.maxWidth = "45%";
  row.appendChild(reason);

  return row;
}

// Collapsed by default: the list can get long, and it matters less than the
// suggested teams above.
function renderUnusedSection(unusedPets: UnusedPetInfo[]): HTMLElement {
  const section = card(`🗑️ Not used in any team (${unusedPets.length})`, { tone: "muted", compactHeader: true, gap: 4 });
  section.root.style.gridColumn = "1 / -1";
  section.root.style.padding = "8px 10px";

  const chevron = document.createElement("span");
  chevron.textContent = "▸";
  chevron.style.display = "inline-block";
  chevron.style.marginLeft = "8px";
  chevron.style.opacity = "0.6";
  chevron.style.transition = "transform 120ms ease";
  section.header.appendChild(chevron);
  section.header.style.cursor = "pointer";
  section.header.style.userSelect = "none";

  const list = document.createElement("div");
  list.style.display = "none";
  list.style.gap = "1px";
  for (const info of unusedPets) {
    list.appendChild(renderUnusedRow(info));
  }
  section.body.appendChild(list);

  let expanded = false;
  section.header.addEventListener("click", () => {
    expanded = !expanded;
    list.style.display = expanded ? "grid" : "none";
    chevron.style.transform = expanded ? "rotate(90deg)" : "none";
  });

  return section.root;
}

async function loadTeams(): Promise<{ teams: SuggestedTeam[]; sustainPet: InventoryPet | null; unusedPets: UnusedPetInfo[]; petsById: Map<string, InventoryPet> }> {
  const pets = await PetsService.getInventoryPets();
  const petsById = new Map(pets.map((p) => [p.id, p] as const));
  const { teams, sustainPet, unusedPets } = buildSuggestedTeams(pets);
  return { teams, sustainPet, unusedPets, petsById };
}

export function renderTeamBuilderTab(view: HTMLElement): void {
  view.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "10px";
  wrap.style.alignContent = "start";
  wrap.style.minHeight = "0";
  wrap.style.maxHeight = "54vh";
  wrap.style.overflow = "auto";
  view.appendChild(wrap);

  const header = flexRow({ justify: "end", fullWidth: true });
  header.style.paddingBottom = "8px";
  header.style.borderBottom = `1px solid ${color.border}`;

  const refreshBtn = button("🔄 Refresh", { size: "sm" });
  header.appendChild(refreshBtn);
  wrap.appendChild(header);

  const content = document.createElement("div");
  content.style.display = "grid";
  content.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr))";
  content.style.gap = "8px";
  wrap.appendChild(content);

  async function repaint() {
    content.innerHTML = "";
    const loading = document.createElement("div");
    loading.textContent = "Loading…";
    loading.style.opacity = "0.6";
    content.appendChild(loading);

    const { teams, unusedPets, petsById } = await loadTeams();
    if (!view.isConnected) return;

    content.innerHTML = "";

    if (!teams.length) {
      const empty = document.createElement("div");
      empty.textContent = "No useful team found. Hatch pets with offensive abilities.";
      empty.style.opacity = "0.7";
      content.appendChild(empty);
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
