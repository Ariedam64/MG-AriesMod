// Vérifie la veille d'absence du companion : quand il s'inquiète, quand il
// s'endort, quand il ronfle, et ce qu'il dit au réveil.
//
// Tout est pur (src/services/companion/afk.ts) : les abonnements au jeu vivent
// à part, dans afkWatch.ts, et ne décident de rien.

import {
  AFK_ASLEEP_AFTER_MS,
  AFK_IDLE_AFTER_MS,
  DREAM_CHANCE,
  DREAM_LINES,
  FALL_ASLEEP_LINES,
  IDLE_LINES,
  LONG_WAKE_LINES,
  RETURN_LINES,
  SNORE_LINES,
  SNORE_MAX_MS,
  SNORE_MIN_MS,
  SNORE_SLOW_AFTER_MS,
  SNORE_SLOW_MAX_MS,
  SNORE_SLOW_MIN_MS,
  WAKE_LINES,
  WAKE_LINE_MIN_ASLEEP_MS,
  afkActivity,
  afkReset,
  afkTick,
  initialAfkState,
  snoreDelay,
  snoreLine,
  type AfkEffect,
  type AfkState,
} from "../src/services/companion/afk";
import { EmoteType } from "../src/services/companion/emoteTypes";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};
const r0 = () => 0;
const r99 = () => 0.99;

const kinds = (effects: AfkEffect[]) => effects.map((e) => e.kind).join(",");
const said = (effects: AfkEffect[]) => effects.find((e): e is Extract<AfkEffect, { kind: "say" }> => e.kind === "say") ?? null;
const free = (now: number) => ({ now, busy: false, hidden: false });

const T0 = 1_000_000;

/** Fait tourner l'horloge pas à pas jusqu'à `until`, et rend le dernier état. */
function runUntil(state: AfkState, from: number, until: number, stepMs = 5_000, random = r0): { state: AfkState; effects: AfkEffect[] } {
  let s = state;
  const all: AfkEffect[] = [];
  for (let t = from; t <= until; t += stepMs) {
    const step = afkTick(s, free(t), random);
    s = step.state;
    all.push(...step.effects);
  }
  return { state: s, effects: all };
}

function asleepAt(t: number): AfkState {
  return { phase: "asleep", quietSince: t - AFK_IDLE_AFTER_MS - AFK_ASLEEP_AFTER_MS, phaseSince: t, asked: true, nextSnoreAt: t + SNORE_MIN_MS, lastSnore: null };
}

/* ------------------------------ active -> idle ------------------------------ */
{
  const s0 = initialAfkState(T0);
  check("départ : active", s0.phase, "active");

  const early = afkTick(s0, free(T0 + AFK_IDLE_AFTER_MS - 1), r0);
  check("avant 3 min : toujours active", early.state.phase, "active");
  check("avant 3 min : rien à dire", early.effects.length, 0);

  const idle = afkTick(s0, free(T0 + AFK_IDLE_AFTER_MS), r0);
  check("à 3 min : idle", idle.state.phase, "idle");
  const line = said(idle.effects);
  check("idle : il demande si on est là", line?.message, IDLE_LINES[0].message);
  check("idle : il vient le dire en face", line?.approach, true);
  check("idle : air interrogateur", line?.emote, EmoteType.Questioning);
  check("idle : question notée", idle.state.asked, true);
  check("idle : pas d'attention posée", kinds(idle.effects), "say");

  const again = afkTick(idle.state, free(T0 + AFK_IDLE_AFTER_MS + 60_000), r0);
  check("idle : la question n'est posée qu'une fois", again.effects.length, 0);

  const busy = afkTick(s0, { now: T0 + AFK_IDLE_AFTER_MS + 10_000, busy: true, hidden: false }, r0);
  check("occupé : pas de passage en idle", busy.state.phase, "active");
  check("occupé : silence", busy.effects.length, 0);
  const afterBusy = afkTick(busy.state, free(T0 + AFK_IDLE_AFTER_MS + 15_000), r0);
  check("occupé puis libre : idle tout de suite (l'horloge a continué)", afterBusy.state.phase, "idle");

  const hidden = afkTick(s0, { now: T0 + AFK_IDLE_AFTER_MS, busy: false, hidden: true }, r0);
  check("onglet caché : idle quand même", hidden.state.phase, "idle");
  check("onglet caché : rien dit", hidden.effects.length, 0);
  check("onglet caché : question non posée", hidden.state.asked, false);

  // Les signes de vie repoussent l'échéance.
  const moved = afkActivity(s0, { now: T0 + 2 * 60_000, busy: false }, r0);
  check("activité en active : rien à dire", moved.effects.length, 0);
  check("activité en active : horloge remise à zéro", moved.state.quietSince, T0 + 2 * 60_000);
  check("activité : 3 min après le départ, toujours active", afkTick(moved.state, free(T0 + AFK_IDLE_AFTER_MS), r0).state.phase, "active");
}

