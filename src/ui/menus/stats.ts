// src/ui/menus/stats.ts
import { Menu } from "../menu";
import { rarityBadge } from "./notifier";
import {
  petCatalog,
  petAbilities,
  rarity,
  weatherCatalog,
} from "../../data";
import { formatPrice } from "../../utils/format";
import { StatsService } from "../../services/stats";
import type { StatsSnapshot } from "../../services/stats";
import {
  garden as gardenView,
  mySeedInventory,
  myToolInventory,
  myEggInventory,
  myDecorInventory,
  myInventory,
  myPetInfos,
} from "../../store/atoms";
import type { GardenState } from "../../store/atoms";
import { attachSpriteIcon } from "../spriteIconCache";
const NF_INT = new Intl.NumberFormat("en-US");
const formatInt = (value: number) => NF_INT.format(Math.max(0, Math.floor(value || 0)));

const DURATION_ABILITIES = new Set([
  "egggrowthboost",
  "egggrowthboostii_new",
  "egggrowthboostii",
  "plantgrowthboost",
  "plantgrowthboostii",
]);

const XP_ABILITIES = new Set([
  "petxpboost",
  "petxpboostii",
  "petageboost",
  "petageboostii",
]);

const STRENGTH_ABILITIES = new Set(["pethatchsizeboost", "pethatchsizeboostii"]);

const HUNGER_ABILITIES = new Set([
  "hungerrestore",
  "hungerrestoreii",
  "hungerboost",
  "hungerboostii",
]);

type GardenStatsShape = StatsSnapshot["garden"];
type ShopStatsShape = StatsSnapshot["shops"];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isGardenStatsSectionEmpty(garden: GardenStatsShape): boolean {
  return (
    (garden.totalPlanted ?? 0) <= 0 &&
    (garden.totalHarvested ?? 0) <= 0 &&
    (garden.totalDestroyed ?? 0) <= 0 &&
    (garden.watercanUsed ?? 0) <= 0 &&
    (garden.waterTimeSavedMs ?? 0) <= 0
  );
}

function isShopStatsSectionEmpty(shops: ShopStatsShape): boolean {
  return (
    (shops.seedsBought ?? 0) <= 0 &&
    (shops.decorBought ?? 0) <= 0 &&
    (shops.eggsBought ?? 0) <= 0 &&
    (shops.toolsBought ?? 0) <= 0 &&
    (shops.cropsSoldCount ?? 0) <= 0 &&
    (shops.cropsSoldValue ?? 0) <= 0 &&
    (shops.petsSoldCount ?? 0) <= 0 &&
    (shops.petsSoldValue ?? 0) <= 0
  );
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

async function readInventoryQuantity(
  atom: { get(): Promise<unknown> },
  label: string
): Promise<number> {
  try {
    const raw = await atom.get();
    if (!Array.isArray(raw)) return 0;
    let total = 0;
    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const quantity = Number((entry as { quantity?: unknown }).quantity);
      if (Number.isFinite(quantity) && quantity > 0) {
        total += Math.max(0, Math.floor(quantity));
      }
    }
    return total;
  } catch (error) {
    console.warn(`[StatsMenu] Failed to read ${label} inventory`, error);
    return 0;
  }
}

async function initGarden(stats: StatsSnapshot): Promise<void> {
  if (!isGardenStatsSectionEmpty(stats.garden)) return;


  let state: GardenState | null;
  try {
    state = await gardenView.get();
  } catch (error) {
    console.warn("[StatsMenu] Failed to read garden data", error);
    return;
  }

  if (!state || !isPlainRecord(state.tileObjects)) return;

  let totalPlanted = 0;
  for (const value of Object.values(state.tileObjects)) {
    if (!isPlainRecord(value)) continue;
    const objectType = typeof value.objectType === "string" ? value.objectType.toLowerCase() : "";
    if (objectType === "plant") {
      totalPlanted += 1;
    }
  }

  if (totalPlanted <= 0) return;

  StatsService.update((draft) => {
    if (!isGardenStatsSectionEmpty(draft.garden)) return;
    draft.garden.totalPlanted = totalPlanted;
  });
}

