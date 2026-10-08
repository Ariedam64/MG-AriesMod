// Wires the companion's reactions to the game.
//
// Everything that decides what to say lives in `reactions/`, pure and checked
// outside the browser. Here we only subscribe, keep the previous reading of
// each source, and hand both to those functions.
//
// The watch keeps running while the companion is put away: the reference
// readings stay current, and nothing is said until he is there to say it. A
// `high` reaction then waits a few minutes for him to appear, a `low` one is
// dropped.

import { weatherCatalog } from "../../data";
import { cropName, eggName } from "../../data/names";
import { Atoms } from "../../game/store/atoms";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { HatchTracker, type HatchTrackerState } from "../hatch/tracker";
import { NotifierService } from "../notifier/notifier";
import type { ShopsSnapshot } from "../shops/shopFeed";
import { PetsService } from "../pets/pets";
import { StatsService, type StatsSnapshot } from "../stats/stats";
import { CompanionService } from ".";
import { companionBusy, reactionsEnabled } from "./availability";
import { rolledMutations } from "./catalogs";
import { CompanionChat } from "./chat";
import { weatherDisplayName, weatherMessage } from "./dialogueLines";
import { gardenFeed } from "./feeds";
import { holidayOf } from "./dialogueTime";
import { badLuckReactions, type LuckCounters } from "./reactions/badLuck";
import {
  abilityReaction,
  eggsReadyReaction,
  rareCropReaction,
  restockedFollowed,
  shopReaction,
  weatherChangeReaction,
} from "./reactions/events";
import { newRareCrops, newlyReadyEggs } from "./reactions/garden";
import { initialGateState, offerReaction, takeReaction, type Reaction } from "./reactions/gate";
import { statReactions } from "./reactions/milestones";
import {
  anniversaryReaction,
  clockReaction,
  greetingReaction,
  resumeSession,
  sessionHourReaction,
  sessionHours,
  type StoredSession,
} from "./reactions/session";
import { defineWatcher } from "./watch";

/**
 * The session (start, hours announced, first meeting) is its own section of
 * the mod's storage, next to the settings rather than inside them: it is a
 * record the companion keeps, not something the player sets.
 */
const SESSION_PATH = "companionSession";

/** How often the queue is looked at. */
const DRAIN_MS = 2_000;
/** Period of the slow readings: session, clock, eggs. */
const SLOW_TICK_MS = 30_000;
/**
 * Past this, a minor reaction is not worth crossing the garden for: it is only
 * said when the player is already close enough to read it.
 */
const LOW_PRIORITY_MAX_DISTANCE = 8;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Bad luck counters observed, per egg. */
function luckOf(state: HatchTrackerState): LuckCounters {
  const out: LuckCounters = {};
  for (const [eggId, counters] of Object.entries(state?.counters ?? {})) {
    out[eggId] = { gold: Number(counters?.gold) || 0, rainbow: Number(counters?.rainbow) || 0 };
  }
  return out;
}

async function speak(reaction: Reaction): Promise<void> {
  const distance = CompanionService.distanceToPlayer();
  if (reaction.priority === "low") {
    if (distance === null || distance > LOW_PRIORITY_MAX_DISTANCE) return;
  } else {
    // A bubble is read above his head: he comes to say it in person.
    await CompanionService.comeToPlayer();
  }
  try {
    await CompanionService.say(reaction.message, { force: true });
  } finally {
    CompanionService.releaseTask();
  }
  // Straight away: he has already arrived, and the pose must replace the
  // speech rather than follow it (see `emote.ts`).
  if (reaction.emote !== null) void CompanionService.emote(reaction.emote).catch(() => {});
}

