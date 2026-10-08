// The loop every companion batch runs: harvesting, planting, hatching, selling
// and feeding.
//
// The bug pinned here: each run swapped in a work team and sent the companion
// walking, then released both after its loop. Nothing guarded the loop, so
// when an action threw halfway (a socket that dropped, for one), the player
// was left wearing the work team and the companion stayed planted on the last
// tile. The crew must be dismissed whatever happens.
//
// Run with: npm run check:batch

import { runSteps, type BatchReporter, type Crew } from "../src/features/companion/chat/batch";
import type { Walker } from "../src/features/companion/chat/walk";

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`);
}

const idleWalker: Walker = {
  async toGardenTile() {},
  async toPosition() {},
  async toBuilding() {
    return false;
  },
  release() {},
  walking: false,
};

function harness(options: { stopAfter?: number } = {}) {
  const lines: string[] = [];
  const progress: string[] = [];
  let dismissed = 0;
  let handled = 0;
  const reporter: BatchReporter = {
    say: (_kind, text) => void lines.push(text),
    stopped: () => options.stopAfter !== undefined && handled >= options.stopAfter,
    progress: (done, total) => void progress.push(`${done}/${total}`),
  };
  const hire = async (): Promise<Crew> => ({
    walker: idleWalker,
    dismiss: async () => {
      dismissed++;
    },
  });
  return {
    reporter,
    hire,
    lines,
    progress,
    dismissed: () => dismissed,
    handle: () => {
      handled++;
    },
  };
}

async function main(): Promise<void> {
  {
    const h = harness();
    let thrown: unknown = null;
    try {
      await runSteps({
        items: [1, 2, 3],
        reporter: h.reporter,
        hire: h.hire,
        async step(item) {
          if (item === 2) throw new Error("socket closed");
          h.handle();
        },
      });
    } catch (error) {
      thrown = error;
    }
    check("an action that throws still ends the batch with an error", (thrown as Error | null)?.message, "socket closed");
    check("and the team and the walker are given back", h.dismissed(), 1);
  }

  {
    const h = harness();
    const outcome = await runSteps({
      items: Array.from({ length: 12 }, (_, i) => i),
      reporter: h.reporter,
      hire: h.hire,
      async step() {
        h.handle();
      },
      progressNote: (done, total) => `${done} of ${total}`,
    });
    check("a full batch handles every item", outcome, { done: 12, cancelled: false });
    check("progress is reported after each item", h.progress.length, 12);
    check("a progress line is posted every ten items, not at the end", h.lines, ["10 of 12"]);
    check("the crew is dismissed once", h.dismissed(), 1);
  }

  {
    const h = harness({ stopAfter: 2 });
    const outcome = await runSteps({
      items: [1, 2, 3, 4],
      reporter: h.reporter,
      hire: h.hire,
      async step() {
        h.handle();
      },
    });
    check("a stop is honoured before the next item", outcome, { done: 2, cancelled: true });
    check("a stopped batch dismisses the crew too", h.dismissed(), 1);
  }

  {
    const h = harness();
    const outcome = await runSteps({
      items: [1, 2, 3],
      reporter: h.reporter,
      hire: h.hire,
      async step(item) {
        if (item === 2) return "halt";
        h.handle();
      },
    });
    check("a step can end the batch without counting", outcome, { done: 1, cancelled: false });
  }
}

main()
  .catch((error) => {
    failures += 1;
    console.error("FAIL the check threw", error);
  })
  .finally(() => {
    if (failures) {
      console.error(`\n${failures} check(s) failed`);
      process.exit(1);
    }
    console.log("\nall batch checks passed");
  });
