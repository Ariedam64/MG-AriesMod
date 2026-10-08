// src/services/companion/emoteMirrorWatch.ts
// Branche sur le jeu la réponse du companion aux emotes du joueur.
//
// Tout ce qui décide vit dans `emoteMirror.ts`, pur et vérifié hors
// navigateur. Ici on ne fait que s'abonner à l'état de room et à l'id du
// joueur, garder le relevé, et jouer ce qui a été décidé.
//
// La veille lit `stateAtom` et non `emoteSourceAtom` : c'est la même liste
// d'entrées (bundle 1400, `emoteSourceAtom` lit `roomPublicationAtom.state`,
// dont `stateAtom` est la vue), mais sans le patch que `emote.ts` pose sur la
// source des emotes pour faire poser notre PNJ.
//
// La veille tourne même quand le companion est rangé ou ses réactions
// coupées : le relevé reste à jour, et une emote jouée avant qu'il ne revienne
// n'est jamais prise pour une neuve. Il ne répond simplement pas.
//
// Aucun effet à l'import : rien ne tourne tant que `startEmoteMirror()` n'est
// pas appelé.

import { Atoms } from "../../store/atoms";
import { CompanionService } from ".";
import { CompanionChat } from "./chat";
import {
  decideMirror,
  initialMirrorState,
  latestOwnEmote,
  observeOwnEmote,
  type MirrorAction,
  type MirrorRead,
  type MirrorState,
} from "./emoteMirror";
import { loadCompanionSettings } from "./state";

let running = false;
/** Change à chaque arrêt : un abonnement résolu après coup sait qu'il est périmé. */
let generation = 0;
let unsubscribers: Array<() => void> = [];
let state: MirrorState = initialMirrorState();
let pending: number | null = null;

let localId: string | null = null;
let roomId: string | null = null;
let entries: unknown = undefined;

function enabled(): boolean {
  try {
    const settings = loadCompanionSettings();
    return settings.enabled && settings.reactions;
  } catch {
    return false;
  }
}

/** Occupé à autre chose : une tâche, une question, une série d'actions. Cf. `reactionWatch.ts`. */
function busy(): boolean {
  if (!CompanionService.isRunning()) return true;
  if (CompanionService.isBusy()) return true;
  try {
    if (CompanionChat.isRunning() || CompanionChat.getProposal()) return true;
  } catch {}
  return false;
}

function cancelPending(): void {
  if (pending === null) return;
  window.clearTimeout(pending);
  pending = null;
}

async function perform(action: MirrorAction): Promise<void> {
  // Le délai a pu suffire à ce qu'il soit pris par autre chose.
  if (!running || !enabled() || busy()) return;
  if (action.line) {
    try {
      await CompanionService.say(action.line);
    } catch {}
  }
  // Tout de suite après la bulle : la pose remplace la parole (cf. `emote.ts`).
  if (action.kind === "mirror") await CompanionService.emote(action.emote);
}

function schedule(action: MirrorAction): void {
  cancelPending();
  pending = window.setTimeout(() => {
    pending = null;
    void perform(action).catch(() => {});
  }, action.delayMs);
}

function currentRead(): MirrorRead {
  if (!localId || !Array.isArray(entries)) return null;
  const npcId = CompanionService.getNpcId();
  return {
    scope: `${roomId ?? ""}|${localId}`,
    latest: latestOwnEmote(entries, localId, npcId ? [npcId] : []),
  };
}

function process(): void {
  const seen = observeOwnEmote(state, currentRead());
  state = seen.state;
  if (!seen.fresh) return;
  const decided = decideMirror(state, seen.fresh, {
    now: Date.now(),
    available: enabled() && !busy(),
    distance: CompanionService.distanceToPlayer(),
    random: Math.random,
  });
  state = decided.state;
  if (decided.action) schedule(decided.action);
}

function onRoomState(next: unknown): void {
  const data = (next as { data?: { roomId?: unknown; chat?: { entries?: unknown } } } | null)?.data;
  roomId = typeof data?.roomId === "string" ? data.roomId : null;
  entries = data?.chat?.entries;
  process();
}

function onPlayerId(next: unknown): void {
  localId = typeof next === "string" && next ? next : null;
  process();
}

/** L'état de room change à chaque patch : on ne relit que quand le chat ou la room changent. */
function sameChat(a: unknown, b: unknown): boolean {
  const da = (a as { data?: any } | null)?.data;
  const db = (b as { data?: any } | null)?.data;
  return da?.roomId === db?.roomId && da?.chat?.entries === db?.chat?.entries;
}

async function subscribe(gen: number): Promise<void> {
  const add = (unsub: unknown) => {
    if (typeof unsub !== "function") return;
    // Arrêtée (ou relancée) pendant l'attente de l'abonnement : on le rend tout de suite.
    if (!running || gen !== generation) {
      try {
        (unsub as () => void)();
      } catch {}
      return;
    }
    unsubscribers.push(unsub as () => void);
  };

  try {
    add(await Atoms.player.playerId.onChangeNow((next) => {
      if (gen === generation) onPlayerId(next);
    }));
  } catch {}
  try {
    add(await Atoms.root.state.onChangeNow((next) => {
      if (gen === generation) onRoomState(next);
    }, sameChat));
  } catch {}
}

export function startEmoteMirror(): void {
  if (running) return;
  running = true;
  state = initialMirrorState();
  localId = null;
  roomId = null;
  entries = undefined;
  void subscribe(++generation).catch(() => {});
}

