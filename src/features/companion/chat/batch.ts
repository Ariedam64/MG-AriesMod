// What every batch of actions shares: its pace, its loop, and how it reports.
//
// Each command's run lives in its own `*Run.ts`, but they all talk to the chat
// the same way, so the facade never needs to know their details.

import { sleep } from "../../../lib/async";
import type { BubbleLine } from "./bubbleTags";
import type { Walker } from "./walk";

/** What a running batch can tell the chat, and ask it. */
export type BatchReporter = {
  /**
   * `spoken` is the bubble's version, when it deserves an icon.
   *
   * The menu thread renders plain text and would show the `<0/>` markup as is,
   * so both say the same thing, the bubble shorter and with pictures.
   */
  say(kind: "reply" | "system" | "report", text: string, spoken?: BubbleLine, force?: boolean): void;
  /** True once the player asked the running batch to stop. */
  stopped(): boolean;
  progress(done: number, total: number): void;
};

/**
 * Minimum gap between two commands: the server is not machine-gunned.
 *
 * A floor, not an addition (see `pacer`). Deliberately wider than the mod's
 * other automations, which have run at 100 ms for a long time without the
 * server minding: the companion gains nothing by hurrying, and the margin
 * absorbs unusual latency without ever losing a command.
 */
const ACTION_DELAY_MS = 400;

/** Time left to the server to publish its state before it is read again. */
export const SETTLE_MS = 700;

/** How often a progress line is posted, in actions. */
const PROGRESS_EVERY = 10;

export type Pacer = {
  /** Call right after sending a command. */
  mark(): void;
  /** Waits for whatever is missing from the gap. Call right before sending. */
  wait(): Promise<void>;
};

/**
 * A batch's pace: keeps the gap without paying it twice.
 *
 * Sleeping `ACTION_DELAY_MS` after every action added the wait to the walk.
 * But he already walks to the next tile, and that spaces the commands out just
 * as well as a sleep. So the real gap since the last command is measured and
 * only the shortfall is waited for: in a garden where crops sit side by side
 * the wait often drops to zero without the floor ever being broken.
 */
function pacer(minGapMs = ACTION_DELAY_MS): Pacer {
  let lastAt = 0;
  return {
    mark(): void {
      lastAt = Date.now();
    },
    async wait(): Promise<void> {
      const missing = minGapMs - (Date.now() - lastAt);
      if (missing > 0) await sleep(missing);
    },
  };
}

/** What a batch borrows while it runs: the walking companion, and maybe a team. */
export type Crew = {
  walker: Walker;
  /** Frees the companion and gives the player's team back. */
  dismiss(): Promise<void>;
};

export type BatchSteps<T> = {
  items: readonly T[];
  reporter: BatchReporter;
  /** Readies the crew. Whatever happens next, a step that throws included, it is dismissed. */
  hire(): Promise<Crew>;
  /** Handles one item. "halt" ends the batch before this item counts. */
  step(item: T, walker: Walker, pace: Pacer): Promise<void | "halt">;
  /** The line posted every few items, when the batch has one. */
  progressNote?(done: number, total: number): string;
};

export type BatchOutcome = {
  /** Items handled. */
  done: number;
  /** The player stopped the batch before it reached the end. */
  cancelled: boolean;
};

/**
 * Runs a batch item by item: checks for a stop before each one, reports the
 * progress after it, and dismisses the crew at the end.
 */
export async function runSteps<T>(batch: BatchSteps<T>): Promise<BatchOutcome> {
  const { items, reporter } = batch;
  const crew = await batch.hire();
  const pace = pacer();
  let done = 0;
  let cancelled = false;

  try {
    for (const item of items) {
      if (reporter.stopped()) {
        cancelled = true;
        break;
      }
      if ((await batch.step(item, crew.walker, pace)) === "halt") break;
      done++;
      reporter.progress(done, items.length);
      if (batch.progressNote && done % PROGRESS_EVERY === 0 && done < items.length) {
        reporter.say("system", batch.progressNote(done, items.length));
      }
    }
  } finally {
    // Otherwise an action that throws leaves the player in the work team and
    // the companion planted on the last tile.
    await crew.dismiss();
  }

  return { done, cancelled };
}
