// src/ui/menus/pets/hatch-counts.ts
// The per-species hatch grid: Species | Normal | Gold | Rainbow | Total.

import { petCatalog, rarityRank } from "../../../data";
import { GOLD_MUTATION, RAINBOW_MUTATION, mutationIcon } from "../../../services/hatchPity";
import type { StatsSnapshot } from "../../../services/stats";
import {
  BORDER,
  GOLD,
  RAINBOW,
  TEAL,
  TEXT,
  TEXT_DIM,
  css,
  iconBox,
} from "../panel-ui";

const NF_INT = new Intl.NumberFormat("en-US");
const formatInt = (value: number) => NF_INT.format(Math.max(0, Math.floor(value || 0)));

const SPECIES_ICON_PX = 24;
const HEADER_ICON_PX = 18;
const GRID_TEMPLATE = "minmax(0, 2.2fr) repeat(4, minmax(54px, 1fr))";

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

function gridRow(): HTMLElement {
  const row = document.createElement("div");
  css(row, {
    display: "grid",
    gridTemplateColumns: GRID_TEMPLATE,
    alignItems: "center",
    gap: "6px",
  });
  return row;
}

function headerCell(label: string, align: "left" | "center" = "center"): HTMLElement {
  const cell = document.createElement("span");
  css(cell, {
    fontSize: "10.5px",
    fontWeight: "700",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    textAlign: align,
    color: TEXT_DIM,
  });
  cell.textContent = label;
  return cell;
}

/** Gold and Rainbow head their columns with the mutation sprite, not a word. */
function mutationHeaderCell(mutationId: string): HTMLElement {
  const cell = document.createElement("span");
  css(cell, { display: "flex", justifyContent: "center" });
  cell.title = mutationId;
  cell.appendChild(iconBox(mutationIcon(mutationId), HEADER_ICON_PX, "hatch"));
  return cell;
}

function numberCell(value: number, color: string, strong = false): HTMLElement {
  const cell = document.createElement("span");
  css(cell, {
    fontSize: "12.5px",
    fontVariantNumeric: "tabular-nums",
    fontWeight: strong ? "700" : "500",
    color: value > 0 ? color : TEXT_DIM,
    textAlign: "center",
  });
  cell.textContent = formatInt(value);
  return cell;
}

function speciesCell(row: SpeciesRow): HTMLElement {
  const cell = document.createElement("span");
  css(cell, { display: "flex", alignItems: "center", gap: "7px", minWidth: "0" });

  cell.appendChild(iconBox(`sprite/pet/${row.species}`, SPECIES_ICON_PX, "hatch"));

  const label = document.createElement("span");
  css(label, {
    fontSize: "12.5px",
    color: TEXT,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  label.textContent = row.species;
  cell.appendChild(label);

  if (row.share !== undefined) {
    const share = document.createElement("span");
    css(share, { fontSize: "10px", color: TEXT_DIM, whiteSpace: "nowrap", flex: "0 0 auto" });
    const percent = row.share * 100;
    share.textContent = `${percent >= 1 ? Math.round(percent) : percent.toFixed(1)}%`;
    cell.appendChild(share);
  }

  return cell;
}

/**
 * Renders the counts grid for `rows`.
 *
 * Unframed on purpose: callers drop it inside a panel that already draws the
 * border, so the egg card can hold its pity rows and these counts in one box.
 * The totals line is only worth a row when there is more than one species to
 * add up.
 */
export function speciesCountsGrid(rows: SpeciesRow[], stats: StatsSnapshot): HTMLElement {
  const wrap = document.createElement("div");
  css(wrap, { display: "flex", flexDirection: "column", gap: "3px" });

  const header = gridRow();
  header.append(
    headerCell("Mutation counters", "left"),
    headerCell("Normal"),
    mutationHeaderCell(GOLD_MUTATION),
    mutationHeaderCell(RAINBOW_MUTATION),
    headerCell("Total"),
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
      numberCell(counts.normal, TEXT),
      numberCell(counts.gold, GOLD),
      numberCell(counts.rainbow, RAINBOW),
      numberCell(totalOf(counts), TEAL, true),
    );
    wrap.appendChild(line);
  }

  if (rows.length > 1) {
    const separator = document.createElement("div");
    css(separator, { height: "1px", background: BORDER, margin: "2px 0" });
    wrap.appendChild(separator);

    const label = document.createElement("span");
    css(label, { fontSize: "11px", fontWeight: "700", color: TEXT_DIM, textTransform: "uppercase" });
    label.textContent = "Total";

    const totals = gridRow();
    totals.append(
      label,
      numberCell(totalNormal, TEXT, true),
      numberCell(totalGold, GOLD, true),
      numberCell(totalRainbow, RAINBOW, true),
      numberCell(totalNormal + totalGold + totalRainbow, TEAL, true),
    );
    wrap.appendChild(totals);
  }

  return wrap;
}
