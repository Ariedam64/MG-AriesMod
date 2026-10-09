// Renders what a team is worth: one block per effect plus how long the team
// lasts without feeding. Shared by the Team Builder cards (one effect at a
// time) and the Teams tab's editor (every effect).
//
// All maths lives in teamStats.ts and the wording in teamStatsText.ts; this
// file only lays it out.

import {
  computeTeamStats,
  effectGroupKeyForAbility,
  type EffectGroup,
  type TeamStats,
} from "./teamStats";
import { color } from "../../ui/kit/theme";
import type { InventoryPet } from "./pets";
import { ensurePetsStyles } from "./styles";
import {
  CONTINUOUS_ROLLS_PER_HOUR,
  formatDuration,
  formatPercent,
  groupTitle,
  perProcMagnitude,
  triggerUnit,
} from "./teamStatsText";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/**
 * Shading for how close the team is to its OWN ceiling, not to 100%. A team
 * whose pets are all at max strength reads green however small its absolute
 * proc chance is: there is nothing left to improve about it. Text takes the
 * ink shades, which stay readable on every theme; the bar takes the fills.
 */
function ratioInk(ratio: number): string {
  if (ratio >= 0.9) return color.okInk;
  if (ratio >= 0.75) return color.warnInk;
  return color.dangerInk;
}

function ratioFill(ratio: number): string {
  if (ratio >= 0.99) return color.okInk;
  if (ratio >= 0.9) return color.ok;
  if (ratio >= 0.75) return color.warn;
  return color.danger;
}

/**
 * Progress toward the best this exact team could do, i.e. the same pets at
 * max strength. Scaling against 100% instead would make every team look
 * hopeless: a Rainbow Granter trio caps around 2%, so a perfect team would
 * still render as an almost-empty bar.
 */
function mkBar(current: number, atMax: number): HTMLElement {
  const ratio = atMax > 0 ? Math.max(0, Math.min(1, current / atMax)) : 0;
  const track = el("div", "pt-stat__bar");
  const fill = el("div", "pt-stat__fill");
  fill.style.width = `${Math.max(1.5, ratio * 100)}%`;
  fill.style.background = ratioFill(ratio);
  track.appendChild(fill);
  return track;
}

type GroupNav = { index: number; total: number; onStep: (delta: number) => void };

/** Small ‹ 1/3 › stepper, only built when there is more than one effect. */
function mkNav(nav: GroupNav): HTMLElement {
  const wrap = el("div", "pt-stat__nav");

  const mkArrow = (glyph: string, delta: number, label: string): HTMLElement => {
    const button = el("button", "pt-stat__arrow", glyph);
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", (event) => {
      // The card underneath has its own handlers; stepping must not reach it.
      event.stopPropagation();
      event.preventDefault();
      nav.onStep(delta);
    });
    return button;
  };

  wrap.append(
    mkArrow("‹", -1, "Previous effect"),
    el("span", "pt-stat__count", `${nav.index + 1}/${nav.total}`),
    mkArrow("›", 1, "Next effect"),
  );
  return wrap;
}

/**
 * Team totals for one effect. Deliberately no per-pet breakdown: the useful
 * figure is what the whole team does, and three extra lines per group made
 * the cards unreadable.
 */
