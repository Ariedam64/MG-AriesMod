// Checks how the companion answers the player's emotes.
//
// Everything here is pure (src/features/companion/emoteMirror.ts): the game
// subscriptions live apart, in emoteMirrorWatch.ts, and decide nothing.

import { checkEqual, done } from "./_check";
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
} from "../src/features/companion/emoteMirror";
import { EmoteType } from "../src/features/companion/emoteTypes";

const r0 = () => 0;
const r99 = () => 0.99;
/** Replays a run of draws, then 0.99 once the run is used up. */
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
  checkEqual("latestOwnEmote: the player's most recent", got?.emote, EmoteType.Laughing);
  checkEqual("latestOwnEmote: its time", got?.at, 3000);
  checkEqual("latestOwnEmote: ignores other players", latestOwnEmote([emoteEntry(OTHER, 0, 1)], ME), null);
  checkEqual("latestOwnEmote: ignores the NPC even when taken for the player", latestOwnEmote([emoteEntry(NPC, 0, 1)], NPC, [NPC]), null);
  checkEqual("latestOwnEmote: ignores Idle", latestOwnEmote([emoteEntry(ME, EmoteType.Idle, 1)], ME), null);
  checkEqual("latestOwnEmote: ignores an unknown type", latestOwnEmote([emoteEntry(ME, 42, 1)], ME), null);
  checkEqual("latestOwnEmote: ignores a missing time", latestOwnEmote([{ kind: "emote", playerId: ME, emoteType: 0 }], ME), null);
  checkEqual("latestOwnEmote: no entries", latestOwnEmote(undefined, ME), null);
  checkEqual("latestOwnEmote: unknown player", latestOwnEmote(entries, null), null);
  checkEqual("latestOwnEmote: a null entry is tolerated", latestOwnEmote([null, emoteEntry(ME, 5, 7)], ME)?.emote, EmoteType.Love);
}

/* ------------------------------ observeOwnEmote ------------------------------ */

{
  const scope = "room1|" + ME;
  let s = initialMirrorState();

  let seen = observeOwnEmote(s, null);
  checkEqual("observe: unusable reading, no reference", seen.state.primed, false);

  seen = observeOwnEmote(s, { scope, latest: { emote: EmoteType.Clapping, at: 1000 } });
  checkEqual("observe: first reading = reference, nothing new", seen.fresh, null);
  checkEqual("observe: reference noted", seen.state.seenAt, 1000);
  s = seen.state;

  seen = observeOwnEmote(s, { scope, latest: { emote: EmoteType.Clapping, at: 1000 } });
  checkEqual("observe: same emote already seen", seen.fresh, null);

  seen = observeOwnEmote(s, { scope, latest: { emote: EmoteType.Clapping, at: 2000 } });
  checkEqual("observe: same emote replayed (count++, later time)", seen.fresh?.at, 2000);
  s = seen.state;

  seen = observeOwnEmote(s, { scope, latest: { emote: EmoteType.Love, at: 1500 } });
  checkEqual("observe: older than the reference", seen.fresh, null);

  seen = observeOwnEmote(s, { scope, latest: null });
  checkEqual("observe: history purged, nothing new", seen.fresh, null);
  checkEqual("observe: the reference does not go back", seen.state.seenAt, 2000);

  seen = observeOwnEmote(s, { scope: "room2|" + ME, latest: { emote: EmoteType.Love, at: 9999 } });
  checkEqual("observe: room change = new reference", seen.fresh, null);
  checkEqual("observe: the new room's reference", seen.state.seenAt, 9999);

  const empty = observeOwnEmote(initialMirrorState(), { scope, latest: null }).state;
  seen = observeOwnEmote(empty, { scope, latest: { emote: EmoteType.Laughing, at: 5 } });
  checkEqual("observe: first emote after an empty reference", seen.fresh?.emote, EmoteType.Laughing);
}

/* ------------------------------ mapping and delay ------------------------------ */

