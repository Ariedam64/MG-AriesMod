// A harvest batch: a crop's identity, grouping by look, the player's filters,
// and the signature.
//
// No game reads and no commands here. WHAT to harvest is not decided here
// either: the Locker's rules are, applied by `gardenRead.ts` when it reads the
// garden. This only describes and identifies what was kept.
//
// The trap to know (fix v3.1.503): `HarvestCrop` expects the slot's
// `slotId`, NOT its position in the `slots` array. Sparse plants (Clover after
// a harvest, Daisy) have non-contiguous ids: 0, 2, 3, 5. `HarvestRow.slotId`
// always carries the slot id, never an array index.

/** A crop that can be harvested on its own. */
export type HarvestRow = {
  /** Key in `gardenTileObjects`: first argument of `harvestCrop`. */
  tileIndex: number;
  /** The slot's id: second argument of `harvestCrop`. */
  slotId: number;
  species: string;
  /** 50 to 100. */
  sizePct: number;
  /** 0 to 100. */
  growthPct: number;
  /** Mutations as the game names them. */
  mutations: string[];
  /** Harvestable now. */
  ready: boolean;
  /**
   * Preserved by the player, and paid for.
   *
   * The game charges per crop for preserving and gives it a badge: a
   * deliberate act, not a growth state. Harvesting it throws away what was
   * just bought, hence it is left out by default.
   */
  preserved: boolean;
};

/** A stable id for a row. */
export function rowKey(row: HarvestRow): string {
  return `${row.tileIndex}:${row.slotId}`;
}

/**
 * The proposed batch's signature.
 *
 * Notices that it changed between the proposal and the confirmation: a crop
 * ripening meanwhile changes the set, and the player must confirm what they
 * really see rather than harvest more than expected. Sorted, so independent
 * of display order.
 */
export function selectionSignature(rows: HarvestRow[]): string {
  return rows.map(rowKey).sort().join("|");
}

/** The species present, sorted: feeds the choice without hardcoding anything. */
export function speciesPresent(rows: HarvestRow[]): string[] {
  return [...new Set(rows.map((row) => row.species))].sort((a, b) => a.localeCompare(b));
}

/** The mutations present, sorted: feeds the filter without hardcoding anything. */
export function mutationsPresent(rows: HarvestRow[]): string[] {
  const all = new Set<string>();
  for (const row of rows) for (const mutation of row.mutations) all.add(mutation);
  return [...all].sort((a, b) => a.localeCompare(b));
}

/**
 * Counts rows per value, to show a count on each filter.
 *
 * `of` returns several values when a row counts in several boxes: a crop with
 * two mutations is counted in both.
 */
