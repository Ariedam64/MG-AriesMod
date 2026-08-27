// src/ui/spriteResolver.ts
//
// Name → sprite-URL resolution, split out of spriteIconCache so it can be
// exercised without a DOM or a network (see scripts/checkSpriteResolver.ts).
//
// Two sources, catalog first:
//   1. The MGData catalogs, which already carry a ready-to-use, versioned
//      `sprite` URL for every entry. Authoritative, no fuzzy matching.
//   2. The API's `/assets/sprite-data` index, name-matched (exact, then fuzzy).
//
// The index is a convenience, never a dependency: it is rebuilt from the game
// bundle on every release and has silently lost whole categories before.

export type SpriteEntry = {
  id: string;          // e.g. "sprite/plant/Bamboo"
  name: string;        // e.g. "Bamboo" — the PNG basename
  internalCat: string; // e.g. "plant"
  apiCat: string;      // e.g. "plants" (URL path segment)
  url: string;         // ready-to-fetch PNG URL
};

/** MGData catalogs this module reads sprites from. */
export type SpriteCatalogKey =
  | "plants"
  | "pets"
  | "eggs"
  | "items"
  | "decor"
  | "mutations"
  | "weather";

export type SpriteCatalogReader = (
  key: SpriteCatalogKey,
) => Record<string, unknown> | null;

/** Map from internal sprite-id category → API URL path segment */
export const INTERNAL_TO_API: Record<string, string> = {
  plant: "plants",
  tallplant: "tallPlants",
  seed: "seeds",
  pet: "pets",
  item: "items",
  decor: "decor",
  mutation: "mutations",
  "mutation-overlay": "mutations",
  ui: "ui",
  weather: "weather",
  // Keys here are the *internal* category, which comes from the frame key and
  // is always singular (`sprite/object/…`). These three were written plural on
  // both sides, so they never matched and their sprites fell through to the
  // singular URL — which the API serves only in plural, hence a 404 for every
  // object/tile/animation icon in the mod.
  object: "objects",
  tile: "tiles",
  animation: "animations",
  winter: "winter",
};

/** URL path segment → internal category. Inverse of INTERNAL_TO_API. */
const API_TO_INTERNAL: Record<string, string> = {
  plants: "plant",
  tallplants: "tallplant",
  seeds: "seed",
  pets: "pet",
  items: "item",
  decor: "decor",
  mutations: "mutation",
  ui: "ui",
  weather: "weather",
  objects: "object",
  tiles: "tile",
  animations: "animation",
  winter: "winter",
};

/** Map from the categories used in attachSpriteIcon calls → internal cats to search */
export const SEARCH_CATS: Record<string, string[]> = {
  plant: ["plant", "tallplant"],
  tallplant: ["tallplant", "plant"],
  crop: ["plant", "tallplant"],
  seed: ["seed"],
  pet: ["pet"],
  item: ["item"],
  decor: ["decor"],
  // A few mutation icons live in the `ui` sheet (MutationGold, MutationRainbow)
  // while the rest sit in `mutations`, so both have to be searched — same
  // reason `weather` already spans three.
  mutation: ["mutation", "mutation-overlay", "ui"],
  "mutation-overlay": ["mutation-overlay", "mutation"],
  ui: ["ui"],
  weather: ["ui", "weather", "mutation"],
};

