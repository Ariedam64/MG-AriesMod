// Menu status lines refresh only while they are on screen.
//
// The HUD status pill, the companion's Behavior and Chat tabs, the weather
// alerts and the debug socket picker used to rewrite their text on a timer
// for the whole session, closed window or not. `refreshWhileVisible` runs the
// timer only while the element shows, and refreshes once as it shows again.
//
// Run with: npm run check:visiblerefresh

import { checkEqual as check, done } from "./_check";

// A manual clock for setInterval.
const g = globalThis as any;
let intervals = new Map<number, { fn: () => void; ms: number; due: number }>();
let nextId = 1;
let now = 0;
g.setInterval = (fn: () => void, ms: number) => {
  const id = nextId++;
  intervals.set(id, { fn, ms, due: now + ms });
  return id;
};
g.clearInterval = (id: number) => {
  intervals.delete(id);
};
function advance(ms: number): void {
  const end = now + ms;
  for (;;) {
    let next: { id: number; due: number } | null = null;
    for (const [id, t] of intervals) if (t.due <= end && (!next || t.due < next.due)) next = { id, due: t.due };
    if (!next) break;
    now = next.due;
    const t = intervals.get(next.id)!;
    t.due += t.ms;
    t.fn();
  }
  now = end;
}

// An IntersectionObserver the check drives by hand.
let observers: Array<{ cb: (entries: Array<{ isIntersecting: boolean }>) => void; connected: boolean }> = [];
function show(visible: boolean): void {
  for (const o of observers) if (o.connected) o.cb([{ isIntersecting: visible }]);
}

async function main(): Promise<void> {
  const { refreshWhileVisible } = await import("../src/ui/kit/dom");
  const el = {} as Element;

  // Fallback first: no IntersectionObserver means a plain interval.
  let calls = 0;
  const stopPlain = refreshWhileVisible(el, () => calls++, 1000);
  advance(3000);
  check("without IntersectionObserver it ticks like an interval", calls, 3);
  stopPlain();
  advance(3000);
  check("and stops when asked", calls, 3);

  g.IntersectionObserver = class {
    private entry: { cb: (entries: Array<{ isIntersecting: boolean }>) => void; connected: boolean };
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      this.entry = { cb, connected: false };
      observers.push(this.entry);
    }
    observe() {
      this.entry.connected = true;
    }
    disconnect() {
      this.entry.connected = false;
    }
  };

  calls = 0;
  const stop = refreshWhileVisible(el, () => calls++, 1000);
  advance(5000);
  check("nothing runs before the element is seen", calls, 0);

  show(true);
  check("it refreshes as soon as it shows", calls, 1);
  advance(3000);
  check("then once per period while shown", calls, 4);

  show(false);
  advance(10_000);
  check("nothing runs while hidden", calls, 4);
  check("no timer is left while hidden", intervals.size, 0);

  show(true);
  check("showing again refreshes at once", calls, 5);
  advance(1000);
  check("and the period resumes", calls, 6);

  stop();
  show(true);
  advance(5000);
  check("nothing runs after stop", calls, 6);
  check("no timer is left after stop", intervals.size, 0);

  let throwing = 0;
  const stopThrowing = refreshWhileVisible(el, () => {
    throwing++;
    throw new Error("boom");
  }, 1000);
  const warn = console.warn;
  console.warn = () => {};
  show(true);
  advance(2000);
  console.warn = warn;
  check("a refresh that throws keeps its timer", throwing, 3);
  stopThrowing();
}

void main().then(done);
