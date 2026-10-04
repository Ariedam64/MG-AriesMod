// src/services/companion/afkWatch.ts
// Branche sur le jeu la veille d'absence du joueur (cf. `afk.ts`).
//
// Tout ce qui décide vit dans `afk.ts`, pur et vérifié hors navigateur. Ici on
// ne fait que relever les signes de vie du joueur, faire tourner l'horloge, et
// exécuter dans l'ordre ce que la machine demande.
//
// Signes de vie retenus :
//  - la position du joueur, à la tuile près (le ping de l'anti-AFK renvoie la
//    même tuile, il ne compte donc pas) ;
//  - les entrées réelles au clavier, à la souris et au toucher (`isTrusted` :
//    le battement synthétique de l'anti-AFK ne compte pas). Un joueur qui trie
//    son inventaire sans bouger est bien là ;
//  - le retour sur l'onglet.
//
// L'anti-AFK du mod force `document.hidden` à `false` et avale
// `visibilitychange` : quand il tourne, l'onglet passe pour toujours visible.
// Les ronflements continuent alors dans le vide, et le réveil attend le premier
// geste du joueur. Rien de cassé, juste moins fin.
//
// Aucun effet à l'import : rien ne tourne tant que `startAfkWatch()` n'est pas
// appelé.

import { Atoms } from "../../store/atoms";
import { CompanionService } from ".";
import { CompanionChat } from "./chat";
import {
  afkActivity,
  afkReset,
  afkTick,
  initialAfkState,
  type AfkEffect,
  type AfkPhase,
  type AfkState,
  type AfkStep,
} from "./afk";
import { loadCompanionSettings } from "./state";

/** Cadence de l'horloge. Les seuils se comptent en minutes : inutile d'aller plus vite. */
const TICK_MS = 5_000;
/** En `active`, un signe de vie par seconde suffit : `pointermove` en envoie des dizaines. */
const ACTIVITY_THROTTLE_MS = 1_000;
/** Une réplique dite sans venir n'est dite que s'il est assez près pour qu'on la lise. */
const NEAR_DISTANCE = 8;

const INPUT_EVENTS = ["keydown", "pointerdown", "pointermove", "wheel", "touchstart"] as const;

let running = false;
/** Change à chaque démarrage : un abonnement qui arrive après un arrêt se défait aussitôt. */
let generation = 0;
let state: AfkState = initialAfkState(0);
let timer: number | null = null;
let unsubscribers: Array<() => void> = [];
/** L'attention posée pour dormir est la nôtre : on ne relâche que celle-là. */
let ownHold = false;
/** Effets en file : tant qu'il y en a, l'horloge attend (nos propres trajets ne sont pas une interruption). */
let pending = 0;
let chain: Promise<void> = Promise.resolve();
let lastNotedAt = 0;
let lastTile: { x: number; y: number } | null = null;

function enabled(): boolean {
  try {
    const settings = loadCompanionSettings();
    return settings.enabled && settings.reactions;
  } catch {
    return false;
  }
}

function isHidden(): boolean {
  try {
    return typeof document !== "undefined" && document.hidden === true;
  } catch {
    return false;
  }
}

function chatActive(): boolean {
  try {
    return CompanionChat.isRunning() || CompanionChat.getProposal() !== null;
  } catch {
    return false;
  }
}

/**
 * Occupé par quelqu'un d'autre que nous.
 *
 * L'attention qu'on pose pour dormir rend `isBusy()` vrai en permanence : tant
 * qu'on la tient, on ne regarde donc que le chat, et si l'attention a disparu,
 * c'est que quelqu'un d'autre l'a reprise. Une tâche lancée par un autre module
 * pendant son sommeil reste invisible d'ici, mais ce cas n'existe pas
 * aujourd'hui : les réactions attendent qu'il soit libre, et les séries
 * d'actions passent par le chat.
 */
function othersBusy(): boolean {
  if (!CompanionService.isRunning()) return true;
  if (chatActive()) return true;
  if (ownHold) return !CompanionService.isHoldingAttention();
  return CompanionService.isBusy();
}

function releaseOwnHold(): void {
  if (!ownHold) return;
  ownHold = false;
  // Si le chat a pris la main entre-temps, l'attention est désormais la sienne.
  if (chatActive()) return;
  if (CompanionService.isHoldingAttention()) CompanionService.releaseAttention();
}

