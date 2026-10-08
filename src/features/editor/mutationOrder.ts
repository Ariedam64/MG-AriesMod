// The order mutations are listed in the editor: colour mutations (Gold,
// Rainbow) first, then the hydro family, then the lunar one, each by coin
// multiplier.
//
// The groups come from the catalogs. A colour mutation has a `baseChance`. A
// weather mutation takes the group of the weather that grants it: the live
// catalog names it in `groupId` ("Hydro", "Lunar") and `mutator.mutation`, the
// bundled fallback in `type` ("weather", "lunar") and `mutations[].name`.
//
// One stored id differs from its catalog key: slots store "Ambershine" for
// the catalog's "Amberlit".

type Catalog = Record<string, any>;

const GROUP_COLOR = 0;
const GROUP_HYDRO = 1;
const GROUP_LUNAR = 2;
const GROUP_OTHER = 3;

/** Shortest shared prefix that makes "Thundercharged" a relative of "Thunderstruck". */
const STEM_MIN_PREFIX = 4;

/** The catalog key for an id stored on a slot. */
export const mutationCatalogKeyFor = (storedId: string): string => (storedId === "Ambershine" ? "Amberlit" : storedId);

/** The id a slot stores for a catalog key. */
export const storedMutationIdFor = (catalogKey: string): string => (catalogKey === "Amberlit" ? "Ambershine" : catalogKey);

function groupOfWeatherType(raw: unknown): number | null {
  const value = String(raw ?? "").toLowerCase();
  if (value === "hydro" || value === "weather") return GROUP_HYDRO;
  if (value === "lunar") return GROUP_LUNAR;
  return null;
}

function commonPrefixLength(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const max = Math.min(la.length, lb.length);
  let i = 0;
  while (i < max && la[i] === lb[i]) i++;
  return i;
}

function grantedMutations(weather: any): string[] {
  const granted: string[] = [];
  if (weather?.mutator?.mutation) granted.push(String(weather.mutator.mutation));
  if (Array.isArray(weather?.mutations)) {
    for (const m of weather.mutations) if (m?.name) granted.push(String(m.name));
  }
  return granted;
}

const isWeatherGroup = (rank: number | undefined) => rank === GROUP_HYDRO || rank === GROUP_LUNAR;

/** The display group of every mutation key, in the order of `keys`. */
function computeMutationGroupRanks(
  keys: string[],
  mutations: Catalog,
  weathers: Catalog,
): Record<string, number> {
  const ranks: Record<string, number> = {};
  const keyByName: Record<string, string> = {};

  for (const key of keys) {
    const def = mutations[key] || {};
    keyByName[key.toLowerCase()] = key;
    if (def.name) keyByName[String(def.name).toLowerCase()] = key;
    const alias = key === "Amberlit" ? "Ambershine" : key === "Ambershine" ? "Amberlit" : null;
    if (alias) keyByName[alias.toLowerCase()] = key;
    if (Number(def.baseChance) > 0) ranks[key] = GROUP_COLOR;
  }

  for (const weather of Object.values(weathers || {})) {
    const granted = grantedMutations(weather);
    if (!granted.length) continue;
    // A weather that grants mutations but has no type (Thunderstorm in the
    // bundled fallback) belongs to the hydro cycle.
    const rank = groupOfWeatherType(weather?.groupId ?? weather?.type) ?? GROUP_HYDRO;
    for (const name of granted) {
      const key = keyByName[name.toLowerCase()];
      if (key && ranks[key] == null) ranks[key] = rank;
    }
  }

  // Derived variants (Thundercharged, Dawncharged...) take the group of the
  // weather mutation sharing the longest name stem (Thunder-, Dawn-...).
  const grouped = keys.filter((k) => ranks[k] != null && ranks[k] !== GROUP_COLOR);
  for (const key of keys) {
    if (ranks[key] != null) continue;
    let bestRank: number | null = null;
    let bestLen = 0;
    for (const other of grouped) {
      const len = commonPrefixLength(key, other);
      if (len >= STEM_MIN_PREFIX && len > bestLen) {
        bestLen = len;
        bestRank = ranks[other];
      }
    }
    if (bestRank != null) ranks[key] = bestRank;
  }

  // Combo mutations (Frozen is Wet plus Chilled) are granted by no weather and
  // share no stem. The catalog lists mutations next to their family, which is
  // also the game's own display order, so they take the group of the nearest
  // weather mutation before them, else after them.
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (ranks[key] != null) continue;
    let inherited: number | null = null;
    for (let j = i - 1; j >= 0 && inherited == null; j--) {
      if (isWeatherGroup(ranks[keys[j]])) inherited = ranks[keys[j]];
    }
    for (let j = i + 1; j < keys.length && inherited == null; j++) {
      if (isWeatherGroup(ranks[keys[j]])) inherited = ranks[keys[j]];
    }
    ranks[key] = inherited ?? GROUP_OTHER;
  }

  return ranks;
}

/** Catalog keys in display order: by group, then coin multiplier, then name. */
export function sortMutationCatalogKeys(keys: string[], mutations: Catalog, weathers: Catalog): string[] {
  const ranks = computeMutationGroupRanks(keys, mutations, weathers);
  const multiplier = (key: string) => Number(mutations[key]?.coinMultiplier) || 0;
  return keys.slice().sort((a, b) => {
    const rankDiff = (ranks[a] ?? GROUP_OTHER) - (ranks[b] ?? GROUP_OTHER);
    if (rankDiff !== 0) return rankDiff;
    const multDiff = multiplier(a) - multiplier(b);
    if (multDiff !== 0) return multDiff;
    return a.localeCompare(b);
  });
}

/** Stored ids in the display order of `orderedKeys`; unknown ids go last, by name. */
export function sortStoredMutationIds(ids: string[], orderedKeys: string[]): string[] {
  const indexOf = (id: string) => {
    const idx = orderedKeys.indexOf(mutationCatalogKeyFor(id));
    return idx === -1 ? orderedKeys.length : idx;
  };
  return ids.slice().sort((a, b) => indexOf(a) - indexOf(b) || a.localeCompare(b));
}
