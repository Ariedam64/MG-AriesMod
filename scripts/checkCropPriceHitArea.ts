// The crop price badge leaves the ability chips above the garden card reachable.
//
// The badge sits above the card, above the plant's ability chips
// (GardenInfoPlantAbilities). To make the badge hoverable, the mod stretched
// the game's own hit rectangle of the card up to the badge's top. The card is
// added after the abilities section, so it wins the hit test, and the
// stretched rectangle covered every chip: their tooltip never opened and a
// click opened the full card instead (BR-2, Dawnbinder and the like).
//
// This builds a fake card system with an abilities section, lets the badge
// draw itself, and asks the card's hit area what Pixi would ask it.
//
// Run with: npm run check:croppricehitarea

import { check, checkEqual, run } from "./_check";
import { Atoms, myCurrentGrowSlotIndex } from "../src/game/store/atoms";
import { getSpriteState } from "../src/game/sprites/context";
import { startCropValueOverlayInPixi } from "../src/features/cropPrice/badge";
import { writeShowCropPrice } from "../src/features/cropPrice/setting";

const g = globalThis as any;
g.requestAnimationFrame = (cb: (t: number) => void) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: number) => clearTimeout(id);

/** The game's Pixi Rectangle, as far as a hit test reads it. */
class FakeRectangle {
  constructor(public x: number, public y: number, public width: number, public height: number) {}
  contains(x: number, y: number): boolean {
    if (this.width <= 0 || this.height <= 0) return false;
    return x >= this.x && x < this.x + this.width && y >= this.y && y < this.y + this.height;
  }
}

type Bounds = { minY: number; height: number };

class FakeNode {
  label?: string;
  children: any[] = [];
  position = { x: 0, y: 0, set: (x: number, y: number) => { this.position.x = x; this.position.y = y; } };
  destroyed = false;
  hitArea: any = null;
  private handlers = new Map<string, Array<(arg?: any) => void>>();
  constructor(label?: string, children: any[] = [], private bounds: Bounds = { minY: 0, height: 0 }) {
    this.label = label;
    this.children = children;
  }
  on(event: string, cb: (arg?: any) => void): void {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
  }
  once(event: string, cb: (arg?: any) => void): void {
    this.on(event, cb);
  }
  addChild(child: any): void {
    this.children.push(child);
  }
  getLocalBounds(): Bounds & { width: number } {
    return { ...this.bounds, width: 0 };
  }
  destroy(): void {
    this.destroyed = true;
  }
}

/** Stands in for the game's Graphics: the badge borrows the constructor of one found on the stage. */
class FakeGraphics {
  position = { x: 0, y: 0, set: (x: number, y: number) => { this.position.x = x; this.position.y = y; } };
  rect = { width: 0, height: 0 };
  clear(): this {
    return this;
  }
  roundRect(_x: number, _y: number, width: number, height: number): { fill(_style: unknown): void } {
    this.rect = { width, height };
    return { fill() {} };
  }
  destroy(): void {}
}

const texts: FakeText[] = [];
class FakeText {
  text: string;
  width = 60;
  height = 16;
  position = { x: 0, y: 0, set: (x: number, y: number) => { this.position.x = x; this.position.y = y; } };
  constructor(opts: { text: string }) {
    this.text = opts.text;
    texts.push(this);
  }
  destroy(): void {}
}

// Card-local space, as in build 1727: the card's hit rectangle starts at y=0,
// its title row at y=10, and the abilities section (40 px tall) sits above it.
const CARD_WIDTH = 200;
const CARD_HEIGHT = 120;
const TITLE_TOP = 10;
const ABILITIES_HEIGHT = 40;
const SECTION_GAP = 8;

const gameRect = new FakeRectangle(0, 0, CARD_WIDTH, CARD_HEIGHT);
const titleRow = new FakeNode("GardenInfoObjectTitleRow", [], { minY: 0, height: 20 });
titleRow.position.y = TITLE_TOP;
const card = new FakeNode("GardenInfoObjectCard", [titleRow], { minY: 0, height: CARD_HEIGHT });
card.hitArea = gameRect;
const row = new FakeNode("GardenInfoCardRow", [card]);
const abilities = new FakeNode("GardenInfoPlantAbilities", [], { minY: 0, height: ABILITIES_HEIGHT });
const cardSystem = new FakeNode("GardenInfoCardSystem", [abilities, row]);
const stage = new FakeNode("Stage", [new FakeNode("World", [new FakeGraphics()]), new FakeNode("UI", [cardSystem])]);

const state = getSpriteState() as any;
state.renderer = { lastObjectRendered: stage };
state.ctors = { Text: FakeText };

const plant = { objectType: "plant", species: "Carrot", slots: [{ species: "Carrot", slotId: 0, size: 80, mutations: [] }] };
(Atoms.data.myCurrentGardenObject as any).get = async () => plant;
(Atoms.data.myCurrentGardenObject as any).onChange = async () => () => {};
(Atoms.server.numPlayers as any).get = async () => 1;
(Atoms.server.numPlayers as any).onChange = async () => () => {};
(myCurrentGrowSlotIndex as any).get = async () => 0;
(myCurrentGrowSlotIndex as any).onChange = async () => () => {};

const settle = async () => {
  for (let i = 0; i < 10; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

run(async () => {
  const log = console.info;
  console.info = () => {};
  const overlay = startCropValueOverlayInPixi();
  await settle();
  console.info = log;

  check("the badge shows the crop's price", texts.length === 1 && texts[0].text.length > 0, `texts drawn: ${texts.length}`);
  if (texts.length !== 1) return;
  const text = texts[0];
  const badgeX = text.position.x + text.width / 2;
  const badgeY = text.position.y + text.height / 2;
  check("the badge is drawn above the abilities section", badgeY < TITLE_TOP - SECTION_GAP - ABILITIES_HEIGHT, `badge centre y ${badgeY}`);

  // Pixi asks the card's hitArea, whatever object it is, through `contains`.
  const hit = (x: number, y: number): boolean => !!card.hitArea?.contains(x, y);
  const chipY = TITLE_TOP - SECTION_GAP - ABILITIES_HEIGHT / 2;
  checkEqual("a point on the ability chips does not hit the card", hit(CARD_WIDTH / 2, chipY), false);
  checkEqual("nor does the top edge of the chips", hit(CARD_WIDTH / 2, TITLE_TOP - SECTION_GAP - ABILITIES_HEIGHT + 1), false);
  checkEqual("the card itself still hits", hit(CARD_WIDTH / 2, CARD_HEIGHT / 2), true);
  checkEqual("the badge still hits the card", hit(badgeX, badgeY), true);
  checkEqual("the game's own rectangle is left as the game made it", [gameRect.x, gameRect.y, gameRect.width, gameRect.height], [0, 0, CARD_WIDTH, CARD_HEIGHT]);

  // Switching the price off detaches the badge.
  writeShowCropPrice(false);
  await settle();
  check("switching the price off gives the card back the game's rectangle", card.hitArea === gameRect);
  checkEqual("unchanged", [gameRect.x, gameRect.y, gameRect.width, gameRect.height], [0, 0, CARD_WIDTH, CARD_HEIGHT]);
  checkEqual("and the badge area no longer hits", hit(badgeX, badgeY), false);

  overlay.stop();
});
