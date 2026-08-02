// src/ui/menus/petsTeamStats.ts
// Renders what a team is worth: a one-line summary strip plus an expandable
// breakdown. Shared by the Team Builder cards (collapsed by default) and the
// Manager tab's equipped team (always open).
//
// All maths lives in services/petTeamStats.ts — this file only formats.

import {
  computeTeamStats,
  effectGroupKeyForAbility,
  type EffectGroup,
  type TeamStats,
} from "../../services/petTeamStats";
import type { InventoryPet } from "../../services/pets";

/**
 * Human labels and units for the game's baseParameter keys. UI vocabulary,
 * not game data — the values themselves always come from the catalog.
 */
const PARAMETER_LABELS: Record<string, { label: string; unit: string }> = {
  scaleIncreasePercentage: { label: "Crop size", unit: "%" },
  cropSellPriceIncreasePercentage: { label: "Sell price", unit: "%" },
  mutationChanceIncreasePercentage: { label: "Mutation chance", unit: "%" },
  hungerRestorePercentage: { label: "Hunger restore", unit: "%" },
  hungerRefundPercentage: { label: "Hunger refund", unit: "%" },
  hungerDepletionRateDecreasePercentage: { label: "Hunger drain", unit: "%" },
  plantGrowthReductionMinutes: { label: "Plant growth", unit: "min" },
  eggGrowthTimeReductionMinutes: { label: "Egg growth", unit: "min" },
  baseMaxCoinsFindable: { label: "Coins (max)", unit: "" },
  bonusXp: { label: "Bonus XP", unit: "" },
  maxStrengthIncreasePercentage: { label: "Max STR", unit: "%" },
  plantAbilityChanceBoostPercentage: { label: "Plant ability", unit: "%" },
};

const MUTED = "#94a3b8";
const ACCENT = "#34d399";
const DIM = "#64748b";

/** Rolls a `continuous` ability gets per hour — the game rolls them each minute. */
const CONTINUOUS_ROLLS_PER_HOUR = 60;

/**
 * What one roll of an effect corresponds to, by trigger. `continuous`
 * abilities roll once a minute (the game's own tooltip reads "chance per
 * minute"); everything else rolls once per matching player action, so
 * labelling those per minute would be plainly wrong.
 */
const TRIGGER_UNITS: Record<string, string> = {
  continuous: "/min",
  harvest: "/harvest",
  sellAllCrops: "/sale",
  sellPet: "/pet sold",
  hatchEgg: "/hatch",
  playerActivated: "/use",
  weather: "/weather",
};

function triggerUnit(trigger: string | null): string {
  return (trigger && TRIGGER_UNITS[trigger]) || "/roll";
}

/**
 * Shading for how close the team is to its OWN ceiling, not to 100%. A team
 * whose pets are all at max strength reads green however small its absolute
 * proc chance is — there is nothing left to improve about it.
 */
function fillRatioColor(ratio: number): string {
  if (ratio >= 0.99) return "#34d399";
  if (ratio >= 0.9) return "#a3e635";
  if (ratio >= 0.75) return "#fbbf24";
  return "#f87171";
}

/**
 * Progress toward the best this exact team could do, i.e. the same pets at
 * max strength. Scaling against 100% instead would make every team look
 * hopeless: a Rainbow Granter trio caps around 2%, so a perfect team would
 * still render as an almost-empty bar.
 */
function mkBar(current: number, atMax: number): HTMLElement {
  const ratio = atMax > 0 ? Math.max(0, Math.min(1, current / atMax)) : 0;

  const track = document.createElement("div");
  Object.assign(track.style, {
    height: "3px",
    borderRadius: "999px",
    background: "rgba(255,255,255,0.07)",
    overflow: "hidden",
    margin: "3px 0 1px",
  } as CSSStyleDeclaration);

  const fill = document.createElement("div");
  Object.assign(fill.style, {
    height: "100%",
    width: `${Math.max(1.5, ratio * 100)}%`,
    borderRadius: "999px",
    background: fillRatioColor(ratio),
    opacity: "0.85",
  } as CSSStyleDeclaration);

  track.appendChild(fill);
  return track;
}