/* ------------------------------ idle -> asleep ------------------------------ */
{
  const tIdle = T0 + AFK_IDLE_AFTER_MS;
  const idle = afkTick(initialAfkState(T0), free(tIdle), r0).state;

  check("idle : pas encore endormi juste avant 6 min", afkTick(idle, free(tIdle + AFK_ASLEEP_AFTER_MS - 1), r0).state.phase, "idle");

  const sleep = afkTick(idle, free(tIdle + AFK_ASLEEP_AFTER_MS), r0);
  check("6 min après idle : asleep", sleep.state.phase, "asleep");
  check("endormissement : réplique puis attention", kinds(sleep.effects), "say,hold");
  check("endormissement : réplique de sommeil", said(sleep.effects)?.message, FALL_ASLEEP_LINES[0].message);
  check("endormissement : il vient d'abord auprès du joueur", said(sleep.effects)?.approach, true);
  check("endormissement : premier ronflement à 45 s au plus tôt", sleep.state.nextSnoreAt, tIdle + AFK_ASLEEP_AFTER_MS + SNORE_MIN_MS);

  const hidden = afkTick(idle, { now: tIdle + AFK_ASLEEP_AFTER_MS, busy: false, hidden: true }, r0);
  check("onglet caché : il s'endort sans rien dire, mais reste auprès du joueur", kinds(hidden.effects), "hold");

  const busy = afkTick(idle, { now: tIdle + AFK_ASLEEP_AFTER_MS, busy: true, hidden: false }, r0);
  check("occupé : ne s'endort pas", busy.state.phase, "idle");

  // Bout à bout, avec l'horloge du pilote.
  const run = runUntil(initialAfkState(T0), T0, T0 + AFK_IDLE_AFTER_MS + AFK_ASLEEP_AFTER_MS);
  check("bout à bout : endormi à 9 min", run.state.phase, "asleep");
  check("bout à bout : question, sommeil, attention", kinds(run.effects), "say,say,hold");
}

/* ------------------------------ retour en idle ------------------------------ */
{
  const tIdle = T0 + AFK_IDLE_AFTER_MS;
  const idle = afkTick(initialAfkState(T0), free(tIdle), r0).state;

  const back = afkActivity(idle, { now: tIdle + 30_000, busy: false }, r0);
  check("retour en idle : active", back.state.phase, "active");
  check("retour en idle (tirage favorable) : petit mot", said(back.effects)?.message, RETURN_LINES[0].message);
  check("retour en idle : petit mot sans se déplacer", said(back.effects)?.approach, false);
  check("retour en idle : pas d'attention à relâcher", back.effects.some((e) => e.kind === "release"), false);

  const quiet = afkActivity(idle, { now: tIdle + 30_000, busy: false }, r99);
  check("retour en idle (tirage défavorable) : silence", quiet.effects.length, 0);

  const notAsked = { ...idle, asked: false };
  check("retour en idle sans question posée : silence", afkActivity(notAsked, { now: tIdle + 30_000, busy: false }, r0).effects.length, 0);
  check("retour en idle pendant qu'il est occupé : silence", afkActivity(idle, { now: tIdle + 30_000, busy: true }, r0).effects.length, 0);
}

