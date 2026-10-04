// Vérifie la réponse du companion aux emotes du joueur.
//
// Tout est pur (src/services/companion/emoteMirror.ts) : les abonnements au
// jeu vivent à part, dans emoteMirrorWatch.ts, et ne décident de rien.

import {
  LINE_COOLDOWN_MS,
  MIRROR_COOLDOWN_MS,
  MIRROR_DELAY_MAX_MS,
  MIRROR_DELAY_MIN_MS,
  MIRROR_LINES,
  MIRROR_MAX_DISTANCE,
  SPAM_LINES,
  SPAM_LINE_COOLDOWN_MS,
  SPAM_THRESHOLD,
  STREAK_GAP_MS,
  decideMirror,
  initialMirrorState,
  latestOwnEmote,
  mirrorDelay,
  mirrorEmoteFor,
  observeOwnEmote,
  type MirrorAction,
  type MirrorState,
  type OwnEmote,
} from "../src/services/companion/emoteMirror";
import { EmoteType } from "../src/services/companion/emoteTypes";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};

const r0 = () => 0;
const r99 = () => 0.99;
/** Rejoue une suite de tirages, puis 0.99 une fois la suite épuisée. */
const seq = (...values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0.99);
};

const ME = "acct_me";
const NPC = "npc_companion";
const OTHER = "acct_other";

const emoteEntry = (playerId: string, emoteType: number, at: number, extra: Record<string, unknown> = {}) => ({
  kind: "emote",
  playerId,
  emoteType,
  lastTimestampMs: at,
  seq: 1,
  lastSeq: 1,
  count: 1,
  ...extra,
});
const message = (playerId: string, at: number) => ({ kind: "message", playerId, message: "hi", timestamp: at, seq: 2 });

/* ------------------------------ latestOwnEmote ------------------------------ */

{
  const entries = [
    emoteEntry(ME, EmoteType.Clapping, 1000),
    emoteEntry(OTHER, EmoteType.Love, 5000),
    message(ME, 6000),
    emoteEntry(ME, EmoteType.Laughing, 3000),
    emoteEntry(NPC, EmoteType.Crying, 9000),
  ];
  const got = latestOwnEmote(entries, ME, [NPC]);
  check("latestOwnEmote: la plus récente du joueur", got?.emote, EmoteType.Laughing);
  check("latestOwnEmote: sa date", got?.at, 3000);
  check("latestOwnEmote: ignore les autres joueurs", latestOwnEmote([emoteEntry(OTHER, 0, 1)], ME), null);
  check("latestOwnEmote: ignore le PNJ même pris pour le joueur", latestOwnEmote([emoteEntry(NPC, 0, 1)], NPC, [NPC]), null);
  check("latestOwnEmote: ignore Idle", latestOwnEmote([emoteEntry(ME, EmoteType.Idle, 1)], ME), null);
  check("latestOwnEmote: ignore un type inconnu", latestOwnEmote([emoteEntry(ME, 42, 1)], ME), null);
  check("latestOwnEmote: ignore une date absente", latestOwnEmote([{ kind: "emote", playerId: ME, emoteType: 0 }], ME), null);
  check("latestOwnEmote: entrées absentes", latestOwnEmote(undefined, ME), null);
  check("latestOwnEmote: joueur inconnu", latestOwnEmote(entries, null), null);
  check("latestOwnEmote: entrée nulle tolérée", latestOwnEmote([null, emoteEntry(ME, 5, 7)], ME)?.emote, EmoteType.Love);
}

/* ------------------------------ observeOwnEmote ------------------------------ */

{
  const scope = "room1|" + ME;
  let s = initialMirrorState();

  let seen = observeOwnEmote(s, null);
  check("observe: relevé inexploitable, pas de référence", seen.state.primed, false);

  seen = observeOwnEmote(s, { scope, latest: { emote: EmoteType.Clapping, at: 1000 } });
  check("observe: premier relevé = référence, rien de neuf", seen.fresh, null);
  check("observe: référence notée", seen.state.seenAt, 1000);
  s = seen.state;

  seen = observeOwnEmote(s, { scope, latest: { emote: EmoteType.Clapping, at: 1000 } });
  check("observe: même emote déjà vue", seen.fresh, null);

  seen = observeOwnEmote(s, { scope, latest: { emote: EmoteType.Clapping, at: 2000 } });
  check("observe: même emote rejouée (count++, date avancée)", seen.fresh?.at, 2000);
  s = seen.state;

  seen = observeOwnEmote(s, { scope, latest: { emote: EmoteType.Love, at: 1500 } });
  check("observe: plus ancienne que la référence", seen.fresh, null);

  seen = observeOwnEmote(s, { scope, latest: null });
  check("observe: historique purgé, rien de neuf", seen.fresh, null);
  check("observe: la référence ne recule pas", seen.state.seenAt, 2000);

  seen = observeOwnEmote(s, { scope: "room2|" + ME, latest: { emote: EmoteType.Love, at: 9999 } });
  check("observe: changement de room = nouvelle référence", seen.fresh, null);
  check("observe: référence de la nouvelle room", seen.state.seenAt, 9999);

  const empty = observeOwnEmote(initialMirrorState(), { scope, latest: null }).state;
  seen = observeOwnEmote(empty, { scope, latest: { emote: EmoteType.Laughing, at: 5 } });
  check("observe: première emote après une référence vide", seen.fresh?.emote, EmoteType.Laughing);
}

