// src/services/companion/dialogue.ts
// Choisit ce que le companion dit quand on lui parle.
//
// Deux sources, mêlées dans un même tirage :
//  1. les répliques contextuelles, qui signalent quelque chose d'utile
//     (récolte prête, pet affamé, météo, crops à vendre), avec une probabilité
//     fixe (`CONTEXTUAL_CHANCE`) ;
//  2. sinon, une phrase perso tirée de la liste réglée par l'utilisateur.
//
// Ce module ne contient QUE la sélection, et n'importe rien : `pickDialogueLine`
// est pure (hasard et horloge injectés), donc testable hors navigateur
// (scripts/checkCompanionDialogue.ts). La lecture de l'état du jeu vit dans
// `dialogueContext.ts`.

/**
 * Une réplique contextuelle, identifiée pour pouvoir être temporisée.
 *
 * `emote` est la valeur d'enum du jeu (cf. `emoteTypes.ts`), gardée en nombre
 * nu pour que ce module reste sans import.
 */
export type ContextualLine = { key: string; message: string; emote?: number | null };

export type DialogueState = {
  /** Index de la dernière phrase perso, pour ne pas la répéter d'affilée. */
  lastCustomIndex: number;
  /** Par clé de fournisseur : date avant laquelle il doit rester muet. */
  mutedUntil: Record<string, number>;
};

export type PickInput = {
  /** Candidats contextuels, par ordre de priorité décroissante. */
  contextual: ContextualLine[];
  customLines: string[];
  state: DialogueState;
  nowMs: number;
  random: () => number;
  /** Temps pendant lequel une même alerte ne se répète pas. */
  cooldownMs: number;
};

export type PickResult = {
  /** `null` = rien à dire : la réplique d'origine du jeu passe alors telle quelle. */
  message: string | null;
  /** Pose d'une réplique contextuelle. Pour une phrase perso, l'appelant la déduit du texte. */
  emote: number | null;
  /** Vrai quand la réplique vient des phrases perso. */
  custom: boolean;
  state: DialogueState;
};

/** Probabilité, à chaque Talk, qu'une alerte disponible sorte plutôt qu'une phrase perso. */
export const CONTEXTUAL_CHANCE = 0.25;

/** Temporisation par défaut d'une même alerte contextuelle. */
export const DEFAULT_CONTEXTUAL_COOLDOWN_MS = 120_000;

export function initialDialogueState(): DialogueState {
  return { lastCustomIndex: -1, mutedUntil: {} };
}

/**
 * Choisit la prochaine réplique. Pure : rejoue à l'identique pour un même
 * `random` et un même `nowMs`.
 */
export function pickDialogueLine(input: PickInput): PickResult {
  const { contextual, customLines, nowMs, random, cooldownMs } = input;
  const state: DialogueState = {
    lastCustomIndex: input.state.lastCustomIndex,
    mutedUntil: { ...input.state.mutedUntil },
  };

  const lines = customLines.filter((line) => typeof line === "string" && line.trim().length > 0);

  // 1. Une alerte, une fois sur quatre environ, tirée parmi celles qui ne sont
  //    pas temporisées. Elles passaient autrefois toujours en premier : le
  //    joueur les entendait toutes d'affilée au début, puis plus rien que des
  //    phrases perso jusqu'à la fin de leur temporisation. Sans phrase perso,
  //    il n'y a pas d'autre choix que l'alerte.
  const available = contextual.filter(
    (candidate) => candidate?.message && nowMs >= (state.mutedUntil[candidate.key] ?? 0)
  );
  if (available.length > 0 && (lines.length === 0 || random() < CONTEXTUAL_CHANCE)) {
    const candidate = available[Math.min(available.length - 1, Math.floor(random() * available.length))];
    state.mutedUntil[candidate.key] = nowMs + cooldownMs;
    return { message: candidate.message, emote: candidate.emote ?? null, custom: false, state };
  }

  // 2. Phrase perso, en évitant de répéter la précédente.
  if (lines.length === 0) return { message: null, emote: null, custom: false, state };
  if (lines.length === 1) {
    state.lastCustomIndex = 0;
    return { message: lines[0], emote: null, custom: true, state };
  }

  let index = Math.min(lines.length - 1, Math.floor(random() * lines.length));
  if (index === state.lastCustomIndex) index = (index + 1) % lines.length;
  state.lastCustomIndex = index;
  return { message: lines[index], emote: null, custom: true, state };
}
