// src/ui/menus/petsHatch.ts
// "Hatch" tab of the Pets menu: one collapsible card per egg, ordered by the
// game's own rarity order, holding that egg's Bad Luck Protection progress and
// the pets it hatches. Species no egg produces fall into a final card.
//
// Hatches are detected from the activity log (see services/hatchTracker), not
// from the websocket: the log names the egg and the pet outright, and tells a
// Double Hatch bonus pet apart from a real pull.

import { Menu } from "../menu";
import { petCatalog } from "../../data";
import { HatchTracker } from "../../services/hatchTracker";
import { listEggPity } from "../../services/hatchPity";
import { StatsService, type StatsSnapshot } from "../../services/stats";
import { myInventory, myPetInfos } from "../../store/atoms";
import { createEggCard } from "./pets/hatch-egg-card";
import { countsFor, sortSpeciesByRarity, speciesCountsGrid, totalOf } from "./pets/hatch-counts";
import {
  BORDER,
  CARD_BG,
  TEAL,
  TEXT,
  TEXT_DIM,
  button,
  css,
  ensurePanelStyles,
} from "./panel-ui";
import { collapsibleCard } from "./panel-layout";
import { getAriesStorage, updateAriesStorage } from "../../utils/localStorage";

type HatchedCounts = StatsSnapshot["pets"]["hatchedByType"][string];

const OTHER_SECTION_ID = "__other__";

/* ------------------------------ collapse state ----------------------------- */

// Cards start closed — eleven eggs expanded at once buries the tab — so what
// persists is the opposite: which ones the player has opened.
function isCollapsed(sectionId: string): boolean {
  return getAriesStorage().hatch?.expanded?.[sectionId] !== true;
}

function setCollapsed(sectionId: string, collapsed: boolean): void {
  updateAriesStorage(current => {
    const hatch = (current.hatch ??= {});
    const map = (hatch.expanded ??= {});
    if (collapsed) delete map[sectionId];
    else map[sectionId] = true;
  });
}

/* --------------------------- seeding from inventory ------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function inventoryItems(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (isRecord(raw) && Array.isArray(raw.items)) return raw.items;
  return [];
}

function mutationTypeOf(mutations: unknown): keyof HatchedCounts {
  if (!Array.isArray(mutations)) return "normal";
  let hasGold = false;
  for (const mutation of mutations) {
    if (typeof mutation !== "string") continue;
    const normalized = mutation.trim().toLowerCase();
    if (normalized === "rainbow") return "rainbow";
    if (normalized === "gold") hasGold = true;
  }
  return hasGold ? "gold" : "normal";
}

function isTableEmpty(stats: StatsSnapshot): boolean {
  const entries = Object.values(stats.pets?.hatchedByType ?? {});
  return entries.length === 0 || entries.every(counts => totalOf(counts) <= 0);
}

function addSpecies(map: Map<string, HatchedCounts>, species: unknown, mutations: unknown): void {
  const name = typeof species === "string" ? species.trim() : "";
  if (!name) return;
  const key = name.toLowerCase();
  const counts = map.get(key) ?? { normal: 0, gold: 0, rainbow: 0 };
  const bucket = mutationTypeOf(mutations);
  counts[bucket] = (counts[bucket] ?? 0) + 1;
  map.set(key, counts);
}

/** Seeds the hatch counts from owned pets the first time the tab is used. */
async function seedFromOwnedPets(stats: StatsSnapshot): Promise<void> {
  if (!isTableEmpty(stats)) return;

  let inventory: unknown = null;
  let activePets: unknown = null;
  try { inventory = await myInventory.get(); } catch (error) {
    console.warn("[PetsHatch] Failed to read inventory data", error);
  }
  try { activePets = await myPetInfos.get(); } catch (error) {
    console.warn("[PetsHatch] Failed to read active pet data", error);
  }

  const counts = new Map<string, HatchedCounts>();

  for (const item of inventoryItems(inventory)) {
    if (!isRecord(item)) continue;
    const itemType = typeof item.itemType === "string" ? item.itemType.toLowerCase() : "";
    if (itemType !== "pet") continue;
    addSpecies(counts, item.petSpecies, item.mutations);
  }

  for (const entry of Array.isArray(activePets) ? activePets : []) {
    if (!isRecord(entry) || !isRecord(entry.slot)) continue;
    addSpecies(counts, entry.slot.petSpecies, (entry.slot as Record<string, unknown>).mutations);
  }

  if (!counts.size) return;

  StatsService.update(draft => {
    if (!isTableEmpty(draft)) return;
    for (const [species, seeded] of counts) {
      const entry = draft.pets.hatchedByType[species] ?? { normal: 0, gold: 0, rainbow: 0 };
      entry.normal += seeded.normal ?? 0;
      entry.gold += seeded.gold ?? 0;
      entry.rainbow += seeded.rainbow ?? 0;
      draft.pets.hatchedByType[species] = entry;
    }
  });
}

/* ------------------------------- other pets -------------------------------- */

/**
 * Species no egg hatches, so nothing the player owns goes unlisted: capsule
 * pets, event grants, and anything the catalogs gained before the egg data did.
 */
