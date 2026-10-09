// A Pixi "Sell all Pets" button beside the game's own "Sell Pet" prompt, the
// one contextual action the `ActionHud` container under `UI` shows at a time.
//
// Which action is offered comes from the game's `actionAtom`
// (`Atoms.player.action`), not from the button's text: the label varies
// (Sell Pet, Sell Rainbow Pet, Sell Gold Pet) while the action's type is what
// the game itself dispatches on.
import { getStage, findByLabel, findGraphicsCtor } from "../../game/pixi/gardenInfoCard";
import { getReadySpriteState } from "../../game/sprites/context";
import { pageWindow, shareGlobal } from "../../platform/pageContext";
import { runSellAllPetsFlow } from "./flow";
import { watchActionHud } from "./actionHud";
import { Atoms } from "../../game/store/atoms";
import { Subscriptions } from "../../lib/emitter";

const BUTTON_FACE_LABEL = "McButtonFace";

// Matches the game's own action-dispatch identifiers for selling a single
// pet (seen in its own `case 'sellPet': case 'sellRainbowPet': case
// 'sellGoldPet':` action switch).
const SELL_PET_ACTION_TYPES = new Set(["sellPet", "sellRainbowPet", "sellGoldPet"]);

const BUTTON_GAP = 10;
const BUTTON_TEXT = "Sell all Pets";
const BUTTON_TEXT_STYLE = { fontFamily: "Arial", fontSize: 14, fontWeight: "700", fill: "#FFFFFF" };
const BUTTON_PADDING_X = 14;
const BUTTON_RADIUS = 10;
// The game's own blue button theme.
const BUTTON_FILL_COLOR = 0x0067b4;
const BUTTON_BORDER_COLOR = 0x48adf4;
const BUTTON_BORDER_WIDTH = 2;
const HOVER_SCALE = 1.08;
// Per-frame easing towards the target scale: higher is snappier.
const HOVER_SCALE_EASE = 0.25;
const HOVER_SCALE_SETTLE_EPSILON = 0.001;

interface SellAllPetsPixiDebugState {
  attached: boolean;
  findAttempts: number;
  hasButton: boolean;
  lastError: string | null;
  currentAction: string | null;
}

export interface SellAllPetsPixiController {
  stop(): void;
}

function isSellPetAction(action: any): boolean {
  if (typeof action === "string") return SELL_PET_ACTION_TYPES.has(action);
  if (action && typeof action === "object") {
    const type = action.type ?? action.action ?? action.name ?? action.id;
    return typeof type === "string" && SELL_PET_ACTION_TYPES.has(type);
  }
  return false;
}

function actionLabel(action: any): string | null {
  if (typeof action === "string") return action;
  if (action && typeof action === "object") {
    const type = action.type ?? action.action ?? action.name ?? action.id;
    return typeof type === "string" ? type : null;
  }
  return null;
}

// `.width` and `.height` are Pixi getters that can throw in the middle of a
// layout rebuild, before there is a value to check, so every read gets its
// own try/catch.
function safeSize(node: any, prop: "width" | "height", fallback: number): number {
  try {
    const value = node?.[prop];
    return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
  } catch {
    return fallback;
  }
}

function findAnyTextStyle(root: any, limit = 5000): any {
  const stack = [root];
  const seen = new Set<any>();
  let n = 0;
  while (stack.length && n++ < limit) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    // Rive display objects can carry `.text` and `.style` too: only a real
    // Pixi text node's style is copied.
    if (typeof node.text === "string" && node.style && node.renderPipeId === "text") return node.style;
    const children = node.children;
    if (Array.isArray(children)) for (const child of children) stack.push(child);
  }
  return null;
}