function renderGroup(group: EffectGroup, nav?: GroupNav): HTMLElement {
  const block = el("div", "pt-stat");

  const head = el("div", "pt-stat__head");
  const weatherSuffix = group.requiredWeathers.length ? ` · ${group.requiredWeathers.join("/")}` : "";
  const name = el("div", "pt-stat__name", `${groupTitle(group)}${weatherSuffix}`);
  if (weatherSuffix) name.title = "Only fires while this weather is active.";
  head.appendChild(name);
  if (nav) head.appendChild(mkNav(nav));
  block.appendChild(head);

  const value = el("div", "pt-stat__value");

  if (group.combinedProbability === null) {
    const always = el("span", "pt-stat__always", "always on");
    always.title = "This ability has no proc chance: it applies continuously.";
    value.appendChild(always);
    block.appendChild(value);
  } else {
    // The ceiling for these exact pets: same team, every pet at max strength.
    const atMax = group.combinedProbabilityAtMax ?? group.combinedProbability;
    const ratio = atMax > 0 ? Math.min(1, group.combinedProbability / atMax) : 1;
    const isMaxed = ratio >= 0.995;

    const big = el("span", "pt-stat__big", formatPercent(group.combinedProbability));
    big.style.color = ratioInk(ratio);
    value.append(big, el("span", "pt-stat__unit", triggerUnit(group.trigger)));

    // Only worth showing when there is headroom left: repeating the same
    // number as "max" on an already-maxed team is noise.
    if (!isMaxed) value.appendChild(el("span", "pt-stat__max", `max ${formatPercent(atMax)}`));

    // Rolling once a minute makes an expected hourly count meaningful, but
    // only for continuous abilities: the rest fire on player actions whose
    // frequency is entirely up to the player.
    const perHour =
      group.trigger === "continuous"
        ? `\nAbout ${((group.combinedProbability / 100) * CONTINUOUS_ROLLS_PER_HOUR).toFixed(1)} procs per hour.`
        : "";

    value.title =
      `Chance at least one of ${group.contributors.length} pet(s) procs.\n` +
      `Not a sum: it is 1 minus the product of every pet missing.${perHour}\n\n` +
      (isMaxed
        ? "Every pet is at max strength: this is the most this team can do."
        : `At ${(ratio * 100).toFixed(0)}% of what these same pets would do at max strength ` +
          `(${formatPercent(atMax)}).`);
    block.append(value, mkBar(group.combinedProbability, atMax));
  }

  // What a proc actually delivers. Labelled "per proc" because it is one
  // pet's value, not a team total: showing it unqualified is what made the
  // old summed figure misleading.
  const magnitude = perProcMagnitude(group);
  if (magnitude) {
    const row = el("div", "pt-stat__proc");
    row.title =
      group.contributors.length > 1
        ? "What a single proc gives. Each pet applies its own value, so this is\n" +
          "a range across the team; the values never add up."
        : "What a single proc gives.";
    row.append(el("span", "", "per proc"), el("b", "", magnitude));
    block.appendChild(row);
  }

  return block;
}

/**
 * Restricts the groups to the effect a team was built for. A Crop Size team
 * shows Crop Size only, not every unrelated ability its pets happen to carry.
 * Unresolvable ids are ignored rather than emptying the panel.
 */
function focusGroups(groups: EffectGroup[], focusAbilityIds: string[]): EffectGroup[] {
  const wanted = new Set<string>();
  for (const abilityId of focusAbilityIds) {
    const key = effectGroupKeyForAbility(abilityId);
    if (key) wanted.add(key);
  }
  if (!wanted.size) return groups;
  const focused = groups.filter((group) => wanted.has(group.key));
  return focused.length ? focused : groups;
}

/**
 * One effect at a time with a ‹ › stepper. Showing every group at once made
 * the cards run several screens long; a card only ever needs to answer "how
 * good is this team at one thing".
 */
function renderGroupCarousel(groups: EffectGroup[]): HTMLElement {
  const host = el("div", "pt-stats__carousel");
  if (!groups.length) return host;

  if (groups.length === 1) {
    host.appendChild(renderGroup(groups[0]));
    return host;
  }

  let index = 0;
  const paint = () => {
    host.replaceChildren(
      renderGroup(groups[index], {
        index,
        total: groups.length,
        onStep: (delta) => {
          // Wraps both ways, so the stepper never dead-ends.
          index = (index + delta + groups.length) % groups.length;
          paint();
        },
      }),
    );
  };
  paint();
  return host;
}

