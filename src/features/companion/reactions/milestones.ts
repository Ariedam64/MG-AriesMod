// What a change in the player's stats makes him say: milestones (100, 1,000,
// 10,000...), hatches, and crop sales.

import { pickOne, type Random } from "../../../lib/random";
import { formatInteger } from "../../../lib/format";
import type { StatsSnapshot } from "../../stats/stats";
import { EmoteType } from "../emoteTypes";
import type { Reaction } from "./gate";

const fmt = (n: number) => formatInteger(n, "round");

/** 100, 1,000, 10,000... up to a million billion. */
const MILESTONES: readonly number[] = Array.from({ length: 14 }, (_, i) => 10 ** (i + 2));

/**
 * The highest milestone crossed between two values, or `null`.
 *
 * Only the highest: a big sale can skip two at once, and announcing both would
 * make two bubbles for a single moment.
 */
export function crossedMilestone(prev: number, next: number): number | null {
  if (!Number.isFinite(prev) || !Number.isFinite(next) || next <= prev) return null;
  let crossed: number | null = null;
  for (const m of MILESTONES) {
    if (prev < m && next >= m) crossed = m;
  }
  return crossed;
}

/** "1,000", "10,000", then "1 million", "2 billion"... */
export function formatMilestone(n: number): string {
  const units: Array<[number, string]> = [
    [1e15, "quadrillion"],
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
  ];
  for (const [size, word] of units) {
    if (n >= size) return `${fmt(n / size)} ${word}`;
  }
  return fmt(n);
}

type StatDef = {
  id: string;
  read: (s: StatsSnapshot) => number;
  lines: ReadonlyArray<(n: string) => string>;
};

const sumHatched = (s: StatsSnapshot, key?: "normal" | "gold" | "rainbow"): number => {
  let total = 0;
  for (const counts of Object.values(s?.pets?.hatchedByType ?? {})) {
    if (!counts) continue;
    total += key
      ? Number(counts[key]) || 0
      : (Number(counts.normal) || 0) + (Number(counts.gold) || 0) + (Number(counts.rainbow) || 0);
  }
  return total;
};

const sumAbilityTriggers = (s: StatsSnapshot): number => {
  let total = 0;
  for (const stat of Object.values(s?.abilities ?? {})) total += Number(stat?.triggers) || 0;
  return total;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const STAT_DEFS: readonly StatDef[] = [
  {
    id: "harvested",
    read: (s) => num(s?.garden?.totalHarvested),
    lines: [
      (n) => `That's ${n} crops harvested! Incredible.`,
      (n) => `${n} harvests! You're a natural.`,
      (n) => `Crop number ${n}! We should celebrate.`,
    ],
  },
  {
    id: "planted",
    read: (s) => num(s?.garden?.totalPlanted),
    lines: [(n) => `${n} seeds planted! This garden keeps growing.`, (n) => `That's seed number ${n}. Green thumb confirmed.`],
  },
  {
    id: "watered",
    read: (s) => num(s?.garden?.watercanUsed),
    lines: [(n) => `${n} waterings! You really care about these plants.`],
  },
  {
    id: "cropsSold",
    read: (s) => num(s?.shops?.cropsSoldCount),
    lines: [(n) => `${n} crops sold! The shop loves you.`, (n) => `That's ${n} crops sold. Business is booming.`],
  },
  {
    id: "coins",
    read: (s) => num(s?.shops?.cropsSoldValue) + num(s?.shops?.petsSoldValue),
    lines: [(n) => `You've earned ${n} coins from sales! So rich.`, (n) => `${n} coins earned. Buy me something nice?`],
  },
  {
    id: "seedsBought",
    read: (s) => num(s?.shops?.seedsBought),
    lines: [(n) => `${n} seeds bought! The shopkeeper knows your name by now.`],
  },
  {
    id: "petsSold",
    read: (s) => num(s?.shops?.petsSoldCount),
    lines: [(n) => `${n} pets sold. Hope they found good homes!`],
  },
  {
    id: "hatched",
    read: (s) => sumHatched(s),
    lines: [(n) => `${n} pets hatched! That's a whole zoo.`, (n) => `Pet number ${n}! Welcome to the family.`],
  },
  {
    id: "abilities",
    read: (s) => sumAbilityTriggers(s),
    lines: [(n) => `Your pets have used their abilities ${n} times!`, (n) => `${n} pet abilities triggered. Hard workers!`],
  },
];

/**
 * Everything a change in stats deserves a word for.
 *
 * Only reacts to a RISE between two snapshots: at startup, stats already at
 * 12,000 say nothing, only going from 9,999 to 10,000 counts. A milestone is
 * therefore announced once without anything to remember.
 */
export function statReactions(prev: StatsSnapshot, next: StatsSnapshot, random: Random): Reaction[] {
  const out: Reaction[] = [];

  for (const def of STAT_DEFS) {
    const m = crossedMilestone(def.read(prev), def.read(next));
    if (m === null) continue;
    out.push({
      key: `milestone:${def.id}`,
      message: pickOne(def.lines, random)(formatMilestone(m)),
      emote: m >= 1e6 ? EmoteType.Love : EmoteType.Clapping,
      priority: "high",
    });
  }

  // Hatches: the rarest wins, one bubble per batch.
  if (sumHatched(next, "rainbow") > sumHatched(prev, "rainbow")) {
    out.push({
      key: "hatch:rainbow",
      message: pickOne(
        ["A RAINBOW pet?! No way!", "Rainbow! I've never seen one up close!", "Look at those colours! A Rainbow pet!"],
        random,
      ),
      emote: EmoteType.Love,
      priority: "high",
    });
  } else if (sumHatched(next, "gold") > sumHatched(prev, "gold")) {
    out.push({
      key: "hatch:gold",
      message: pickOne(["A Gold pet! Look at it shine!", "Gold! That one's a keeper.", "Shiny! A Gold pet!"], random),
      emote: EmoteType.Love,
      priority: "high",
    });
  } else if (sumHatched(next) > sumHatched(prev)) {
    out.push({
      key: "hatch:normal",
      message: pickOne(["Welcome to the family, little one!", "A new friend! Hi there!", "Aww, look at the new pet."], random),
      emote: EmoteType.Clapping,
      priority: "low",
    });
  }

  const earned = num(next?.shops?.cropsSoldValue) - num(prev?.shops?.cropsSoldValue);
  if (earned > 0) {
    const coins = fmt(earned);
    out.push({
      key: "sale:crops",
      message: pickOne(
        [`Ka-ching! +${coins} coins.`, `Sold! ${coins} coins richer.`, `Nice sale, ${coins} coins!`, `${coins} coins in the bank. Love it.`],
        random,
      ),
      emote: EmoteType.Clapping,
      priority: "low",
    });
  }

  return out;
}
