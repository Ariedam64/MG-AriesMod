// src/services/companion/chat/harvest.ts
// Le lot de récolte : identité d'un crop, regroupement par apparence, signature.
//
// Module PUR — aucune lecture du jeu, aucun envoi de commande. Le *quoi*
// récolter n'est plus décidé ici : ce sont les règles du Locker, que
// `gardenRead.ts` applique en lisant le jardin. Ce fichier ne fait que décrire
// et identifier ce qui a été retenu.
//
// Piège à connaître (fix v3.1.503, cf. workflowScan.ts) : `HarvestCrop` attend
// le `slotId` du sous-slot, PAS sa position dans le tableau `slots`. Les plantes
// sparse (Clover après récolte, Daisy) ont des slotIds non contigus : 0, 2, 3, 5.
// `HarvestRow.slotId` porte toujours le slotId, jamais un index de tableau.

/** Un crop récoltable individuellement. */
export type HarvestRow = {
  /** Clé de `gardenTileObjects` : premier argument de `harvestCrop`. */
  tileIndex: number;
  /** slotId du sous-slot : second argument de `harvestCrop`. */
  slotId: number;
  species: string;
  /** 50–100. */
  sizePct: number;
  /** 0–100. */
  growthPct: number;
  /**
   * Mutations telles que le jeu les nomme, sans reclassement.
   *
   * `scanGarden` en propose aussi une version triee par categorie, mais elle
   * ecarte en silence toute mutation absente de ses listes : un crop
   * Thundercharged y perdrait sa mutation. Le rendu compose attend de toute
   * facon les noms bruts.
   */
  mutations: string[];
  /** Récoltable maintenant. */
  ready: boolean;
  /**
   * Préservé par le joueur, et payé pour l'être.
   *
   * Le jeu facture la préservation au crop et lui pose un badge : c'est un
   * geste délibéré, pas un état de croissance. Le récolter jette ce qu'on vient
   * d'acheter, d'où le fait qu'il soit écarté par défaut.
   */
  preserved: boolean;
};

/** Toutes les mutations d'une ligne, catégories confondues. */
export function mutationsOf(row: HarvestRow): string[] {
  return row.mutations;
}

/** Identifiant stable d'une ligne. */
export function rowKey(row: HarvestRow): string {
  return `${row.tileIndex}:${row.slotId}`;
}

/**
 * Signature du lot proposé.
 *
 * Sert à détecter qu'il a changé entre la proposition et la confirmation : un
 * crop qui mûrit entre-temps modifie l'ensemble, et l'utilisateur doit
 * reconfirmer ce qu'il voit réellement plutôt que d'en récolter plus que prévu.
 * Triée, donc indépendante de l'ordre d'affichage.
 */
export function selectionSignature(rows: HarvestRow[]): string {
  return rows.map(rowKey).sort().join("|");
}

/** Espèces présentes, triées : alimente le choix sans rien coder en dur. */
export function speciesPresent(rows: HarvestRow[]): string[] {
  return [...new Set(rows.map((row) => row.species))].sort((a, b) => a.localeCompare(b));
}

/** Mutations présentes, triées : alimente le filtre sans rien coder en dur. */
export function mutationsPresent(rows: HarvestRow[]): string[] {
  const all = new Set<string>();
  for (const row of rows) for (const mutation of mutationsOf(row)) all.add(mutation);
  return [...all].sort((a, b) => a.localeCompare(b));
}

/**
 * Compte les lignes par valeur, pour afficher un effectif sur chaque filtre.
 *
 * `of` rend plusieurs valeurs quand une ligne compte dans plusieurs cases : un
 * crop portant deux mutations est compté dans les deux.
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

/** Les critères choisis par le joueur, pour cette demande-là. */
export type HarvestFilters = {
  /** `null` = toutes les espèces. */
  species: string[] | null;
  minSizePct: number;
  /** Mutations recherchées, toutes catégories confondues. */
  mutations: string[];
  mutationMode: MutationMode;
  /**
   * Autorise la récolte des crops préservés.
   *
   * Faux par défaut, contrairement à tous les autres critères qui partent
   * ouverts : préserver coûte des pièces et se fait crop par crop, donc en
   * récolter un par mégarde a un prix. Les écarter en silence ne serait pas
   * mieux — c'est pour ça que la popup le dit et que le compte s'affiche.
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
  const present = new Set(mutationsOf(row));
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
 * Applique les critères du joueur.
 *
 * La maturité n'est pas une option : une plante qui pousse encore ne se récolte
 * pas, donc rien de ce qui n'est pas mûr n'a sa place ici — ni dans la
 * sélection, ni dans les effectifs affichés sur les filtres.
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
 * La demande du joueur, telle qu'elle s'affiche de son côté du fil.
 *
 * Écrite comme on la dirait, pas comme on la coderait : c'est une phrase
 * adressée à quelqu'un, pas le résumé d'un formulaire. On ne mentionne que ce
 * qui s'écarte des valeurs par défaut, sinon la phrase s'allonge sans rien
 * apprendre.
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
  // Seul le cas qui s'écarte du défaut se dit : préciser « sans les préservés »
  // à chaque demande alourdirait la phrase pour rappeler la règle ordinaire.
  if (filters.includePreserved) qualifiers.push("preserved ones included");

  if (qualifiers.length === 0) {
    return species.length > 0 ? `Harvest ${subject}, please` : "Harvest everything that's ready";
  }
  return `Harvest ${subject}, ${qualifiers.join(", ")}`;
}

/** Une apparence : une espèce et le jeu exact de mutations qu'elle porte. */
export type HarvestVariant = {
  species: string;
  /** Triées, donc deux crops identiques donnent bien la même variante. */
  mutations: string[];
  count: number;
};

/**
 * Regroupe une sélection par apparence.
 *
 * On ne calcule aucune combinaison hypothétique : les variantes sont celles qui
 * existent réellement dans le jardin. Deux Aloe, l'un Frozen et l'autre
 * Frozen + Amberlit, sont deux variantes distinctes — c'est ce qui permet de
 * montrer à quoi ressemble ce qu'on s'apprête à récolter, et non un catalogue
 * de possibles dont la moitié n'est pas plantée.
 */
export function groupVariants(rows: HarvestRow[]): HarvestVariant[] {
  const groups = new Map<string, HarvestVariant>();
  for (const row of rows) {
    const mutations = [...mutationsOf(row)].sort();
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
      a.mutations.join(",").localeCompare(b.mutations.join(","))
  );
}

/** « Carrot, Tomato and Beet » : une énumération qui se lit à voix haute. */
export function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * Ce que le companion a trouvé, tel qu'il l'annonce avant de demander.
 *
 * Sans point final : la phrase se poursuit par la question.
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

  // Une seule espèce : « 12 Carrot ready » se suffit, inutile de répéter le total.
  if (parts.length === 1) return `${parts[0]} ready`;
  return `${total} ready: ${listWords(head)}${rest}`;
}