checkEqual("map: Clapping -> Clapping", mirrorEmoteFor(EmoteType.Clapping, r0), EmoteType.Clapping);
checkEqual("map: Laughing -> Laughing", mirrorEmoteFor(EmoteType.Laughing, r0), EmoteType.Laughing);
checkEqual("map: Love -> Love", mirrorEmoteFor(EmoteType.Love, r0), EmoteType.Love);
checkEqual("map: Questioning -> Questioning", mirrorEmoteFor(EmoteType.Questioning, r0), EmoteType.Questioning);
checkEqual("map: Crying -> Love (comfort)", mirrorEmoteFor(EmoteType.Crying, r0), EmoteType.Love);
checkEqual("map: Crying -> Crying", mirrorEmoteFor(EmoteType.Crying, r99), EmoteType.Crying);
checkEqual("map: Angered -> Questioning", mirrorEmoteFor(EmoteType.Angered, r0), EmoteType.Questioning);
checkEqual("map: Angered -> Crying", mirrorEmoteFor(EmoteType.Angered, r99), EmoteType.Crying);
{
  let angeredBack = false;
  for (let i = 0; i < 100; i++) if (mirrorEmoteFor(EmoteType.Angered, () => i / 100) === EmoteType.Angered) angeredBack = true;
  checkEqual("map: never Angered in return", angeredBack, false);
}
checkEqual("delay: lower bound", mirrorDelay(r0), MIRROR_DELAY_MIN_MS);
checkEqual("delay: upper bound", mirrorDelay(() => 1), MIRROR_DELAY_MAX_MS);
checkEqual("delay: lower bound is 400", MIRROR_DELAY_MIN_MS, 400);
checkEqual("delay: upper bound is 1200", MIRROR_DELAY_MAX_MS, 1200);
checkEqual("delay: whole number", Number.isInteger(mirrorDelay(() => 0.3333)), true);

/* ------------------------------ decideMirror ------------------------------ */

const primed = (): MirrorState => ({ ...initialMirrorState(), primed: true, scope: "s", seenAt: 0 });
const played = (emote: EmoteType, at = 1): OwnEmote => ({ emote, at });
const near = (now: number, random: () => number = r99) => ({ now, available: true, distance: 2, random });
const asMirror = (a: MirrorAction | null) => (a && a.kind === "mirror" ? a : null);

{
  const T = 1_000_000;
  const d = decideMirror(primed(), played(EmoteType.Clapping), near(T));
  const m = asMirror(d.action);
  checkEqual("decide: answers an emote", m?.emote, EmoteType.Clapping);
  checkEqual("decide: delay within bounds", !!m && m.delayMs >= 400 && m.delayMs <= 1200, true);
  checkEqual("decide: no word when the draw misses", m?.line, null);
  checkEqual("decide: the answer is counted", d.state.streakAnswers, 1);

  checkEqual(
    "decide: too far, no answer",
    decideMirror(primed(), played(EmoteType.Clapping), { ...near(T), distance: MIRROR_MAX_DISTANCE + 1 }).action,
    null
  );
  checkEqual(
    "decide: at the edge of sight, answers",
    decideMirror(primed(), played(EmoteType.Clapping), { ...near(T), distance: MIRROR_MAX_DISTANCE }).action?.kind,
    "mirror"
  );
  checkEqual(
    "decide: unknown position, no answer",
    decideMirror(primed(), played(EmoteType.Clapping), { ...near(T), distance: null }).action,
    null
  );
  const busyD = decideMirror(primed(), played(EmoteType.Clapping), { ...near(T), available: false });
  checkEqual("decide: busy, no answer", busyD.action, null);
  checkEqual("decide: busy, the streak still counts", busyD.state.streakCount, 1);

  // The word: 1 in 6, and no more than one every two minutes.
  // Draws: mirrorEmoteFor (none for Laughing), delay, word chance, word choice.
  const withLine = decideMirror(primed(), played(EmoteType.Laughing), near(T, seq(0.5, 0.1, 0)));
  checkEqual("word: sometimes comes with the answer", asMirror(withLine.action)?.line, MIRROR_LINES[EmoteType.Laughing][0]);
  checkEqual("word: time noted", withLine.state.lastLineAt, T);

  const tooSoon = decideMirror(
    { ...primed(), lastLineAt: T - LINE_COOLDOWN_MS + 1 },
    played(EmoteType.Laughing),
    near(T, seq(0.5, 0, 0))
  );
  checkEqual("word: not two in two minutes", asMirror(tooSoon.action)?.line, null);
  checkEqual("word: the answer still goes out", tooSoon.action?.kind, "mirror");

  const missLine = decideMirror(primed(), played(EmoteType.Laughing), near(T, seq(0.5, 1 / 6)));
  checkEqual("word: the draw misses above 1/6", asMirror(missLine.action)?.line, null);
}

/* ------------------------------ cooldown and streak ------------------------------ */

