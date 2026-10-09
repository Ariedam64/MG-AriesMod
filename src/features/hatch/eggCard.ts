// One collapsible card per egg: its Bad Luck Protection progress, then the
// pets it can hatch and how many of each the player has.

import { raritySprite } from "../../data";
import { HatchTracker, type EggCounters } from "./tracker";
import type { EggPity, PityTarget } from "./pity";
import type { StatsSnapshot } from "../stats/stats";
import { speciesCountsGrid } from "./counts";
import { formatInteger as formatInt } from "../../lib/format";
import { meter } from "../../ui/kit/badges";
import { sectionLabel } from "../../ui/kit/card";
import { textInput } from "../../ui/kit/fields";
import { iconBox } from "../../ui/kit/icons";
import { collapsibleCard } from "../../ui/kit/layout";
import { ensureHatchStyles } from "./styles";

const EGG_ICON_PX = 30;
const TARGET_ICON_PX = 22;
const RARITY_ICON_PX = 20;
/** Within this many pulls of the guarantee, the row is worth flagging. */
const NEAR_GUARANTEE_PULLS = 10;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function formatChance(chance: number): string {
  if (!Number.isFinite(chance) || chance <= 0) return "";
  const percent = chance * 100;
  return `${percent >= 1 ? percent.toFixed(percent % 1 === 0 ? 0 : 1) : percent.toFixed(2)}%`;
}

function counterValue(counters: EggCounters, key: string): number {
  if (key === "gold") return counters.gold;
  if (key === "rainbow") return counters.rainbow;
  return counters.species[key] ?? 0;
}

function targetRow(egg: EggPity, target: PityTarget, showOffsets: boolean): HTMLElement {
  const observed = counterValue(HatchTracker.getCounters(egg.eggId), target.key);
  const offset = counterValue(HatchTracker.getOffsets(egg.eggId), target.key);
  const misses = observed + offset;

  // The threshold is the pull that gets forced, so the guarantee is due once
  // the straight misses reach threshold - 1.
  const ceiling = Math.max(1, target.threshold - 1);
  const remaining = Math.max(0, ceiling - misses);
  const due = remaining === 0;
  const near = !due && remaining <= NEAR_GUARANTEE_PULLS;

  const row = el("div", "ht-row");

  const label = el("div", "ht-row__label");
  label.title = target.label;
  label.appendChild(iconBox(target.icon, TARGET_ICON_PX, "hatch"));

  // The Gold and Rainbow sprites say what they are on their own, so only a
  // species needs its name spelled out.
  if (target.kind === "species") label.appendChild(el("span", "ht-row__name", target.label));

  const chance = formatChance(target.chance);
  if (chance) label.appendChild(el("span", "ht-row__rate", chance));

  const bar = meter();
  bar.set(misses / ceiling, due || near ? "warn" : "accent");

  // Without a head start the count is only what this install watched, so it is
  // a floor rather than the real counter. Saying so beats quietly showing a
  // number the game would disagree with.
  const isFloor = offset <= 0;
  const value = el(
    "span",
    due || near ? "ht-row__value is-near" : "ht-row__value",
    due ? "Guaranteed" : `${isFloor ? "≥ " : ""}${formatInt(misses)} / ${formatInt(ceiling)}`,
  );
  value.title = due
    ? `Due: the next pull is forced (threshold ${formatInt(target.threshold)}).`
    : isFloor
      ? `At least ${formatInt(remaining)} more misses before the guarantee (threshold ${formatInt(target.threshold)}). The game keeps its own counter private, so this only counts hatches seen since tracking began. Set your real counter to correct it.`
      : `${formatInt(remaining)} more misses before the guarantee (threshold ${formatInt(target.threshold)}).`;

  row.append(label, bar.root, value);

  if (showOffsets) {
    const input = textInput("", String(offset), { small: true });
    Object.assign(input, { type: "number", min: "0", max: String(ceiling), step: "1" });
    input.classList.add("ht-offset");
    input.title = "Your real in-game counter for this outcome. The mod adds what it has seen since.";
    input.setAttribute("aria-label", `In-game counter for ${target.label}`);
    input.addEventListener("change", () => {
      HatchTracker.setOffset(egg.eggId, target.key, Number(input.value));
    });
    row.appendChild(input);
  } else {
    // Keeps the grid aligned with rows that do show an input.
    row.appendChild(document.createElement("span"));
  }

  return row;
}

/**
 * Says where the numbers come from.
 *
 * The game keeps its own counters server side and strips them from what the
 * client receives, so the mod can only count hatches it watched. Anything
 * hatched before this install is invisible to it, which is why the counts read
 * low on an old account and why the head start exists.
 */
function trackingNote(): HTMLElement {
  const startedAt = HatchTracker.getTrackingStartedAt();
  const since = startedAt > 0
    ? `since ${new Date(startedAt).toLocaleDateString()}`
    : "since this install started watching";
  return el(
    "div",
    "ht-note",
    `Counts the hatches seen ${since}; the game keeps its real counters private. ` +
      `Hatched before that? Use Set counters to type yours in.`,
  );
}

/** Single line, so a collapsed card costs one row rather than two. */
function eggHeader(egg: EggPity, pulls: number): HTMLElement {
  const head = el("div", "ht-egg-head");
  head.appendChild(iconBox(`sprite/pet/${egg.eggId}`, EGG_ICON_PX, "hatch"));
  head.appendChild(el("span", "ht-egg-name", egg.name));

  const rarityFrame = raritySprite(egg.rarity);
  if (rarityFrame) {
    const badge = iconBox(rarityFrame, RARITY_ICON_PX, "hatch");
    badge.title = egg.rarity;
    head.appendChild(badge);
  }

  head.appendChild(el("span", "ht-egg-seen", pulls === 1 ? "1 hatch seen" : `${formatInt(pulls)} hatches seen`));
  return head;
}

export interface EggCardOptions {
  egg: EggPity;
  stats: StatsSnapshot;
  showOffsets: boolean;
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
}

export function createEggCard(options: EggCardOptions): HTMLElement {
  ensureHatchStyles();
  const { egg, stats, showOffsets } = options;
  const counters = HatchTracker.getCounters(egg.eggId);

  const card = collapsibleCard({
    header: eggHeader(egg, counters.pulls),
    collapsed: options.collapsed,
    onToggle: options.onToggle,
  });
  card.root.classList.add("ht-egg");

  // Species and mutation guarantees are separate rolls, but both are Bad Luck
  // Protection, so one heading covers the lot.
  const pity = el("div", "ht-section");
  pity.append(sectionLabel("Bad luck protection"), trackingNote());
  for (const target of egg.targets) {
    pity.appendChild(targetRow(egg, target, showOffsets));
  }
  card.body.appendChild(pity);

  if (egg.fauna.length) {
    card.body.appendChild(
      speciesCountsGrid(
        egg.fauna.map(entry => ({ species: entry.species, share: entry.share })),
        stats,
      ),
    );
  }

  return card.root;
}
