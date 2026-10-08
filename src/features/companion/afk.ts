// src/services/companion/afk.ts
// Le companion remarque que le joueur ne bouge plus, s'endort, et se réveille.
//
// Module PUR : aucun import qui touche au jeu, horloge et hasard injectés. Tout
// ce qui décide QUAND changer de phase et QUOI dire se vérifie hors navigateur
// (scripts/checkCompanionAfk.ts). Les abonnements et l'exécution des effets
// vivent dans `afkWatch.ts`.
//
// Trois phases :
//  - `active` : le joueur est là. Rien à dire.
//  - `idle` : plus rien depuis quelques minutes. Il vient voir et demande, une
//    seule fois, si on est toujours là.
//  - `asleep` : toujours rien. Il s'endort auprès du joueur, et ronfle de temps
//    en temps, de moins en moins souvent si l'absence dure.
//
// Deux règles tiennent tout le reste :
//  - il ne parle jamais quand quelqu'un d'autre l'occupe (`busy`) ni quand
//    l'onglet est caché (`hidden`) : une bulle que personne ne voit est perdue ;
//  - seul le joueur fait avancer ou reculer l'horloge d'absence. Une réaction ou
//    une tâche qui l'occupe ne fait que retarder la phase suivante, sauf s'il dort :
//    là, elle le réveille, sans un mot puisqu'il est occupé.

import { EmoteType } from "./emoteTypes";

/* ------------------------------------------------------------------ */
/*  Réglages                                                           */
/* ------------------------------------------------------------------ */

/** Sans rien de la part du joueur depuis ce délai, il passe en `idle`. */
export const AFK_IDLE_AFTER_MS = 3 * 60_000;
/** Temps passé en `idle` avant de s'endormir. */
export const AFK_ASLEEP_AFTER_MS = 6 * 60_000;
/** Écart entre deux ronflements, tiré au hasard dans cet intervalle. */
export const SNORE_MIN_MS = 45_000;
export const SNORE_MAX_MS = 90_000;
/** Au-delà de ce temps endormi, les ronflements s'espacent beaucoup. */
export const SNORE_SLOW_AFTER_MS = 30 * 60_000;
export const SNORE_SLOW_MIN_MS = 3 * 60_000;
export const SNORE_SLOW_MAX_MS = 6 * 60_000;
/**
 * Endormi depuis moins longtemps, il se réveille sans rien dire : sursauter
 * après trente secondes de sieste sonnerait faux.
 */
export const WAKE_LINE_MIN_ASLEEP_MS = 60_000;
/** Chance d'un petit mot au retour du joueur, quand il avait demandé s'il était là. */
const RETURN_LINE_CHANCE = 0.3;
/** Chance qu'un ronflement soit une phrase de rêve plutôt qu'un simple « Zzz ». */
export const DREAM_CHANCE = 0.12;

/* ------------------------------------------------------------------ */
/*  Forme                                                              */
/* ------------------------------------------------------------------ */

type AfkPhase = "active" | "idle" | "asleep";

export type AfkState = {
  phase: AfkPhase;
  /** Dernier signe de vie du joueur (ou début de la veille). */
  quietSince: number;
  /** Entrée dans la phase courante. */
  phaseSince: number;
  /** A posé sa question en `idle`. Le mot de retour n'a de sens qu'après. */
  asked: boolean;
  /** Prochain ronflement, `null` hors sommeil. */
  nextSnoreAt: number | null;
  /** Dernière réplique de sommeil, pour ne pas répéter la même deux fois de suite. */
  lastSnore: string | null;
};

/**
 * Ce que le pilote doit faire, dans l'ordre.
 *
 * `approach` : venir auprès du joueur avant de parler. Sinon la réplique n'est
 * dite que s'il est déjà assez près pour qu'on la lise.
 * `hold` / `release` : le garder auprès du joueur pendant son sommeil, puis le
 * rendre à son mode.
 */
export type AfkEffect =
  | { kind: "say"; message: string; emote: EmoteType | null; approach: boolean }
  | { kind: "hold" }
  | { kind: "release" };

export type AfkStep = { state: AfkState; effects: AfkEffect[] };

export type AfkTickInput = {
  now: number;
  /** Occupé par autre chose que nous : tâche, question du chat, série d'actions. */
  busy: boolean;
  /** Onglet caché : personne ne lirait ce qui serait dit. */
  hidden: boolean;
};