function formatPercent(value: number): string {
  if (value >= 10) return `${value.toFixed(1)}%`;
  if (value >= 1) return `${value.toFixed(2)}%`;
  return `${value.toFixed(3)}%`;
}

function formatAmount(value: number, unit: string): string {
  // Coin ranges reach seven digits, where "9900000" is unreadable — group
  // thousands so the magnitude is legible at a glance.
  const decimals = Math.abs(value) >= 10 ? 0 : 1;
  const text = value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return unit ? `${text}${unit === "%" ? "%" : ` ${unit}`}` : text;
}

function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  if (hours > 0) return `${hours}h${String(mins).padStart(2, "0")}`;
  return `${mins}m`;
}

/**
 * Team totals for one effect. Deliberately no per-pet breakdown: the useful
 * figure is what the whole team does, and three extra lines per group made
 * the cards unreadable.
 */
/** The parameter this effect is really about, or null when it carries none. */
function primaryParameterKey(group: EffectGroup): string | null {
  for (const contributor of group.contributors) {
    for (const key of Object.keys(contributor.scaledParameters)) {
      if (PARAMETER_LABELS[key]) return key;
    }
  }
  return null;
}

/**
 * Titles the card by what the effect does ("Crop size") rather than by the
 * ability's name ("Crop Size Boost"), which only repeated the line below it.
 * Effects with no numeric parameter — granters, Seed Finder, Double Hatch —
 * keep their ability name, since there is nothing else to call them.
 */
function groupTitle(group: EffectGroup): string {
  const key = primaryParameterKey(group);
  return key ? PARAMETER_LABELS[key].label : group.label;
}

/**
 * What one proc delivers. Magnitudes do not add up across the team: a proc is
 * one pet firing, and it applies that pet's own value. When contributors
 * differ (different tiers or strengths) this is a range, never a total.
 */
function perProcMagnitude(group: EffectGroup): string | null {
  const key = primaryParameterKey(group);
  if (!key) return null;

  const meta = PARAMETER_LABELS[key];
  const values = group.contributors
    .map((contributor) => contributor.scaledParameters[key])
    .filter((value): value is number => typeof value === "number" && value !== 0);
  if (!values.length) return null;

  const low = formatAmount(Math.min(...values), meta.unit);
  const high = formatAmount(Math.max(...values), meta.unit);
  // Spaces around the dash: "3.5 min–5.0 min" reads as one broken token.
  return low === high ? high : `${low} – ${high}`;
}

type GroupNav = { index: number; total: number; onStep: (delta: number) => void };

/** Small ‹ 1/3 › stepper, only built when there is more than one effect. */
function mkNav(nav: GroupNav): HTMLElement {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    flex: "0 0 auto",
  } as CSSStyleDeclaration);

  const mkArrow = (glyph: string, delta: number, label: string): HTMLElement => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = glyph;
    button.title = label;
    Object.assign(button.style, {
      border: "none",
      background: "transparent",
      color: MUTED,
      font: "inherit",
      fontSize: "11px",
      lineHeight: "1",
      padding: "0 3px",
      cursor: "pointer",
      borderRadius: "3px",
    } as CSSStyleDeclaration);
    button.onmouseenter = () => { button.style.color = "#e2e8f0"; };
    button.onmouseleave = () => { button.style.color = MUTED; };
    button.addEventListener("click", (event) => {
      // The card underneath has its own handlers; stepping must not reach it.
      event.stopPropagation();
      event.preventDefault();
      nav.onStep(delta);
    });
    return button;
  };

  const counter = document.createElement("span");
  counter.textContent = `${nav.index + 1}/${nav.total}`;
  counter.style.fontSize = "9px";
  counter.style.color = DIM;
  counter.style.fontVariantNumeric = "tabular-nums";

  wrap.append(mkArrow("‹", -1, "Previous effect"), counter, mkArrow("›", 1, "Next effect"));
  return wrap;
}