async function initShops(stats: StatsSnapshot): Promise<void> {
  if (!isShopStatsSectionEmpty(stats.shops)) return;

  let state: GardenState | null = null;
  try {
    state = await gardenView.get();
  } catch (error) {
    console.warn("[StatsMenu] Failed to read garden data", error);
  }

  let seedsBought = 0;
  let eggsBought = 0;
  let decorBought = 0;
  let toolsBought = 0;

  if (state && isPlainRecord(state.tileObjects)) {
    for (const value of Object.values(state.tileObjects)) {
      if (!isPlainRecord(value)) continue;
      const objectType = typeof value.objectType === "string" ? value.objectType.toLowerCase() : "";
      if (objectType === "plant") {
        seedsBought += 1;
      } else if (objectType === "egg") {
        eggsBought += 1;
      }
    }
  }

  if (state && isPlainRecord(state.boardwalkTileObjects)) {
    for (const value of Object.values(state.boardwalkTileObjects)) {
      if (value != null) {
        decorBought += 1;
      }
    }
  }

  const [seedInventoryQty, toolInventoryQty, eggInventoryQty, decorInventoryQty] = await Promise.all([
    readInventoryQuantity(mySeedInventory, "seed"),
    readInventoryQuantity(myToolInventory, "tool"),
    readInventoryQuantity(myEggInventory, "egg"),
    readInventoryQuantity(myDecorInventory, "decor"),
  ]);

  seedsBought += seedInventoryQty;
  eggsBought += eggInventoryQty;
  decorBought += decorInventoryQty;
  toolsBought += toolInventoryQty;

  if (seedsBought <= 0 && eggsBought <= 0 && decorBought <= 0 && toolsBought <= 0) return;

  StatsService.update((draft) => {
    if (!isShopStatsSectionEmpty(draft.shops)) return;
    if (seedsBought > 0 && (draft.shops.seedsBought ?? 0) <= 0) {
      draft.shops.seedsBought = seedsBought;
    }
    if (eggsBought > 0 && (draft.shops.eggsBought ?? 0) <= 0) {
      draft.shops.eggsBought = eggsBought;
    }
    if (decorBought > 0 && (draft.shops.decorBought ?? 0) <= 0) {
      draft.shops.decorBought = decorBought;
    }
    if (toolsBought > 0 && (draft.shops.toolsBought ?? 0) <= 0) {
      draft.shops.toolsBought = toolsBought;
    }
  });
}

function getInventoryItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isPlainRecord(raw) && Array.isArray(raw.items)) {
    return raw.items;
  }
  return [];
}

type HatchedCountsShape = StatsSnapshot["pets"]["hatchedByType"][string];

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

async function initPets(stats: StatsSnapshot): Promise<void> {
  if (!isPetStatsSectionEmpty(stats)) return;

  let inventory: unknown;
  try {
    inventory = await myInventory.get();
  } catch (error) {
    console.warn("[StatsMenu] Failed to read inventory data", error);
    inventory = null;
  }

  let activePetsRaw: unknown;
  try {
    activePetsRaw = await myPetInfos.get();
  } catch (error) {
    console.warn("[StatsMenu] Failed to read active pet data", error);
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

function formatAbilityTotalValue(abilityId: string, totalValue: number): string {
  const normalized = abilityId.toLowerCase();
  const safeValue = Number.isFinite(totalValue) ? Math.max(0, totalValue) : 0;

  if (DURATION_ABILITIES.has(normalized)) {
    return formatDuration(safeValue);
  }

  if (XP_ABILITIES.has(normalized)) {
    return `${formatInt(safeValue)} XP`;
  }

  if (STRENGTH_ABILITIES.has(normalized)) {
    return `${formatInt(safeValue)} strength`;
  }

  if (HUNGER_ABILITIES.has(normalized)) {
    const rounded = Math.round(safeValue);
    const isWholeNumber = Math.abs(safeValue - rounded) < 1e-6;
    const formatted = isWholeNumber ? formatInt(rounded) : safeValue.toFixed(1);
    return `${formatted}% hunger`;
  }

  return formatPrice(safeValue) ?? formatInt(safeValue);
}

const STATS_WINDOW_MIN_WIDTH = 560;

const LS_STATS_COLLAPSE_KEY = "menu:stats:collapsed";

type StatsCollapseState = Record<string, boolean>;

let collapseStateCache: StatsCollapseState | null = null;

function getStatsStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    /* ignore */
  }

  try {
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    /* ignore */
  }

  return null;
}