async function sayLine(effect: Extract<AfkEffect, { kind: "say" }>): Promise<void> {
  if (!CompanionService.isRunning() || othersBusy() || isHidden()) return;
  if (effect.approach) {
    try {
      await CompanionService.comeToPlayer();
      if (!running) return;
      await CompanionService.say(effect.message, { force: true });
    } finally {
      CompanionService.releaseTask();
    }
  } else {
    const distance = CompanionService.distanceToPlayer();
    if (distance === null || distance > NEAR_DISTANCE) return;
    await CompanionService.say(effect.message, { force: true });
  }
  if (effect.emote !== null) void CompanionService.emote(effect.emote).catch(() => {});
}

async function perform(effect: AfkEffect, gen: number): Promise<void> {
  if (effect.kind === "release") {
    releaseOwnHold();
    return;
  }
  if (!running || gen !== generation) return;
  if (effect.kind === "hold") {
    if (!CompanionService.isRunning()) return;
    CompanionService.holdAttention();
    ownHold = true;
    return;
  }
  await sayLine(effect);
}

function apply(step: AfkStep): void {
  state = step.state;
  const gen = generation;
  for (const effect of step.effects) {
    pending++;
    chain = chain
      .then(() => perform(effect, gen))
      .catch(() => {})
      .finally(() => {
        pending--;
      });
  }
}

function tick(): void {
  if (!running) return;
  const now = Date.now();
  // Rangé ou réglage coupé : on repart de zéro, l'horloge reprendra au retour.
  if (!enabled() || !CompanionService.isRunning()) {
    apply(afkReset(state, now));
    return;
  }
  if (pending > 0) return;
  apply(afkTick(state, { now, busy: othersBusy(), hidden: isHidden() }, Math.random));
}

function noteActivity(): void {
  if (!running) return;
  const now = Date.now();
  if (state.phase === "active" && now - lastNotedAt < ACTIVITY_THROTTLE_MS) return;
  lastNotedAt = now;
  // Rangé ou coupé : l'horloge s'en charge au prochain pas.
  if (!enabled() || !CompanionService.isRunning()) return;
  apply(afkActivity(state, { now, busy: othersBusy() }, Math.random));
}

function onInput(event: Event): void {
  if (!event.isTrusted) return;
  noteActivity();
}

function onVisibility(): void {
  if (!isHidden()) noteActivity();
}

function onPosition(next: unknown): void {
  const pos = next as { x?: unknown; y?: unknown } | null | undefined;
  const x = Math.round(Number(pos?.x));
  const y = Math.round(Number(pos?.y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const prev = lastTile;
  lastTile = { x, y };
  if (prev && (prev.x !== x || prev.y !== y)) noteActivity();
}

async function subscribe(gen: number): Promise<void> {
  try {
    const unsub = await Atoms.player.position.onChangeNow((next) => onPosition(next));
    if (gen !== generation || !running) unsub();
    else unsubscribers.push(unsub);
  } catch {}
}

/** Phase courante, `active` quand la veille ne tourne pas. */
export function getAfkPhase(): AfkPhase {
  return running ? state.phase : "active";
}

/**
 * Réveil sans un mot, demandé de l'extérieur : une réaction importante qui doit
 * passer, par exemple. Remet aussi l'horloge d'absence à zéro.
 */
export function wakeCompanion(): void {
  if (!running) return;
  apply(afkReset(state, Date.now()));
}

export function startAfkWatch(): void {
  if (running) return;
  running = true;
  const gen = ++generation;
  state = initialAfkState(Date.now());
  lastNotedAt = 0;
  lastTile = null;

  try {
    for (const type of INPUT_EVENTS) window.addEventListener(type, onInput, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    unsubscribers.push(() => {
      for (const type of INPUT_EVENTS) window.removeEventListener(type, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
    });
  } catch {}
  void subscribe(gen).catch(() => {});

  timer = window.setInterval(() => {
    try {
      tick();
    } catch {}
  }, TICK_MS);
}

export function stopAfkWatch(): void {
  if (!running) return;
  running = false;
  generation++;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  for (const unsub of unsubscribers) {
    try {
      unsub();
    } catch {}
  }
  unsubscribers = [];
  // Il ne doit pas rester planté à côté du joueur une fois la veille coupée.
  releaseOwnHold();
  state = initialAfkState(Date.now());
}
