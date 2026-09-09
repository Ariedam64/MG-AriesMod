// src/services/companion/dialogue.ts
// Choisit ce que le companion dit quand on lui parle.
//
// Deux sources, dans cet ordre :
//  1. les répliques contextuelles, qui signalent quelque chose d'utile
//     (récolte prête, pet affamé, météo, crops à vendre) ;
//  2. à défaut, une phrase perso tirée de la liste réglée par l'utilisateur.
//
// Ce module ne contient QUE la sélection, et n'importe rien : `pickDialogueLine`
// est pure (hasard et horloge injectés), donc testable hors navigateur
// (scripts/checkCompanionDialogue.ts). La lecture de l'état du jeu vit dans
// `dialogueContext.ts`.

/** Une réplique contextuelle, identifiée pour pouvoir être temporisée. */
export type ContextualLine = { key: string; message: string };

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
  state: DialogueState;
};

/** Temporisation par défaut d'une même alerte contextuelle. */
export const DEFAULT_CONTEXTUAL_COOLDOWN_MS = 120_000;

export const DEFAULT_CUSTOM_LINES: string[] = [
  "Right behind you, boss.",
  "Nice patch you've got here.",
  "Want me to keep an eye on anything?",
  "I like it here.",
];

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

  // 1. Contextuel : le premier candidat qui n'est pas encore temporisé.
  for (const candidate of contextual) {
    if (!candidate?.message) continue;
    const mutedUntil = state.mutedUntil[candidate.key] ?? 0;
    if (nowMs < mutedUntil) continue;
    state.mutedUntil[candidate.key] = nowMs + cooldownMs;
    return { message: candidate.message, state };
  }

  // 2. Phrase perso, en évitant de répéter la précédente.
  const lines = customLines.filter((line) => typeof line === "string" && line.trim().length > 0);
  if (lines.length === 0) return { message: null, state };
  if (lines.length === 1) {
    state.lastCustomIndex = 0;
    return { message: lines[0], state };
  }

  let index = Math.min(lines.length - 1, Math.floor(random() * lines.length));
  if (index === state.lastCustomIndex) index = (index + 1) % lines.length;
  state.lastCustomIndex = index;
  return { message: lines[index], state };
}