function otherSpecies(stats: StatsSnapshot, fromEggs: Set<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const consider = (species: string) => {
    const lower = species.toLowerCase();
    if (seen.has(lower) || fromEggs.has(lower)) return;
    seen.add(lower);
    out.push(species);
  };

  for (const species of Object.keys(petCatalog)) consider(species);

  // Species the catalog no longer serves but the player has hatched. Zero-count
  // entries are skipped: the stats snapshot seeds a 0 for every catalog species
  // and never prunes, so a species the API served once would linger forever.
  for (const key of Object.keys(stats.pets?.hatchedByType ?? {})) {
    if (totalOf(countsFor(stats, key)) <= 0) continue;
    consider(key.charAt(0).toUpperCase() + key.slice(1));
  }

  return sortSpeciesByRarity(out);
}

/* ----------------------------------- tab ----------------------------------- */

export function renderHatchTab(view: HTMLElement, _ui: Menu): void {
  const prevCleanup = (view as any).__cleanup__;
  if (typeof prevCleanup === "function") {
    try { prevCleanup(); } catch {}
    (view as any).__cleanup__ = undefined;
  }

  ensurePanelStyles();
  view.innerHTML = "";

  // Style an inner wrapper, never the tab view itself: an inline display on
  // the view would override the menu's .qmm-view show/hide rule.
  const wrap = document.createElement("div");
  wrap.classList.add("qws-pnl-root", "qws-pnl-scroll");
  css(wrap, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    // Wide enough for the counts grid to breathe, but capped against the
    // viewport so the HUD window never runs off a small screen.
    width: "min(680px, 86vw)",
    maxWidth: "100%",
    minHeight: "0",
    maxHeight: "68vh",
    overflowY: "auto",
    boxSizing: "border-box",
  });
  view.appendChild(wrap);

  /* ----- Header ----- */
  const header = document.createElement("div");
  css(header, { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0", padding: "0 2px" });

  const title = document.createElement("div");
  css(title, { fontSize: "14.5px", fontWeight: "700", color: TEXT, flex: "1 1 auto" });
  title.textContent = "🥚 Hatches & bad luck protection";
  title.title =
    "Counted from the hatches Arie's Mod has watched — the game never sends the real counters. Use Calibrate to set your actual head start.";
  header.appendChild(title);

  let showOffsets = false;
  const calibrateBtn = button("Calibrate", "neutral", () => {
    showOffsets = !showOffsets;
    repaint();
  });
  calibrateBtn.title = "Show a head start field on every counter.";
  header.appendChild(calibrateBtn);
  wrap.appendChild(header);

  const body = document.createElement("div");
  css(body, { display: "flex", flexDirection: "column", gap: "8px" });
  wrap.appendChild(body);

  /* ----- Painting ----- */
  function repaint(): void {
    css(calibrateBtn, {
      color: showOffsets ? TEAL : TEXT,
      borderColor: showOffsets ? "rgba(94,234,212,0.3)" : BORDER,
      background: showOffsets ? "rgba(94,234,212,0.12)" : CARD_BG,
    });

    const stats = StatsService.getSnapshot();
    body.innerHTML = "";

    const eggs = listEggPity();
    const fromEggs = new Set<string>();
    for (const egg of eggs) {
      for (const entry of egg.fauna) fromEggs.add(entry.species.toLowerCase());
    }

    for (const egg of eggs) {
      body.appendChild(
        createEggCard({
          egg,
          stats,
          showOffsets,
          collapsed: isCollapsed(egg.eggId),
          onToggle: collapsed => setCollapsed(egg.eggId, collapsed),
        }),
      );
    }

    const others = otherSpecies(stats, fromEggs);
    if (others.length) {
      const card = collapsibleCard({
        icon: "🐾",
        title: "Other pets",
        description: "Species no egg hatches.",
        collapsed: isCollapsed(OTHER_SECTION_ID),
        onToggle: collapsed => setCollapsed(OTHER_SECTION_ID, collapsed),
      });
      card.body.appendChild(speciesCountsGrid(others.map(species => ({ species })), stats));
      body.appendChild(card.root);
    }

    if (!body.childElementCount) {
      const empty = document.createElement("div");
      css(empty, { fontSize: "12.5px", color: TEXT_DIM, padding: "6px 2px" });
      empty.textContent = "No egg data available yet.";
      body.appendChild(empty);
    }
  }

  /* ----- Live updates ----- */
  let rafId: number | null = null;
  const schedule = () => {
    if (!view.isConnected) {
      cleanup();
      return;
    }
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      repaint();
    });
  };

  const stopStats = StatsService.subscribe(schedule);
  const stopTracker = HatchTracker.subscribe(schedule);

  function cleanup(): void {
    try { stopStats(); } catch {}
    try { stopTracker(); } catch {}
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  (view as any).__cleanup__ = cleanup;

  seedFromOwnedPets(StatsService.getSnapshot()).catch(error => {
    console.error("[PetsHatch] Failed to seed pet stats", error);
  });

  repaint();
}