/* ------------------------------ ronflements ------------------------------ */
{
  const tSleep = T0;
  const s = asleepAt(tSleep);

  const before = afkTick(s, free(tSleep + SNORE_MIN_MS - 1), r0);
  check("ronflement : rien avant l'échéance", before.effects.length, 0);

  // Tirages dans l'ordre : délai du suivant, rêve ou non, réplique. Le second
  // au-dessus de DREAM_CHANCE : on le veut ordinaire ici.
  const seq = [0, 0.5, 0];
  let i = 0;
  const rSeq = () => seq[i++ % seq.length];
  const snore = afkTick(s, free(tSleep + SNORE_MIN_MS), rSeq);
  const line = said(snore.effects);
  check("ronflement : une bulle", line !== null, true);
  check("ronflement : sans se déplacer", line?.approach, false);
  check("ronflement : sans emote", line?.emote, null);
  check("ronflement : réplique de sommeil ordinaire", SNORE_LINES.includes(line?.message ?? ""), true);
  check("ronflement : retenu pour ne pas le répéter", snore.state.lastSnore, line?.message);
  const delay = (snore.state.nextSnoreAt ?? 0) - (tSleep + SNORE_MIN_MS);
  check("ronflement : prochain entre 45 et 90 s", delay >= SNORE_MIN_MS && delay <= SNORE_MAX_MS, true);

  check("snoreDelay : 45 s au minimum", snoreDelay(0, r0), SNORE_MIN_MS);
  check("snoreDelay : 90 s au maximum", snoreDelay(0, () => 1), SNORE_MAX_MS);
  check("snoreDelay : ralenti après 30 min (min)", snoreDelay(SNORE_SLOW_AFTER_MS, r0), SNORE_SLOW_MIN_MS);
  check("snoreDelay : ralenti après 30 min (max)", snoreDelay(SNORE_SLOW_AFTER_MS + 1, () => 1), SNORE_SLOW_MAX_MS);
  check("snoreDelay : pas encore ralenti juste avant 30 min", snoreDelay(SNORE_SLOW_AFTER_MS - 1, () => 1), SNORE_MAX_MS);

  const late = { ...s, nextSnoreAt: tSleep + SNORE_SLOW_AFTER_MS };
  const lateSnore = afkTick(late, free(tSleep + SNORE_SLOW_AFTER_MS), r99);
  const lateDelay = (lateSnore.state.nextSnoreAt ?? 0) - (tSleep + SNORE_SLOW_AFTER_MS);
  check("après 30 min : prochain ronflement à plusieurs minutes", lateDelay >= SNORE_SLOW_MIN_MS && lateDelay <= SNORE_SLOW_MAX_MS, true);

  // Sur une heure de sommeil, au pire tirage (le plus rapproché).
  const hour = runUntil(s, tSleep, tSleep + 60 * 60_000, 5_000, () => 0.5);
  const count = hour.effects.filter((e) => e.kind === "say").length;
  const fastMax = Math.ceil(SNORE_SLOW_AFTER_MS / SNORE_MIN_MS);
  const slowMax = Math.ceil((30 * 60_000) / SNORE_SLOW_MIN_MS) + 1;
  check(`une heure de sommeil : au plus ${fastMax + slowMax} bulles (${count})`, count <= fastMax + slowMax && count > 0, true);
  const lastHalf = runUntil({ ...s, phaseSince: tSleep - SNORE_SLOW_AFTER_MS, nextSnoreAt: tSleep }, tSleep, tSleep + 30 * 60_000, 5_000, () => 0.5);
  const slowCount = lastHalf.effects.filter((e) => e.kind === "say").length;
  check(`30 min de sommeil profond : quelques bulles seulement (${slowCount})`, slowCount <= slowMax && slowCount >= 1, true);
  check("sommeil : aucune autre sorte d'effet en route", hour.effects.every((e) => e.kind === "say"), true);
  check("sommeil : reste endormi sans signe de vie", hour.state.phase, "asleep");

  const hidden = afkTick(s, { now: tSleep + SNORE_MIN_MS, busy: false, hidden: true }, r0);
  check("onglet caché : pas de ronflement", hidden.effects.length, 0);
  check("onglet caché : le suivant est reprogrammé", (hidden.state.nextSnoreAt ?? 0) > tSleep + SNORE_MIN_MS, true);

  check("snoreLine : jamais deux fois la même", snoreLine(SNORE_LINES[0], () => 0.5) !== SNORE_LINES[0], true);
  check("snoreLine : rêve sous DREAM_CHANCE", DREAM_LINES.includes(snoreLine(null, () => DREAM_CHANCE / 2)), true);
  check("snoreLine : ordinaire au-dessus", SNORE_LINES.includes(snoreLine(null, () => DREAM_CHANCE + 0.01)), true);
}

