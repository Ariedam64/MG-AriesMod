// Where a dragged floating widget (shop bell, instant feed) ends up on screen.
import { checkEqual, done } from "./_check";
import { clampToViewport } from "../src/ui/kit/floating";

const viewport = { width: 1000, height: 600 };
const size = { width: 100, height: 50 };

checkEqual("inside stays put", clampToViewport({ left: 300, top: 200 }, size, 8, viewport), { left: 300, top: 200 });
checkEqual("past the left edge", clampToViewport({ left: -40, top: 200 }, size, 8, viewport), { left: 8, top: 200 });
checkEqual("past the right edge", clampToViewport({ left: 990, top: 200 }, size, 8, viewport), { left: 892, top: 200 });
checkEqual("past the bottom", clampToViewport({ left: 300, top: 700 }, size, 8, viewport), { left: 300, top: 542 });
checkEqual("past the top", clampToViewport({ left: 300, top: -5 }, size, 8, viewport), { left: 300, top: 8 });
checkEqual(
  "window narrower than the widget pins it to the margin",
  clampToViewport({ left: 50, top: 50 }, { width: 2000, height: 50 }, 8, viewport),
  { left: 8, top: 50 },
);

done();
