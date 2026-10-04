// src/services/companion/wanderWatch.ts
// Donne un but à ses flâneries : aller voir un crop mûr, un Gold, un œuf.
//
// Tout ce qui décide vit dans `wanderInterest.ts`, pur et vérifié hors
// navigateur. Ici on ne fait que tenir le jardin à jour, fournir les noms du
// catalogue, et jouer la pose à l'arrivée.
//
// Le branchement sur la boucle passe par `CompanionService.setWanderHooks` :
// la boucle appelle `pickInterest` au moment exact où elle tire une nouvelle
// cible de flânerie, et `onInterestReached` quand il y est. La façade n'a donc
// pas à importer ce module.
//
// Aucun effet à l'import : rien ne tourne tant que `startWanderWatch()` n'est
// pas appelé.

import { eggCatalog, mutationCatalog, plantCatalog } from "../../data";
import { Atoms } from "../../store/atoms";
import { CompanionService } from ".";
import { readMySlotIdx } from "./anchors";
import { CompanionChat } from "./chat";
import type { WanderArea, WanderHooks, XY } from "./movement";
import { loadCompanionSettings } from "./state";
import { pickWanderInterest, shouldComment, type WanderInterest } from "./wanderInterest";

/** Le slot du joueur change avec la salle : on le relit de temps en temps. */
const SLOT_REFRESH_MS = 30_000;
/**
 * Au-delà, un centre d'intérêt choisi n'est plus celui vers lequel il marche :
 * la flânerie a été interrompue, et une arrivée tardive ne doit rien jouer.
 */
const PENDING_TTL_MS = 60_000;

let running = false;
let unsubscribers: Array<() => void> = [];
let timers: number[] = [];

let latestGarden: unknown = null;
let slotIdx: number | null = null;
let pending: { interest: WanderInterest; at: number } | null = null;
let lastCommentAt = 0;

/** Occupé à autre chose : une tâche, une question, une série d'actions. */
function busy(): boolean {
  if (!CompanionService.isRunning()) return true;
  if (CompanionService.isBusy()) return true;
  try {
    if (CompanionChat.isRunning() || CompanionChat.getProposal()) return true;
  } catch {}
  return false;
}

/* ------------------------------ catalogues ------------------------------ */
// Lus à chaque appel, jamais à l'import : au démarrage l'API n'a pas encore
// répondu, et une copie figée resterait celle du catalogue embarqué.

function rareMutations(): Set<string> {
  const out = new Set<string>();
  try {
    for (const [key, def] of Object.entries((mutationCatalog ?? {}) as Record<string, { baseChance?: unknown }>)) {
      if (Number(def?.baseChance) > 0) out.add(key);
    }
  } catch {}
  return out;
}

const spaced = (id: string) => id.replace(/([a-z])([A-Z])/g, "$1 $2");

function cropName(species: string): string {
  try {
    const entry = (plantCatalog as Record<string, any>)?.[species];
    const name = entry?.crop?.name ?? entry?.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {}
  return spaced(species);
}

function mutationName(mutation: string): string {
  try {
    const name = (mutationCatalog as Record<string, any>)?.[mutation]?.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {}
  return spaced(mutation);
}

function eggName(eggId: string): string {
  try {
    const name = (eggCatalog as Record<string, any>)?.[eggId]?.name;
    if (typeof name === "string" && name.trim()) return name.trim();
  } catch {}
  return spaced(eggId);
}

/* ------------------------------ crochets ------------------------------ */

/** Appelé par la boucle à chaque nouvelle cible de flânerie. Synchrone. */
function pickInterest(area: WanderArea): XY | null {
  pending = null;
  if (!running || busy()) return null;
  const slot = slotIdx;
  if (slot === null || !latestGarden) return null;

  const interest = pickWanderInterest({
    tileObjects: latestGarden,
    tileXY: (dirtTileIdx) => CompanionService.gardenTileXY(slot, dirtTileIdx),
    now: Date.now(),
    area,
    random: Math.random,
    rareMutations: rareMutations(),
    cropName,
    mutationName,
    eggName,
  });
  if (!interest) return null;
  pending = { interest, at: Date.now() };
  return interest.tile;
}

/** Il vient de s'arrêter à côté de ce qu'il était venu voir. */
function onInterestReached(tile: XY): void {
  const current = pending;
  pending = null;
  if (!current || !running) return;
  const { interest, at } = current;
  const now = Date.now();
  if (now - at > PENDING_TTL_MS) return;
  if (interest.tile.x !== tile.x || interest.tile.y !== tile.y) return;
  if (busy()) return;

  // Le jardin a pu changer en route : un crop cueilli entre-temps ne mérite
  // plus qu'on s'extasie devant la terre nue.
  const still = (latestGarden as Record<string, unknown> | null)?.[String(interest.dirtTileIdx)];
  if (!still || typeof still !== "object") return;

  let reactions = false;
  try {
    reactions = loadCompanionSettings().reactions;
  } catch {}

  const speak =
    reactions &&
    shouldComment({
      now,
      lastCommentAt,
      distanceToPlayer: CompanionService.distanceToPlayer(),
      busy: false,
      random: Math.random,
    });

  void (async () => {
    if (speak) {
      lastCommentAt = now;
      await CompanionService.say(interest.line);
    }
    // Juste après la bulle : la pose remplace la parole (cf. `emote.ts`).
    await CompanionService.emote(interest.emote);
  })().catch(() => {});
}

const hooks: WanderHooks = { pickInterest, onInterestReached };

/* ------------------------------ cycle de vie ------------------------------ */

async function refreshSlot(): Promise<void> {
  slotIdx = await readMySlotIdx();
}

async function subscribe(): Promise<void> {
  try {
    const unsub = await Atoms.data.gardenTileObjects.onChangeNow((next) => {
      latestGarden = next;
    });
    if (typeof unsub === "function") unsubscribers.push(unsub);
  } catch {}
}

export function startWanderWatch(): void {
  if (running) return;
  running = true;
  CompanionService.setWanderHooks(hooks);
  void subscribe().catch(() => {});
  void refreshSlot().catch(() => {});
  timers.push(
    window.setInterval(() => {
      void refreshSlot().catch(() => {});
    }, SLOT_REFRESH_MS)
  );
}

export function stopWanderWatch(): void {
  running = false;
  pending = null;
  try {
    CompanionService.setWanderHooks(null);
  } catch {}
  for (const id of timers) clearInterval(id);
  timers = [];
  for (const unsub of unsubscribers) {
    try {
      unsub();
    } catch {}
  }
  unsubscribers = [];
  latestGarden = null;
}
