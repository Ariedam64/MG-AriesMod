// src/services/companion/chat/plant.ts
// Le plan de plantation : ce qu'on pose, où, et ce qu'il en reste de faisable.
//
// Module PUR — aucune lecture du jeu, aucun envoi de commande. Le plan est
// dessiné par le joueur sur la grille ; ici on ne fait que le décrire, le
// confronter à l'état du jardin, et l'identifier pour la confirmation.
//
// Une graine et un œuf se posent sur la même tuile et ne diffèrent, sur le fil,
// que par le nom de la commande (`PlantSeed` contre `GrowEgg`). Ils partagent
// donc le même type ici, et `kind` est ce qui les sépare au moment de l'envoi.

import { listWords } from "./harvest";

/**
 * Géométrie de la parcelle : deux carrés de dix cases, côte à côte.
 *
 * La map fait autorité — `dirtTileCount` dit combien de cases un joueur possède
 * vraiment — et ces constantes ne servent que de repli quand elle n'est pas
 * encore chargée. C'est déjà la grille que dessine l'onglet Auto Plant, et en
 * changer ici sans que la map suive ne créerait que des cases fantômes.
 */
export const GARDEN_COLS = 20;
export const GARDEN_ROWS = 10;
export const GARDEN_TILE_COUNT = GARDEN_COLS * GARDEN_ROWS;

export type PlantKind = "seed" | "egg";

/** Un exemplaire posable, tel qu'on l'a en réserve. */
export type PlantItem = {
  kind: PlantKind;
  /**
   * Ce que la commande attend : l'espèce pour une graine, l'`eggId` pour un
   * œuf. Jamais le nom affiché, qui n'a de valeur que pour l'œil.
   */
  id: string;
  name: string;
  /** Exemplaires en inventaire. C'est le plafond du plan. */
  stock: number;
};

/** Une case du plan : une tuile, et ce qu'on veut y mettre. */
export type PlantAssignment = {
  /** Clé de `garden.tileObjects`, comme `HarvestRow.tileIndex`. */
  tileIndex: number;
  kind: PlantKind;
  id: string;
  name: string;
};

/** L'état du jardin et de la réserve, à l'instant où on regarde. */
export type PlantScope = {
  /** Tuiles de terre que ce joueur possède, dans l'ordre de la parcelle. */
  tiles: number[];
  /** Tuiles déjà prises : plante, œuf en couvaison, décor, animal posé. */
  occupied: Set<number>;
  items: PlantItem[];
};

export const EMPTY_SCOPE: PlantScope = { tiles: [], occupied: new Set(), items: [] };

/**
 * Identité d'un posable.
 *
 * `kind` en fait partie : rien n'interdit à un œuf et à une graine de porter le
 * même identifiant, et les confondre reviendrait à puiser dans la mauvaise
 * réserve.
 */
export function itemKey(item: { kind: PlantKind; id: string }): string {
  return `${item.kind}:${item.id}`;
}

/** Identifiant d'une case du plan : la tuile et ce qui doit y pousser. */
export function assignmentKey(assignment: PlantAssignment): string {
  return `${assignment.tileIndex}:${assignment.kind}:${assignment.id}`;
}

/**
 * Signature du plan proposé.
 *
 * Sert à détecter qu'il a changé entre la proposition et la confirmation : une
 * tuile occupée entre-temps, une graine dépensée ailleurs, et ce n'est plus le
 * plan qu'on a montré. Triée, donc indépendante de l'ordre du dessin.
 */
export function plantSignature(plan: PlantAssignment[]): string {
  return plan.map(assignmentKey).sort().join("|");
}

export type PlantTally = { kind: PlantKind; id: string; name: string; count: number };

/** Combien de fois chaque posable revient dans le plan, du plus nombreux au moins. */
export function countByItem(plan: PlantAssignment[]): PlantTally[] {
  const counts = new Map<string, PlantTally>();
  for (const assignment of plan) {
    const key = itemKey(assignment);
    const known = counts.get(key);
    if (known) known.count++;
    else counts.set(key, { kind: assignment.kind, id: assignment.id, name: assignment.name, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Ce qui reste en réserve une fois le plan servi, par posable. */
export function stockLeft(plan: PlantAssignment[], items: PlantItem[]): Map<string, number> {
  const left = new Map(items.map((item) => [itemKey(item), item.stock]));
  for (const assignment of plan) {
    const key = itemKey(assignment);
    left.set(key, (left.get(key) ?? 0) - 1);
  }
  return left;
}

/**
 * Ce qui reste faisable du plan, ici et maintenant.
 *
 * Le jardin bouge pendant qu'on dessine, et pendant qu'on attend la réponse :
 * une tuile se remplit, une graine part ailleurs. Plutôt que de refuser le plan
 * entier, on garde ce qui tient encore debout — et c'est la comparaison des
 * signatures, à la confirmation, qui décide s'il faut reposer la question.
 *
 * L'ordre du dessin fait foi quand la réserve ne suffit plus : la première case
 * posée est la première servie. Arbitraire, mais stable, donc reproductible
 * d'un appel à l'autre — une règle qui changerait d'avis ferait croire à un
 * changement de périmètre à chaque relecture.
 */
export function viablePlan(plan: PlantAssignment[], scope: PlantScope): PlantAssignment[] {
  const owned = new Set(scope.tiles);
  const left = new Map(scope.items.map((item) => [itemKey(item), item.stock]));
  const kept: PlantAssignment[] = [];

  for (const assignment of plan) {
    if (!owned.has(assignment.tileIndex)) continue;
    if (scope.occupied.has(assignment.tileIndex)) continue;

    const key = itemKey(assignment);
    const remaining = left.get(key) ?? 0;
    if (remaining <= 0) continue;

    left.set(key, remaining - 1);
    kept.push(assignment);
  }

  return kept;
}

/** « 12 Carrot and 3 Aloe », ou « … and 2 other kinds » au-delà de trois. */
export function listPlantItems(plan: PlantAssignment[]): string {
  const parts = countByItem(plan).map((entry) => `${entry.count} ${entry.name}`);
  if (parts.length === 0) return "nothing";
  const head = parts.slice(0, 3);
  const rest = parts.length > head.length ? ` and ${parts.length - head.length} other kinds` : "";
  return `${listWords(head)}${rest}`;
}

/**
 * La demande du joueur, telle qu'elle s'affiche de son côté du fil.
 *
 * Écrite comme on la dirait : c'est une phrase adressée à quelqu'un, pas le
 * relevé d'un formulaire.
 */
export function describePlan(plan: PlantAssignment[]): string {
  if (plan.length === 0) return "Plant nothing";
  return `Plant ${listPlantItems(plan)} for me`;
}

/**
 * Ce que le companion s'apprête à planter, tel qu'il l'annonce avant de demander.
 *
 * Sans point final : la phrase se poursuit par la question.
 */
export function summarizePlan(plan: PlantAssignment[]): string {
  if (plan.length === 0) return "nothing";
  const tiles = `${plan.length} tile${plan.length === 1 ? "" : "s"}`;
  const parts = countByItem(plan);
  // Une seule sorte : « 12 Carrot » se suffit, répéter le nombre de tuiles
  // n'apprendrait rien puisque c'est le même.
  if (parts.length === 1) return `${parts[0].count} ${parts[0].name} to plant`;
  return `${listPlantItems(plan)} to plant, over ${tiles}`;
}