export function startSellAllPetsPixi(): SellAllPetsPixiController {
  let running = true;
  let actionHud: any = null;
  let buttonContainer: any = null;
  let buttonBg: any = null;
  let buttonText: any = null;
  let currentAction: any = null;
  let canvasEl: any = null;
  let canvasListenersAttached = false;
  let weSetPointerCursor = false;
  let hovering = false;
  let currentScale = 1;
  let scaleRafId: number | null = null;

  const debugState: SellAllPetsPixiDebugState = {
    attached: false,
    findAttempts: 0,
    hasButton: false,
    lastError: null,
    currentAction: null,
  };
  shareGlobal("__MG_SELL_ALL_PETS_PIXI_DEBUG__", debugState);

  const raf: (cb: (t: number) => void) => number = (pageWindow as any).requestAnimationFrame.bind(pageWindow);
  const cancelRaf: (id: number) => void = (pageWindow as any).cancelAnimationFrame.bind(pageWindow);

  const stopScaleAnimation = () => {
    if (scaleRafId != null) { cancelRaf(scaleRafId); scaleRafId = null; }
  };

  const scaleAnimationTick = () => {
    scaleRafId = null;
    if (!buttonContainer || buttonContainer.destroyed) return;
    const target = hovering ? HOVER_SCALE : 1;
    currentScale += (target - currentScale) * HOVER_SCALE_EASE;
    if (Math.abs(target - currentScale) < HOVER_SCALE_SETTLE_EPSILON) currentScale = target;
    buttonContainer.scale.set(currentScale);
    if (currentScale !== target) {
      scaleRafId = raf(scaleAnimationTick);
    }
  };

  const ensureScaleAnimationRunning = () => {
    if (scaleRafId == null) scaleRafId = raf(scaleAnimationTick);
  };

  // Forgets our nodes without destroying them: used after destroying them
  // ourselves, and when the game's rebuild of `actionHud` destroyed them
  // first (see the `once("destroyed")` hook where the container is made).
  const forgetButtonRefs = () => {
    stopScaleAnimation();
    hovering = false;
    currentScale = 1;
    buttonContainer = null;
    buttonBg = null;
    buttonText = null;
    debugState.hasButton = false;
  };

  const removeButton = () => {
    if (buttonContainer) {
      try { buttonContainer.destroy({ children: true }); } catch {}
    }
    forgetButtonRefs();
  };

  const onClick = () => {
    void runSellAllPetsFlow();
  };

  // Pixi's EventSystem never delivered clicks to this part of the tree (even
  // `stage.on("pointerdown")` stayed silent while the canvas got the native
  // event): the prompt is keyboard-only in the game. So a native listener on
  // the canvas hit-tests our button's on-screen box itself.
  const hitTestButton = (clientX: number, clientY: number): boolean => {
    if (!buttonBg || buttonBg.destroyed || !canvasEl) return false;
    try {
      const rect = canvasEl.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      // Both corners go through `toGlobal` so the box follows the hover zoom.
      const topLeft = buttonBg.toGlobal({ x: 0, y: 0 });
      const bottomRight = buttonBg.toGlobal({ x: buttonBg.width || 0, y: buttonBg.height || 0 });
      return x >= topLeft.x && x <= bottomRight.x && y >= topLeft.y && y <= bottomRight.y;
    } catch {
      return false;
    }
  };

  const setHovering = (next: boolean) => {
    if (hovering === next) return;
    hovering = next;
    ensureScaleAnimationRunning();
  };

  const onCanvasPointerDown = (ev: PointerEvent) => {
    if (hitTestButton(ev.clientX, ev.clientY)) onClick();
  };

  const onCanvasPointerMove = (ev: PointerEvent) => {
    if (!canvasEl) return;
    const isHovering = hitTestButton(ev.clientX, ev.clientY);
    setHovering(isHovering);
    if (isHovering && !weSetPointerCursor) {
      canvasEl.style.cursor = "pointer";
      weSetPointerCursor = true;
    } else if (!isHovering && weSetPointerCursor) {
      canvasEl.style.cursor = "";
      weSetPointerCursor = false;
    }
  };

  // Mouse leaving the canvas entirely skips any further pointermove, which
  // would otherwise leave the button stuck zoomed-in / cursor stuck as
  // "pointer" until the next unrelated move event.
  const onCanvasPointerLeave = () => {
    setHovering(false);
    if (weSetPointerCursor && canvasEl) {
      canvasEl.style.cursor = "";
      weSetPointerCursor = false;
    }
  };

  const ensureCanvasListeners = (state: any) => {
    if (canvasListenersAttached) return;
    const canvas = state.renderer?.canvas || state.renderer?.view?.canvas || state.renderer?.view;
    if (!canvas) return;
    canvasEl = canvas;
    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerleave", onCanvasPointerLeave);
    canvasListenersAttached = true;
  };

  // Runs inside the game's own Pixi update (its `addChild` emits
  // `childAdded`), so it must never throw, as in game/pixi/gardenInfoCard.ts.
  const syncUnsafe = () => {
    debugState.currentAction = actionLabel(currentAction);
    if (!running || !actionHud || actionHud.destroyed || !isSellPetAction(currentAction)) {
      removeButton();
      return;
    }
    const wrapper = actionHud.children?.[0];
    if (!wrapper || wrapper.destroyed) {
      removeButton();
      return;
    }

    const state = getReadySpriteState();
    if (!state?.ctors?.Text) return;
    const graphicsCtor = findGraphicsCtor(getStage(state));
    if (!graphicsCtor) return;
    ensureCanvasListeners(state);

    // The face's size is unreliable in the middle of a rebuild, which is
    // when this runs: missing or zero falls back on the observed 150x55.
    const face = findByLabel(wrapper, BUTTON_FACE_LABEL) ?? wrapper;
    const faceWidth = safeSize(face, "width", 150);
    const faceHeight = safeSize(face, "height", 55);

    // Background and text share a container so the hover zoom scales around
    // the button's centre (its `pivot`), not its top-left corner.
    if (!buttonContainer) {
      const ContainerCtor = state.ctors?.Container ?? actionHud.constructor;
      buttonContainer = new ContainerCtor();
      const thisContainer = buttonContainer;
      // The game rebuilds `actionHud`'s children wholesale and can destroy
      // ours without a word; holding on to it would crash the next
      // `.clear()` or `.destroy()`.
      thisContainer.once("destroyed", () => {
        if (buttonContainer === thisContainer) forgetButtonRefs();
      });
      actionHud.addChildAt(buttonContainer, 0);
    }
    if (!buttonText) {
      // The game's own button font, closer to its UI than a fixed Arial.
      const existingTextStyle = findAnyTextStyle(wrapper);
      const style = {
        ...BUTTON_TEXT_STYLE,
        ...(existingTextStyle?.fontFamily ? { fontFamily: existingTextStyle.fontFamily } : {}),
        ...(existingTextStyle?.fontSize ? { fontSize: existingTextStyle.fontSize } : {}),
        ...(existingTextStyle?.fontWeight ? { fontWeight: existingTextStyle.fontWeight } : {}),
      };
      buttonText = new state.ctors.Text({ text: BUTTON_TEXT, style });
      buttonContainer.addChild(buttonText);
    }
    if (!buttonBg) {
      buttonBg = new graphicsCtor();
      buttonContainer.addChildAt(buttonBg, 0);
    }
    if (!buttonContainer || !buttonText || !buttonBg) return;

    const buttonTextHeight = safeSize(buttonText, "height", 20);
    const badgeWidth = safeSize(buttonText, "width", 100) + BUTTON_PADDING_X * 2;
    const badgeHeight = Math.max(faceHeight, buttonTextHeight + 12);

    // Anchored beside the visible face rather than the whole wrapper; our own
    // hit test means the wrapper's hit area cannot take the click. `toGlobal`
    // walks every ancestor transform and can throw mid-rebuild too.
    let localAnchor: { x: number; y: number } = { x: 0, y: 0 };
    try {
      if (typeof face?.toGlobal === "function" && typeof actionHud.toLocal === "function") {
        const globalAnchor = face.toGlobal({ x: faceWidth, y: faceHeight / 2 });
        localAnchor = actionHud.toLocal(globalAnchor);
      }
    } catch {
      // Keeps (0, 0); the next sync, which comes often, corrects it.
    }

    buttonBg.clear();
    buttonBg
      .roundRect(0, 0, badgeWidth, badgeHeight, BUTTON_RADIUS)
      .fill({ color: BUTTON_FILL_COLOR })
      .stroke({ width: BUTTON_BORDER_WIDTH, color: BUTTON_BORDER_COLOR });
    buttonText.position.set(BUTTON_PADDING_X, (badgeHeight - buttonTextHeight) / 2);

    // Pivot at the centre, position shifted to match, so at scale 1 the
    // button sits exactly beside the face.
    buttonContainer.pivot.set(badgeWidth / 2, badgeHeight / 2);
    buttonContainer.position.set(
      localAnchor.x + BUTTON_GAP + badgeWidth / 2,
      localAnchor.y,
    );

    debugState.hasButton = true;
  };

  const sync = () => {
    try {
      syncUnsafe();
      debugState.lastError = null;
    } catch (error) {
      debugState.lastError = String((error as Error)?.message ?? error);
      console.warn("[sellAllPets] Pixi button sync failed, clearing button", error);
      try { removeButton(); } catch {}
    }
  };

  const onChildAdded = () => sync();
  const hudWatch = watchActionHud({
    attach(hud) {
      actionHud = hud;
      hud.on("childAdded", onChildAdded);
      debugState.attached = true;
      sync();
    },
    detach() {
      actionHud = null;
      debugState.attached = false;
      removeButton();
    },
    onSearch(attempts) {
      debugState.findAttempts = attempts;
    },
  });

  const subs = new Subscriptions();
  void Atoms.player.action
    .get()
    .then((initial) => {
      currentAction = initial;
      if (running) sync();
    })
    .catch(() => {});
  subs.add(
    Atoms.player.action.onChange((next: any) => {
      currentAction = next;
      sync();
    }),
  );

  return {
    stop() {
      if (!running) return;
      running = false;
      hudWatch.stop();
      if (actionHud) {
        try { actionHud.off("childAdded", onChildAdded); } catch {}
      }
      subs.dispose();
      if (canvasListenersAttached && canvasEl) {
        try {
          canvasEl.removeEventListener("pointerdown", onCanvasPointerDown);
          canvasEl.removeEventListener("pointermove", onCanvasPointerMove);
          canvasEl.removeEventListener("pointerleave", onCanvasPointerLeave);
          if (weSetPointerCursor) canvasEl.style.cursor = "";
        } catch {}
      }
      removeButton();
      actionHud = null;
    },
  };
}
