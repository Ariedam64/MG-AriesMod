// src/services/companion/chat/feedScope.ts
// Le périmètre d'un nourrissage : de quoi il est fait, et comment on le nomme.
//
// Module PUR — aucune lecture du jeu. `petFeed.ts` le remplit, `index.ts` s'en
// sert pour poser la question.

import type { HarvestRow } from "./harvest";

/** Ce avec quoi on nourrirait le pet. */
export type FeedSource =
  | { kind: "inventory"; itemId: string; species: string }
  /** À récolter d'abord : le crop est encore en terre. */
  | { kind: "garden"; row: HarvestRow; species: string };

export type FeedCandidate = {
  petId: string;
  /** Nom donné par le joueur, ou l'espèce à défaut. */
  petName: string;
  petSpecies: string;
  hungerPct: number;
  source: FeedSource;
  /**
   * L'animal tel que le jeu le connaît, gardé pour le rendu seul.
   *
   * Une bulle ne sait pas dessiner un animal depuis une clé d'atlas : les
   * animaux passent par le rendu dédié du jeu, qui veut l'objet. Opaque à
   * dessein, tout ce qui compte est déjà extrait au-dessus.
   */
  pet?: unknown;
};

/**
 * Le périmètre d'un nourrissage, ce sont les PETS — pas les crops choisis.
 *
 * Deux recherches successives peuvent très bien retenir deux carottes
 * différentes pour la même tortue : l'inventaire est parcouru dans l'ordre où
 * le jeu le sert. Faire entrer le crop dans la signature rendait la proposition
 * instable, et le companion reposait sa question toutes les quelques secondes
 * en annonçant que « les choses avaient bougé ».
 *
 * Ce que l'utilisateur confirme, c'est « nourris ces animaux-là » : la
 * signature dit exactement ça.
 */
export function feedSignature(candidates: FeedCandidate[]): string {
  return candidates
    .map((candidate) => candidate.petId)
    .sort()
    .join("|");
}

/**
 * Rend chaque nom unique dans la liste.
 *
 * Deux pets de la même espèce sans nom donné s'appellent pareil : « Turtle,
 * Turtle 1, Turtle » ne désigne rien. On numérote les homonymes, dans un ordre
 * fixé par leur identifiant pour que l'étiquette d'un animal ne change pas d'un
 * affichage à l'autre.
 */
export function disambiguate(candidates: FeedCandidate[]): FeedCandidate[] {
  const byName = new Map<string, FeedCandidate[]>();
  for (const candidate of candidates) {
    const group = byName.get(candidate.petName);
    if (group) group.push(candidate);
    else byName.set(candidate.petName, [candidate]);
  }

  for (const group of byName.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a.petId.localeCompare(b.petId));
    ordered.forEach((candidate, index) => {
      candidate.petName = `${candidate.petName} #${index + 1}`;
    });
  }

  return candidates;
}

/**
 * La question de nourrissage n'a plus d'objet.
 *
 * Vrai seulement si PLUS AUCUN des animaux proposés n'est encore concerné :
 * tant qu'il en reste un, la question garde du sens. Se retirer au premier
 * changement rendrait le companion insaisissable — il suffirait qu'un pet sur
 * trois soit nourri à la main pour que tout tombe.
 */
export function isSettled(picks: FeedCandidate[], stillFeedable: Set<string>): boolean {
  return !picks.some((pick) => stillFeedable.has(pick.petId));
}

/** Résumé lisible, tel que le companion l'annonce avant de demander. */
export function describeFeed(candidates: FeedCandidate[]): string {
  if (candidates.length === 0) return "nothing";
  if (candidates.length === 1) {
    const only = candidates[0];
    const where = only.source.kind === "garden" ? ", which I would pick first" : "";
    return `${only.petName} is down to ${only.hungerPct}% and I have ${only.source.species}${where}`;
  }
  const names = candidates.map((candidate) => candidate.petName);
  const head = names.slice(0, 3).join(", ");
  const rest = names.length > 3 ? ` and ${names.length - 3} more` : "";
  return `${candidates.length} pets are hungry: ${head}${rest}`;
}