export type AfkActivityInput = { now: number; busy: boolean };

/* ------------------------------------------------------------------ */
/*  Répliques                                                          */
/* ------------------------------------------------------------------ */

type Line = { message: string; emote: EmoteType | null };

export const IDLE_LINES: readonly Line[] = [
  { message: "Hello? You still there?", emote: EmoteType.Questioning },
  { message: "Did you fall asleep on me?", emote: EmoteType.Questioning },
  { message: "Psst... are you still with me?", emote: EmoteType.Questioning },
  { message: "It's very quiet all of a sudden...", emote: EmoteType.Questioning },
];

export const RETURN_LINES: readonly Line[] = [
  { message: "Oh, there you are!", emote: EmoteType.Laughing },
  { message: "Welcome back!", emote: EmoteType.Love },
  { message: "Ah, you're still here. Good.", emote: null },
];

export const FALL_ASLEEP_LINES: readonly Line[] = [
  { message: "I'll just rest my eyes...", emote: null },
  { message: "Yawn... wake me up if anything grows.", emote: null },
  { message: "Okay... a tiny nap. Just a tiny one...", emote: null },
  { message: "I'll keep watch... with my eyes closed...", emote: null },
];

export const SNORE_LINES: readonly string[] = [
  "Zzz...",
  "Zzz... zzz...",
  "zzz... carrots...",
  "Mmh... five more minutes...",
  "*snore*",
  "Zzz... mmh...",
];

/** Rares : il rêve tout haut. */
export const DREAM_LINES: readonly string[] = [
  "Zzz... no, the golden one is mine...",
  "Mmh... a pumpkin... the size of a house...",
  "zzz... don't eat the seeds, little bunny...",
  "Zzz... I'm the best gardener in the world...",
  "Mmh... rain... more rain... perfect...",
];

export const WAKE_LINES: readonly Line[] = [
  { message: "Huh? I wasn't sleeping!", emote: EmoteType.Questioning },
  { message: "I'm up! I'm up!", emote: EmoteType.Laughing },
  { message: "Oh, you're back!", emote: EmoteType.Laughing },
  { message: "Wha-? Oh, it's you. Hi!", emote: EmoteType.Questioning },
];

/** Après une très longue absence, le réveil le dit. */
export const LONG_WAKE_LINES: readonly Line[] = [
  { message: "You were gone forever! I may have napped. A little.", emote: EmoteType.Laughing },
  { message: "Oh! You're back! I kept the garden safe. Mostly by sleeping.", emote: EmoteType.Laughing },
  { message: "Huh? What time is it? Welcome back!", emote: EmoteType.Questioning },
];

