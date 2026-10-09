// Finding a labelled node on the game's Pixi stage, and finding it again.
//
// The sell all pets button, the notification bell and the garden card
// overlays each look for one container on the stage (ActionHud,
// RightSideRail, GardenInfoCardSystem). A full stage walk is expensive, so
// the search runs at most once a second, stops scheduling frames once the
// node is found, and starts again only when the node is destroyed.
//
// Run with: npm run check:stagewatch

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

// A frame clock: callbacks queued with requestAnimationFrame run on `frame()`.
let now = 0;
let queued: Array<{ id: number; cb: (t: number) => void }> = [];
let nextId = 1;
const g = globalThis as any;
g.requestAnimationFrame = (cb: (t: number) => void) => {
  const id = nextId++;
  queued.push({ id, cb });
  return id;
};
g.cancelAnimationFrame = (id: number) => {
  queued = queued.filter((entry) => entry.id !== id);
};
function frame(ms = 16): void {
  now += ms;
  const run = queued;
  queued = [];
  for (const entry of run) entry.cb(now);
}
function frames(count: number, ms = 16): void {
  for (let i = 0; i < count; i++) frame(ms);
}

type FakeNode = { label?: string; children: FakeNode[]; once(event: string, cb: () => void): void; destroy(): void };
let visits = 0;
function node(label?: string, children: FakeNode[] = []): FakeNode {
  const handlers: Array<() => void> = [];
  const n: FakeNode = {
    label,
    once: (event, cb) => {
      if (event === "destroyed") handlers.push(cb);
    },
    destroy: () => handlers.splice(0).forEach((cb) => cb()),
    children: [],
  };
  // Counting reads of `children` counts the nodes the search walks.
  Object.defineProperty(n, "children", {
    get() {
      visits++;
      return children;
    },
  });
  return n;
}

async function main(): Promise<void> {
// Loaded after the frame clock is installed: the modules bind it on load.
const { getSpriteState } = await import("../src/game/sprites/context");
const { watchStageNode } = await import("../src/game/pixi/stageSearch");

const world = node("World", Array.from({ length: 50 }, () => node("Tile")));
const ui = node("UI", []);
const stage = node("Stage", [world, ui]);
const state = getSpriteState();
state.renderer = { lastObjectRendered: stage };
state.ctors = { Text: function Text() {} };

const log = console.info;
console.info = () => {};

const events: string[] = [];
const watch = watchStageNode({
  label: "ActionHud",
  logTag: "[check]",
  onFound: (found: FakeNode) => events.push(`found ${found.label}`),
  onLost: () => events.push("lost"),
});

check("nothing found yet", events.length, 0);
check("one frame queued while searching", queued.length, 1);

visits = 0;
frames(30);
const visitsInHalfSecond = visits;
check("at most one stage walk in half a second", visitsInHalfSecond <= 53 * 2, true);

const target = node("ActionHud");
const uiChildren: FakeNode[] = (ui as any).children;
uiChildren.push(target);
frames(70);
check("found within the next second", events.join(","), "found ActionHud");
check("no frame queued once found", queued.length, 0);

visits = 0;
frames(200);
check("no stage walk while the node lives", visits, 0);

uiChildren.splice(0);
target.destroy();
check("losing the node is reported", events.join(","), "found ActionHud,lost");
check("the search starts again", queued.length, 1);

const replacement = node("ActionHud");
uiChildren.push(replacement);
frames(70);
check("the new node is found", events.join(","), "found ActionHud,lost,found ActionHud");
check("no frame queued once found again", queued.length, 0);

// The bell's orphan check: the node left the stage without a "destroyed" event.
uiChildren.splice(0);
watch.reset();
check("a reset reports the node lost", events.join(","), "found ActionHud,lost,found ActionHud,lost");
check("and searches again", queued.length, 1);
uiChildren.push(replacement);
frames(70);
check("the same node is found again", events.join(","), "found ActionHud,lost,found ActionHud,lost,found ActionHud");
events.splice(0, 2);

uiChildren.splice(0);
replacement.destroy();
watch.stop();
uiChildren.push(node("ActionHud"));
frames(70);
check("no frame queued after stop", queued.length, 0);
check("nothing found after stop", events.join(","), "found ActionHud,lost,found ActionHud,lost");

console.info = log;
}

void main().then(() => {
  console.log(failed ? `${failed} FAILURES` : "all good");
  process.exit(failed ? 1 : 0);
});