function renderDetails(stats: TeamStats, groups: EffectGroup[], showAllGroups: boolean): HTMLElement {
  const details = el("div", showAllGroups ? "pt-stats is-all" : "pt-stats");

  if (stats.unknownSpecies.length) {
    details.appendChild(el("div", "pt-stats__warn", `Unknown species: ${stats.unknownSpecies.join(", ")}`));
  }

  if (showAllGroups) {
    const grid = el("div", "pt-stats__groups");
    for (const group of groups) grid.appendChild(renderGroup(group));
    details.appendChild(grid);
  } else {
    details.appendChild(renderGroupCarousel(groups));
  }
  details.appendChild(renderFeedRow(stats));

  return details;
}

/**
 * How long the team can be left alone before a pet needs feeding: the whole
 * point of the old "Unattended" label, spelled out.
 */
function renderFeedRow(stats: TeamStats): HTMLElement {
  const autonomy = stats.autonomy;

  let text: string;
  let tint: string;
  let title: string;

  const boostLine = autonomy.drainReductionPercent > 0
    ? `\nHunger Boost removes ${autonomy.drainReductionPercent.toFixed(0)}% of the drain.`
    : "";
  const restoreLine = autonomy.restoreActivationsPerMinute > 0
    ? `\nHunger Restore fires ~${autonomy.restoreActivationsPerMinute.toFixed(2)}×/min on average.`
    : "";
  const weatherLine = autonomy.weatherGatedHungerAbilities.length
    ? `\nNot counted (needs a specific weather): ${autonomy.weatherGatedHungerAbilities.join(", ")}.`
    : "";

  if (autonomy.status === "sustained") {
    text = "indefinitely";
    tint = color.okInk;
    title =
      "Expected hunger restore covers the drain for every pet, so the team\n" +
      `feeds itself.${boostLine}${restoreLine}${weatherLine}\n\n` +
      "This is an average: a bad run of Restore luck can still empty a pet.";
  } else if (autonomy.status === "runs-out" && autonomy.minutesFromFull !== null) {
    text = `~${formatDuration(autonomy.minutesFromFull)}`;
    tint = autonomy.minutesFromFull < 60 ? color.warnInk : color.okInk;
    title =
      `Starting from full, ${autonomy.limitingPetName ?? "the first pet"} empties first.\n` +
      `Rates the team itself: current hunger is not taken into account.${boostLine}${restoreLine}${weatherLine}\n\n` +
      "Restore figures are averages; unlucky streaks do worse.";
  } else {
    text = "unknown";
    tint = color.textSoft;
    title = `No known hunger data for: ${autonomy.speciesMissingDepletion.join(", ")}.`;
  }

  const row = el("div", "pt-feedrow");
  row.title = title;
  const valueSpan = el("span", "pt-feedrow__value", text);
  valueSpan.style.color = tint;
  row.append(el("span", "pt-feedrow__label", "Lasts without feeding"), valueSpan);
  return row;
}

export type TeamStatsOptions = {
  /**
   * Show only the effect(s) these abilities belong to. Used by the Team
   * Builder so a Crop Size team reports Crop Size and nothing else, however
   * many unrelated abilities its pets happen to carry.
   */
  focusAbilityIds?: string[];
  /**
   * Lay every effect out side by side instead of stepping through them. For
   * the Teams tab, which has a wide panel; the Team Builder's cards sit in a
   * grid and would grow unreadably tall.
   */
  showAllGroups?: boolean;
};

/**
 * Always-visible stats for a team: one effect (steppable when there are
 * several) and the feeding line. Returns a detached element; the caller owns
 * placement. Every listener lives inside the returned subtree, so it is
 * disposed of with the node.
 */
export function renderTeamStats(
  pets: InventoryPet[],
  options: TeamStatsOptions = {},
): HTMLElement {
  ensurePetsStyles();
  const realPets = pets.filter(Boolean);
  if (!realPets.length) return el("div", "pt-empty", "No pets in this team.");

  const stats = computeTeamStats(realPets);
  const groups = options.focusAbilityIds?.length
    ? focusGroups(stats.groups, options.focusAbilityIds)
    : stats.groups;

  return renderDetails(stats, groups, options.showAllGroups === true);
}
