// Where a dragged floating widget (shop bell, instant feed) ends up on screen.
import { clampToViewport } from "../src/ui/kit/floating";

let failed = 0;
function check(name: string, got: { left: number; top: number }, want: { left: number; top: number }): void {
  const ok = got.left === want.left && got.top === want.top;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name} -> ${got.left},${got.top}${ok ? "" : ` (expected ${want.left},${want.top})`}`);
}

const viewport = { width: 1000, height: 600 };
const size = { width: 100, height: 50 };

check("inside stays put", clampToViewport({ left: 300, top: 200 }, size, 8, viewport), { left: 300, top: 200 });
check("past the left edge", clampToViewport({ left: -40, top: 200 }, size, 8, viewport), { left: 8, top: 200 });
check("past the right edge", clampToViewport({ left: 990, top: 200 }, size, 8, viewport), { left: 892, top: 200 });
check("past the bottom", clampToViewport({ left: 300, top: 700 }, size, 8, viewport), { left: 300, top: 542 });
check("past the top", clampToViewport({ left: 300, top: -5 }, size, 8, viewport), { left: 300, top: 8 });
check(
  "window narrower than the widget pins it to the margin",
  clampToViewport({ left: 50, top: 50 }, { width: 2000, height: 50 }, 8, viewport),
  { left: 8, top: 50 },
);

console.log(failed ? `${failed} FAILURES` : "all good");
process.exit(failed ? 1 : 0);