function readCollapseState(): StatsCollapseState {
  const storage = getStatsStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(LS_STATS_COLLAPSE_KEY);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};

    const entries = Object.entries(parsed).filter((entry): entry is [string, boolean] => {
      return typeof entry[1] === "boolean";
    });

    return Object.fromEntries(entries);
  } catch (error) {
    console.warn("[StatsMenu] Failed to read collapse state", error);
    return {};
  }
}

function writeCollapseState(state: StatsCollapseState): void {
  const storage = getStatsStorage();
  if (!storage) return;

  try {
    storage.setItem(LS_STATS_COLLAPSE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[StatsMenu] Failed to save collapse state", error);
  }
}

function getCollapseState(): StatsCollapseState {
  if (!collapseStateCache) {
    collapseStateCache = readCollapseState();
  }
  return collapseStateCache;
}

function getSectionCollapsed(id: string, fallback: boolean): boolean {
  const state = getCollapseState();
  const value = state[id];
  return typeof value === "boolean" ? value : fallback;
}


function setSectionCollapsed(id: string, collapsed: boolean): void {
  const current = getCollapseState();
  if (current[id] === collapsed) return;

  const next = { ...current, [id]: collapsed };
  collapseStateCache = next;
  writeCollapseState(next);
}

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const RELATIVE_TIME_FORMATTER = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
});

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

