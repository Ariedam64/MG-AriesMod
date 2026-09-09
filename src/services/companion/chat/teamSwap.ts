// src/services/companion/chat/teamSwap.ts
// Porter une équipe le temps d'un lot, puis rendre celle d'avant.
//
// Trois commandes s'en servent — récolter, faire éclore, vendre — et c'est bien
// pour ça que le code vit ici : la moitié du contrat, c'est la remise en état,
// et l'oublier une fois sur trois laisserait le joueur en équipe de travail
// sans qu'il s'en aperçoive.
//
// Rien n'est silencieux. Une bascule d'équipe touche à ce que le joueur a monté
// à la main, donc elle est annoncée dans la question avant d'être faite, et
// dite à nouveau quand elle se produit.

import { PetsService } from "../../pets";
import { sleep, type BatchReporter } from "./batch";

/** Une bascule d'équipe n'est pas instantanée côté serveur. */
const AFTER_TEAM_SWAP_MS = 300;

export type TeamSwap = {
  /** Remet l'équipe portée avant. Sans effet si on n'a rien changé. */
  restore(): Promise<void>;
  /** Vrai quand on porte effectivement l'équipe demandée. */
  readonly wearing: boolean;
};

const NOT_SWAPPED: TeamSwap = {
  async restore() {},
  wearing: false,
};

/** Le nom d'une équipe, ou `null` si elle a été supprimée depuis le réglage. */
export function teamName(teamId: string | null): string | null {
  if (!teamId) return null;
  try {
    return PetsService.getTeamById(teamId)?.name ?? null;
  } catch {
    return null;
  }
}

/**
 * Enfile une équipe pour la durée d'un lot.
 *
 * Un échec ne bloque jamais le lot : au pire on travaille avec l'équipe qu'on
 * a déjà, et on le dit. C'est la même règle que pour la marche — l'habillage
 * n'a pas à empêcher l'action.
 */
export async function wearTeam(teamId: string | null, reporter: BatchReporter): Promise<TeamSwap> {
  if (!teamId) return NOT_SWAPPED;

  const name = teamName(teamId);
  if (!name) {
    reporter.say("system", "That team is gone, keeping the one you have on.");
    return NOT_SWAPPED;
  }

  // On note l'équipe portée AVANT de la quitter : c'est la seule occasion.
  let previous: string[] | null = null;
  try {
    const ids = await PetsService.getActivePetIds();
    previous = ids.length ? ids : null;
  } catch {
    previous = null;
  }

  try {
    await PetsService.useTeam(teamId, { markUsed: false });
    await sleep(AFTER_TEAM_SWAP_MS);
  } catch {
    reporter.say("system", "The team switch failed, working as I am.");
    return NOT_SWAPPED;
  }

  reporter.say("system", `Wearing ${name} for this.`);

  return {
    wearing: true,
    async restore() {
      if (!previous || previous.length === 0) return;
      try {
        await PetsService.usePetIds(previous);
        await sleep(AFTER_TEAM_SWAP_MS);
        reporter.say("system", "Your team is back the way it was.");
      } catch {
        reporter.say("system", "Could not put your team back, sorry.");
      }
    },
  };
}
