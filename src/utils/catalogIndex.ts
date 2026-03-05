// src/utils/catalogIndex.ts
import { plantCatalog, eggCatalog, toolCatalog, decorCatalog } from "../data";

/* ============================== Types & utils ============================== */

// Types souples pour lire le catalogue
type Entry = {
  seed?:  { name?: string; tileRef?: unknown };
  plant?: { name?: string; tileRef?: unknown };
  crop?:  { name?: string; tileRef?: unknown };
};
type Catalog = Record<string, Entry>;

// Normalisation (clé/label)
const norm = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// tileRef (objet/chaîne/nombre) → dernier segment normalisé
const tileRefKey = (tr: unknown) => {
  const raw = String(tr ?? "");
  // on tolère "Tiles.Foo.Bar" ou "Tiles/Foo/Bar"
  const last = raw.split(/[./]/).pop() || raw;
  return norm(last);
};

// DataURI
const _toDataURI = (s?: string | null) =>
  s ? (s.startsWith("data:") ? s : `data:image/png;base64,${s}`) : undefined;

export type CatalogIndex = {
  seedNameToSpecies: Map<string, string[]>;
  plantNameToSpecies: Map<string, string[]>;
  cropNameToSpecies: Map<string, string[]>;
  tileRefToSpecies: Map<string, string>;
  allSpecies: string[];
};

/* ========================= Index plantes (singleton) ======================== */

function createCatalogIndex(cat: Catalog = plantCatalog as Catalog): CatalogIndex {
  const seedNameToSpecies  = new Map<string, string[]>();
  const plantNameToSpecies = new Map<string, string[]>();
  const cropNameToSpecies  = new Map<string, string[]>();
  const tileRefToSpecies   = new Map<string, string>();
  const allSpecies: string[] = [];

  const push = (map: Map<string, string[]>, key: string | undefined, species: string) => {
    if (!key) return;
    const k = norm(key);
    const arr = map.get(k);
    if (arr) arr.push(species);
    else map.set(k, [species]);
  };

  for (const [species, e] of Object.entries(cat || {})) {
    allSpecies.push(species);
    push(seedNameToSpecies,  e.seed?.name,  species);
    push(plantNameToSpecies, e.plant?.name, species);
    push(cropNameToSpecies,  e.crop?.name,  species);

    const trs = [e.seed?.tileRef, e.plant?.tileRef, e.crop?.tileRef].filter(Boolean);
    for (const tr of trs) {
      const k = tileRefKey(tr);
      if (k && !tileRefToSpecies.has(k)) tileRefToSpecies.set(k, species);
    }
  }

  return { seedNameToSpecies, plantNameToSpecies, cropNameToSpecies, tileRefToSpecies, allSpecies };
}

let _IDX: CatalogIndex | null = null;
export function getPlantCatalogIndex(): CatalogIndex {
  if (_IDX) return _IDX;
  _IDX = createCatalogIndex();
  return _IDX;
}

/* ============================== Helpers exports ============================= */

export const speciesFromSeedName  = (label: string, idx = getPlantCatalogIndex()) =>
  idx.seedNameToSpecies.get(norm(label)) ?? [];

export const speciesFromPlantName = (label: string, idx = getPlantCatalogIndex()) =>
  idx.plantNameToSpecies.get(norm(label)) ?? [];

export const speciesFromCropName  = (label: string, idx = getPlantCatalogIndex()) =>
  idx.cropNameToSpecies.get(norm(label)) ?? [];

export const speciesFromAnyDisplayName = (label: string, idx = getPlantCatalogIndex()) =>
  idx.seedNameToSpecies.get(norm(label)) ||
  idx.plantNameToSpecies.get(norm(label)) ||
  idx.cropNameToSpecies.get(norm(label)) ||
  [];

export const speciesFromTileRef = (tr: unknown, idx = getPlantCatalogIndex()) =>
  idx.tileRefToSpecies.get(tileRefKey(tr)) ?? null;

export const firstSpecies = (arr: string[]) => (arr.length ? arr[0] : null);

// --- add near the other helper exports ---