export function tally(rows: HarvestRow[], of: (row: HarvestRow) => string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const value of of(row)) {
      if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

export type MutationMode = "any" | "all" | "none";

/** The filters the player picked for this request. */
export type HarvestFilters = {
  /** `null` means every species. */
  species: string[] | null;
  minSizePct: number;
  /** The mutations wanted, all groups together. */
  mutations: string[];
  mutationMode: MutationMode;
  /**
   * Allows harvesting preserved crops.
   *
   * Off by default, unlike every other filter which starts open: preserving
   * costs coins and is done crop by crop, so picking one by mistake has a
   * price. Leaving them out silently would not be better, which is why the
   * popup says so and shows the count.
   */
  includePreserved: boolean;
};

export const DEFAULT_FILTERS: HarvestFilters = {
  species: null,
  minSizePct: 50,
  mutations: [],
  mutationMode: "any",
  includePreserved: false,
};

function matchesMutations(row: HarvestRow, wanted: string[], mode: MutationMode): boolean {
  if (wanted.length === 0) return true;
  const present = new Set(row.mutations);
  switch (mode) {
    case "all":
      return wanted.every((mutation) => present.has(mutation));
    case "none":
      return wanted.every((mutation) => !present.has(mutation));
    default:
      return wanted.some((mutation) => present.has(mutation));
  }
}

/**
 * Applies the player's filters.
 *
 * Ripeness is not an option: a plant still growing is not harvested, so
 * nothing unripe belongs here, neither in the selection nor in the counts
 * shown on the filters.
 */
export function filterRows(rows: HarvestRow[], filters: HarvestFilters): HarvestRow[] {
  const species = filters.species && filters.species.length > 0 ? new Set(filters.species) : null;
  return rows.filter((row) => {
    if (!row.ready) return false;
    if (row.preserved && !filters.includePreserved) return false;
    if (species && !species.has(row.species)) return false;
    if (row.sizePct < filters.minSizePct) return false;
    return matchesMutations(row, filters.mutations, filters.mutationMode);
  });
}

/**
 * The request as it shows on the player's side of the thread.
 *
 * Written as it would be said, not as it would be coded: a sentence to
 * someone, not a form summary. Only what differs from the defaults is said.
 */
export function describeFilters(filters: HarvestFilters): string {
  const species = filters.species ?? [];
  const subject = species.length > 0 ? `my ${listWords(species)}` : "everything";
  const qualifiers: string[] = [];

  if (filters.mutations.length > 0) {
    const list = listWords(filters.mutations);
    if (filters.mutationMode === "none") qualifiers.push(`without ${list}`);
    else if (filters.mutationMode === "all") qualifiers.push(`with both ${list}`);
    else qualifiers.push(`with ${list}`);
  }
  if (filters.minSizePct > DEFAULT_FILTERS.minSizePct) {
    qualifiers.push(`at least ${filters.minSizePct}% size`);
  }
  // Only the case that differs from the default is said: "without the
  // preserved ones" on every request would restate the usual rule.
  if (filters.includePreserved) qualifiers.push("preserved ones included");

  if (qualifiers.length === 0) {
    return species.length > 0 ? `Harvest ${subject}, please` : "Harvest everything that's ready";
  }
  return `Harvest ${subject}, ${qualifiers.join(", ")}`;
}

/** A look: a species and the exact set of mutations it carries. */
export type HarvestVariant = {
  species: string;
  /** Sorted, so two identical crops give the same variant. */
  mutations: string[];
  count: number;
};

/**
 * Groups a selection by look.
 *
 * No hypothetical combination is computed: the variants are the ones really
 * in the garden. Two Aloe, one Frozen and one Frozen plus Amberlit, are two
 * variants. That shows what is about to be harvested, not a catalog of
 * possibilities half of which are not planted.
 */
export function groupVariants(rows: HarvestRow[]): HarvestVariant[] {
  const groups = new Map<string, HarvestVariant>();
  for (const row of rows) {
    const mutations = [...row.mutations].sort();
    const key = `${row.species}|${mutations.join(",")}`;
    const known = groups.get(key);
    if (known) known.count++;
    else groups.set(key, { species: row.species, mutations, count: 1 });
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.species.localeCompare(b.species) ||
      a.mutations.length - b.mutations.length ||
      a.mutations.join(",").localeCompare(b.mutations.join(",")),
  );
}

/** "Carrot, Tomato and Beet": a list that reads aloud. */
export function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * What the companion found, as he announces it before asking.
 *
 * No full stop: the sentence goes on with the question.
 */
export function describeSelection(rows: HarvestRow[]): string {
  if (rows.length === 0) return "nothing";
  const bySpecies = new Map<string, number>();
  for (const row of rows) bySpecies.set(row.species, (bySpecies.get(row.species) ?? 0) + 1);
  const parts = [...bySpecies.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([species, count]) => `${count} ${species}`);

  const head = parts.slice(0, 3);
  const rest = parts.length > head.length ? ` and ${parts.length - head.length} other kinds` : "";
  const total = `${rows.length} crop${rows.length === 1 ? "" : "s"}`;

  // One species: "12 Carrot ready" says it all, no need to repeat the total.
  if (parts.length === 1) return `${parts[0]} ready`;
  return `${total} ready: ${listWords(head)}${rest}`;
}
