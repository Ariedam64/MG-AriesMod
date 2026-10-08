// The chat's state: the thread, the open question, and the running batch.
//
// Every command (`commands/*.ts`) asks its question through `ask` and runs its
// batch through `runBatch`; the facade in `index.ts` answers the player. What
// keeps the mod within its rules lives in `proposals.ts`: nothing runs without
// a fresh human confirmation, and the run covers exactly what was proposed.

import { Emitter, type Unsubscribe } from "../../../lib/emitter";
import { CompanionService } from "..";
import { EmoteType } from "../emoteTypes";
import { MAX_LINE_LENGTH } from "../settingsShape";
import { attendToQuestion } from "./attend";
import type { BatchReporter } from "./batch";
import { forGame, type BubbleLine } from "./bubbleTags";
import { append, clearProposal, emptyLog, type ChatAuthor, type ChatKind, type ChatLog } from "./log";
import { isExpired, type Proposal } from "./proposals";

export type RunProgress = { done: number; total: number };

/** Runs one batch and hands back whether the player stopped it. */
type RunBatch = (run: (reporter: BatchReporter) => Promise<unknown>) => Promise<boolean>;

/**
 * One thing the companion can do, from its question to its batch.
 *
 * `R` is what a request carries (a way to read the game again, sometimes
 * rules), `C` is what the question captured on top of it. The batch that runs
 * is always the captured one, never a fresh reading: it is what the player saw
 * and said yes to.
 */
export type ChatCommand<R, C extends R> = {
  id: string;
  /** What the player says when accepting. */
  acceptance: string;
  /** Reads the game and asks. Called again, with the captured scope, when a confirmation is refused. */
  propose(request: R): Promise<void>;
  /** The scope's signature as the game stands now. */
  signature(captured: C): Promise<string>;
  /** Runs the captured batch, then whatever question follows it. */
  execute(captured: C, run: RunBatch): Promise<void>;
};

/** What the player asked for, ready to become a question. */
export type ChatRequest = {
  /** The player's side of the thread: what they asked, not what they will get. */
  label: string;
  propose(): Promise<void>;
};

/** The question a command asks, and the scope it identifies. */
export type Question = {
  summary: string;
  size: number;
  signature: string;
  text: string;
  bubble?: BubbleLine;
  thread?: BubbleLine;
};

/** The command waiting on an answer, bound to the scope it captured. */
export type Held = {
  command: unknown;
  captured: unknown;
  acceptance: string;
  signature(): Promise<string>;
  repropose(): Promise<void>;
  execute(run: RunBatch): Promise<void>;
};

type State = {
  log: ChatLog;
  proposal: Proposal | null;
  held: Held | null;
  run: RunProgress | null;
  cancelRequested: boolean;
};

let state: State = { log: emptyLog(), proposal: null, held: null, run: null, cancelRequested: false };
const changes = new Emitter();
let nextProposalSeq = 1;

export function chatState(): Readonly<State> {
  return state;
}

export function onChatChange(listener: () => void): Unsubscribe {
  return changes.on(listener);
}

function notify(): void {
  changes.emit();
}

/**
 * The bubble version of a thread message.
 *
 * What he says in the thread he also says out loud, since the menu is not
 * always open. A bubble holds one line, so plain text is cut; tagged lines are
 * written short by hand and never cut, since cutting inside `<0/>` would leave
 * the game looking for a tag that is gone. `say` drops whatever comes too soon
 * after the previous bubble, so a burst of progress does not flicker.
 */
function speak(line: BubbleLine, force = false): void {
  // Measured on what the game can draw: dropping a tag shortens the line.
  const spoken = forGame(line);
  const message =
    !spoken.tags && spoken.message.length > MAX_LINE_LENGTH
      ? `${spoken.message.slice(0, MAX_LINE_LENGTH - 1).trimEnd()}…`
      : spoken.message;
  void CompanionService.say(message, { tags: spoken.tags, force }).catch(() => {});
}

export type Illustrated = {
  /** The illustrated line, the same on both sides unless `thread` says otherwise. */
  bubble?: BubbleLine;
  /**
   * A version for the thread only, when it has more room: it can name every
   * pet in a list and give each its sprite, where the bubble would not fit.
   */
  thread?: BubbleLine;
  /**
   * Skips the bubble's burst guard, for announcements that must each be
   * heard: hatches, for one, come faster than the minimum gap between bubbles.
   */
  force?: boolean;
};