/* ------------------------------ mapping et délai ------------------------------ */

check("map: Clapping -> Clapping", mirrorEmoteFor(EmoteType.Clapping, r0), EmoteType.Clapping);
check("map: Laughing -> Laughing", mirrorEmoteFor(EmoteType.Laughing, r0), EmoteType.Laughing);
check("map: Love -> Love", mirrorEmoteFor(EmoteType.Love, r0), EmoteType.Love);
check("map: Questioning -> Questioning", mirrorEmoteFor(EmoteType.Questioning, r0), EmoteType.Questioning);
check("map: Crying -> Love (consoler)", mirrorEmoteFor(EmoteType.Crying, r0), EmoteType.Love);
check("map: Crying -> Crying", mirrorEmoteFor(EmoteType.Crying, r99), EmoteType.Crying);
check("map: Angered -> Questioning", mirrorEmoteFor(EmoteType.Angered, r0), EmoteType.Questioning);
check("map: Angered -> Crying", mirrorEmoteFor(EmoteType.Angered, r99), EmoteType.Crying);
{
  let angeredBack = false;
  for (let i = 0; i < 100; i++) if (mirrorEmoteFor(EmoteType.Angered, () => i / 100) === EmoteType.Angered) angeredBack = true;
  check("map: jamais Angered en retour", angeredBack, false);
}
check("délai: borne basse", mirrorDelay(r0), MIRROR_DELAY_MIN_MS);
check("délai: borne haute", mirrorDelay(() => 1), MIRROR_DELAY_MAX_MS);
check("délai: borne basse 400", MIRROR_DELAY_MIN_MS, 400);
check("délai: borne haute 1200", MIRROR_DELAY_MAX_MS, 1200);
check("délai: entier", Number.isInteger(mirrorDelay(() => 0.3333)), true);

/* ------------------------------ decideMirror ------------------------------ */

const primed = (): MirrorState => ({ ...initialMirrorState(), primed: true, scope: "s", seenAt: 0 });
const played = (emote: EmoteType, at = 1): OwnEmote => ({ emote, at });
const near = (now: number, random: () => number = r99) => ({ now, available: true, distance: 2, random });
const asMirror = (a: MirrorAction | null) => (a && a.kind === "mirror" ? a : null);

{
  const T = 1_000_000;
  const d = decideMirror(primed(), played(EmoteType.Clapping), near(T));
  const m = asMirror(d.action);
  check("décide: répond à une emote", m?.emote, EmoteType.Clapping);
  check("décide: délai dans les bornes", !!m && m.delayMs >= 400 && m.delayMs <= 1200, true);
  check("décide: pas de mot quand le tirage rate", m?.line, null);
  check("décide: réponse comptée", d.state.streakAnswers, 1);

  check(
    "décide: trop loin, pas de réponse",
    decideMirror(primed(), played(EmoteType.Clapping), { ...near(T), distance: MIRROR_MAX_DISTANCE + 1 }).action,
    null
  );
  check(
    "décide: à la limite de vue, répond",
    decideMirror(primed(), played(EmoteType.Clapping), { ...near(T), distance: MIRROR_MAX_DISTANCE }).action?.kind,
    "mirror"
  );
  check(
    "décide: position inconnue, pas de réponse",
    decideMirror(primed(), played(EmoteType.Clapping), { ...near(T), distance: null }).action,
    null
  );
  const busyD = decideMirror(primed(), played(EmoteType.Clapping), { ...near(T), available: false });
  check("décide: occupé, pas de réponse", busyD.action, null);
  check("décide: occupé, la série compte quand même", busyD.state.streakCount, 1);

  // Le mot : 1 sur 6, et pas plus d'un toutes les deux minutes.
  // Tirages : mirrorEmoteFor (aucun pour Laughing), délai, chance du mot, choix du mot.
  const withLine = decideMirror(primed(), played(EmoteType.Laughing), near(T, seq(0.5, 0.1, 0)));
  check("mot: accompagne parfois la réponse", asMirror(withLine.action)?.line, MIRROR_LINES[EmoteType.Laughing][0]);
  check("mot: date notée", withLine.state.lastLineAt, T);

  const tooSoon = decideMirror(
    { ...primed(), lastLineAt: T - LINE_COOLDOWN_MS + 1 },
    played(EmoteType.Laughing),
    near(T, seq(0.5, 0, 0))
  );
  check("mot: pas deux en deux minutes", asMirror(tooSoon.action)?.line, null);
  check("mot: la réponse part quand même", tooSoon.action?.kind, "mirror");

  const missLine = decideMirror(primed(), played(EmoteType.Laughing), near(T, seq(0.5, 1 / 6)));
  check("mot: tirage raté au-dessus de 1/6", asMirror(missLine.action)?.line, null);
}

/* ------------------------------ cooldown et série ------------------------------ */

