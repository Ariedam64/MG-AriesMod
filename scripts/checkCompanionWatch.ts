// The companion's watches: the shared start/stop helper, and the clocks that
// keep the AFK and hunger watches going.
//
// Two regressions are pinned here. The AFK watch lost its clock when its
// unused `stop` was deleted (the interval id was only read there, so the
// interval went with it): the companion never asked whether the player was
// still there and never dozed off. The hunger watch lost its 30 second poll
// the same way.
//
// Run with: npm run check:watch

import { defineWatcher } from "../src/features/companion/watch";
import { CompanionService } from "../src/features/companion";
import { CompanionChat } from "../src/features/companion/chat";
import { patchCompanionSettings } from "../src/features/companion/state";
import { AFK_IDLE_AFTER_MS, IDLE_LINES } from "../src/features/companion/afk";

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

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/* ------------------------------ fake timers ------------------------------ */

type Interval = { ms: number; run: () => void; cleared: boolean };
const intervals: Interval[] = [];
const realSetInterval = globalThis.setInterval;
(globalThis as any).setInterval = (run: () => void, ms: number) => {
  const entry: Interval = { ms, run, cleared: false };
  intervals.push(entry);
  return entry;
};
(globalThis as any).clearInterval = (entry: Interval) => {
  if (entry && typeof entry === "object") entry.cleared = true;
};
const tickAll = (ms: number) => {
  for (const entry of intervals) if (entry.ms === ms && !entry.cleared) entry.run();
};

let now = 1_000_000;
Date.now = () => now;

async function main(): Promise<void> {
  /* ------------------------------ the helper ------------------------------ */

  {
    let resolveLate!: (off: () => void) => void;
    let lateUndone = 0;
    let liveCalls = 0;
    let ticks = 0;
    let fire: (() => void) | null = null;

    const watcher = defineWatcher("probe", (scope) => {
      scope.add(new Promise<() => void>((resolve) => (resolveLate = resolve)));
      fire = scope.live(() => liveCalls++);
      scope.every(1234, () => ticks++);
    });

    watcher.start();
    watcher.start();
    check("starting twice runs the setup once", intervals.filter((i) => i.ms === 1234).length, 1);
    tickAll(1234);
    check("a running watcher ticks", ticks, 1);
    fire!();
    check("a live callback runs while the watcher runs", liveCalls, 1);

    const oldFire = fire!;
    watcher.stop();
    await flush();
    tickAll(1234);
    check("a stopped watcher no longer ticks", ticks, 1);

    resolveLate(() => lateUndone++);
    await flush();
    check("a subscription that resolves after stop is undone", lateUndone, 1);

    oldFire();
    check("a live callback from a stopped run does nothing", liveCalls, 1);

    watcher.start();
    oldFire();
    check("even after the watcher starts again", liveCalls, 1);
    check("the watcher reports it runs", watcher.running, true);
    watcher.stop();
  }

  /* ---------------------------- the AFK clock ---------------------------- */

  const said: string[] = [];
  let walkedOver = 0;
  const service = CompanionService as any;
  service.isRunning = () => true;
  service.isBusy = () => false;
  service.isHoldingAttention = () => false;
  service.holdAttention = () => {};
  service.releaseAttention = () => {};
  service.releaseTask = () => {};
  service.distanceToPlayer = () => 1;
  service.comeToPlayer = async () => {
    walkedOver++;
    return true;
  };
  service.say = async (message: string) => {
    said.push(message);
  };
  service.emote = async () => {};

  const chat = CompanionChat as any;
  chat.isRunning = () => false;
  chat.getProposal = () => null;
  let staleChecks = 0;
  chat.dropStaleProposal = () => {
    staleChecks++;
  };

  patchCompanionSettings({ enabled: true, reactions: true, feedAlerts: false });

  const { afkWatch } = await import("../src/features/companion/afkWatch");
  afkWatch.start();
  const afkTicks = intervals.filter((i) => i.ms === 5_000 && !i.cleared);
  check("the AFK watch runs a clock", afkTicks.length, 1);

  now += AFK_IDLE_AFTER_MS + 1;
  tickAll(5_000);
  await flush();
  const idleLines = IDLE_LINES.map((line) => line.message);
  check("a quiet player is asked whether they are still there", said.some((line) => idleLines.includes(line)), true);
  check("he walks over to ask", walkedOver, 1);
  afkWatch.stop();

  /* --------------------------- the hunger poll --------------------------- */

  const { feedWatch } = await import("../src/features/companion/feedWatch");
  feedWatch.start();
  await flush();
  const afterStart = staleChecks;
  check("the hunger watch checks once on start", afterStart, 1);
  tickAll(30_000);
  await flush();
  check("and again on its own, without a pet update", staleChecks, 2);
  feedWatch.stop();
}

main()
  .catch((error) => {
    failures += 1;
    console.error("FAIL the check threw", error);
  })
  .finally(() => {
    globalThis.setInterval = realSetInterval;
    if (failures) {
      console.error(`\n${failures} check(s) failed`);
      process.exit(1);
    }
    console.log("\nall companion watch checks passed");
    process.exit(0);
  });
