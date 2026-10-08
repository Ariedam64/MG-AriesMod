// src/services/companion/reactionWatch.ts
// Branche les réactions du companion sur le jeu.
//
// Tout ce qui décide quoi dire vit dans `reactions.ts`, pur et vérifié hors
// navigateur. Ici on ne fait que s'abonner, garder le relevé précédent de
// chaque source, et passer les deux à ces fonctions.
//
// La veille tourne même quand le companion est rangé : les relevés de
// référence restent à jour, et rien n'est dit tant qu'il n'est pas là pour le
// dire. Une réaction `high` attend alors quelques minutes qu'il apparaisse,
// une `low` se perd.
//
// Aucun effet à l'import : rien ne tourne tant que `startReactionWatch()` n'est
// pas appelé.

import { mutationCatalog, weatherCatalog } from "../../data";
import { cropName, eggName } from "../../data/names";
import { Atoms } from "../../game/store/atoms";
import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { HatchTracker, type HatchTrackerState } from "../hatch/tracker";
import { NotifierService } from "../notifier/notifier";
import type { ShopsSnapshot } from "../shops/shopFeed";
import { PetsService } from "../pets/pets";
import { StatsService, type StatsSnapshot } from "../stats/stats";
import { CompanionService } from ".";
import { CompanionChat } from "./chat";
import { weatherDisplayName, weatherMessage } from "./dialogueLines";
import {
  abilityReaction,
  anniversaryReaction,
  badLuckReactions,
  clockReaction,
  eggsReadyReaction,
  greetingReaction,
  holidayOf,
  initialGateState,
  newRareCrops,
  newlyReadyEggs,
  offerReaction,
  rareCropReaction,
  restockedFollowed,
  resumeSession,
  sessionHourReaction,
  sessionHours,
  shopReaction,
  statReactions,
  takeReaction,
  weatherChangeReaction,
  type GateState,
  type LuckCounters,
  type Reaction,
  type StoredSession,
} from "./reactions";
import { loadCompanionSettings } from "./state";

const SESSION_PATH = "companionSession";

/** Cadence à laquelle la file est consultée. */
const DRAIN_MS = 2_000;
/** Cadence des relevés lents : session, horloge, œufs. */
const SLOW_TICK_MS = 30_000;
/**
 * Au-delà, une réaction de peu d'importance ne vaut pas qu'il traverse le
 * jardin : il ne la dit que si le joueur est déjà assez près pour la lire.
 */
const LOW_PRIORITY_MAX_DISTANCE = 8;

let running = false;
let unsubscribers: Array<() => void> = [];
let timers: number[] = [];
let gate: GateState = initialGateState();
let speaking = false;

let session: StoredSession | null = null;
let lastHour = new Date().getHours();

let prevStats: StatsSnapshot | null = null;
let prevWeather: string | null | undefined = undefined;
let lastAbilityAt = 0;
let prevShops: ShopsSnapshot | null = null;
let prevLuck: LuckCounters | null = null;
let prevGarden: unknown = null;
let latestGarden: unknown = null;
const announcedEggs = new Set<string>();
let eggsPrimed = false;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function enabled(): boolean {
  try {
    const settings = loadCompanionSettings();
    return settings.enabled && settings.reactions;
  } catch {
    return false;
  }
}

function offer(reaction: Reaction | null): void {
  if (!reaction || !enabled()) return;
  gate = offerReaction(gate, reaction, Date.now());
}

/** Occupé à autre chose : une tâche, une question, une série d'actions. */
function busy(): boolean {
  if (!CompanionService.isRunning()) return true;
  if (CompanionService.isBusy()) return true;
  try {
    if (CompanionChat.isRunning() || CompanionChat.getProposal()) return true;
  } catch {}
  return false;
}

async function speak(reaction: Reaction): Promise<void> {
  const distance = CompanionService.distanceToPlayer();
  if (reaction.priority === "low") {
    if (distance === null || distance > LOW_PRIORITY_MAX_DISTANCE) return;
  } else {
    // Une bulle se lit au-dessus de sa tête : il vient la dire en face.
    await CompanionService.comeToPlayer();
  }
  try {
    await CompanionService.say(reaction.message, { force: true });
  } finally {
    CompanionService.releaseTask();
  }
  // Tout de suite : il est déjà arrivé, et la pose doit remplacer la parole
  // plutôt que la suivre (cf. `emote.ts`).
  if (reaction.emote !== null) void CompanionService.emote(reaction.emote).catch(() => {});
}

