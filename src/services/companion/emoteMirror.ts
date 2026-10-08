// src/services/companion/emoteMirror.ts
// Le companion répond aux emotes du joueur.
//
// Le joueur applaudit, le companion applaudit avec lui un instant plus tard ;
// le joueur pleure, le companion le console. Tout ce qui décide vit ici, pur :
// le hasard et l'horloge sont passés en paramètre, et rien ne touche au jeu.
// Les abonnements vivent à part, dans `emoteMirrorWatch.ts`, et ne décident de
// rien.
//
// D'où viennent les emotes du joueur
// ----------------------------------
// Relevé dans le bundle live (1400) : le bouton d'emote du chat envoie
// `{ type: "Emote", emoteType }` au serveur et ne garde rien en local. L'emote
// revient dans l'état de room, `stateAtom.data.chat.entries`, sous la forme
// `{ kind: "emote", playerId, emoteType, seq, lastSeq, lastTimestampMs, count }`.
// Une même emote répétée ne crée pas de nouvelle entrée : elle incrémente
// `count` et avance `lastTimestampMs`. C'est donc cette date, et elle seule,
// qui dit qu'une emote vient d'être jouée.

import { EmoteType } from "./emoteTypes";

export type Random = () => number;

/** Au-delà, il ne voit pas l'emote : il ne répond pas. Même seuil que les réactions `low`. */
export const MIRROR_MAX_DISTANCE = 8;
/** Écart minimal entre deux réponses. */
export const MIRROR_COOLDOWN_MS = 6_000;
/** Délai de réaction, tiré entre ces deux bornes : le temps de voir, puis de répondre. */
export const MIRROR_DELAY_MIN_MS = 400;
export const MIRROR_DELAY_MAX_MS = 1_200;

/**
 * Deux emotes plus rapprochées que ça appartiennent à la même série.
 *
 * Une série, c'est le joueur qui martèle le bouton : le companion répond à la
 * première, peut-être à une seconde, puis laisse passer jusqu'à ce que le
 * joueur se calme.
 */
export const STREAK_GAP_MS = 12_000;
/** Réponses au plus par série. */
const STREAK_MAX_ANSWERS = 2;
/** Chance de répondre une seconde fois dans la même série. Tirée une seule fois. */
const SECOND_ANSWER_CHANCE = 0.5;

/** Une réponse sur six environ s'accompagne d'un mot. */
const LINE_CHANCE = 1 / 6;
/** Jamais plus d'un mot toutes les deux minutes. */
export const LINE_COOLDOWN_MS = 120_000;

/** À partir de tant d'emotes dans une série, il peut le faire remarquer. */
export const SPAM_THRESHOLD = 6;
/** Chance qu'il le fasse remarquer, tirée une fois par série. */
const SPAM_LINE_CHANCE = 0.3;
/** Et au plus une fois toutes les cinq minutes. */
export const SPAM_LINE_COOLDOWN_MS = 300_000;

/** Emotes qu'un joueur peut jouer, c'est-à-dire toutes sauf la posture de repos. */
const PLAYABLE: ReadonlySet<number> = new Set(
  Object.values(EmoteType).filter((value) => value !== EmoteType.Idle)
);

export type OwnEmote = { emote: EmoteType; at: number };

/**
 * Emote la plus récente d'un joueur parmi les entrées du chat de la room.
 *
 * `ignoreIds` écarte des ids à coup sûr étrangers au joueur, le PNJ du
 * companion en premier : ce ne sont jamais ses emotes à lui.
 */
export function latestOwnEmote(
  entries: unknown,
  playerId: string | null | undefined,
  ignoreIds: readonly string[] = []
): OwnEmote | null {
  if (!playerId || !Array.isArray(entries) || ignoreIds.includes(playerId)) return null;
  let best: OwnEmote | null = null;
  for (const raw of entries) {
    const entry = raw as { kind?: unknown; playerId?: unknown; emoteType?: unknown; lastTimestampMs?: unknown } | null;
    if (!entry || entry.kind !== "emote" || entry.playerId !== playerId) continue;
    const emote = entry.emoteType;
    const at = entry.lastTimestampMs;
    if (typeof emote !== "number" || !PLAYABLE.has(emote)) continue;
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    if (!best || at > best.at) best = { emote: emote as EmoteType, at };
  }
  return best;
}