{
  const T = 2_000_000;
  let s = primed();

  // 1re emote : réponse.
  let d = decideMirror(s, played(EmoteType.Clapping), near(T));
  check("série: 1re emote, réponse", d.action?.kind, "mirror");
  s = d.state;

  // 2e emote 2 s plus tard : dans le cooldown.
  d = decideMirror(s, played(EmoteType.Clapping), near(T + 2_000, r0));
  check("série: dans le cooldown, rien", d.action, null);
  s = d.state;

  // 3e emote après le cooldown, tirage de la seconde réponse réussi.
  d = decideMirror(s, played(EmoteType.Clapping), near(T + 2_000 + MIRROR_COOLDOWN_MS, r0));
  check("série: seconde réponse possible", d.action?.kind, "mirror");
  s = d.state;
  check("série: deux réponses", s.streakAnswers, 2);

  // Au-delà : plus rien tant que la série dure, même cooldown écoulé.
  d = decideMirror(s, played(EmoteType.Clapping), near(T + 2_000 + 2 * MIRROR_COOLDOWN_MS, r0));
  check("série: pas de troisième réponse", d.action, null);
  s = d.state;

  // Le joueur se calme, puis rejoue : nouvelle série, nouvelle réponse.
  const later = T + 2_000 + 2 * MIRROR_COOLDOWN_MS + STREAK_GAP_MS + 1;
  d = decideMirror(s, played(EmoteType.Love), near(later));
  check("série: après une pause, il répond de nouveau", asMirror(d.action)?.emote, EmoteType.Love);
  check("série: compteur remis à un", d.state.streakCount, 1);
}

{
  // La seconde réponse ratée ferme la série, au lieu de retenter à chaque emote.
  const T = 3_000_000;
  let s = decideMirror(primed(), played(EmoteType.Clapping), near(T)).state;
  let d = decideMirror(s, played(EmoteType.Clapping), near(T + MIRROR_COOLDOWN_MS, r99));
  check("série: seconde réponse ratée", d.action, null);
  s = d.state;
  d = decideMirror(s, played(EmoteType.Clapping), near(T + 2 * MIRROR_COOLDOWN_MS, r0));
  check("série: pas de nouveau tirage dans la même série", d.action, null);
}

{
  // Martèlement : une remarque, rarement, une fois par série, et pas plus d'une
  // toutes les cinq minutes.
  const T = 4_000_000;
  let s = primed();
  let spam: MirrorAction | null = null;
  for (let i = 0; i < SPAM_THRESHOLD; i++) {
    const d = decideMirror(s, played(EmoteType.Laughing), near(T + i * 1_000, r0));
    s = d.state;
    if (d.action?.kind === "line") spam = d.action;
  }
  check("spam: remarque à la série insistante", spam?.kind === "line" ? spam.line : null, SPAM_LINES[0]);
  check("spam: date notée", s.lastSpamLineAt, T + (SPAM_THRESHOLD - 1) * 1_000);

  let again: MirrorAction | null = null;
  for (let i = SPAM_THRESHOLD; i < SPAM_THRESHOLD * 3; i++) {
    const d = decideMirror(s, played(EmoteType.Laughing), near(T + i * 1_000, r0));
    s = d.state;
    if (d.action?.kind === "line") again = d.action;
  }
  check("spam: une seule fois par série", again, null);

  // Nouvelle série insistante avant cinq minutes : pas de remarque.
  const t2 = T + SPAM_THRESHOLD * 3 * 1_000 + STREAK_GAP_MS + 1;
  let early: MirrorAction | null = null;
  for (let i = 0; i < SPAM_THRESHOLD * 2; i++) {
    const d = decideMirror(s, played(EmoteType.Laughing), near(t2 + i * 1_000, r0));
    s = d.state;
    if (d.action?.kind === "line") early = d.action;
  }
  check("spam: pas deux remarques en cinq minutes", early, null);

  // Tirage raté : la série n'en redemande pas.
  let s3 = primed();
  let missed: MirrorAction | null = null;
  for (let i = 0; i < SPAM_THRESHOLD * 2; i++) {
    const d = decideMirror(s3, played(EmoteType.Laughing), near(T + SPAM_LINE_COOLDOWN_MS * 2 + i * 1_000, r99));
    s3 = d.state;
    if (d.action?.kind === "line") missed = d.action;
  }
  check("spam: tirage raté, pas de remarque", missed, null);
  check("spam: tiré une fois", s3.streakSpamRolled, true);
}

/* ------------------------------ textes ------------------------------ */

{
  const all = [...Object.values(MIRROR_LINES).flat(), ...SPAM_LINES];
  check("textes: aucun tiret cadratin", all.some((l) => l.includes(String.fromCharCode(0x2014))), false);
  check("textes: courts", all.every((l) => l.length <= 24), true);
  check(
    "textes: un jeu par emote jouable",
    Object.values(EmoteType).filter((v) => v !== EmoteType.Idle).every((v) => (MIRROR_LINES[v] ?? []).length >= 2),
    true
  );
}

if (fails) {
  console.log(`\n${fails} FAIL`);
  process.exit(1);
}
console.log("\nall ok");