function renderGroup(group: EffectGroup, nav?: GroupNav): HTMLElement {
  const block = document.createElement("div");
  Object.assign(block.style, {
    padding: "5px 7px",
    borderRadius: "7px",
    background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.05)",
    marginBottom: "4px",
  } as CSSStyleDeclaration);

  const nameRow = document.createElement("div");
  Object.assign(nameRow.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "6px",
    minHeight: "13px",
  } as CSSStyleDeclaration);

  const name = document.createElement("div");
  const weatherSuffix = group.requiredWeathers.length ? ` · ${group.requiredWeathers.join("/")}` : "";
  name.textContent = `${groupTitle(group)}${weatherSuffix}`;
  Object.assign(name.style, {
    fontSize: "9px",
    fontWeight: "600",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: DIM,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } as CSSStyleDeclaration);
  if (weatherSuffix) name.title = "Only fires while this weather is active.";

  nameRow.appendChild(name);
  if (nav) nameRow.appendChild(mkNav(nav));
  block.appendChild(nameRow);

  const value = document.createElement("div");
  Object.assign(value.style, {
    display: "flex",
    alignItems: "baseline",
    gap: "3px",
    fontVariantNumeric: "tabular-nums",
  } as CSSStyleDeclaration);

  if (group.combinedProbability === null) {
    const always = document.createElement("span");
    always.textContent = "always on";
    always.style.fontSize = "12px";
    always.style.color = MUTED;
    always.title = "This ability has no proc chance — it applies continuously.";
    value.appendChild(always);
    block.appendChild(value);
  } else {
    // The ceiling for these exact pets: same team, every pet at max strength.
    const atMax = group.combinedProbabilityAtMax ?? group.combinedProbability;
    const ratio = atMax > 0 ? Math.min(1, group.combinedProbability / atMax) : 1;
    const isMaxed = ratio >= 0.995;

    const big = document.createElement("span");
    big.textContent = formatPercent(group.combinedProbability);
    big.style.fontSize = "15px";
    big.style.fontWeight = "700";
    big.style.color = fillRatioColor(ratio);
    big.style.lineHeight = "1.1";

    const unit = document.createElement("span");
    unit.textContent = triggerUnit(group.trigger);
    unit.style.fontSize = "9px";
    unit.style.color = DIM;
    value.append(big, unit);

    // Only worth showing when there is headroom left — repeating the same
    // number as "max" on an already-maxed team is noise.
    if (!isMaxed) {
      const ceiling = document.createElement("span");
      ceiling.textContent = `max ${formatPercent(atMax)}`;
      ceiling.style.fontSize = "9px";
      ceiling.style.color = DIM;
      ceiling.style.marginLeft = "auto";
      value.appendChild(ceiling);
    }

    // Rolling once a minute makes an expected hourly count meaningful, but
    // only for continuous abilities — the rest fire on player actions whose
    // frequency is entirely up to the player.
    const perHour =
      group.trigger === "continuous"
        ? `\nAbout ${((group.combinedProbability / 100) * CONTINUOUS_ROLLS_PER_HOUR).toFixed(1)} procs per hour.`
        : "";

    value.title =
      `Chance at least one of ${group.contributors.length} pet(s) procs.\n` +
      `Not a sum — it is 1 minus the product of every pet missing.${perHour}\n\n` +
      (isMaxed
        ? "Every pet is at max strength — this is the most this team can do."
        : `At ${(ratio * 100).toFixed(0)}% of what these same pets would do at max strength ` +
          `(${formatPercent(atMax)}).`);
    block.appendChild(value);
    block.appendChild(mkBar(group.combinedProbability, atMax));
  }

  // What a proc actually delivers. Labelled "per proc" because it is one
  // pet's value, not a team total — showing it unqualified is what made the
  // old summed figure misleading.
  const magnitude = perProcMagnitude(group);
  if (magnitude) {
    const row = document.createElement("div");
    Object.assign(row.style, {
      display: "flex",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: "8px",
      fontSize: "10px",
      marginTop: "1px",
    } as CSSStyleDeclaration);
    row.title =
      group.contributors.length > 1
        ? "What a single proc gives. Each pet applies its own value, so this is\n" +
          "a range across the team — the values never add up."
        : "What a single proc gives.";

    const label = document.createElement("span");
    label.textContent = "per proc";
    label.style.color = MUTED;

    const amount = document.createElement("span");
    amount.textContent = magnitude;
    amount.style.fontWeight = "600";
    amount.style.flex = "0 0 auto";
    amount.style.fontVariantNumeric = "tabular-nums";

    row.append(label, amount);
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
 * the equipped-team panel run several screens long; the card only ever needs
 * to answer "how good is this team at one thing".
 */
function renderGroupCarousel(groups: EffectGroup[]): HTMLElement {
  const host = document.createElement("div");
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
  const details = document.createElement("div");
  details.style.paddingTop = "4px";

  if (stats.unknownSpecies.length) {
    const warn = document.createElement("div");
    warn.textContent = `⚠ unknown species: ${stats.unknownSpecies.join(", ")}`;
    warn.style.fontSize = "10px";
    warn.style.color = "#fbbf24";
    details.appendChild(warn);
  }

  if (showAllGroups) {
    for (const group of groups) details.appendChild(renderGroup(group));
  } else {
    details.appendChild(renderGroupCarousel(groups));
  }
  details.appendChild(renderFeedRow(stats));

  return details;
}

/**
 * How long the team can be left alone before a pet needs feeding — the whole
 * point of the old "Unattended" label, spelled out.
 */
function renderFeedRow(stats: TeamStats): HTMLElement {
  const autonomy = stats.autonomy;

  let text: string;
  let color: string;
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
    color = ACCENT;
    title =
      "Expected hunger restore covers the drain for every pet, so the team\n" +
      `feeds itself.${boostLine}${restoreLine}${weatherLine}\n\n` +
      "This is an average — a bad run of Restore luck can still empty a pet.";
  } else if (autonomy.status === "runs-out" && autonomy.minutesFromFull !== null) {
    text = `~${formatDuration(autonomy.minutesFromFull)}`;
    color = autonomy.minutesFromFull < 60 ? "#fbbf24" : ACCENT;
    title =
      `Starting from full, ${autonomy.limitingPetName ?? "the first pet"} empties first.\n` +
      `Rates the team itself — current hunger is not taken into account.${boostLine}${restoreLine}${weatherLine}\n\n` +
      "Restore figures are averages; unlucky streaks do worse.";
  } else {
    text = "unknown";
    color = MUTED;
    title = `No known hunger data for: ${autonomy.speciesMissingDepletion.join(", ")}.`;
  }

  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    padding: "4px 7px",
    borderRadius: "7px",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    fontSize: "10px",
  } as CSSStyleDeclaration);
  row.title = title;

  const label = document.createElement("span");
  label.textContent = "🍖 Lasts without feeding (from full)";
  label.style.color = MUTED;
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";
  label.style.whiteSpace = "nowrap";

  const valueSpan = document.createElement("span");
  valueSpan.textContent = text;
  valueSpan.style.color = color;
  valueSpan.style.fontWeight = "600";
  valueSpan.style.flex = "0 0 auto";
  valueSpan.style.fontVariantNumeric = "tabular-nums";

  row.append(label, valueSpan);
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
   * Stack every effect instead of stepping through them. For the Manager,
   * which has a full-width panel; the Team Builder's cards sit in a
   * three-column grid and would grow unreadably tall.
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
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "2px";

  const realPets = pets.filter(Boolean);
  if (!realPets.length) {
    const empty = document.createElement("div");
    empty.textContent = "No pets in this team.";
    empty.style.fontSize = "10px";
    empty.style.color = MUTED;
    wrap.appendChild(empty);
    return wrap;
  }

  const stats = computeTeamStats(realPets);
  const groups = options.focusAbilityIds?.length
    ? focusGroups(stats.groups, options.focusAbilityIds)
    : stats.groups;

  wrap.appendChild(renderDetails(stats, groups, options.showAllGroups === true));
  return wrap;
}
