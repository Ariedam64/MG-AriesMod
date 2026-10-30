// The rail bell swapping its emoji for the game's art (BR-18).
//
// `refreshArt` builds the art with `new state.ctors.Sprite(texture)`. When the
// stage walk captured the game's RiveWorldVisual as ctors.Sprite, that call
// throws ("Cannot destructure property 'riveFileSrc' of 't' as it is
// undefined"): the error climbed to the bell's sync, which removed the bell,
// and the 2 s maintenance replayed the failure, so the bell never showed. A
// Sprite constructor that throws must leave the bell on its emoji instead.
//
// Run with: npm run check:railbellart

import { check, checkEqual, done } from "./_check";
import { createRailBellView, type RailBellView } from "../src/features/notifier/bell/railBellView";
import { BELL_GLYPH } from "../src/features/notifier/bell/ring";

const BELL_FRAME_KEY = "sprite/ui/NotifierBellOn";

class FakePoint {
  x = 0;
  y = 0;
  set(x: number, y: number = x): void {
    this.x = x;
    this.y = y;
  }
}

class FakeContainer {
  label = "";
  visible = true;
  rotation = 0;
  eventMode = "auto";
  parent: FakeContainer | null = null;
  children: FakeContainer[] = [];
  position = new FakePoint();
  pivot = new FakePoint();
  scale = new FakePoint();
  anchor = new FakePoint();
  destroyed = false;
  addChild(child: FakeContainer): FakeContainer {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  destroy(): void {
    this.destroyed = true;
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
  }
}

class FakeTexture {
  width = 64;
  height = 64;
}

class FakeSprite extends FakeContainer {
  texture: FakeTexture;
  constructor(texture: FakeTexture) {
    super();
    this.texture = texture;
  }
}

/** The game's RiveWorldVisual: a Sprite subclass whose constructor destructures its second argument. */
class FakeRiveWorldVisual extends FakeSprite {
  artboard: any = null;
  stateMachine: any = null;
  riveFileSrc: string;
  constructor(texture: FakeTexture, options: { riveFileSrc: string }) {
    const { riveFileSrc } = options;
    super(texture);
    this.riveFileSrc = riveFileSrc;
  }
}

class FakeText extends FakeContainer {
  text: string;
  style: { fontSize: number };
  height = 28;
  constructor(opts: { text: string; style: { fontSize: number } }) {
    super();
    this.text = opts.text;
    this.style = { ...opts.style };
  }
}

function spriteState(Sprite: any, withArt: boolean): any {
  const atlas = new Map<string, FakeTexture>();
  if (withArt) atlas.set(BELL_FRAME_KEY, new FakeTexture());
  return { ctors: { Container: FakeContainer, Sprite, Text: FakeText }, tex: atlas };
}

/** The node the bell draws: root > content > face > icon. */
function iconOf(view: RailBellView | null): any {
  return view?.root?.children?.[0]?.children?.[0]?.children?.[0] ?? null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function build(state: any): { view: RailBellView | null; error: string | null } {
  try {
    const view = createRailBellView(state, new FakeContainer(), 0);
    view.setSize(48);
    return { view, error: null };
  } catch (error) {
    return { view: null, error: errorText(error) };
  }
}

// --- control: a real Sprite constructor gives the game's art ------------------
{
  const { view, error } = build(spriteState(FakeSprite, true));
  check("real Sprite: the bell builds", error === null, error ?? undefined);
  checkEqual("real Sprite: the bell uses the game's art", view?.usesGameArt, true);
  check("real Sprite: the icon is a sprite", iconOf(view) instanceof FakeSprite);
}

// --- ctors.Sprite is the Rive class, the atlas is already loaded --------------
{
  const { view, error } = build(spriteState(FakeRiveWorldVisual, true));
  check("Rive ctors.Sprite: building the bell does not throw", error === null, error ?? undefined);
  checkEqual("Rive ctors.Sprite: the bell keeps the emoji", view?.usesGameArt, false);
  const icon = iconOf(view);
  checkEqual("Rive ctors.Sprite: the emoji glyph is drawn", icon?.text, BELL_GLYPH);
}

// --- the bell shows its emoji, then the atlas loads with the Rive class -------
// What pixiBell's sync does every 2 s once the view exists.
{
  const { view, error } = build(spriteState(FakeRiveWorldVisual, false));
  check("before the atlas: the bell builds on its emoji", error === null, error ?? undefined);
  if (view) {
    let refreshError: string | null = null;
    try {
      view.refreshArt(spriteState(FakeRiveWorldVisual, true));
    } catch (e) {
      refreshError = errorText(e);
    }
    check("atlas loaded, Rive ctors.Sprite: refreshArt does not throw", refreshError === null, refreshError ?? undefined);
    checkEqual("atlas loaded, Rive ctors.Sprite: the bell keeps the emoji", view.usesGameArt, false);
    const icon = iconOf(view);
    checkEqual("atlas loaded, Rive ctors.Sprite: the emoji is still drawn", icon?.text, BELL_GLYPH);
    checkEqual("atlas loaded, Rive ctors.Sprite: the emoji was not destroyed", icon?.destroyed, false);
  }
}

done();