function createCollapsibleCard(
  ui: Menu,
  title: string,
  opts: {
    subtitle?: string;
    startCollapsed?: boolean;
    icon?: string;
    storageId?: string;
  } = {},
) {
  const card = ui.card(title, { tone: "muted", align: "stretch", subtitle: opts.subtitle, icon: opts.icon });
  card.root.classList.add("qmm-card--collapsible");

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "qmm-btn qmm-btn--ghost qmm-btn--sm stats-collapse-toggle";
  toggle.style.marginLeft = "auto";

  const toggleIcon = document.createElement("span");
  toggleIcon.className = "stats-collapse-toggle__icon";
  toggleIcon.setAttribute("aria-hidden", "true");

  const toggleLabel = document.createElement("span");
  toggleLabel.className = "stats-collapse-toggle__label";

  toggle.append(toggleIcon, toggleLabel);

  const titleElement = card.header.querySelector(".qmm-card__title");
  if (titleElement) titleElement.insertAdjacentElement("afterend", toggle);
  else card.header.appendChild(toggle);

  const storageId = opts.storageId?.trim() || null;

  let currentAnimation: Animation | null = null;

  const stopAnimation = () => {
    if (!currentAnimation) return;
    currentAnimation.cancel();
    currentAnimation = null;
  };

  const animateBody = (collapsed: boolean) => {
    const body = card.body;
    stopAnimation();

    const prefersReducedMotion =
      typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      body.style.display = collapsed ? "none" : "grid";
      body.style.height = "";
      body.style.opacity = "";
      body.style.overflow = "";
      return;
    }

    const easing = "cubic-bezier(0.33, 1, 0.68, 1)";
    const duration = 220;
    body.style.overflow = "hidden";

    if (!collapsed) {
      body.style.display = "grid";
      body.style.height = "0px";
      body.style.opacity = "0";
      const targetHeight = body.scrollHeight;
      currentAnimation = body.animate(
        [
          { height: "0px", opacity: 0 },
          { height: `${targetHeight}px`, opacity: 1 },
        ],
        { duration, easing, fill: "forwards" },
      );
    } else {
      const startHeight = body.offsetHeight;
      body.style.height = `${startHeight}px`;
      body.style.opacity = "1";
      currentAnimation = body.animate(
        [
          { height: `${startHeight}px`, opacity: 1 },
          { height: "0px", opacity: 0 },
        ],
        { duration, easing, fill: "forwards" },
      );
    }

    if (!currentAnimation) {
      body.style.display = collapsed ? "none" : "grid";
      body.style.height = "";
      body.style.opacity = "";
      body.style.overflow = "";
      return;
    }

    currentAnimation.onfinish = () => {
      if (collapsed) {
        body.style.display = "none";
        body.style.opacity = "";
      } else {
        body.style.display = "grid";
        body.style.opacity = "";
      }
      body.style.height = "";
      body.style.overflow = "";
      currentAnimation = null;
    };

    currentAnimation.oncancel = () => {
      body.style.height = "";
      body.style.opacity = "";
      body.style.overflow = "";
      if (collapsed) {
        body.style.display = "none";
      }
      currentAnimation = null;
    };
  };

  const setCollapsed = (collapsed: boolean, persist = true, animate = true) => {
    if (!animate) {
      stopAnimation();
      card.body.style.display = collapsed ? "none" : "grid";
      card.body.style.height = "";
      card.body.style.opacity = "";
      card.body.style.overflow = "";
    } else {
      animateBody(collapsed);
    }

    card.root.dataset.collapsed = collapsed ? "true" : "false";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    const verb = collapsed ? "Show" : "Hide";
    const label = `${verb} ${title}`;
    toggleLabel.textContent = verb;
    toggle.setAttribute("aria-label", label);
    toggle.title = label;
    card.root.classList.toggle("is-collapsed", collapsed);
    if (persist && storageId) {
      setSectionCollapsed(storageId, collapsed);
    }
  };

  const defaultCollapsed = !!opts.startCollapsed;
  const initialCollapsed = storageId
    ? getSectionCollapsed(storageId, defaultCollapsed)
    : defaultCollapsed;

  setCollapsed(initialCollapsed, false, false);

  toggle.addEventListener("click", () => {
    const collapsed = card.root.dataset.collapsed === "true";
    setCollapsed(!collapsed);
  });

  return { root: card.root, body: card.body, header: card.header, setCollapsed };
}

function createMetricGrid(rows: Array<{ label: string; value: string; hint?: string }>) {
  const grid = document.createElement("div");
  grid.className = "stats-metric-grid";

  for (const row of rows) {
    const card = document.createElement("div");
    card.className = "stats-metric";
    if (row.hint) card.title = row.hint;

    const label = document.createElement("span");
    label.className = "stats-metric__label";
    label.textContent = row.label;

    const value = document.createElement("span");
    value.className = "stats-metric__value qmm-num";
    value.textContent = row.value;

    card.append(label, value);
    grid.appendChild(card);
  }

  return grid;
}

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

function createWeatherNameCell(entry: { label: string; lookupId: string }): StatListCell {
  const wrapper = document.createElement("span");
  wrapper.className = "stats-weather__name";

  const iconWrap = document.createElement("span");
  iconWrap.className = "stats-weather__icon";

  const initials = entry.label?.trim().charAt(0) || "—";
  iconWrap.textContent = initials.toUpperCase();
  if (entry.label) {
    iconWrap.setAttribute("aria-label", entry.label);
    iconWrap.setAttribute("title", entry.label);
  }
  const categories = ["ui"];
  const normalized = entry.lookupId.replace(/\s+/g, "");
  const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9]/g, "");
  const bases = Array.from(
    new Set(
      [
        sanitize(entry.lookupId),
        normalized,
        entry.lookupId.replace(/Icon$/i, ""),
        normalized.replace(/Icon$/i, ""),
      ].filter(Boolean),
    ),
  );
  const candidates = Array.from(
    new Set(
      bases
        .map(base => `${base}Icon`)
        .filter(candidate => candidate.includes("Icon")),
    ),
  );
  if (candidates.length === 0) {
    candidates.push(`${normalized || sanitize(entry.lookupId)}Icon`);
  }
  attachSpriteIcon(iconWrap, categories, candidates, 28, "stats-weather");

  const label = document.createElement("span");
  label.className = "stats-weather__label";
  label.textContent = entry.label;

  wrapper.append(iconWrap, label);

  return { content: wrapper };
}

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