{
  const T = 2_000_000;
  let s = primed();

  // 1st emote: answered.
  let d = decideMirror(s, played(EmoteType.Clapping), near(T));
  checkEqual("streak: 1st emote, answered", d.action?.kind, "mirror");
  s = d.state;

  // 2nd emote 2 s later: within the cooldown.
  d = decideMirror(s, played(EmoteType.Clapping), near(T + 2_000, r0));
  checkEqual("streak: within the cooldown, nothing", d.action, null);
  s = d.state;

  // 3rd emote after the cooldown, the draw for the second answer succeeds.
  d = decideMirror(s, played(EmoteType.Clapping), near(T + 2_000 + MIRROR_COOLDOWN_MS, r0));
  checkEqual("streak: a second answer is possible", d.action?.kind, "mirror");
  s = d.state;
  checkEqual("streak: two answers", s.streakAnswers, 2);

  // Beyond that: nothing more while the streak lasts, even after the cooldown.
  d = decideMirror(s, played(EmoteType.Clapping), near(T + 2_000 + 2 * MIRROR_COOLDOWN_MS, r0));
  checkEqual("streak: no third answer", d.action, null);
  s = d.state;

  // The player calms down, then plays again: a new streak, a new answer.
  const later = T + 2_000 + 2 * MIRROR_COOLDOWN_MS + STREAK_GAP_MS + 1;
  d = decideMirror(s, played(EmoteType.Love), near(later));
  checkEqual("streak: after a pause, it answers again", asMirror(d.action)?.emote, EmoteType.Love);
  checkEqual("streak: counter reset to one", d.state.streakCount, 1);
}

{
  // A missed second answer closes the streak, instead of retrying on every emote.
  const T = 3_000_000;
  let s = decideMirror(primed(), played(EmoteType.Clapping), near(T)).state;
  let d = decideMirror(s, played(EmoteType.Clapping), near(T + MIRROR_COOLDOWN_MS, r99));
  checkEqual("streak: second answer missed", d.action, null);
  s = d.state;
  d = decideMirror(s, played(EmoteType.Clapping), near(T + 2 * MIRROR_COOLDOWN_MS, r0));
  checkEqual("streak: no new draw within the same streak", d.action, null);
}

{
  // Hammering: a remark, rarely, once per streak, and no more than one every
  // five minutes.
  const T = 4_000_000;
  let s = primed();
  let spam: MirrorAction | null = null;
  for (let i = 0; i < SPAM_THRESHOLD; i++) {
    const d = decideMirror(s, played(EmoteType.Laughing), near(T + i * 1_000, r0));
    s = d.state;
    if (d.action?.kind === "line") spam = d.action;
  }
  checkEqual("spam: a remark on an insistent streak", spam?.kind === "line" ? spam.line : null, SPAM_LINES[0]);
  checkEqual("spam: time noted", s.lastSpamLineAt, T + (SPAM_THRESHOLD - 1) * 1_000);

  let again: MirrorAction | null = null;
  for (let i = SPAM_THRESHOLD; i < SPAM_THRESHOLD * 3; i++) {
    const d = decideMirror(s, played(EmoteType.Laughing), near(T + i * 1_000, r0));
    s = d.state;
    if (d.action?.kind === "line") again = d.action;
  }
  checkEqual("spam: only once per streak", again, null);

  // A new insistent streak within five minutes: no remark.
  const t2 = T + SPAM_THRESHOLD * 3 * 1_000 + STREAK_GAP_MS + 1;
  let early: MirrorAction | null = null;
  for (let i = 0; i < SPAM_THRESHOLD * 2; i++) {
    const d = decideMirror(s, played(EmoteType.Laughing), near(t2 + i * 1_000, r0));
    s = d.state;
    if (d.action?.kind === "line") early = d.action;
  }
  checkEqual("spam: not two remarks in five minutes", early, null);

  // Missed draw: the streak does not ask again.
  let s3 = primed();
  let missed: MirrorAction | null = null;
  for (let i = 0; i < SPAM_THRESHOLD * 2; i++) {
    const d = decideMirror(s3, played(EmoteType.Laughing), near(T + SPAM_LINE_COOLDOWN_MS * 2 + i * 1_000, r99));
    s3 = d.state;
    if (d.action?.kind === "line") missed = d.action;
  }
  checkEqual("spam: missed draw, no remark", missed, null);
  checkEqual("spam: drawn once", s3.streakSpamRolled, true);
}

/* ------------------------------ texts ------------------------------ */

{
  const all = [...Object.values(MIRROR_LINES).flat(), ...SPAM_LINES];
  checkEqual("texts: no em dash", all.some((l) => l.includes(String.fromCharCode(0x2014))), false);
  checkEqual("texts: short", all.every((l) => l.length <= 24), true);
  checkEqual(
    "texts: a set for every playable emote",
    Object.values(EmoteType).filter((v) => v !== EmoteType.Idle).every((v) => (MIRROR_LINES[v] ?? []).length >= 2),
    true
  );
}

done();
