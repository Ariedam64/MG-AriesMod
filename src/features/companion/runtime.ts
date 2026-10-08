// The companion while he is out: the NPC he borrows, where he stands, what
// he is doing. `null` while he is put away.
//
// Settings are not copied here: every reader asks `loadCompanionSettings()`,
// so a write from anywhere is seen at once.

import type { Subscriptions } from "../../lib/emitter";
import type { CompanionMode } from "./anchors";
import type { ContextualLine, DialogueState } from "./dialogue";
import type { CompanionMap } from "./map";
import type { MovementState, XY } from "./movement";

export type Runtime = {
  npcId: string;
  map: CompanionMap | null;
  movement: MovementState;
  player: XY | null;
  /** Timers and store subscriptions, all undone when he is put away. */
  subscriptions: Subscriptions;
  lastBubbleAt: number;
  /** The last position the game really read for our NPC. */
  observedTile: XY | null;
  /** Since when the render receipt has been awaited. `null` when it is not. */
  waitingSinceMs: number | null;
  /** The mode really applied: differs from the setting when it fell back. */
  effectiveMode: CompanionMode;
  dialogue: DialogueState;
  /**
   * Contextual lines worked out ahead of time. The dialogue hook is
   * synchronous while reading the game is not, so they are collected in
   * advance and picking stays instant at Talk time.
   */
  contextualCache: ContextualLine[];
  /**
   * A tile set by a running task, overriding the mode.
   *
   * He goes there and stays until the task is released: a harvest sends him
   * to each crop before sending the command.
   */
  task: XY | null;
  /**
   * He is waiting on an answer, so he stays by the player.
   *
   * He asked a question out loud; wandering back to the garden before it is
   * answered would look like he lost interest. Beats the mode, but gives way
   * to a task: a precise order is stronger than waiting.
   */
  attention: boolean;
  /** When he was last talked to, to notice being clicked on over and over. */
  talkTimes: number[];
};

let current: Runtime | null = null;

export function currentRuntime(): Runtime | null {
  return current;
}

export function setRuntime(next: Runtime | null): void {
  current = next;
}