function formatDuration(ms: number): string {
  const value = Math.max(0, ms || 0);
  if (value < 1000) return `${formatInt(value)} ms`;
  const seconds = value / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = seconds / 60;
  if (minutes < 60) return `${minutes.toFixed(1)} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(1)} h`;
}

function formatDateTime(ms: number): string {
  return DATE_TIME_FORMATTER.format(new Date(ms));
}

function formatRelativeTimeFromNow(ms: number): string {
  const diff = ms - Date.now();
  const absDiff = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 1000 * 60 * 60 * 24 * 365],
    ["month", 1000 * 60 * 60 * 24 * 30],
    ["week", 1000 * 60 * 60 * 24 * 7],
    ["day", 1000 * 60 * 60 * 24],
    ["hour", 1000 * 60 * 60],
    ["minute", 1000 * 60],
    ["second", 1000],
  ];

  for (const [unit, unitMs] of units) {
    if (absDiff >= unitMs || unit === "second") {
      const value = Math.round(diff / unitMs);
      return RELATIVE_TIME_FORMATTER.format(value, unit);
    }
  }

  return RELATIVE_TIME_FORMATTER.format(0, "second");
}

function renderMetaSection(ui: Menu, root: HTMLElement, stats: StatsSnapshot) {
  const card = ui.card("🗓️ Tracking", {
    tone: "muted",
    align: "stretch",
    compactHeader: true,
  });

  const createdAt = Number.isFinite(stats.createdAt) ? Math.max(0, Math.floor(stats.createdAt)) : 0;
  const hasCreatedAt = createdAt > 0;

  const row = ui.flexRow({ align: "center", gap: 12, className: "stats-meta" });

  const label = document.createElement("span");
  label.className = "stats-meta__label";
  label.textContent = "Tracking started:";
  row.appendChild(label);

  const value = document.createElement("strong");
  value.className = "stats-meta__value";
  value.textContent = hasCreatedAt ? formatDateTime(createdAt) : "Unavailable";
  row.appendChild(value);

  const resetButton = ui.btn("RESET", { variant: "danger" });
  resetButton.style.marginLeft = "auto";
  resetButton.addEventListener("click", () => {
    const freshStats = StatsService.reset();
    void initGarden(freshStats);
    void initShops(freshStats);
    void initPets(freshStats);
  });
  row.appendChild(resetButton);

  card.body.appendChild(row);
  root.appendChild(card.root);
}

function renderGardenSection(ui: Menu, root: HTMLElement, stats: StatsSnapshot) {
  const card = createCollapsibleCard(ui, "🌱 Garden", {
    subtitle: "Field activity",
    storageId: "garden",
  });
  const rows = [
    { label: "Total planted", value: formatInt(stats.garden.totalPlanted) },
    { label: "Total harvested", value: formatInt(stats.garden.totalHarvested) },
    { label: "Total destroyed", value: formatInt(stats.garden.totalDestroyed) },
    { label: "Watering can Used", value: formatInt(stats.garden.watercanUsed) },
    {
      label: "Water time saved",
      value: formatDuration(stats.garden.waterTimeSavedMs),
      hint: `${formatInt(stats.garden.waterTimeSavedMs)} ms`,
    },
  ];
  card.body.appendChild(createMetricGrid(rows));
  root.appendChild(card.root);
}

