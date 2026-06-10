// src/ui/menus/petsHatch.ts
// "Hatch" tab of the Pets menu: per-species hatch counts (normal/gold/rainbow).
// Formerly the Pets section of the Stats menu; the rest of that menu was
// removed once the game started shipping its own stats screens.

import { Menu } from "../menu";
import { rarityBadge } from "./notifier";
import { petCatalog, rarity } from "../../data";
import { StatsService } from "../../services/stats";
import type { StatsSnapshot } from "../../services/stats";
import { myInventory, myPetInfos } from "../../store/atoms";
import { attachSpriteIcon } from "../spriteIconCache";

const NF_INT = new Intl.NumberFormat("en-US");
const formatInt = (value: number) => NF_INT.format(Math.max(0, Math.floor(value || 0)));

const RARITY_ORDER = [
  rarity.Common,
  rarity.Uncommon,
  rarity.Rare,
  rarity.Legendary,
  rarity.Mythic,
  rarity.Divine,
  rarity.Celestial,
];

type PetRarity = (typeof RARITY_ORDER)[number];

const RARITY_BORDER_COLORS: Record<PetRarity, string> = {
  [rarity.Common]: "#E7E7E7",
  [rarity.Uncommon]: "#67BD4D",
  [rarity.Rare]: "#0071C6",
  [rarity.Legendary]: "#FFC734",
  [rarity.Mythic]: "#9944A7",
  [rarity.Divine]: "#FF7835",
  [rarity.Celestial]: "#7C2AE8",
};

/* ----------------------------- Stat list table ----------------------------- */

type StatListColumn = {
  label: string;
  align?: "left" | "right" | "center";
  width?: string;
  minWidth?: string;
  headerClassName?: string;
};
type StatListCell = {
  text?: string;
  hint?: string;
  align?: "left" | "right" | "center";
  content?: Node;
};

function createStatList(columns: StatListColumn[], rows: StatListCell[][]) {
  const container = document.createElement("div");
  container.className = "stats-list";

  const toTemplate = (column: StatListColumn) => {
    if (column.width) return column.width;
    if (column.minWidth) return `minmax(${column.minWidth}, 1fr)`;
    return "minmax(0, 1fr)";
  };

  const template = columns.map(toTemplate).join(" ");

  const header = document.createElement("div");
  header.className = "stats-list__row stats-list__row--header";
  header.style.gridTemplateColumns = template;

  for (const column of columns) {
    const cell = document.createElement("span");
    cell.className = "stats-list__cell";
    const align = column.align ?? "left";
    if (align !== "left") cell.classList.add(`stats-list__cell--align-${align}`);
    if (column.headerClassName) cell.classList.add(column.headerClassName);
    cell.textContent = column.label;
    header.appendChild(cell);
  }

  container.appendChild(header);

  for (const row of rows) {
    const rowEl = document.createElement("div");
    rowEl.className = "stats-list__row";
    rowEl.style.gridTemplateColumns = template;

    row.forEach((cellData, index) => {
      const column = columns[index];
      const cell = document.createElement("span");
      cell.className = "stats-list__cell";
      const align = cellData.align ?? column.align ?? "left";
      if (align !== "left") {
        cell.classList.add(`stats-list__cell--align-${align}`);
        if (align === "right") cell.classList.add("qmm-num");
      }
      if (cellData.hint) cell.title = cellData.hint;

      const hasContent = Boolean(cellData.content);
      if (cellData.content) {
        cell.appendChild(cellData.content);
      }

      if (cellData.text != null) {
        if (hasContent) {
          const textSpan = document.createElement("span");
          textSpan.textContent = cellData.text;
          cell.appendChild(textSpan);
        } else {
          cell.textContent = cellData.text;
        }
      } else if (!hasContent) {
        cell.textContent = "";
      }

      rowEl.appendChild(cell);
    });

    container.appendChild(rowEl);
  }

  return container;
}

/* ----------------------- Seed counts from current state ---------------------- */

type HatchedCountsShape = StatsSnapshot["pets"]["hatchedByType"][string];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getInventoryItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isPlainRecord(raw) && Array.isArray(raw.items)) {
    return raw.items;
  }
  return [];
}

function determinePetMutationType(mutations: unknown): keyof HatchedCountsShape {
  if (!Array.isArray(mutations)) return "normal";

  let hasGold = false;
  for (const mutation of mutations) {
    if (typeof mutation !== "string") continue;
    const normalized = mutation.trim().toLowerCase();
    if (normalized === "rainbow") {
      return "rainbow";
    }
    if (normalized === "gold") {
      hasGold = true;
    }
  }

  return hasGold ? "gold" : "normal";
}

function isPetStatsSectionEmpty(stats: StatsSnapshot): boolean {
  const entries = Object.values(stats.pets?.hatchedByType ?? {});
  if (entries.length === 0) return true;
  return entries.every((counts) => {
    if (!counts) return true;
    const normal = Number((counts as { normal?: unknown }).normal) || 0;
    const gold = Number((counts as { gold?: unknown }).gold) || 0;
    const rainbow = Number((counts as { rainbow?: unknown }).rainbow) || 0;
    return normal <= 0 && gold <= 0 && rainbow <= 0;
  });
}

