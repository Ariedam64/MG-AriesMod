// src/services/companion/chat/hatch.ts
// Ce qu'on garde d'une couvée, et ce qui part.
//
// Module PUR — aucune lecture du jeu, aucun envoi de commande.
//
// Deux protections ne se discutent pas et ne figurent dans aucun réglage :
// un favori du joueur et un animal de l'équipe active ne se vendent jamais.
// Ce sont des consignes posées ailleurs et volontairement, comme le Locker
// l'est pour la récolte ; des règles de tri n'ont pas à les contredire.
//
// Et une vente ne se rattrape pas. Tout ce qui suit penche donc du côté de
// garder : sans critère renseigné, rien ne part.

import { listWords } from "./harvest";

/** Ce que le joueur veut conserver. Tout le reste est vendable. */
export type KeepRules = {
  species: string[];
  mutations: string[];
  /** Identifiants de capacités, pas leurs noms affichés. */
  abilities: string[];
  /** Garde au-dessus de cette force maximale. `null` = critère inactif. */
  minMaxStr: number | null;
};

export const DEFAULT_KEEP_RULES: KeepRules = {
  species: [],
  mutations: [],
  abilities: [],
  minMaxStr: null,
};

/**
 * Au moins un critère est renseigné.
 *
 * Sans critère, « ce qui ne correspond pas » désigne la totalité : proposer
 * une vente dans cet état reviendrait à faire du vide par défaut. On préfère
 * refuser l'action et dire pourquoi.
 */
export function hasAnyRule(rules: KeepRules): boolean {
  return (
    rules.species.length > 0 ||
    rules.mutations.length > 0 ||
    rules.abilities.length > 0 ||
    rules.minMaxStr !== null
  );
}

export type PetRow = {
  petId: string;
  /** Nom donné par le joueur, ou l'espèce à défaut. */
  name: string;
  species: string;
  mutations: string[];
  abilities: string[];
  maxStrength: number | null;
  /** Favori du joueur. */
  favorited: boolean;
  /** Présent dans l'équipe active. */
  onTeam: boolean;
};

/** Comparaison de mutations insensible à la casse : les sources divergent. */
function hasAny(present: string[], wanted: string[]): boolean {
  if (wanted.length === 0) return false;
  const set = new Set(present.map((value) => value.toLowerCase()));
  return wanted.some((value) => set.has(value.toLowerCase()));
}

/** L'animal coche au moins un critère de conservation. */
export function matchesKeep(pet: PetRow, rules: KeepRules): boolean {
  if (rules.species.includes(pet.species)) return true;
  if (hasAny(pet.mutations, rules.mutations)) return true;
  if (rules.abilities.some((ability) => pet.abilities.includes(ability))) return true;
  if (rules.minMaxStr !== null && pet.maxStrength !== null && pet.maxStrength >= rules.minMaxStr) return true;
  return false;
}

/** Tout ce qui met un animal à l'abri, critères du joueur compris. */
export function isProtected(pet: PetRow, rules: KeepRules): boolean {
  return pet.favorited || pet.onTeam || matchesKeep(pet, rules);
}

/**
 * Ceux qu'il faut mettre en favori.
 *
 * Seulement ceux qui correspondent sans l'être déjà : refavoriser un favori
 * n'apporte rien et allongerait la liste que le joueur doit relire.
 */
export function toFavourite(pets: PetRow[], rules: KeepRules): PetRow[] {
  return pets.filter((pet) => !pet.favorited && matchesKeep(pet, rules));
}

/** Ceux qui partiraient. Rien sans critère : voir `hasAnyRule`. */
export function toSell(pets: PetRow[], rules: KeepRules): PetRow[] {
  if (!hasAnyRule(rules)) return [];
  return pets.filter((pet) => !isProtected(pet, rules));
}

/**
 * Signature d'un lot de vente : l'ensemble exact des animaux concernés.
 *
 * Une vente est irréversible, donc la moindre différence doit invalider la
 * confirmation. Un animal éclos, favorisé à la main ou mis en équipe entre la
 * question et la réponse suffit à faire reposer la question.
 */
export function petSignature(pets: PetRow[]): string {
  return pets.map((pet) => pet.petId).sort().join("|");
}

/** Signature d'une couvée : les cases d'œufs prêtes, triées. */
export function slotSignature(slots: number[]): string {
  return [...slots].sort((a, b) => a - b).join("|");
}

/** Effectifs par espèce, du plus nombreux au moins, pour un résumé lisible. */
export function bySpecies(pets: PetRow[]): Array<{ species: string; count: number }> {
  const counts = new Map<string, number>();
  for (const pet of pets) counts.set(pet.species, (counts.get(pet.species) ?? 0) + 1);
  return [...counts.entries()]
    .map(([species, count]) => ({ species, count }))
    .sort((a, b) => b.count - a.count || a.species.localeCompare(b.species));
}

/** Les critères, en toutes lettres, tels qu'ils s'affichent en résumé. */
export function describeKeep(rules: KeepRules, abilityNames: Map<string, string> = new Map()): string {
  if (!hasAnyRule(rules)) return "Nothing set yet";
  const parts: string[] = [];
  if (rules.species.length) parts.push(listWords(rules.species));
  if (rules.mutations.length) parts.push(listWords(rules.mutations));
  if (rules.abilities.length) {
    parts.push(listWords(rules.abilities.map((id) => abilityNames.get(id) ?? id)));
  }
  if (rules.minMaxStr !== null) parts.push(`max STR ${rules.minMaxStr} and up`);
  return parts.join(", ");
}

/** Ce que le joueur demande, de son côté du fil. */
export function describeHatchRequest(count: number): string {
  return count === 1 ? "Hatch that egg for me" : `Hatch my ${count} eggs`;
}

/** Ce que le companion annonce avant de demander. Sans point final. */
export function summarizeHatch(slots: number[]): string {
  return `${slots.length} egg${slots.length === 1 ? "" : "s"} ready to hatch`;
}

/** Ce que le joueur demande quand il lance une vente. */
export function describeSellRequest(pets: PetRow[]): string {
  return pets.length === 1 ? `Sell ${pets[0].name}` : `Sell the ${pets.length} pets I do not want`;
}

/**
 * Ce qu'une vente emporte, tel qu'il l'annonce avant de demander.
 *
 * Les espèces sont nommées plutôt que comptées en bloc : « 23 pets » ne se
 * relit pas, et c'est justement le moment où il faut pouvoir se raviser.
 */
export function summarizeSell(pets: PetRow[]): string {
  if (pets.length === 0) return "nothing";
  const parts = bySpecies(pets).map((entry) => `${entry.count} ${entry.species}`);
  const head = parts.slice(0, 3);
  const rest = parts.length > head.length ? ` and ${parts.length - head.length} other kinds` : "";
  if (parts.length === 1) return parts[0];
  return `${pets.length} pets: ${listWords(head)}${rest}`;
}