export type MirrorState = {
  /** Faux tant que le premier relevé n'a pas été pris comme référence. */
  primed: boolean;
  /** Room et joueur du relevé de référence : en changer, c'est repartir de zéro. */
  scope: string | null;
  /** Date de la plus récente emote déjà vue. Seule une emote plus récente compte. */
  seenAt: number;

  /** Emotes de la série en cours, réponses données, et date (horloge locale) de la dernière. */
  streakCount: number;
  streakAnswers: number;
  streakLastAt: number;
  /** La remarque sur la série a déjà été tirée, réussie ou non. */
  streakSpamRolled: boolean;

  lastMirrorAt: number;
  lastLineAt: number;
  lastSpamLineAt: number;
};

export function initialMirrorState(): MirrorState {
  return {
    primed: false,
    scope: null,
    seenAt: Number.NEGATIVE_INFINITY,
    streakCount: 0,
    streakAnswers: 0,
    streakLastAt: Number.NEGATIVE_INFINITY,
    streakSpamRolled: false,
    lastMirrorAt: Number.NEGATIVE_INFINITY,
    lastLineAt: Number.NEGATIVE_INFINITY,
    lastSpamLineAt: Number.NEGATIVE_INFINITY,
  };
}

/** Ce que la veille a lu : `null` tant que la room ou le joueur ne sont pas connus. */
export type MirrorRead = { scope: string; latest: OwnEmote | null } | null;

/**
 * Tient le relevé à jour, et dit si une emote vient d'être jouée.
 *
 * Le premier relevé exploitable ne fait que noter ce qui existait déjà : les
 * emotes jouées avant le démarrage de la veille ne sont pas des nouvelles. Il
 * en va de même à chaque changement de room, dont l'historique de chat
 * pourrait contenir une vieille emote du joueur.
 *
 * Un relevé inexploitable (état de room pas encore chargé, id du joueur
 * inconnu) ne sert pas de référence : il laisserait passer pour neuves les
 * emotes qu'on découvrirait au relevé suivant.
 */
export function observeOwnEmote(
  state: MirrorState,
  read: MirrorRead
): { state: MirrorState; fresh: OwnEmote | null } {
  if (!read) return { state, fresh: null };
  if (!state.primed || state.scope !== read.scope) {
    return {
      state: { ...state, primed: true, scope: read.scope, seenAt: read.latest?.at ?? Number.NEGATIVE_INFINITY },
      fresh: null,
    };
  }
  const latest = read.latest;
  if (!latest || latest.at <= state.seenAt) return { state, fresh: null };
  return { state: { ...state, seenAt: latest.at }, fresh: latest };
}

function pick<T>(list: readonly T[], random: Random): T {
  const i = Math.floor(random() * list.length);
  return list[Math.min(list.length - 1, Math.max(0, i))];
}

/**
 * L'emote qu'il rend.
 *
 * La même, le plus souvent : partager le moment, c'est faire pareil. Deux
 * exceptions. Le joueur pleure : il le console (Love) ou pleure avec lui. Le
 * joueur se fâche : il s'en étonne ou s'en attriste, mais ne se fâche jamais
 * en retour.
 */
export function mirrorEmoteFor(played: EmoteType, random: Random): EmoteType {
  switch (played) {
    case EmoteType.Crying:
      return random() < 0.6 ? EmoteType.Love : EmoteType.Crying;
    case EmoteType.Angered:
      return random() < 0.6 ? EmoteType.Questioning : EmoteType.Crying;
    default:
      return played;
  }
}

/** Délai avant de répondre, entier, dans `[MIRROR_DELAY_MIN_MS, MIRROR_DELAY_MAX_MS]`. */
export function mirrorDelay(random: Random): number {
  const span = MIRROR_DELAY_MAX_MS - MIRROR_DELAY_MIN_MS;
  const r = Math.min(1, Math.max(0, random()));
  return Math.round(MIRROR_DELAY_MIN_MS + r * span);
}