export const reactionWatch = defineWatcher("reactions", (scope) => {
  let gate = initialGateState();
  let speaking = false;

  let session: StoredSession | null = null;
  let lastHour = new Date().getHours();

  let prevStats: StatsSnapshot | null = null;
  let prevWeather: string | null | undefined = undefined;
  let lastAbilityAt = 0;
  let prevShops: ShopsSnapshot | null = null;
  let prevLuck: LuckCounters | null = null;
  let prevGarden: unknown = null;
  const announcedEggs = new Set<string>();
  let eggsPrimed = false;

  function offer(reaction: Reaction | null): void {
    if (!reaction || !reactionsEnabled()) return;
    gate = offerReaction(gate, reaction, Date.now());
  }

  async function drain(): Promise<void> {
    if (speaking) return;
    const picked = takeReaction(gate, Date.now(), companionBusy() || !reactionsEnabled());
    gate = picked.state;
    if (!picked.reaction) return;
    speaking = true;
    try {
      await speak(picked.reaction);
    } catch {
    } finally {
      speaking = false;
    }
  }

  /* ------------------------------ session ------------------------------ */

  function saveSession(): void {
    if (!session) return;
    try {
      writeAriesPath(SESSION_PATH, session);
    } catch {}
  }

  function checkAnniversary(now: number): void {
    if (!session) return;
    const due = anniversaryReaction(session.firstMetAt, now, session.celebratedDays, Math.random);
    if (!due.reaction) return;
    session.celebratedDays = due.celebratedDays;
    saveSession();
    offer(due.reaction);
  }

  function openSession(): void {
    const resumed = resumeSession(readAriesPath(SESSION_PATH, undefined), Date.now());
    session = resumed.session;
    saveSession();
    const today = new Date();
    if (resumed.greeting) offer(greetingReaction(resumed.greeting, today.getHours(), Math.random, holidayOf(today)));
    checkAnniversary(Date.now());
  }

  /* ------------------------------ sources ------------------------------ */

  function checkEggs(now: number): void {
    const garden = gardenFeed.latest();
    if (!garden) return;
    const fresh = newlyReadyEggs(garden, now, announcedEggs);
    for (const key of fresh) announcedEggs.add(key);
    // The first reading only notes what was already ready.
    if (!eggsPrimed) {
      eggsPrimed = true;
      return;
    }
    offer(eggsReadyReaction(fresh.length, Math.random));
  }

  function slowTick(): void {
    const now = Date.now();
    if (session) {
      session.lastSeenAt = now;
      const hours = sessionHours(session, now);
      if (hours > session.announcedHours) {
        session.announcedHours = hours;
        offer(sessionHourReaction(hours, Math.random));
      }
      saveSession();

      const date = new Date(now);
      const hour = date.getHours();
      offer(clockReaction(lastHour, hour, now - session.startedAt, Math.random, holidayOf(date)));
      lastHour = hour;
      checkAnniversary(now);
    }
    checkEggs(now);
  }

  function checkGarden(): void {
    const next = gardenFeed.latest();
    if (!next || next === prevGarden) return;
    const prev = prevGarden;
    prevGarden = next;
    if (!prev) return;
    const crops = newRareCrops(prev, next, new Set(rolledMutations())).map((c) => ({
      ...c,
      species: cropName(c.species),
    }));
    offer(rareCropReaction(crops, Math.random));
  }

  function onWeather(next: unknown): void {
    const id = typeof next === "string" && next ? next : null;
    const prev = prevWeather;
    prevWeather = id;
    // `undefined`: the first reading. The weather already running is no news.
    if (prev === undefined) return;
    const prevName = prev ? weatherDisplayName(prev, weatherCatalog) : "";
    const startLine = id ? weatherMessage(id, weatherDisplayName(id, weatherCatalog), Math.random) : "";
    offer(weatherChangeReaction(prev, id, prevName, startLine, Math.random));
  }

  function onStats(next: StatsSnapshot): void {
    const snapshot = clone(next);
    const prev = prevStats;
    prevStats = snapshot;
    if (!prev) return;
    // During a batch he runs himself (hatching, harvesting) he already reports
    // each result: reacting as well would say it twice. Milestones stay, they
    // say something else.
    let ownRun = false;
    try {
      ownRun = CompanionChat.isRunning();
    } catch {}
    for (const reaction of statReactions(prev, snapshot, Math.random)) {
      if (ownRun && !reaction.key.startsWith("milestone:")) continue;
      offer(reaction);
    }
  }

  function onAbilityLogs(all: Array<{ performedAt: number; name?: string; species?: string; abilityName: string }>): void {
    if (!Array.isArray(all) || all.length === 0) return;
    const newest = all.reduce((a, b) => (b.performedAt > a.performedAt ? b : a));
    const first = lastAbilityAt === 0;
    if (newest.performedAt <= lastAbilityAt) return;
    lastAbilityAt = newest.performedAt;
    if (first) return;
    offer(abilityReaction({ name: newest.name, species: newest.species, abilityName: newest.abilityName }, Math.random));
  }

  function onHatchTracker(state: HatchTrackerState): void {
    const next = luckOf(state);
    const prev = prevLuck;
    prevLuck = next;
    if (!prev) return;
    for (const reaction of badLuckReactions(prev, next, eggName, Math.random)) offer(reaction);
  }

  async function onShops(next: ShopsSnapshot): Promise<void> {
    const prev = prevShops;
    prevShops = next;
    const ids = restockedFollowed(prev, next, (id) => {
      try {
        return NotifierService.getPref(id).popup === true;
      } catch {
        return false;
      }
    });
    if (ids.length === 0) return;
    let names = ids.map((id) => id.split(":").slice(1).join(":"));
    try {
      const state = await NotifierService.get();
      const byId = new Map(state.rows.map((row) => [row.id, row.name]));
      names = ids.map((id, i) => byId.get(id) ?? names[i]);
    } catch {}
    offer(shopReaction(names, Math.random));
  }

  /* ---------------------------- subscriptions ---------------------------- */

  openSession();
  scope.add(saveSession);

  scope.add(Atoms.data.weather.onChangeNow(scope.live(onWeather)));
  try {
    prevStats = clone(StatsService.getSnapshot());
    scope.add(StatsService.subscribe(scope.live(onStats)));
  } catch {}
  try {
    prevLuck = luckOf(HatchTracker.getState());
    scope.add(HatchTracker.subscribe(scope.live(onHatchTracker)));
  } catch {}
  try {
    scope.add(PetsService.onAbilityLogs(scope.live((all) => onAbilityLogs(all as never))));
  } catch {}
  scope.add(NotifierService.onShopsChangeNow(scope.live((next) => void onShops(next).catch(() => {}))));
  scope.add(gardenFeed.hold());

  scope.every(DRAIN_MS, () => {
    try {
      checkGarden();
    } catch {}
    void drain().catch(() => {});
  });
  scope.every(SLOW_TICK_MS, slowTick);
});