/**
 * Writes to the thread and makes the companion speak.
 *
 * `bubble` is for lines that deserve better than the thread's text: it may
 * carry game icons the thread could not render (it would show the `<0/>`
 * markup as is).
 */
export function post(from: ChatAuthor, kind: ChatKind, text: string, proposalId?: string, extra: Illustrated = {}): void {
  const shown = extra.thread ?? extra.bubble;
  state = {
    ...state,
    log: append(state.log, {
      from,
      kind,
      text: shown?.message ?? text,
      atMs: Date.now(),
      proposalId,
      icons: shown?.tags ? Object.values(shown.tags) : undefined,
      // The thread only places an icon where it goes when it has the markup.
      positioned: shown !== undefined,
    }),
  };
  // A bubble carrying a question always goes through: it waits for an
  // answer, and being swallowed by the note before it would hide it.
  const insist = extra.force ?? proposalId !== undefined;
  if (from === "companion") {
    speak(extra.bubble ?? { message: text }, insist);
    if (proposalId !== undefined) {
      // He comes to ask in person: a bubble from across the garden would be
      // off screen, and nobody would read it.
      void attendToQuestion(proposalId).catch(() => {});
      // The questioning pose waits until he stands still (see `emoteWhenStill`).
      void CompanionService.emoteWhenStill(EmoteType.Questioning).catch(() => {});
    }
  }
  notify();
}

/** Opens the question for a command, holding the scope it captured. */
export function ask<R, C extends R>(command: ChatCommand<R, C>, captured: C, question: Question): void {
  const proposal: Proposal = {
    id: `p${nextProposalSeq++}`,
    commandId: command.id,
    summary: question.summary,
    size: question.size,
    signature: question.signature,
    createdAtMs: Date.now(),
  };
  const held: Held = {
    command,
    captured,
    acceptance: command.acceptance,
    signature: () => command.signature(captured),
    repropose: () => command.propose(captured),
    execute: (run) => command.execute(captured, run),
  };
  state = { ...state, proposal, held };
  post("companion", "reply", question.text, proposal.id, { bubble: question.bubble, thread: question.thread });
}

/** The scope `command` captured, when its question is the one open. */
export function heldFor<R, C extends R>(command: ChatCommand<R, C>): C | null {
  return state.held?.command === command ? (state.held.captured as C) : null;
}

/** Closes the open question, if it is `proposalId`, without running anything. */
export function closeProposal(proposalId: string): void {
  if (state.proposal?.id !== proposalId) return;
  state = { ...state, proposal: null, held: null, log: clearProposal(state.log, proposalId) };
  notify();
}

/**
 * Drops a question it is too late to answer.
 *
 * Otherwise a forgotten proposal stays open forever: the hunger watch holds
 * back while a question waits, so the companion stopped warning about hungry
 * pets after the first question nobody answered.
 */
export function dropStaleProposal(): void {
  const proposal = state.proposal;
  if (proposal && isExpired(proposal, Date.now())) closeProposal(proposal.id);
}

function reporter(): BatchReporter {
  return {
    say: (kind, text, spoken, force) => post("companion", kind, text, undefined, { bubble: spoken, force }),
    stopped: () => state.cancelRequested,
    progress: (done, total) => {
      state = { ...state, run: { done, total } };
      notify();
    },
  };
}

/**
 * Runs the batch for a confirmed proposal, and hands control back afterwards
 * whatever the outcome.
 *
 * The final notify matters: a batch's last message goes out while it still
 * runs, so the bar was last drawn with the batch in progress. Without this
 * wake-up it stayed on "Working on it" until something else redrew it.
 */
export async function runConfirmed(proposalId: string, held: Held, total: number): Promise<void> {
  state = {
    ...state,
    proposal: null,
    held: null,
    run: { done: 0, total },
    cancelRequested: false,
    log: clearProposal(state.log, proposalId),
  };

  await held.execute(async (run) => {
    let stopped = false;
    try {
      await run(reporter());
    } finally {
      // Read BEFORE the reset: it is the only moment the caller can still
      // learn the player said stop, and that decides whether it may chain a
      // follow-up question.
      stopped = state.cancelRequested;
      state = { ...state, run: null, cancelRequested: false };
      notify();
    }
    return stopped;
  });
}

/** Asks the running batch to stop. */
export function requestStop(): void {
  if (!state.run) return;
  state = { ...state, cancelRequested: true };
  notify();
}