async function drain(): Promise<void> {
  if (speaking) return;
  const picked = takeReaction(gate, Date.now(), busy() || !enabled());
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

function openSession(): void {
  const resumed = resumeSession(readAriesPath(SESSION_PATH, undefined), Date.now());
  session = resumed.session;
  saveSession();
  const today = new Date();
  if (resumed.greeting) offer(greetingReaction(resumed.greeting, today.getHours(), Math.random, holidayOf(today)));
  checkAnniversary(Date.now());
}

function checkAnniversary(now: number): void {
  if (!session) return;
  const due = anniversaryReaction(session.firstMetAt, now, session.celebratedDays, Math.random);
  if (!due.reaction) return;
  session.celebratedDays = due.celebratedDays;
  saveSession();
  offer(due.reaction);
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

/* ------------------------------ sources ------------------------------ */

function checkEggs(now: number): void {
  if (!latestGarden) return;
  const fresh = newlyReadyEggs(latestGarden, now, announcedEggs);
  for (const key of fresh) announcedEggs.add(key);
  // Le premier relevé ne fait que noter ce qui était déjà prêt.
  if (!eggsPrimed) {
    eggsPrimed = true;
    return;
  }
  offer(eggsReadyReaction(fresh.length, Math.random));
}

/** Mutations tirées au hasard (Gold, Rainbow...) : celles qui ont une chance de base. */
function rareMutations(): Set<string> {
  const out = new Set<string>();
  try {
    for (const [key, def] of Object.entries((mutationCatalog ?? {}) as Record<string, { baseChance?: unknown }>)) {
      if (Number(def?.baseChance) > 0) out.add(key);
    }
  } catch {}
  return out;
}

function checkGarden(): void {
  const next = latestGarden;
  if (!next || next === prevGarden) return;
  const prev = prevGarden;
  prevGarden = next;
  if (!prev) return;
  const crops = newRareCrops(prev, next, rareMutations()).map((c) => ({ ...c, species: cropName(c.species) }));
  offer(rareCropReaction(crops, Math.random));
}

function onWeather(next: unknown): void {
  const id = typeof next === "string" && next ? next : null;
  const prev = prevWeather;
  prevWeather = id;
  // `undefined` : premier relevé, la météo déjà en cours n'est pas une nouvelle.
  if (prev === undefined) return;
  const nextName = id ? weatherDisplayName(id, weatherCatalog) : "";
  const prevName = prev ? weatherDisplayName(prev, weatherCatalog) : "";
  const startLine = id ? weatherMessage(id, nextName, Math.random) : "";
  offer(weatherChangeReaction(prev, id, prevName, startLine, Math.random));
}

function onStats(next: StatsSnapshot): void {
  const snapshot = clone(next);
  const prev = prevStats;
  prevStats = snapshot;
  if (!prev) return;
  // Pendant une série qu'il mène lui-même (couvée, récolte), il annonce déjà
  // chaque résultat : y réagir en plus le ferait parler deux fois. Les paliers
  // restent, ils disent autre chose.
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

/** Compteurs de malchance observés, par œuf. */
function luckOf(state: HatchTrackerState): LuckCounters {
  const out: LuckCounters = {};
  for (const [eggId, counters] of Object.entries(state?.counters ?? {})) {
    out[eggId] = { gold: Number(counters?.gold) || 0, rainbow: Number(counters?.rainbow) || 0 };
  }
  return out;
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

/* ------------------------------ cycle de vie ------------------------------ */

async function subscribe(): Promise<void> {
  const add = (unsub: unknown) => {
    if (typeof unsub === "function") unsubscribers.push(unsub as () => void);
  };

  try {
    add(await Atoms.data.weather.onChangeNow((next) => onWeather(next)));
  } catch {}
  try {
    prevStats = clone(StatsService.getSnapshot());
    add(StatsService.subscribe((next) => onStats(next)));
  } catch {}
  try {
    prevLuck = luckOf(HatchTracker.getState());
    add(HatchTracker.subscribe((state) => onHatchTracker(state)));
  } catch {}
  try {
    add(PetsService.onAbilityLogs((all) => onAbilityLogs(all as never)));
  } catch {}
  try {
    add(await NotifierService.onShopsChangeNow((next) => void onShops(next).catch(() => {})));
  } catch {}
  try {
    add(
      await Atoms.data.gardenTileObjects.onChangeNow((next) => {
        latestGarden = next;
      })
    );
  } catch {}
}

export function startReactionWatch(): void {
  if (running) return;
  running = true;

  openSession();
  void subscribe().catch(() => {});

  timers.push(
    window.setInterval(() => {
      try {
        checkGarden();
      } catch {}
      void drain().catch(() => {});
    }, DRAIN_MS),
    window.setInterval(() => {
      try {
        slowTick();
      } catch {}
    }, SLOW_TICK_MS)
  );
}

