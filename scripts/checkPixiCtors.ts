// Mirrors how build 1823 puts Rive visuals in the world, so the stage walk in
// getCtors is checked against the game's real shape.
//
// The game's RiveWorldVisual chunk does:
//   ce = class e extends o { session; batchRenderer; artboard = null; stateMachine = null; riveFileSrc; ...
//        constructor(e, t) { let { riveFileSrc: n, artboardName: r, ... } = t
// where `o` is Pixi v8's Sprite. So a Rive node has a texture with a frame like
// any Sprite, its artboard and state machine stay null until it hydrates, and
// its two-argument constructor throws when called as `new Sprite(texture)`.
// When such a node comes first in the walk, ctors.Sprite must not be its class.
import { check, checkEqual, done } from "./_check";
import { getCtors, type PixiCtors } from "../src/game/sprites/utils/pixi";

class FakeRectangle {
  constructor(public x = 0, public y = 0, public width = 1, public height = 1) {}
}

class FakeTexture {
  frame = new FakeRectangle();
}

class FakeContainer {
  children: any[] = [];
  constructor(children: any[] = []) {
    this.children = children;
  }
}

class FakeSprite extends FakeContainer {
  texture: FakeTexture;
  renderPipeId = "sprite";
  constructor(texture: FakeTexture = new FakeTexture()) {
    super();
    this.texture = texture;
  }
}

type RiveOptions = { riveFileSrc: string; artboardName?: string };

/** The game's Rive sprite: a Sprite subclass that destructures its second argument. */
class FakeRiveSprite extends FakeSprite {
  artboard: any = null;
  stateMachine: any = null;
  riveFileSrc: string;
  constructor(texture: FakeTexture, options: RiveOptions) {
    const { riveFileSrc } = options;
    super(texture);
    this.riveFileSrc = riveFileSrc;
  }
}

/** A Rive sprite that also exposes text and style, as the comment in pixi.ts describes. */
class FakeRiveTextLike extends FakeRiveSprite {
  text = "Dawnbinder";
  style = { fontSize: 12 };
}

class FakeText extends FakeContainer {
  text = "";
  style = { fontSize: 12 };
  renderPipeId = "text";
}

/** A text node from a Pixi without renderPipeId, only reachable through the loose fallback. */
class FakeLooseText extends FakeContainer {
  text = "";
  style = { fontSize: 12 };
}

function captureFrom(stage: FakeContainer): PixiCtors | null {
  try {
    return getCtors({ stage });
  } catch (error) {
    check("getCtors finds the constructors", false, error instanceof Error ? error.message : String(error));
    return null;
  }
}

function constructs(Sprite: any, texture: FakeTexture): string | null {
  try {
    const sprite = new Sprite(texture);
    return sprite?.texture === texture ? null : "the new sprite does not hold the texture";
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

const riveOptions: RiveOptions = { riveFileSrc: "dawnbinder.riv", artboardName: "Plant" };

// --- control: no Rive in the scene -------------------------------------------
{
  const stage = new FakeContainer([
    new FakeContainer([new FakeSprite()]),
    new FakeContainer([new FakeText()]),
  ]);
  const ctors = captureFrom(stage);
  checkEqual("plain scene: Sprite is the Pixi Sprite", ctors?.Sprite, FakeSprite);
  checkEqual("plain scene: Text is the Pixi Text", ctors?.Text, FakeText);
}

// --- an unhydrated Rive sprite first in the world layer ------------------------
{
  const rive = new FakeRiveSprite(new FakeTexture(), riveOptions);
  checkEqual("the Rive node has not hydrated yet", rive.artboard, null);
  const stage = new FakeContainer([
    new FakeContainer([new FakeContainer([rive])]),
    new FakeContainer([new FakeSprite(), new FakeText()]),
  ]);
  const ctors = captureFrom(stage);
  checkEqual("Rive first: Sprite is the Pixi Sprite, not the Rive class", ctors?.Sprite, FakeSprite);
  checkEqual("Rive first: Texture is the Pixi Texture", ctors?.Texture, FakeTexture);
  checkEqual("Rive first: Rectangle is the Pixi Rectangle", ctors?.Rectangle, FakeRectangle);
  const failure = ctors ? constructs(ctors.Sprite, new FakeTexture()) : "no ctors";
  check("Rive first: new ctors.Sprite(texture) works, as the price badge calls it", failure === null, failure ?? undefined);
}

// --- an unhydrated Rive node with text and style, no Pixi v8 text node ---------
{
  const stage = new FakeContainer([
    new FakeContainer([new FakeSprite()]),
    new FakeContainer([new FakeRiveTextLike(new FakeTexture(), riveOptions)]),
    new FakeContainer([new FakeLooseText()]),
  ]);
  const ctors = captureFrom(stage);
  checkEqual("unhydrated Rive with text: Text is not the Rive class", ctors?.Text, FakeLooseText);
}

done();
