// The Hatch tab of the Pets menu: one collapsible card per egg, ordered by the
// game's own rarity order, holding that egg's Bad Luck Protection progress and
// the pets it hatches. Species no egg produces fall into a final card.
//
// Hatches are detected from the activity log (see tracker.ts), not
// from the websocket: the log names the egg and the pet outright, and tells a
// Double Hatch bonus pet apart from a real pull.

import { petCatalog } from "../../data";
import { PlayerService } from "../../game/player";
import { HatchTracker } from "./tracker";
import { listEggPity } from "./pity";
import { StatsService, type StatsSnapshot } from "../stats/stats";
import { Atoms } from "../../game/store/atoms";
import { createEggCard } from "./eggCard";
import { countsFor, sortSpeciesByRarity, speciesCountsGrid, totalOf } from "./counts";
import { button } from "../../ui/kit/button";
import { collapsibleCard } from "../../ui/kit/layout";
import { getAriesStorage, updateAriesStorage } from "../../platform/storage";
import { ensureHatchStyles } from "./styles";

type HatchedCounts = StatsSnapshot["pets"]["hatchedByType"][string];

const OTHER_SECTION_ID = "__other__";

/* ------------------------------ collapse state ----------------------------- */

// Cards start closed, since eleven eggs expanded at once bury the tab. What
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
  try { inventory = await Atoms.inventory.myInventory.get(); } catch (error) {
    console.warn("[PetsHatch] Failed to read inventory data", error);
  }
  try { activePets = await PlayerService.getPets(); } catch (error) {
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

export function renderHatchTab(view: HTMLElement): void {
  ensureHatchStyles();
  view.replaceChildren();

  // Style an inner wrapper, never the tab view itself: an inline display on
  // the view would override the menu's .qmm-view show/hide rule.
  const wrap = document.createElement("div");
  wrap.className = "ht-tab";
  view.appendChild(wrap);

  /* ----- Header ----- */
  const header = document.createElement("div");
  header.className = "ht-head";

  const text = document.createElement("div");
  text.className = "ht-head__text";
  const title = document.createElement("div");
  title.className = "ht-title";
  title.textContent = "Hatches";
  const subtitle = document.createElement("div");
  subtitle.className = "ht-sub";
  subtitle.textContent = "What each egg gave you, and how close its next guarantee is.";
  text.append(title, subtitle);
  header.appendChild(text);

  let showOffsets = false;
  const calibrateBtn = button("Set counters", {
    size: "sm",
    title:
      "Counted from the hatches Arie's Mod has watched: the game never sends the real counters. " +
      "Shows a field on every counter to type in your real one.",
    onClick: () => {
      showOffsets = !showOffsets;
      repaint();
    },
  });
  header.appendChild(calibrateBtn);
  wrap.appendChild(header);

  const body = document.createElement("div");
  body.className = "ht-list qws-pnl-scroll";
  wrap.appendChild(body);

  /* ----- Painting ----- */
  function repaint(): void {
    calibrateBtn.setActive(showOffsets);

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
        title: "Other pets",
        description: "Species no egg hatches.",
        collapsed: isCollapsed(OTHER_SECTION_ID),
        onToggle: collapsed => setCollapsed(OTHER_SECTION_ID, collapsed),
      });
      card.root.classList.add("ht-egg");
      card.body.appendChild(speciesCountsGrid(others.map(species => ({ species })), stats));
      body.appendChild(card.root);
    }

    if (!body.childElementCount) {
      const empty = document.createElement("div");
      empty.className = "ht-empty";
      empty.textContent = "No egg data yet. It shows up once the game's catalogs have loaded.";
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

  seedFromOwnedPets(StatsService.getSnapshot()).catch(error => {
    console.error("[PetsHatch] Failed to seed pet stats", error);
  });

  repaint();
}