export function normalizeSpriteName(value: string): string {
  let str = String(value || "").trim();
  // If it looks like a URL or path, extract just the filename
  if (str.includes("/")) {
    str = str.split("/").pop() || str;
  }
  // Strip file extensions and query params (e.g. "Carrot.png?v=163" → "Carrot")
  str = str.replace(/\.[a-z0-9]+(\?.*)?$/i, "");
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function expandCategories(categories: string[]): Set<string> {
  const internalCats = new Set<string>();
  for (const cat of categories) {
    const expanded = SEARCH_CATS[cat] || [cat];
    for (const catName of expanded) internalCats.add(catName);
  }
  return internalCats;
}

/* ------------------------------ Sprite index ------------------------------ */

const indexEntries: SpriteEntry[] = [];
const nameIndex = new Map<string, SpriteEntry[]>();

/** Feed the entries of `/assets/sprite-data?flat=1`. */
export function setSpriteIndex(
  items: Array<{ id: string; name: string }>,
  apiBase: string,
): void {
  indexEntries.length = 0;
  nameIndex.clear();
  for (const item of items) {
    const parts = item.id.split("/").filter(Boolean);
    const start = parts[0] === "sprite" || parts[0] === "sprites" ? 1 : 0;
    const internalCat = parts[start] || "";
    const apiCat = INTERNAL_TO_API[internalCat] || internalCat;
    const entry: SpriteEntry = {
      id: item.id,
      name: item.name,
      internalCat,
      apiCat,
      url: `${apiBase}/assets/sprites/${apiCat}/${item.name}.png`,
    };
    indexEntries.push(entry);
    const norm = normalizeSpriteName(item.name);
    const arr = nameIndex.get(norm) || [];
    arr.push(entry);
    nameIndex.set(norm, arr);
  }
}

export function spriteIndexSize(): number {
  return indexEntries.length;
}

/* ----------------------------- Catalog sprites ---------------------------- */
//
// Every catalog entry MGData serves already carries its own sprite URL, so the
// catalog can answer on its own — that is what keeps the icons alive when the
// index loses a category.

/** Where the sprite URL sits inside an entry of each catalog. */
type CatalogSource = {
  key: SpriteCatalogKey;
  /** Sub-objects holding a `sprite`, in registration order. `null` = the entry itself. */
  paths: Array<string | null>;
};

const CATALOG_SOURCES: readonly CatalogSource[] = [
  // `crop` before `plant`: both land in the `plants` sheet, and the bare species
  // name must resolve to the harvested crop (Carrot), not the seedling
  // (BabyCarrot) — which is what the index used to return.
  { key: "plants", paths: ["seed", "crop", "plant"] },
  { key: "pets", paths: [null] },
  { key: "eggs", paths: [null] },
  { key: "items", paths: [null] },
  { key: "decor", paths: [null] },
  { key: "mutations", paths: [null] },
  { key: "weather", paths: [null] },
];

const catalogIndex = new Map<string, SpriteEntry[]>();
let catalogSourcesIndexed = -1;
let catalogReader: SpriteCatalogReader | null = null;

export function setCatalogReader(reader: SpriteCatalogReader | null): void {
  catalogReader = reader;
  catalogSourcesIndexed = -1;
}

function addCatalogAlias(alias: string, entry: SpriteEntry): void {
  const key = normalizeSpriteName(alias);
  if (!key) return;
  const entries = catalogIndex.get(key) || [];
  if (entries.some(known => known.internalCat === entry.internalCat)) return;
  entries.push(entry);
  catalogIndex.set(key, entries);
}

/** `https://…/assets/sprites/seeds/Carrot.png?v=1029` → `{ apiCat: "seeds", name: "Carrot" }` */
function readSpriteUrl(url: string): { apiCat: string; name: string } | null {
  const match = /\/assets\/sprites\/([^/]+)\/([^/?#]+)\.[a-z0-9]+(?:[?#]|$)/i.exec(url);
  if (!match) return null;
  return { apiCat: match[1], name: match[2] };
}

function catalogEntryFor(url: string): SpriteEntry | null {
  const parsed = readSpriteUrl(url);
  if (!parsed) return null;
  const internalCat = API_TO_INTERNAL[parsed.apiCat.toLowerCase()] || parsed.apiCat.toLowerCase();
  return {
    id: `sprite/${internalCat}/${parsed.name}`,
    name: parsed.name,
    internalCat,
    apiCat: parsed.apiCat,
    url,
  };
}

/** (Re)build the catalog lookup as MGData catalogs land. Cheap no-op once stable. */
function buildCatalogIndex(): void {
  const read = catalogReader;
  if (!read) return;

  const loaded = CATALOG_SOURCES.filter(source => read(source.key)).length;
  if (loaded === catalogSourcesIndexed) return;
  catalogSourcesIndexed = loaded;
  catalogIndex.clear();

  for (const source of CATALOG_SOURCES) {
    const catalog = read(source.key);
    if (!catalog) continue;

    for (const [id, raw] of Object.entries(catalog)) {
      const record = raw as Record<string, unknown> | null;
      if (!record || typeof record !== "object") continue;

      for (const path of source.paths) {
        const holder = (path === null ? record : record[path]) as
          | { sprite?: unknown; name?: unknown }
          | null
          | undefined;
        if (!holder || typeof holder !== "object") continue;
        const url = typeof holder.sprite === "string" ? holder.sprite : "";
        if (!url) continue;

        const entry = catalogEntryFor(url);
        if (!entry) continue;

        // The PNG basename is what the index keyed on, so it stays the primary
        // alias; the catalog id and display name are what callers actually pass.
        addCatalogAlias(entry.name, entry);
        addCatalogAlias(id, entry);
        if (typeof holder.name === "string") addCatalogAlias(holder.name, entry);
      }
    }
  }
}

export function catalogIndexSize(): number {
  buildCatalogIndex();
  return catalogIndex.size;
}

function findCatalogSprite(internalCats: Set<string>, normTarget: string): SpriteEntry | null {
  if (!normTarget) return null;
  buildCatalogIndex();
  const entries = catalogIndex.get(normTarget);
  if (!entries?.length) return null;
  for (const entry of entries) {
    if (internalCats.has(entry.internalCat)) return entry;
  }
  return null;
}

/* -------------------------------- Lookup ---------------------------------- */

export function findSprite(categories: string[], candidateId: string): SpriteEntry | null {
  const norm = normalizeSpriteName(candidateId);
  const internalCats = expandCategories(categories);

  const fromCatalog = findCatalogSprite(internalCats, norm);
  if (fromCatalog) return fromCatalog;

  const entries = nameIndex.get(norm);
  if (!entries?.length) {
    return findSpriteFuzzy(categories, norm);
  }

  for (const entry of entries) {
    if (internalCats.has(entry.internalCat)) return entry;
  }

  // No category match — try fuzzy search instead of returning wrong category
  return findSpriteFuzzy(categories, norm);
}

function findSpriteFuzzy(categories: string[], normTarget: string): SpriteEntry | null {
  if (!normTarget) return null;

  const internalCats = expandCategories(categories);

  for (const [norm, entries] of nameIndex) {
    if (norm.includes(normTarget) || normTarget.includes(norm)) {
      for (const entry of entries) {
        if (internalCats.has(entry.internalCat)) return entry;
      }
    }
  }

  for (const [norm, entries] of nameIndex) {
    if (norm.includes(normTarget) || normTarget.includes(norm)) {
      return entries[0];
    }
  }

  return null;
}

/** Test seam: drop every source so a case can start from a known state. */
export function resetSpriteResolver(): void {
  indexEntries.length = 0;
  nameIndex.clear();
  catalogIndex.clear();
  catalogSourcesIndexed = -1;
  catalogReader = null;
}