export function seedNameFromSpecies(
  species: string,
  cat: any = plantCatalog as any
): string | undefined {
  const e = cat?.[species];
  return e?.seed?.name ?? e?.plant?.name ?? e?.crop?.name ?? undefined;
}

export function eggNameFromId(
  eggId: string,
  cat: any = eggCatalog as any
): string | undefined {
  return cat?.[eggId]?.name ?? undefined;
}

export function toolNameFromId(
  toolId: string,
  cat: any = toolCatalog as any
): string | undefined {
  return cat?.[toolId]?.name ?? undefined;
}

export function decorNameFromId(
  decorId: string,
  cat: any = decorCatalog as any
): string | undefined {
  return cat?.[decorId]?.name ?? undefined;
}


/* =========================== Images (seeds / eggs / …) =========================== */

type SeedEntryWithImg = { name?: string; tileRef?: unknown; img64?: string };
type CatalogWithImg = Record<string, { seed?: SeedEntryWithImg }>;

type EggEntryWithImg = { name?: string; tileRef?: unknown; img64?: string };
type EggCatalogWithImg = Record<string, EggEntryWithImg>;

type ToolEntryWithImg = { name?: string; img64?: string };
type ToolCatalogWithImg = Record<string, ToolEntryWithImg>;

type DecorEntryWithImg = { img64?: string };
type DecorCatalogWithImg = Record<string, DecorEntryWithImg>;

// Caches
const _seedImgCache  = new Map<string, string | undefined>();
const _eggImgCache   = new Map<string, string | undefined>();
const _toolImgCache  = new Map<string, string | undefined>();
const _decorImgCache = new Map<string, string | undefined>();

/* --------------------------------- SEEDS ---------------------------------- */

export function seedImageFromSpecies(
  species: string,
  cat: CatalogWithImg = plantCatalog as unknown as CatalogWithImg
): string | undefined {
  const key = String(species || "").toLowerCase();
  if (_seedImgCache.has(key)) return _seedImgCache.get(key);
  const entry = cat[species];
  const src = _toDataURI(entry?.seed?.img64);
  _seedImgCache.set(key, src);
  return src;
}

/**
 * Plus souple :
 *  - si tu passes la clé species ("orangetulip"), on renvoie son image.
 *  - sinon, si tu passes un tileRef (string/objet/number), on mappe via l'index.
 */
export function seedImageFrom(
  tileOrSpecies: unknown,
  cat: CatalogWithImg = plantCatalog as unknown as CatalogWithImg
): string | undefined {
  const s = String(tileOrSpecies || "");
  // 1) Cas "clé species" directe
  if (s && (cat as any)[s]) return seedImageFromSpecies(s, cat);

  // 2) Cas tileRef → résout la species via l'index
  const idx = getPlantCatalogIndex();
  const key = tileRefKey(tileOrSpecies);
  const species = idx.tileRefToSpecies.get(key);
  return species ? seedImageFromSpecies(species, cat) : undefined;
}

/* ---------------------------------- EGGS ---------------------------------- */

/** Index paresseux pour eggCatalog par ID (lower → canonique) et par tileRef. */
type EggIndexes = {
  byLowerId: Map<string, string>;     // "rareegg" -> "RareEgg"
  byTileRef: Map<string, string>;     // "13" / "rareegg" -> "RareEgg"
};
let _eggIndexes: WeakMap<EggCatalogWithImg, EggIndexes> | null = null;

function getEggIndexes(cat: EggCatalogWithImg): EggIndexes {
  if (!_eggIndexes) _eggIndexes = new WeakMap();
  const hit = _eggIndexes.get(cat);
  if (hit) return hit;

  const byLowerId = new Map<string, string>();
  const byTileRef = new Map<string, string>();

  for (const [id, e] of Object.entries(cat)) {
    const lc = id.toLowerCase();
    if (!byLowerId.has(lc)) byLowerId.set(lc, id);

    const tr = e?.tileRef;
    if (tr != null) {
      const k1 = String(tr).toLowerCase();        // ex: "13" ou "tiles.pets.rareegg"
      const k2 = tileRefKey(tr);                  // ex: "rareegg"
      if (!byTileRef.has(k1)) byTileRef.set(k1, id);
      if (!byTileRef.has(k2)) byTileRef.set(k2, id);
    }

    // aussi le dernier segment de l'ID lui-même (pratique pour "Tiles.Pets.RareEgg" passé brut)
    const last = tileRefKey(id);
    if (!byTileRef.has(last)) byTileRef.set(last, id);
  }

  const idx: EggIndexes = { byLowerId, byTileRef };
  _eggIndexes.set(cat, idx);
  return idx;
}