function renderShopSection(ui: Menu, root: HTMLElement, stats: StatsSnapshot) {
  const card = createCollapsibleCard(ui, "🏪 Shops", {
    subtitle: "Purchases & sales",
    storageId: "shops",
  });
  const rows = [
    { label: "Seeds bought", value: formatInt(stats.shops.seedsBought) },
    { label: "Tools bought", value: formatInt(stats.shops.toolsBought) },
    { label: "Eggs bought", value: formatInt(stats.shops.eggsBought) },
    { label: "Decor bought", value: formatInt(stats.shops.decorBought) },
    { label: "Crops sold", value: `${formatInt(stats.shops.cropsSoldCount)} items` },
    {
      label: "Crop revenue",
      value: formatPrice(stats.shops.cropsSoldValue) ?? formatInt(stats.shops.cropsSoldValue),
    },
    { label: "Pets sold", value: `${formatInt(stats.shops.petsSoldCount)} pets` },
    {
      label: "Pet revenue",
      value: formatPrice(stats.shops.petsSoldValue) ?? formatInt(stats.shops.petsSoldValue),
    },
  ];
  card.body.appendChild(createMetricGrid(rows));
  root.appendChild(card.root);
}

function createPetRarityGroups(): Map<PetRarity, string[]> {
  const map = new Map<PetRarity, string[]>();
  for (const rarityKey of RARITY_ORDER) {
    map.set(rarityKey, []);
  }
  for (const species of Object.keys(petCatalog)) {
    const info = petCatalog[species as keyof typeof petCatalog];
    const rarityValue = (info?.rarity ?? rarity.Common) as PetRarity;
    const list = map.get(rarityValue) ?? [];
    list.push(species);
    map.set(rarityValue, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.localeCompare(b));
  }
  return map;
}

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

function renderPetSection(ui: Menu, root: HTMLElement, stats: StatsSnapshot) {
  const card = createCollapsibleCard(ui, "🐾 Pets", {
    subtitle: "Hatching overview",
    storageId: "pets",
  });
  const groups = createPetRarityGroups();

  for (const rarityKey of RARITY_ORDER) {
    const speciesList = groups.get(rarityKey) ?? [];
    if (!speciesList.length) continue;

    const group = document.createElement("div");
    group.className = "stats-pet-group";
    group.style.setProperty("--stats-pet-group-border-color", RARITY_BORDER_COLORS[rarityKey]);

    const summary = document.createElement("div");
    summary.className = "stats-pet-group__summary";
    summary.textContent = "";
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
    card.body.appendChild(group);
  }

  root.appendChild(card.root);
}

function renderAbilitySection(ui: Menu, root: HTMLElement, stats: StatsSnapshot) {
  const card = createCollapsibleCard(ui, "🧠 Abilities", {
    subtitle: "Trigger counts",
    storageId: "abilities",
  });
  const abilityIds = Object.keys(petAbilities).sort((a, b) => {
    const nameA = petAbilities[a as keyof typeof petAbilities]?.name ?? a;
    const nameB = petAbilities[b as keyof typeof petAbilities]?.name ?? b;
    return nameA.localeCompare(nameB);
  });

  const columns: StatListColumn[] = [
    { label: "Ability", width: "2.2fr" },
    { label: "Triggers", align: "right", width: "1fr" },
    { label: "Value", align: "right", width: "1.2fr" },
  ];

  const rows: StatListCell[][] = [];

  for (const id of abilityIds) {
    const info = petAbilities[id as keyof typeof petAbilities];
    const statsEntry = stats.abilities[id] ?? { triggers: 0, totalValue: 0 };
    const formatted = formatAbilityTotalValue(id, statsEntry.totalValue);

    rows.push([
      { text: info?.name ?? id, hint: info?.description },
      { text: formatInt(statsEntry.triggers) },
      { text: formatted },
    ]);
  }

  card.body.appendChild(createStatList(columns, rows));
  root.appendChild(card.root);
}

