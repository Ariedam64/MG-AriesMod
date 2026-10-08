import { decorCatalog, eggCatalog, plantCatalog, rarity as rarityMap, toolCatalog } from "../../data";
import { Emitter } from "../../lib/emitter";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { isCapReached } from "./inventoryCaps";

/**
 * Every item a shop alert can follow, built from the catalogs rather than
 * from the live shops, so weather-only items (Daisy, Dawn Egg) can be set up
 * before their weather comes. Each row carries whether the player follows it.
 */

type SectionType = "Seed" | "Egg" | "Tool" | "Decor";

export type NotifierRow = {
  id: string;
  type: SectionType;
  name: string;
  rarity?: string;
  /** Whether the item's alert is on. A capped item reads as off. */
  popup: boolean;
  /** Same as `popup`. */
  followed: boolean;
  /** Only purchasable during a weather event (no base shop in eligibleShops). */
  weatherOnly?: boolean;
  /** Weather shops that also sell the item (e.g. ["Dawn"]). */
  weathers?: string[];
};

export type NotifierState = {
  updatedAt: number;
  rows: NotifierRow[];
  counts: {
    items: number;
    followed: number;
  };
};

export type NotifierFilters = {
  type?: "all" | "seed" | "egg" | "tool" | "decor";
  rarity?: "all" | "common" | "uncommon" | "rare" | "legendary" | "mythical" | "divine" | "celestial";
};

const FOLLOWED_PATH = "notifier.prefs";

/* ============================ Followed items ============================== */

// Stored as `{ [id]: 1 }`, a bit field of which only the popup bit is left.
let followed: Set<string> | null = null;

function followedIds(): Set<string> {
  if (followed) return followed;
  followed = new Set();
  const stored = readAriesPath<Record<string, unknown>>(FOLLOWED_PATH);
  if (stored && typeof stored === "object") {
    for (const [id, bits] of Object.entries(stored)) {
      if (id && (Number(bits) | 0) & 1) followed.add(id);
    }
  }
  return followed;
}

function saveFollowed(): void {
  const out: Record<string, number> = {};
  for (const id of followedIds()) out[id] = 1;
  writeAriesPath(FOLLOWED_PATH, out);
}

/* ================================== Rows ================================== */

const DISPLAY_RARITY: Record<string, string> = {
  [rarityMap.Common]: "Common",
  [rarityMap.Uncommon]: "Uncommon",
  [rarityMap.Rare]: "Rare",
  [rarityMap.Legendary]: "Legendary",
  [rarityMap.Mythic]: "Mythical",
  // The live API returns "Mythic" while rarityMap.Mythic is "Mythical".
  Mythic: "Mythical",
  [rarityMap.Divine]: "Divine",
  [rarityMap.Celestial]: "Celestial",
};

const BASE_SHOPS = new Set<string>(["Seed", "Egg", "Tool", "Decor"]);

/** Splits `eligibleShops` into the base shop (if any) and the weather shops. */
function splitEligibleShops(shops: unknown): { base: SectionType | null; weathers: string[] } {
  const names = Array.isArray(shops) ? shops.map((s) => String(s ?? "").trim()).filter(Boolean) : [];
  let base: SectionType | null = null;
  const weathers: string[] = [];
  for (const name of names) {
    if (BASE_SHOPS.has(name)) base = name as SectionType;
    else weathers.push(name);
  }
  return { base, weathers };
}

function buildRows(): NotifierRow[] {
  const rows: NotifierRow[] = [];
  const seen = new Set<string>();
  const sources: Array<{ catalog: Record<string, any>; section: SectionType; entryOf: (raw: any) => any }> = [
    { catalog: plantCatalog, section: "Seed", entryOf: (raw) => raw?.seed ?? raw },
    { catalog: eggCatalog, section: "Egg", entryOf: (raw) => raw },
    { catalog: toolCatalog, section: "Tool", entryOf: (raw) => raw },
    { catalog: decorCatalog, section: "Decor", entryOf: (raw) => raw },
  ];

  for (const { catalog, section: naturalSection, entryOf } of sources) {
    if (!catalog || typeof catalog !== "object") continue;
    for (const key of Object.keys(catalog)) {
      const entry = entryOf(catalog[key]);
      if (!entry || typeof entry !== "object") continue;
      // `eligibleShops` is the source of truth. `purchasable` only speaks for
      // the base shop: Daisy (purchasable=false, eligibleShops=["Dawn"]) is
      // still sold by the weather shop.
      const { base, weathers } = splitEligibleShops(entry.eligibleShops);
      if (!base && weathers.length === 0) continue;
      const section = base ?? naturalSection;
      const id = `${section}:${key}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const rawRarity = typeof entry.rarity === "string" ? entry.rarity : undefined;
      const popup = followedIds().has(id);
      rows.push({
        id,
        type: section,
        name: typeof entry.name === "string" && entry.name.trim() ? String(entry.name) : key,
        rarity: rawRarity ? (DISPLAY_RARITY[rawRarity] ?? rawRarity) : undefined,
        popup,
        followed: popup,
        weatherOnly: !base || undefined,
        weathers: weathers.length ? weathers : undefined,
      });
    }
  }
  return rows;
}

let state: NotifierState | null = null;
let idsSig = "";
const changed = new Emitter<NotifierState>();

const countFollowed = (rows: NotifierRow[]) => rows.reduce((n, r) => n + (r.followed ? 1 : 0), 0);
const emit = () => {
  if (state) changed.emit({ ...state, rows: state.rows.slice() });
};

export const ShopRows = {
  /** Rebuilds the rows from the catalogs. Listeners hear of it only when the set of items changed. */
  rebuild(): void {
    const rows = buildRows();
    state = { updatedAt: Date.now(), rows, counts: { items: rows.length, followed: countFollowed(rows) } };
    const sig = rows.map((r) => r.id).sort().join("|");
    if (sig === idsSig) return;
    idsSig = sig;
    emit();
  },

  /** Re-reads every row's alert (followed, capped) and tells the listeners. */
  refresh(): void {
    if (!state) return;
    for (const row of state.rows) {
      const popup = followedIds().has(row.id) && !isCapReached(row.id);
      row.popup = popup;
      row.followed = popup;
    }
    state = {
      ...state,
      updatedAt: Date.now(),
      rows: state.rows.slice(),
      counts: { items: state.rows.length, followed: countFollowed(state.rows) },
    };
    emit();
  },

  state(): NotifierState {
    if (!state) ShopRows.rebuild();
    return state as NotifierState;
  },

  onChange(cb: (s: NotifierState) => void): () => void {
    return changed.on(cb);
  },

  /** Whether an item's alert is on. A capped item reads as off. */
  isFollowed(id: string): boolean {
    return !isCapReached(id) && followedIds().has(id);
  },

  /** Turns an item's alert on or off. Turning on a capped item does nothing. */
  setFollowed(id: string, enabled: boolean): void {
    if (!id || (enabled && isCapReached(id))) return;
    if (enabled) followedIds().add(id);
    else followedIds().delete(id);
    saveFollowed();
    ShopRows.refresh();
  },

  /** Filters rows by type and rarity, as the Shops tab's selects ask. */
  filter(rows: NotifierRow[], filters: NotifierFilters): NotifierRow[] {
    const type = filters.type ?? "all";
    const rarity = filters.rarity ?? "all";
    return rows.filter(
      (r) =>
        (type === "all" || r.type.toLowerCase() === type) &&
        (rarity === "all" || String(r.rarity ?? "").toLowerCase() === rarity),
    );
  },
};
