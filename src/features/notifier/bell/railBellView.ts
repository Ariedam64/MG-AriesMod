// What the rail's bell looks like: the game's own bell art on a face that
// grows under the pointer and shrinks when pressed, as the game's icons do,
// a ring while items wait, and a count badge built from the chat icon's class.
import { findByLabel } from "../../../game/pixi/stageSearch";
import { BELL_GLYPH, BELL_RING_DURATION_MS, bellRingAngleAt } from "./ring";

const BELL_LABEL = "GeminiNotificationBell";
const BADGE_LABEL = "GeminiNotificationBellBadge";
/** The game's own bell, the one it shows in its notification settings. */
const BELL_FRAME_KEY = "sprite/ui/NotifierBellOn";
/** The chat icon's count badge: the bell's badge is built from its class, to look the same. */
const CHAT_BADGE_LABEL = "RightSideRailChatBadge";
// The game's badge on rail icons, and where it sits when the chat badge cannot be read.
const BADGE_DIAMETER = 25;
const BADGE_TEXT_OFFSET_Y = -1;
const DEFAULT_BADGE_OFFSET = { x: -10, y: -4 };
// The game's icon faces: how much of the cell the art fills, and how they grow
// under the pointer and shrink when pressed.
const ICON_REST_SCALE = 0.94;
const HOVER_SCALE = 1.06;
const PRESSED_SCALE = 0.94;
/** Share of the remaining scale covered per 60 fps frame, as the game's faces ease. */
const SCALE_EASE_PER_FRAME = 0.22;
const SCALE_SNAP = 0.002;
const FRAME_MS = 1000 / 60;
/** The emoji stand-in, until the atlas holding the game's art has loaded. */
const EMOJI_SIZE_RATIO = 0.6;
const DEFAULT_ICON_SIZE = 48;

export interface RailBellView {
  /** The bell's cell, the node that goes on the rail. */
  readonly root: any;
  /** False while the game has stripped the rail: the cell stays, empty. */
  readonly shown: boolean;
  readonly usesGameArt: boolean;
  readonly hasGameBadge: boolean;
  setShown(shown: boolean): void;
  setSize(size: number): void;
  /** Swaps the emoji for the game's art once the atlas holding it has loaded. */
  refreshArt(state: any): void;
  setHovered(hovered: boolean): void;
  press(): void;
  setRinging(ringing: boolean): void;
  setCount(count: number): void;
  /** Advances the hover scale and the ring by `dtMs`. */
  animate(dtMs: number): void;
}

/**
 * The chat badge's own class, so the count looks exactly like the game's.
 * Null when the game changed it: the overlay then draws a DOM badge.
 */
function createGameBadge(rail: any, count: number): any {
  const chatBadge = findByLabel(rail, CHAT_BADGE_LABEL);
  const BadgeCtor = chatBadge?.constructor;
  if (typeof BadgeCtor !== "function") return null;
  let made: any = null;
  try {
    made = new BadgeCtor({ diameterPx: BADGE_DIAMETER, textOffsetYPx: BADGE_TEXT_OFFSET_Y, label: BADGE_LABEL });
    if (typeof made?.setCount !== "function" || typeof made?.position?.set !== "function") throw new Error("not a count badge");
    const x = Number(chatBadge.x);
    const y = Number(chatBadge.y);
    made.position.set(Number.isFinite(x) ? x : DEFAULT_BADGE_OFFSET.x, Number.isFinite(y) ? y : DEFAULT_BADGE_OFFSET.y);
    made.setCount(count);
    return made;
  } catch (error) {
    console.warn("[PixiBell] the game's badge could not be reused, falling back to the DOM badge", error);
    try { made?.destroy?.(); } catch {}
    return null;
  }
}

/** Builds the bell from the game's own constructors (`state.ctors`). */
export function createRailBellView(state: any, rail: any, count: number): RailBellView {
  const ContainerCtor = state.ctors.Container ?? rail.constructor;
  const root = new ContainerCtor();
  root.label = BELL_LABEL;
  const content = new ContainerCtor();
  const face = new ContainerCtor();
  content.addChild(face);
  root.addChild(content);
  const badge = createGameBadge(rail, count);
  if (badge) content.addChild(badge);

  let icon: any = null;
  let iconIsArt = false;
  let size = 0;
  let hovered = false;
  let faceScale = 1;
  let ringing = false;
  let ringT = 0;

  const layoutIcon = () => {
    if (!icon || size <= 0) return;
    // Anchored at the top center, so the ring swings the bell around its
    // mounting point, like the floating bell.
    icon.anchor?.set?.(0.5, 0);
    if (iconIsArt) {
      const w = Number(icon.texture?.width) || 1;
      const h = Number(icon.texture?.height) || 1;
      const scale = (size * ICON_REST_SCALE) / Math.max(w, h);
      icon.scale.set(scale);
      icon.position.set(size / 2, (size - h * scale) / 2);
    } else {
      icon.style.fontSize = Math.round(size * EMOJI_SIZE_RATIO);
      const textHeight = Number(icon.height) || size * EMOJI_SIZE_RATIO;
      icon.position.set(size / 2, Math.max(0, (size - textHeight) / 2));
    }
  };

  const view: RailBellView = {
    root,
    get shown() {
      return content.visible !== false;
    },
    get usesGameArt() {
      return iconIsArt;
    },
    get hasGameBadge() {
      return !!badge;
    },

    setShown(shown) {
      content.visible = shown;
    },

    setSize(next) {
      if (next === size) return;
      size = next;
      face.pivot.set(size / 2, size / 2);
      face.position.set(size / 2, size / 2);
      layoutIcon();
    },

    refreshArt(current) {
      const art = current.tex?.get?.(BELL_FRAME_KEY);
      const canUseArt = !!art && typeof current.ctors?.Sprite === "function";
      if (icon && (iconIsArt || !canUseArt)) return;
      const next = canUseArt
        ? new current.ctors.Sprite(art)
        : new current.ctors.Text({ text: BELL_GLYPH, style: { fontSize: DEFAULT_ICON_SIZE } });
      if (icon) {
        try { icon.destroy(); } catch {}
      }
      icon = next;
      iconIsArt = canUseArt;
      icon.eventMode = "none";
      face.addChild(icon);
      layoutIcon();
    },

    setHovered(value) {
      hovered = value;
    },

    press() {
      faceScale = PRESSED_SCALE;
      face.scale.set(faceScale);
    },

    setRinging(value) {
      if (ringing === value) return;
      ringing = value;
      ringT = 0;
    },

    setCount(value) {
      try { badge?.setCount(value); } catch {}
    },

    animate(dtMs) {
      const target = hovered ? HOVER_SCALE : 1;
      if (faceScale !== target) {
        const ease = 1 - (1 - SCALE_EASE_PER_FRAME) ** (dtMs / FRAME_MS);
        faceScale += (target - faceScale) * ease;
        if (Math.abs(target - faceScale) < SCALE_SNAP) faceScale = target;
        face.scale.set(faceScale);
      }
      if (!icon) return;
      if (ringing) {
        ringT += dtMs;
        icon.rotation = bellRingAngleAt((ringT % BELL_RING_DURATION_MS) / BELL_RING_DURATION_MS);
      } else if (icon.rotation !== 0) {
        icon.rotation = 0;
      }
    },
  };

  view.refreshArt(state);
  return view;
}
