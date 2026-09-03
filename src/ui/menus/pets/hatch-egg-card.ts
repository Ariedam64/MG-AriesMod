// src/ui/menus/pets/hatch-egg-card.ts
//
// One collapsible card per egg: its Bad Luck Protection progress, then the
// pets it can hatch and how many of each the player has.

import { raritySprite } from "../../../data";
import { HatchTracker, type EggCounters } from "../../../services/hatchTracker";
import type { EggPity, PityTarget } from "../../../services/hatchPity";
import type { StatsSnapshot } from "../../../services/stats";
import { speciesCountsGrid } from "./hatch-counts";
import {
  BORDER,
  CARD_BG,
  TEXT,
  TEXT_DIM,
  WARN,
  css,
  iconBox,
  meter,
  numberField,
  sectionLabel,
} from "../panel-ui";
import { collapsibleCard } from "../panel-layout";

const NF_INT = new Intl.NumberFormat("en-US");
const formatInt = (value: number) => NF_INT.format(Math.max(0, Math.floor(value || 0)));

const EGG_ICON_PX = 30;
const TARGET_ICON_PX = 22;
const RARITY_ICON_PX = 20;
/** Row: label | meter | value | head start. */
const ROW_TEMPLATE = "minmax(96px, 1fr) minmax(70px, 1.5fr) auto auto";
/** Within this many pulls of the guarantee, the row is worth flagging. */
const NEAR_GUARANTEE_PULLS = 10;

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

  // No border of its own: the card holds every pity row and the counts grid in
  // a single panel, so the rows read as one block rather than three cards.
  const row = document.createElement("div");
  css(row, {
    display: "grid",
    gridTemplateColumns: ROW_TEMPLATE,
    alignItems: "center",
    gap: "10px",
    padding: "3px 0",
  });

  const label = document.createElement("div");
  css(label, { display: "flex", alignItems: "center", gap: "6px", minWidth: "0" });
  label.title = target.label;

  const icon = iconBox(target.icon, TARGET_ICON_PX, "hatch");
  label.appendChild(icon);

  // The Gold and Rainbow sprites say what they are on their own, so only a
  // species needs its name spelled out.
  if (target.kind === "species") {
    const name = document.createElement("span");
    css(name, {
      fontSize: "12.5px",
      color: TEXT,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });
    name.textContent = target.label;
    label.appendChild(name);
  }

  const chance = formatChance(target.chance);
  if (chance) {
    const rate = document.createElement("span");
    css(rate, { fontSize: "10.5px", color: TEXT_DIM, whiteSpace: "nowrap" });
    rate.textContent = chance;
    label.appendChild(rate);
  }

  const bar = meter();
  bar.set(misses / ceiling, due || near ? "warn" : "accent");

  const value = document.createElement("span");
  css(value, {
    fontSize: "11.5px",
    fontVariantNumeric: "tabular-nums",
    color: due || near ? WARN : TEXT_DIM,
    whiteSpace: "nowrap",
    textAlign: "right",
  });
  value.textContent = due ? "Guaranteed" : `${formatInt(misses)} / ${formatInt(ceiling)}`;
  value.title = due
    ? `Due: the next pull is forced (threshold ${formatInt(target.threshold)}).`
    : `${formatInt(remaining)} more misses before the guarantee (threshold ${formatInt(target.threshold)}).`;

  row.append(label, bar.root, value);

  if (showOffsets) {
    const input = numberField(0, ceiling, 1, offset);
    css(input, { width: "70px", padding: "5px 7px", fontSize: "11px" });
    input.title = "Head start: your real counter when the mod started watching.";
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

/** Single line, so a collapsed card costs one row rather than two. */
function eggHeader(egg: EggPity, pulls: number): HTMLElement {
  const head = document.createElement("div");
  css(head, { display: "flex", alignItems: "center", gap: "8px", minWidth: "0" });

  head.appendChild(iconBox(`sprite/pet/${egg.eggId}`, EGG_ICON_PX, "hatch"));

  const name = document.createElement("span");
  css(name, {
    fontSize: "13.5px",
    fontWeight: "600",
    color: TEXT,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  name.textContent = egg.name;
  head.appendChild(name);

  const rarityFrame = raritySprite(egg.rarity);
  if (rarityFrame) {
    const badge = iconBox(rarityFrame, RARITY_ICON_PX, "hatch");
    badge.title = egg.rarity;
    head.appendChild(badge);
  }

  const seen = document.createElement("span");
  css(seen, { fontSize: "11px", color: TEXT_DIM, whiteSpace: "nowrap", marginLeft: "auto" });
  seen.textContent = pulls === 1 ? "1 hatch seen" : `${formatInt(pulls)} hatches seen`;
  head.appendChild(seen);

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
  const { egg, stats, showOffsets } = options;
  const counters = HatchTracker.getCounters(egg.eggId);

  const card = collapsibleCard({
    header: eggHeader(egg, counters.pulls),
    collapsed: options.collapsed,
    onToggle: options.onToggle,
  });

  const panel = document.createElement("div");
  css(panel, {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    padding: "7px 9px",
    borderRadius: "8px",
    background: CARD_BG,
    border: `1px solid ${BORDER}`,
  });

  // Species and mutation guarantees are separate rolls, but both are Bad Luck
  // Protection, so one heading covers the lot.
  panel.appendChild(sectionLabel("Bad luck protection"));
  for (const target of egg.targets) {
    panel.appendChild(targetRow(egg, target, showOffsets));
  }

  if (egg.fauna.length) {
    const separator = document.createElement("div");
    css(separator, { height: "1px", background: BORDER, margin: "5px 0 4px" });
    panel.appendChild(separator);

    panel.appendChild(
      speciesCountsGrid(
        egg.fauna.map(entry => ({ species: entry.species, share: entry.share })),
        stats,
      ),
    );
  }

  card.body.appendChild(panel);
  return card.root;
}