export function eggImageFromEggId(
  eggId: string,
  cat: EggCatalogWithImg = eggCatalog as unknown as EggCatalogWithImg
): string | undefined {
  const key = String(eggId || "");
  if (!key) return undefined;

  const ck = key.toLowerCase();
  // cache image
  if (_eggImgCache.has(ck)) return _eggImgCache.get(ck);

  // résolution canonique via index
  const { byLowerId } = getEggIndexes(cat);
  const canonical = (cat as any)[key] ? key : byLowerId.get(ck);
  const src = _toDataURI((canonical ? cat[canonical] : undefined)?.img64);

  _eggImgCache.set(ck, src);
  return src;
}

/**
 * Image d'œuf à partir d’un eggId OU d’un tileRef (nombre/chaîne).
 * - "RareEgg"            -> trouve par id
 * - 13                   -> trouve par tileRef numérique
 * - "Tiles.Pets.RareEgg" -> trouve via dernier segment
 */
export function eggImageFrom(
  tileOrEggId: unknown,
  cat: EggCatalogWithImg = eggCatalog as unknown as EggCatalogWithImg
): string | undefined {
  const raw = String(tileOrEggId ?? "");
  if (!raw) return undefined;

  // 1) Si c'est directement un eggId connu
  if ((cat as any)[raw]) return eggImageFromEggId(raw, cat);

  const { byLowerId, byTileRef } = getEggIndexes(cat);

  // 2) Essayer correspondance id insensible à la casse
  const byId = byLowerId.get(raw.toLowerCase());
  if (byId) return eggImageFromEggId(byId, cat);

  // 3) Essayer via tileRef (normalisé & brut)
  const k1 = raw.toLowerCase();
  const k2 = tileRefKey(raw);
  const viaTile = byTileRef.get(k1) || byTileRef.get(k2);
  if (viaTile) return eggImageFromEggId(viaTile, cat);

  return undefined;
}

/* ---------------------------------- TOOLS --------------------------------- */

export function toolImageFromId(
  toolId: string,
  cat: ToolCatalogWithImg = toolCatalog as unknown as ToolCatalogWithImg
): string | undefined {
  const id = String(toolId || "").trim();
  if (!id) return undefined;

  const cacheKey = id.toLowerCase();
  if (_toolImgCache.has(cacheKey)) return _toolImgCache.get(cacheKey);

  const entry = (cat as any)[id] ?? (cat as any)[cacheKey];
  const src = _toDataURI(entry?.img64);
  _toolImgCache.set(cacheKey, src);
  return src;
}

/** Entrée souple: "Tool:WateringCan" | "WateringCan" | { toolId: "WateringCan" } -> data URI */
export function toolImageFrom(
  input: unknown,
  cat: ToolCatalogWithImg = toolCatalog as unknown as ToolCatalogWithImg
): string | undefined {
  const id = (() => {
    if (typeof input === "string") {
      const s = input.trim();
      return s.startsWith("Tool:") ? s.slice("Tool:".length) : s;
    }
    if (input && typeof input === "object" && "toolId" in (input as any)) {
      return String((input as any).toolId || "");
    }
    return "";
  })();

  return id ? toolImageFromId(id, cat) : undefined;
}

/* --------------------------------- DECOR ---------------------------------- */

export function decorImageFromId(
  decorId: string,
  cat: DecorCatalogWithImg = decorCatalog as unknown as DecorCatalogWithImg
): string | undefined {
  const cacheKey = String(decorId || "").toLowerCase();
  if (_decorImgCache.has(cacheKey)) return _decorImgCache.get(cacheKey);

  const raw = (cat as any)?.[decorId]?.img64 as string | undefined;
  const src = _toDataURI(raw);
  _decorImgCache.set(cacheKey, src);
  return src;
}