/** Le petit mot qui accompagne parfois la réponse, selon ce que le joueur a joué. */
export const MIRROR_LINES: Readonly<Record<number, readonly string[]>> = {
  [EmoteType.Clapping]: ["Bravo!", "Woo!", "Nice one!"],
  [EmoteType.Laughing]: ["Haha!", "Hehe.", "Too funny."],
  [EmoteType.Angered]: ["Uh oh.", "Easy there.", "What happened?"],
  [EmoteType.Crying]: ["Aww.", "There, there.", "I'm here."],
  [EmoteType.Questioning]: ["Hmm?", "No idea either.", "Good question."],
  [EmoteType.Love]: ["Aww.", "Same!", "Right back at you!"],
};

/** Ce qu'il dit quand le joueur martèle le bouton. */
export const SPAM_LINES: readonly string[] = ["Okay okay, I get it!", "Alright, alright!", "You're on a roll, huh?"];

export type MirrorAction =
  | { kind: "mirror"; emote: EmoteType; delayMs: number; line: string | null }
  | { kind: "line"; line: string; delayMs: number };

export type MirrorContext = {
  now: number;
  /** Faux quand il est occupé, rangé, ou que ses réactions sont coupées. */
  available: boolean;
  /** Distance en tuiles jusqu'au joueur, `null` quand on ne sait pas. */
  distance: number | null;
  random: Random;
};

/**
 * Décide de la réponse à une emote neuve du joueur.
 *
 * La série est tenue à jour dans tous les cas, qu'il réponde ou non : un
 * joueur qui martèle le bouton pendant que le companion est loin martèle
 * quand même, et ce n'est pas en arrivant qu'il doit répondre à la sixième.
 */
export function decideMirror(
  state: MirrorState,
  played: OwnEmote,
  ctx: MirrorContext
): { state: MirrorState; action: MirrorAction | null } {
  const { now, random } = ctx;
  let next: MirrorState =
    now - state.streakLastAt > STREAK_GAP_MS
      ? { ...state, streakCount: 1, streakAnswers: 0, streakSpamRolled: false, streakLastAt: now }
      : { ...state, streakCount: state.streakCount + 1, streakLastAt: now };

  // Occupé, ou trop loin pour avoir vu : il ne répond pas.
  if (!ctx.available || ctx.distance === null || ctx.distance > MIRROR_MAX_DISTANCE) {
    return { state: next, action: null };
  }

  // Le joueur insiste : une remarque, rarement, une fois par série au plus.
  if (
    next.streakCount >= SPAM_THRESHOLD &&
    !next.streakSpamRolled &&
    now - next.lastSpamLineAt >= SPAM_LINE_COOLDOWN_MS
  ) {
    next = { ...next, streakSpamRolled: true };
    if (random() < SPAM_LINE_CHANCE) {
      next = { ...next, lastSpamLineAt: now, lastLineAt: now, lastMirrorAt: now };
      return { state: next, action: { kind: "line", line: pick(SPAM_LINES, random), delayMs: mirrorDelay(random) } };
    }
  }

  if (now - next.lastMirrorAt < MIRROR_COOLDOWN_MS) return { state: next, action: null };
  if (next.streakAnswers >= STREAK_MAX_ANSWERS) return { state: next, action: null };

  // Une seconde réponse dans la même série n'est pas acquise. Le tirage ne se
  // fait qu'une fois : raté, la série est close, sinon il finirait toujours
  // par répondre à force d'emotes.
  if (next.streakAnswers >= 1 && random() >= SECOND_ANSWER_CHANCE) {
    return { state: { ...next, streakAnswers: STREAK_MAX_ANSWERS }, action: null };
  }

  const emote = mirrorEmoteFor(played.emote, random);
  const delayMs = mirrorDelay(random);
  let line: string | null = null;
  if (now - next.lastLineAt >= LINE_COOLDOWN_MS && random() < LINE_CHANCE) {
    const lines = MIRROR_LINES[played.emote];
    if (lines && lines.length) line = pick(lines, random);
  }

  next = {
    ...next,
    streakAnswers: next.streakAnswers + 1,
    lastMirrorAt: now,
    lastLineAt: line ? now : next.lastLineAt,
  };
  return { state: next, action: { kind: "mirror", emote, delayMs, line } };
}