function renderWeatherSection(ui: Menu, root: HTMLElement, stats: StatsSnapshot) {
  const card = createCollapsibleCard(ui, "⛅ Weather", {
    subtitle: "Events overview",
    storageId: "weather",
  });

  const columns: StatListColumn[] = [
    { label: "Weather", width: "2fr" },
    { label: "TOTAL", align: "right", width: "1fr" },
  ];

  const rows: StatListCell[][] = [];

  const weatherEntries = Object.keys(weatherCatalog)
    .map((key) => {
      const info = weatherCatalog[key as keyof typeof weatherCatalog];
      const label = info?.atomValue ?? key;
      const lower = key.toLowerCase();
      const entry = stats.weather[lower] ?? { triggers: 0 };
      const lookupId = (label && label.trim()) || key;
      return {
        key: lower,
        label,
        triggers: entry.triggers,
        lookupId,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  for (const entry of weatherEntries) {
    rows.push([
      createWeatherNameCell({ label: entry.label, lookupId: entry.lookupId }),
      { text: formatInt(entry.triggers) },
    ]);
  }

  card.body.appendChild(createStatList(columns, rows));
  root.appendChild(card.root);
}

type StatsMenuContainer = HTMLElement & {
  __statsCleanup?: () => void;
};

export function renderStatsMenu(container: HTMLElement) {
  const root = container as StatsMenuContainer;
  if (typeof root.__statsCleanup === "function") {
    try {
      root.__statsCleanup();
    } catch (error) {
      console.error("[StatsMenu] Cleanup error", error);
    }
    root.__statsCleanup = undefined;
  }

  const prevRoot = container.firstElementChild as HTMLElement | null;
  const prevView = prevRoot?.classList.contains("qmm")
    ? (prevRoot.querySelector<HTMLElement>(".qmm-views") ?? null)
    : null;
  const previousScrollTop = prevView ? prevView.scrollTop : null;

  let rafId: number | null = null;
  let unsubscribed = false;
  let unsubscribe: () => void = () => {};

  const cleanup = () => {
    if (unsubscribed) return;
    unsubscribed = true;
    try {
      unsubscribe();
    } catch (error) {
      console.error("[StatsMenu] Unsubscribe error", error);
    }
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (root.__statsCleanup === cleanup) {
      root.__statsCleanup = undefined;
    }
  };

  unsubscribe = StatsService.subscribe(() => {
    if (!root.isConnected) {
      cleanup();
      return;
    }
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      renderStatsMenu(container);
    });
  });

  root.__statsCleanup = cleanup;

  const ui = new Menu({ id: "stats", compact: true });
  ui.mount(container);

  const win = ui.root.closest<HTMLElement>(".qws-win");
  if (win) {
    win.style.minWidth = `${STATS_WINDOW_MIN_WIDTH}px`;
  }

  const paddingStyle = getComputedStyle(container);
  const paddingLeft = Number.parseFloat(paddingStyle.paddingLeft) || 0;
  const paddingRight = Number.parseFloat(paddingStyle.paddingRight) || 0;
  const minContentWidth = Math.max(0, STATS_WINDOW_MIN_WIDTH - paddingLeft - paddingRight);
  container.style.minWidth = `${minContentWidth}px`;

  const view = ui.root.querySelector(".qmm-views") as HTMLElement | null;
  if (!view) return;

  view.innerHTML = "";
  view.style.display = "grid";
  view.style.gap = "12px";
  view.style.padding = "4px 0";
  view.style.minHeight = "0";
  view.style.alignContent = "start";
  view.style.maxHeight = "54vh";

  const stats = StatsService.getSnapshot();
  initGarden(stats).catch((error) => {
    console.error("[StatsMenu] Failed to initialize garden stats", error);
  });
  initShops(stats).catch((error) => {
    console.error("[StatsMenu] Failed to initialize shop stats", error);
  });
  initPets(stats).catch((error) => {
    console.error("[StatsMenu] Failed to initialize pet stats", error);
  });
  renderMetaSection(ui, view, stats);
  renderGardenSection(ui, view, stats);
  renderShopSection(ui, view, stats);
  renderPetSection(ui, view, stats);
  renderAbilitySection(ui, view, stats);
  renderWeatherSection(ui, view, stats);

  if (previousScrollTop !== null) {
    view.scrollTop = previousScrollTop;
  }
}