/** Seed the hatch counters from owned pets the first time the tab is used. */
async function initPets(stats: StatsSnapshot): Promise<void> {
  if (!isPetStatsSectionEmpty(stats)) return;

  let inventory: unknown;
  try {
    inventory = await myInventory.get();
  } catch (error) {
    console.warn("[PetsHatch] Failed to read inventory data", error);
    inventory = null;
  }

  let activePetsRaw: unknown;
  try {
    activePetsRaw = await myPetInfos.get();
  } catch (error) {
    console.warn("[PetsHatch] Failed to read active pet data", error);
    activePetsRaw = null;
  }

  const items = getInventoryItems(inventory);
  const activePets = Array.isArray(activePetsRaw) ? activePetsRaw : [];

  if (items.length === 0 && activePets.length === 0) return;

  const countsBySpecies = new Map<string, HatchedCountsShape>();

  for (const item of items) {
    if (!isPlainRecord(item)) continue;
    const itemType = typeof item.itemType === "string" ? item.itemType.toLowerCase() : "";
    if (itemType !== "pet") continue;

    const speciesRaw = typeof item.petSpecies === "string" ? item.petSpecies : null;
    const species = speciesRaw?.trim();
    if (!species) continue;

    const key = species.toLowerCase();
    const counts = countsBySpecies.get(key) ?? ({ normal: 0, gold: 0, rainbow: 0 } as HatchedCountsShape);
    const rarityKey = determinePetMutationType(item.mutations);
    counts[rarityKey] = (counts[rarityKey] ?? 0) + 1;
    countsBySpecies.set(key, counts);
  }

  for (const entry of activePets) {
    if (!isPlainRecord(entry)) continue;
    const slot = isPlainRecord(entry.slot) ? entry.slot : null;
    if (!slot) continue;

    const speciesRaw = typeof slot.petSpecies === "string" ? slot.petSpecies : null;
    const species = speciesRaw?.trim();
    if (!species) continue;

    const key = species.toLowerCase();
    const counts = countsBySpecies.get(key) ?? ({ normal: 0, gold: 0, rainbow: 0 } as HatchedCountsShape);
    const rarityKey = determinePetMutationType((slot as { mutations?: unknown }).mutations);
    counts[rarityKey] = (counts[rarityKey] ?? 0) + 1;
    countsBySpecies.set(key, counts);
  }

  let hasCounts = false;
  for (const counts of countsBySpecies.values()) {
    if ((counts.normal ?? 0) > 0 || (counts.gold ?? 0) > 0 || (counts.rainbow ?? 0) > 0) {
      hasCounts = true;
      break;
    }
  }

  if (!hasCounts) return;

  StatsService.update((draft) => {
    if (!isPetStatsSectionEmpty(draft)) return;
    for (const [speciesKey, counts] of countsBySpecies) {
      if ((counts.normal ?? 0) <= 0 && (counts.gold ?? 0) <= 0 && (counts.rainbow ?? 0) <= 0) {
        continue;
      }

      const entry =
        draft.pets.hatchedByType[speciesKey] ?? ({ normal: 0, gold: 0, rainbow: 0 } as HatchedCountsShape);
      entry.normal = (entry.normal ?? 0) + (counts.normal ?? 0);
      entry.gold = (entry.gold ?? 0) + (counts.gold ?? 0);
      entry.rainbow = (entry.rainbow ?? 0) + (counts.rainbow ?? 0);
      draft.pets.hatchedByType[speciesKey] = entry;
    }
  });
}

/* ------------------------------ Rarity groups ------------------------------ */

// MGData's API returns "Mythic" while the hardcoded `rarity` constant uses "Mythical".
function normalizePetRarity(raw: unknown): PetRarity {
  if (typeof raw !== "string") return rarity.Common as PetRarity;
  if (raw === "Mythic") return rarity.Mythic as PetRarity;
  return raw as PetRarity;
}

function createPetRarityGroups(stats: StatsSnapshot): Map<PetRarity, string[]> {
  const map = new Map<PetRarity, string[]>();
  for (const rarityKey of RARITY_ORDER) {
    map.set(rarityKey, []);
  }

  // Track species we've already added (by lowercased key) so a pet present in
  // both the catalog and the stats payload isn't displayed twice.
  const seen = new Set<string>();

  for (const species of Object.keys(petCatalog)) {
    const lower = species.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    const info = petCatalog[species as keyof typeof petCatalog] as { rarity?: unknown } | undefined;
    const rarityValue = normalizePetRarity(info?.rarity);
    map.get(rarityValue)?.push(species);
  }

  // Include pets the player has stats for but that aren't in the catalog yet.
  for (const speciesKey of Object.keys(stats.pets?.hatchedByType ?? {})) {
    const lower = speciesKey.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    const display = speciesKey.charAt(0).toUpperCase() + speciesKey.slice(1);
    map.get(rarity.Common as PetRarity)?.push(display);
  }

  for (const list of map.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }
  return map;
}

