// Bringing the companion out and putting him away.
//
// Nothing starts at import. Start wires the movement loop to the state
// injection; stop undoes every timer and subscription and gives the game its
// NPC back. Both are safe to call more than once.

import { Subscriptions } from "../../lib/emitter";
import { Atoms } from "../../game/store/atoms";
import { makeAtom } from "../../game/store/hub";
import { initialDialogueState } from "./dialogue";
import { stopEmote } from "./emote";
import { playerTileFeed, roundTile } from "./feeds";
import { disposeInjection, hideCompanion, installInjection, listNpcIdentities } from "./injection";
import { onMapChange, readCompanionMap } from "./map";
import { stepCompanion } from "./motion";
import { STEP_INTERVAL_MS, initialMovementState, type XY } from "./movement";
import { currentRuntime, setRuntime, type Runtime } from "./runtime";
import { installSpeechRewriter, uninstallSpeechRewriter } from "./speech";
import { loadCompanionSettings } from "./state";
import { refreshContextual, resolveSpeech } from "./talk";

/** How often the contextual lines are collected again. */
const CONTEXTUAL_REFRESH_MS = 10_000;

/** What the avatar layer really reads: serves as the render receipt. */
const npcQuinoaUsers = makeAtom<Array<{ playerId: string; position?: XY | null }>>("npcQuinoaUsersAtom");

let starting: Promise<boolean> | null = null;

/**
 * Picks the NPC to borrow.
 *
 * An absent NPC is preferred (an out-of-season weather merchant): the
 * companion then overlaps nobody. Failing that, the first of the roster; the
 * injection takes priority, so it still works.
 */
async function resolveNpcId(preferred: string | null): Promise<string | null> {
  const roster = await listNpcIdentities();
  if (roster.length === 0) return preferred;
  if (preferred && roster.some((n) => n.playerId === preferred)) return preferred;
  return (roster.find((n) => !n.present) ?? roster[0]).playerId;
}

function every(subscriptions: Subscriptions, ms: number, run: () => Promise<void>): void {
  const id = window.setInterval(() => void run().catch(() => {}), ms);
  subscriptions.add(() => clearInterval(id));
}

async function startInternal(): Promise<boolean> {
  if (currentRuntime()) return true;

  const settings = loadCompanionSettings();
  const npcId = await resolveNpcId(settings.npcId);
  if (!npcId) return false;

  const map = await readCompanionMap();
  const player = roundTile(await Atoms.player.position.get().catch(() => null));

  const rt: Runtime = {
    npcId,
    map,
    movement: initialMovementState(),
    player,
    subscriptions: new Subscriptions(),
    lastBubbleAt: 0,
    observedTile: null,
    waitingSinceMs: null,
    effectiveMode: settings.mode,
    dialogue: initialDialogueState(),
    contextualCache: [],
    task: null,
    attention: false,
    talkTimes: [],
  };
  setRuntime(rt);

  await installInjection();
  installSpeechRewriter(npcId, resolveSpeech);
  void refreshContextual().catch(() => {});
  every(rt.subscriptions, CONTEXTUAL_REFRESH_MS, refreshContextual);

  // The player's tile drives following; the map changes with every room.
  rt.subscriptions.add(
    playerTileFeed.on((tile) => {
      rt.player = tile;
    }),
  );
  // Render receipt: the avatar layer reads this atom, so seeing it change
  // proves the injected position made it all the way to the screen.
  rt.subscriptions.add(
    npcQuinoaUsers
      .onChangeNow((entries) => {
        const entry = Array.isArray(entries) ? entries.find((e) => e?.playerId === rt.npcId) : null;
        const tile = roundTile(entry?.position ?? null);
        if (tile) rt.observedTile = tile;
      })
      .catch(() => undefined),
  );
  rt.subscriptions.add(
    onMapChange((next) => {
      rt.map = next;
      // A new map: the old position means nothing there, so he spawns again.
      rt.movement = initialMovementState();
      rt.observedTile = null;
      rt.waitingSinceMs = null;
    }),
  );

  every(rt.subscriptions, STEP_INTERVAL_MS, stepCompanion);
  return true;
}

/** Brings him out. Idempotent, concurrent calls included. */
export function startRuntime(): Promise<boolean> {
  if (currentRuntime()) return Promise.resolve(true);
  if (!starting) {
    starting = startInternal().finally(() => {
      starting = null;
    });
  }
  return starting;
}

/** Puts him away and restores the game's atoms. Safe to call more than once. */
export async function stopRuntime(): Promise<void> {
  const rt = currentRuntime();
  setRuntime(null);
  uninstallSpeechRewriter();
  // Before anything else: a pose in progress would outlive the companion and
  // freeze the NPC it borrowed.
  await stopEmote();
  if (rt) {
    rt.subscriptions.dispose();
    await hideCompanion();
  }
  await disposeInjection();
}