/* ------------------------------ réveil ------------------------------ */
{
  const tSleep = T0;
  const s = asleepAt(tSleep);

  const wake = afkActivity(s, { now: tSleep + WAKE_LINE_MIN_ASLEEP_MS, busy: false }, r0);
  check("réveil : active", wake.state.phase, "active");
  check("réveil : réplique puis attention relâchée", kinds(wake.effects), "say,release");
  check("réveil : réplique de sursaut", said(wake.effects)?.message, WAKE_LINES[0].message);
  check("réveil : sans se déplacer", said(wake.effects)?.approach, false);
  const emote = said(wake.effects)?.emote;
  check("réveil : Questioning ou Laughing", emote === EmoteType.Questioning || emote === EmoteType.Laughing, true);
  check("réveil : horloge repartie", wake.state.quietSince, tSleep + WAKE_LINE_MIN_ASLEEP_MS);
  check("réveil : plus de ronflement prévu", wake.state.nextSnoreAt, null);

  const nap = afkActivity(s, { now: tSleep + WAKE_LINE_MIN_ASLEEP_MS - 1, busy: false }, r0);
  check("réveil après moins d'une minute : silence, mais relâche", kinds(nap.effects), "release");

  const long = afkActivity(s, { now: tSleep + SNORE_SLOW_AFTER_MS, busy: false }, r0);
  check("réveil après une très longue absence : réplique dédiée", said(long.effects)?.message, LONG_WAKE_LINES[0].message);

  for (const line of [...WAKE_LINES, ...LONG_WAKE_LINES]) {
    check(`réveil « ${line.message} » : Questioning ou Laughing`, line.emote === EmoteType.Questioning || line.emote === EmoteType.Laughing, true);
  }

  // Interrompu par autre chose : il se réveille, mais sans un mot.
  const interrupted = afkTick(s, { now: tSleep + 5 * 60_000, busy: true, hidden: false }, r0);
  check("occupé pendant le sommeil : réveillé", interrupted.state.phase, "active");
  check("occupé pendant le sommeil : sans un mot", kinds(interrupted.effects), "release");
  check("occupé pendant le sommeil : l'horloge repart de là", interrupted.state.quietSince, tSleep + 5 * 60_000);

  const busyWake = afkActivity(s, { now: tSleep + 5 * 60_000, busy: true }, r0);
  check("signe de vie pendant qu'il est occupé : relâche sans parler", kinds(busyWake.effects), "release");

  check("reset endormi : relâche", kinds(afkReset(s, tSleep + 1).effects), "release");
  check("reset éveillé : rien à relâcher", afkReset(initialAfkState(T0), T0 + 1).effects.length, 0);
  check("reset : active", afkReset(s, tSleep + 1).state.phase, "active");
}

/* ------------------------------ écriture ------------------------------ */
{
  const all = [
    ...IDLE_LINES.map((l) => l.message),
    ...RETURN_LINES.map((l) => l.message),
    ...FALL_ASLEEP_LINES.map((l) => l.message),
    ...SNORE_LINES,
    ...DREAM_LINES,
    ...WAKE_LINES.map((l) => l.message),
    ...LONG_WAKE_LINES.map((l) => l.message),
  ];
  const dashes = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];
  check("pas de tiret cadratin", all.some((s) => dashes.some((d) => s.includes(d))), false);
  check("pas de réplique vide", all.every((s) => s.trim().length > 0), true);
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
