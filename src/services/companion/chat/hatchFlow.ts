// src/services/companion/chat/hatchFlow.ts
// Ce qui relie une couvée à la vente qui la suit parfois, et à la couvée d'après.
//
// Le mot d'ordre : ce module fabrique des *questions*, jamais des actions. Il
// dit ce qu'il y aurait à faire et avec quoi ; c'est la façade qui pose la
// question, et le joueur seul qui décide. Rien n'enchaîne tout seul.

import { loadCompanionSettings } from "../state";
import { hasAnyRule, toFavourite, toSell, type KeepRules, type PetRow } from "./hatch";
import { readHatchScope, type HatchScope } from "./hatchRead";
import type { SellPlan } from "./hatchRun";
import type { HatchStop } from "./hatchRun";

/** Recalcule les œufs prêts au moment de la confirmation. */
export type HatchProvider = () => Promise<number[]>;
/** Recalcule qui partirait et qui serait protégé, au moment de la confirmation. */
export type SellProvider = () => Promise<SellPlan>;

export function hatchProvider(): HatchProvider {
  return async () => (await readHatchScope()).readySlots;
}

/**
 * Le lot de vente, reconstruit à chaque appel.
 *
 * L'équipe de vente est relue ici et pas capturée plus tôt : le joueur peut
 * l'avoir changée entre le moment où il a lancé la couvée et celui où on lui
 * demande de vendre.
 */
export function sellProvider(rules: KeepRules): SellProvider {
  return async () => {
    const scope = await readHatchScope();
    return {
      favourite: toFavourite(scope.pets, rules),
      sell: toSell(scope.pets, rules),
      teamId: loadCompanionSettings().hatchSellTeamId,
    };
  };
}

/**
 * Ce qu'il constate au sortir d'une couvée, avant de demander quoi que ce soit.
 *
 * Rend `null` quand il n'y a rien à signaler. Le cas sans critère mérite ses
 * mots : un sac plein sans règle de tri n'est pas une panne, c'est un réglage
 * qui manque, et le dire évite de chercher ailleurs.
 */
export function afterHatch(stop: HatchStop, scope: HatchScope, rules: KeepRules, sellable: PetRow[]): string | null {
  const waiting = scope.readySlots.length;
  const eggs = waiting > 0 ? ` ${waiting} egg${waiting === 1 ? "" : "s"} still waiting.` : "";

  if (stop === "full") {
    if (sellable.length > 0) return `Your bag is full.${eggs}`;
    return hasAnyRule(rules)
      ? `Your bag is full, nothing in it is up for sale.${eggs}`
      : `Your bag is full.${eggs} Nothing set to keep, so I am not selling.`;
  }

  // Couvée terminée : on ne signale la vente que s'il y a matière.
  return sellable.length > 0 ? "All open. Now the ones you did not want." : null;
}

/** Le lot de vente vaut la peine d'être proposé. */
export function worthSelling(plan: SellPlan): boolean {
  return plan.sell.length > 0;
}
