// The per-species hatch grid: Species | Normal | Gold | Rainbow | Total.

import { petCatalog, rarityRank } from "../../data";
import { GOLD_MUTATION, RAINBOW_MUTATION, mutationIcon } from "./pity";
import type { StatsSnapshot } from "../stats/stats";
import { formatInteger } from "../../lib/format";
import { iconBox } from "../../ui/kit/icons";
import { color } from "../../ui/kit/theme";
import { ensureHatchStyles } from "./styles";

const SPECIES_ICON_PX = 24;
const HEADER_ICON_PX = 18;

export interface SpeciesRow {
  species: string;
  /** Spawn share within the egg, as a fraction. Omitted outside an egg. */
  share?: number;
}

export type HatchedCounts = StatsSnapshot["pets"]["hatchedByType"][string];

export function countsFor(stats: StatsSnapshot, species: string): HatchedCounts {
  return stats.pets.hatchedByType[species.toLowerCase()] ?? { normal: 0, gold: 0, rainbow: 0 };
}

export function totalOf(counts: HatchedCounts): number {
  return (counts.normal ?? 0) + (counts.gold ?? 0) + (counts.rainbow ?? 0);
}

/** Species the pet catalog knows, ordered least to most rare then by name. */
export function sortSpeciesByRarity(species: string[]): string[] {
  return species.slice().sort((a, b) => {
    const infoA = petCatalog[a as keyof typeof petCatalog] as { rarity?: unknown } | undefined;
    const infoB = petCatalog[b as keyof typeof petCatalog] as { rarity?: unknown } | undefined;
    const diff = rarityRank(infoA?.rarity) - rarityRank(infoB?.rarity);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

function span(className: string, text?: string): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function gridRow(extraClass = ""): HTMLElement {
  const row = document.createElement("div");
  row.className = `ht-counts__row ${extraClass}`.trim();
  return row;
}

/** Gold and Rainbow head their columns with the mutation sprite, not a word. */
function mutationHeaderCell(mutationId: string): HTMLElement {
  const cell = span("ht-counts__mutation");
  cell.title = mutationId;
  cell.appendChild(iconBox(mutationIcon(mutationId), HEADER_ICON_PX, "hatch"));
  return cell;
}

/** A count, in its column's colour once there is one; zeros stay dim. */
function numberCell(value: number, tint: string, strong = false): HTMLElement {
  const cell = span(strong ? "ht-num is-strong" : "ht-num", formatInteger(value));
  if (value > 0) cell.style.color = tint;
  return cell;
}

function speciesCell(row: SpeciesRow): HTMLElement {
  const cell = span("ht-species");
  cell.appendChild(iconBox(`sprite/pet/${row.species}`, SPECIES_ICON_PX, "hatch"));
  cell.appendChild(span("ht-species__name", row.species));

  if (row.share !== undefined) {
    const percent = row.share * 100;
    cell.appendChild(span("ht-species__share", `${percent >= 1 ? Math.round(percent) : percent.toFixed(1)}%`));
  }

  return cell;
}

/**
 * Renders the counts grid for `rows`.
 *
 * Unframed on purpose: callers drop it inside a card that already draws the
 * border, so the egg card holds its pity rows and these counts in one box.
 * The totals line is only worth a row when there is more than one species to
 * add up.
 */
export function speciesCountsGrid(rows: SpeciesRow[], stats: StatsSnapshot): HTMLElement {
  ensureHatchStyles();
  const wrap = document.createElement("div");
  wrap.className = "ht-counts";

  const header = gridRow();
  header.append(
    span("ht-counts__head is-left", "Hatched"),
    span("ht-counts__head", "Normal"),
    mutationHeaderCell(GOLD_MUTATION),
    mutationHeaderCell(RAINBOW_MUTATION),
    span("ht-counts__head", "Total"),
  );
  wrap.appendChild(header);

  let totalNormal = 0;
  let totalGold = 0;
  let totalRainbow = 0;

  for (const row of rows) {
    const counts = countsFor(stats, row.species);
    totalNormal += counts.normal ?? 0;
    totalGold += counts.gold ?? 0;
    totalRainbow += counts.rainbow ?? 0;

    const line = gridRow();
    line.append(
      speciesCell(row),
      numberCell(counts.normal, color.text),
      numberCell(counts.gold, color.goldInk),
      numberCell(counts.rainbow, color.rainbowInk),
      numberCell(totalOf(counts), color.sepiaInk, true),
    );
    wrap.appendChild(line);
  }

  if (rows.length > 1) {
    const totals = gridRow("is-total");
    totals.append(
      span("ht-counts__head is-left", "Total"),
      numberCell(totalNormal, color.text, true),
      numberCell(totalGold, color.goldInk, true),
      numberCell(totalRainbow, color.rainbowInk, true),
      numberCell(totalNormal + totalGold + totalRainbow, color.sepiaInk, true),
    );
    wrap.appendChild(totals);
  }

  return wrap;
}
