// The lock look the DOM indicators put on a game element comes off cleanly.
//
// The Sell Crops lock set `z-index: 1000` on the game's container without
// saving the value it replaced, so the container stayed lifted above its
// neighbours after the lock lifted. Every style a lock sets is now saved and
// put back, and two indicators marking one element keep separate saves.
//
// Run with: npm run check:domlockmarks
import { markLocked, unmarkLocked, type LockLook } from "../src/features/locker/domLockMarks";
import { SELL_CROPS_LOCK_LOOK } from "../src/features/locker/sellCropsLock";

// Just enough of an element to hold inline styles, dataset values and glyphs.
type FakeChild = { className: string; style: { setProperty(prop: string, value: string): void }; textContent: string; remove(): void };

type FakeElement = {
  dataset: Record<string, string | undefined>;
  style: {
    getPropertyValue(prop: string): string;
    setProperty(prop: string, value: string): void;
    removeProperty(prop: string): void;
  };
  appendChild(child: FakeChild): void;
  querySelector(selector: string): FakeChild | null;
  querySelectorAll(selector: string): FakeChild[];
  childCount(): number;
};

const classOf = (selector: string) => selector.split(".").pop() ?? "";

function fakeElement(): FakeElement & HTMLElement {
  const props = new Map<string, string>();
  const children: FakeChild[] = [];
  const el: FakeElement = {
    dataset: {},
    style: {
      getPropertyValue: (prop) => props.get(prop) ?? "",
      setProperty: (prop, value) => (value ? props.set(prop, value) : props.delete(prop)),
      removeProperty: (prop) => props.delete(prop),
    },
    appendChild(child) {
      child.remove = () => {
        const i = children.indexOf(child);
        if (i >= 0) children.splice(i, 1);
      };
      children.push(child);
    },
    querySelector: (selector) => children.find((c) => c.className === classOf(selector)) ?? null,
    querySelectorAll: (selector) => children.filter((c) => c.className === classOf(selector)),
    childCount: () => children.length,
  };
  return el as FakeElement & HTMLElement;
}

function installFakeDom(): void {
  const g = globalThis as any;
  g.document = { createElement: () => ({ className: "", style: { setProperty() {} }, textContent: "", remove() {} }) };
  g.getComputedStyle = (el: FakeElement) => ({ position: el.style.getPropertyValue("position") || "static" });
}

installFakeDom();

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${got}${ok ? "" : ` (expected ${want})`}`);
};

const container = fakeElement();
container.style.setProperty("border", "1px solid red");
container.style.setProperty("padding", "4px");

markLocked(container, SELL_CROPS_LOCK_LOOK);
check("locked: the container is lifted", container.style.getPropertyValue("z-index"), "1000");
check("locked: its border is hidden", container.style.getPropertyValue("border"), "none");
check("locked: it carries one lock glyph", container.childCount(), 1);
markLocked(container, SELL_CROPS_LOCK_LOOK);
check("locking twice adds no second glyph", container.childCount(), 1);

unmarkLocked(container, SELL_CROPS_LOCK_LOOK.owner);
check("unlocked: the z-index is the game's again", container.style.getPropertyValue("z-index"), "");
check("unlocked: the border is the game's again", container.style.getPropertyValue("border"), "1px solid red");
check("unlocked: the padding is the game's again", container.style.getPropertyValue("padding"), "4px");
check("unlocked: the position is the game's again", container.style.getPropertyValue("position"), "");
check("unlocked: the glyph is gone", container.childCount(), 0);

// Two indicators on one element: each puts back only what it saved.
const egg: LockLook = { owner: "egg", style: { border: "3px solid purple" }, glyph: {} };
const decor: LockLook = { owner: "decor", style: { overflow: "visible" }, glyph: {} };
const card = fakeElement();
card.style.setProperty("overflow", "hidden");
markLocked(card, egg);
markLocked(card, decor);
unmarkLocked(card, "egg");
check("one owner's unlock leaves the other's style", card.style.getPropertyValue("overflow"), "visible");
check("and the other's glyph", card.childCount(), 1);
unmarkLocked(card, "decor");
check("both unlocked: the card is as it was", card.style.getPropertyValue("overflow"), "hidden");

console.log(failed ? `${failed} FAILURE(S)` : "All checks passed.");
process.exit(failed ? 1 : 0);