function pickOne<T>(options: readonly T[], random: () => number): T {
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

const say = (line: Line, approach: boolean): AfkEffect => ({
  kind: "say",
  message: line.message,
  emote: line.emote,
  approach,
});

/* ------------------------------------------------------------------ */
/*  Machine                                                            */
/* ------------------------------------------------------------------ */

export function initialAfkState(now: number): AfkState {
  return { phase: "active", quietSince: now, phaseSince: now, asked: false, nextSnoreAt: null, lastSnore: null };
}

/**
 * Délai jusqu'au prochain ronflement, selon le temps déjà passé à dormir.
 *
 * Au-delà de `SNORE_SLOW_AFTER_MS`, le joueur est parti pour de bon : une bulle
 * par minute sur une heure d'absence ne serait que du bruit.
 */
export function snoreDelay(asleepForMs: number, random: () => number): number {
  const slow = asleepForMs >= SNORE_SLOW_AFTER_MS;
  const min = slow ? SNORE_SLOW_MIN_MS : SNORE_MIN_MS;
  const max = slow ? SNORE_SLOW_MAX_MS : SNORE_MAX_MS;
  const r = Math.min(Math.max(random(), 0), 1);
  return Math.round(min + (max - min) * r);
}

/** Un ronflement, rarement un rêve, jamais deux fois le même d'affilée. */
export function snoreLine(last: string | null, random: () => number): string {
  const pool = random() < DREAM_CHANCE ? DREAM_LINES : SNORE_LINES;
  const options = pool.filter((line) => line !== last);
  return pickOne(options.length > 0 ? options : pool, random);
}

/** Retour en `active` sans un mot. Relâche l'attention s'il dormait. */
function wakeSilently(state: AfkState, now: number): AfkStep {
  const effects: AfkEffect[] = state.phase === "asleep" ? [{ kind: "release" }] : [];
  return { state: initialAfkState(now), effects };
}

/**
 * Un pas d'horloge.
 *
 * Occupé par autre chose : éveillé, on attend simplement, l'horloge d'absence
 * continue de tourner et la phase suivante viendra quand il sera libre ;
 * endormi, il se réveille sans rien dire, puisqu'il a mieux à faire.
 *
 * Onglet caché : les phases avancent quand même (le joueur est bel et bien
 * absent), mais rien n'est dit. La question d'`idle` est alors perdue, et le
 * retour sur l'onglet compte comme un signe de vie : c'est là que se joue le
 * réveil, sous les yeux du joueur.
 */
export function afkTick(state: AfkState, input: AfkTickInput, random: () => number): AfkStep {
  const { now, busy, hidden } = input;

  if (state.phase === "asleep") {
    if (busy) return wakeSilently(state, now);
    if (state.nextSnoreAt === null || now < state.nextSnoreAt) return { state, effects: [] };
    const asleepFor = now - state.phaseSince;
    const nextSnoreAt = now + snoreDelay(asleepFor, random);
    if (hidden) return { state: { ...state, nextSnoreAt }, effects: [] };
    const message = snoreLine(state.lastSnore, random);
    return {
      state: { ...state, nextSnoreAt, lastSnore: message },
      effects: [say({ message, emote: null }, false)],
    };
  }

  if (busy) return { state, effects: [] };

  if (state.phase === "active") {
    if (now - state.quietSince < AFK_IDLE_AFTER_MS) return { state, effects: [] };
    const next: AfkState = { ...state, phase: "idle", phaseSince: now, asked: !hidden };
    return { state: next, effects: hidden ? [] : [say(pickOne(IDLE_LINES, random), true)] };
  }

  // idle
  if (now - state.phaseSince < AFK_ASLEEP_AFTER_MS) return { state, effects: [] };
  const next: AfkState = {
    ...state,
    phase: "asleep",
    phaseSince: now,
    nextSnoreAt: now + snoreDelay(0, random),
    lastSnore: null,
  };
  // Il vient d'abord s'installer auprès du joueur, puis on le retient là.
  const effects: AfkEffect[] = hidden ? [] : [say(pickOne(FALL_ASLEEP_LINES, random), true)];
  effects.push({ kind: "hold" });
  return { state: next, effects };
}

/**
 * Le joueur a donné signe de vie : il a bougé, cliqué, tapé, ou il revient sur
 * l'onglet.
 *
 * Endormi depuis au moins `WAKE_LINE_MIN_ASLEEP_MS`, il sursaute ; moins que ça,
 * il se réveille en silence. En `idle`, un petit mot de temps en temps, et
 * seulement s'il avait vraiment posé sa question.
 */
export function afkActivity(state: AfkState, input: AfkActivityInput, random: () => number): AfkStep {
  const { now, busy } = input;

  if (state.phase === "active") {
    return { state: { ...state, quietSince: now }, effects: [] };
  }

  if (state.phase === "idle") {
    const effects: AfkEffect[] = [];
    if (state.asked && !busy && random() < RETURN_LINE_CHANCE) effects.push(say(pickOne(RETURN_LINES, random), false));
    return { state: initialAfkState(now), effects };
  }

  // asleep
  // La réplique d'abord, l'attention ensuite : il sursaute là où il dormait,
  // à côté du joueur, avant de retourner à ses occupations.
  const asleepFor = now - state.phaseSince;
  const effects: AfkEffect[] = [];
  if (!busy && asleepFor >= WAKE_LINE_MIN_ASLEEP_MS) {
    const pool = asleepFor >= SNORE_SLOW_AFTER_MS ? LONG_WAKE_LINES : WAKE_LINES;
    effects.push(say(pickOne(pool, random), false));
  }
  effects.push({ kind: "release" });
  return { state: initialAfkState(now), effects };
}

/**
 * Remise à zéro sans un mot : companion rangé, réglage coupé, veille arrêtée,
 * ou réveil demandé de l'extérieur.
 */
export function afkReset(state: AfkState, now: number): AfkStep {
  return wakeSilently(state, now);
}