/* --------------------------------- Cells ---------------------------------- */

function createPetSpeciesCell(species: string): StatListCell {
  const wrapper = document.createElement("span");
  wrapper.className = "stats-pet__species";

  const iconWrap = document.createElement("span");
  iconWrap.className = "stats-pet__icon";
  iconWrap.textContent = species?.trim().charAt(0).toUpperCase() || "?";
  iconWrap.setAttribute("aria-hidden", "true");
  attachSpriteIcon(iconWrap, ["pet"], species, 28, "stats-pet");

  const label = document.createElement("span");
  label.className = "stats-pet__label";
  label.textContent = species;

  wrapper.append(iconWrap, label);

  return { content: wrapper };
}

function createPetTotalValueCell(total: number): StatListCell {
  const value = document.createElement("span");
  value.className = "stats-pet__total-value qmm-num";
  value.textContent = formatInt(total);
  return { content: value, align: "center" };
}

function createPetTotalsLabelCell(label: string): StatListCell {
  const value = document.createElement("span");
  value.className = "stats-pet__total-label";
  value.textContent = label;
  return { content: value };
}

/* ---------------------------------- Tab ----------------------------------- */

function renderGroups(body: HTMLElement, stats: StatsSnapshot): void {
  body.innerHTML = "";
  const groups = createPetRarityGroups(stats);

  for (const rarityKey of RARITY_ORDER) {
    const speciesList = groups.get(rarityKey) ?? [];
    if (!speciesList.length) continue;

    const group = document.createElement("div");
    group.className = "stats-pet-group";
    group.style.setProperty("--stats-pet-group-border-color", RARITY_BORDER_COLORS[rarityKey]);

    const summary = document.createElement("div");
    summary.className = "stats-pet-group__summary";
    const badge = rarityBadge(rarityKey);
    badge.style.margin = "0";
    summary.appendChild(badge);
    group.appendChild(summary);

    const content = document.createElement("div");
    content.className = "stats-pet-group__content";

    const columns: StatListColumn[] = [
      { label: "Species", width: "2.2fr" },
      { label: "Normal", align: "center", width: "1fr" },
      { label: "Gold", align: "center", width: "1fr", headerClassName: "stats-list__header-label--gold" },
      {
        label: "Rainbow",
        align: "center",
        width: "1fr",
        headerClassName: "stats-list__header-label--rainbow",
      },
      { label: "Total", align: "center", width: "1fr" },
    ];

    const rows: StatListCell[][] = [];
    let totalNormal = 0;
    let totalGold = 0;
    let totalRainbow = 0;

    for (const species of speciesList) {
      const key = species.toLowerCase();
      const counts = stats.pets.hatchedByType[key] ?? { normal: 0, gold: 0, rainbow: 0 };
      totalNormal += counts.normal;
      totalGold += counts.gold;
      totalRainbow += counts.rainbow;
      const total = counts.normal + counts.gold + counts.rainbow;
      rows.push([
        createPetSpeciesCell(species),
        { text: formatInt(counts.normal), align: "center" },
        { text: formatInt(counts.gold), align: "center" },
        { text: formatInt(counts.rainbow), align: "center" },
        createPetTotalValueCell(total),
      ]);
    }

    const totalAll = totalNormal + totalGold + totalRainbow;
    rows.push([
      createPetTotalsLabelCell("Total"),
      createPetTotalValueCell(totalNormal),
      createPetTotalValueCell(totalGold),
      createPetTotalValueCell(totalRainbow),
      createPetTotalValueCell(totalAll),
    ]);

    content.appendChild(createStatList(columns, rows));
    group.appendChild(content);
    body.appendChild(group);
  }
}

export function renderHatchTab(view: HTMLElement, ui: Menu): void {
  const prevCleanup = (view as any).__cleanup__;
  if (typeof prevCleanup === "function") {
    try { prevCleanup(); } catch {}
    (view as any).__cleanup__ = undefined;
  }

  view.innerHTML = "";

  // Style an inner wrapper, never the tab view itself: an inline display on
  // the view would override the menu's .qmm-view show/hide rule.
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "12px";
  wrap.style.alignContent = "start";
  wrap.style.minHeight = "0";
  wrap.style.maxHeight = "54vh";
  wrap.style.overflow = "auto";
  view.appendChild(wrap);

  const card = ui.card("🐾 Hatched pets", {
    tone: "muted",
    align: "stretch",
    subtitle: "Per-species hatch counts (normal / gold / rainbow)",
  });
  wrap.appendChild(card.root);

  const repaint = () => renderGroups(card.body, StatsService.getSnapshot());

  let rafId: number | null = null;
  const cleanup = () => {
    try { unsubscribe(); } catch {}
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  const unsubscribe = StatsService.subscribe(() => {
    if (!view.isConnected) {
      cleanup();
      return;
    }
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      repaint();
    });
  });

  (view as any).__cleanup__ = cleanup;

  initPets(StatsService.getSnapshot()).catch((error) => {
    console.error("[PetsHatch] Failed to initialize pet stats", error);
  });

  repaint();
}
