// src/services/editor/decorRotation.ts
// Rotation states a decor actually accepts, plus the picker control that lets
// you scrub through them with a live sprite preview.
//
// The game encodes rotation as a signed angle where the SIGN IS A MIRROR FLAG,
// not part of the angle: negative means "flipped horizontally". `-360` is the
// mirrored form of `0`, which exists only because `-0 === 0` cannot encode it.
//
// Which angles are legal is per-decor and comes straight from the catalog:
//   - `baseCapacitySlots` (storages)  -> never rotates, `0` only
//   - `rotationVariants`              -> `[0, ...its keys]`
//   - neither                         -> `0` and its mirror only
//
// Mirrors are deliberately dropped when the decor has rotation variants: every
// mirrored angle renders the same as one of the upright ones (270° reads as
// 90°, 180° as its own mirror, 0° as 0°), so offering all eight would just be
// four duplicate slider stops. Decors without variants keep `-360`, since
// mirroring is then the only orientation they have.
//
// Storages get no control at all: their sprite follows the player's real
// `capacitySlots`, read off the user slot rather than off the placed object,
// so there is nothing selectable per decor. They show the preview only.

import { decorCatalog } from "../../data";
import { attachSpriteIcon } from "../../ui/spriteIconCache";

/** Neutral rotation. */
const ANGLE_NONE = 0;
/** The game's encoding for "0°, mirrored" — see the note above. */
const ANGLE_MIRRORED_NONE = -360;
const FULL_TURN_DEGREES = 360;

const PREVIEW_SIZE_PX = 64;
const CONTENT_MAX_WIDTH_PX = 168;
// Slack on each side of the track so the first and last tick labels, which are
// centred on their notch, stay inside the panel instead of forcing a scrollbar.
const TRACK_INSET_PX = 14;
const SPRITE_LOG_TAG = "editor-decor-rotation";

// The thumb travels between its own half-widths, not the full track, so the
// notches can only line up if we pin the thumb to a known size.
const THUMB_SIZE_PX = 14;
const SLIDER_CLASS = "qws-decor-rot-slider";
const STYLE_ID = "gemini-decor-rotation-styles";

function ensureSliderStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.${SLIDER_CLASS} {
  -webkit-appearance: none; appearance: none;
  width: 100%; height: ${THUMB_SIZE_PX}px;
  background: transparent; cursor: pointer; margin: 0;
}
.${SLIDER_CLASS}::-webkit-slider-runnable-track {
  height: 4px; border-radius: 999px; background: #2b3441;
}
.${SLIDER_CLASS}::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: ${THUMB_SIZE_PX}px; height: ${THUMB_SIZE_PX}px;
  margin-top: ${(4 - THUMB_SIZE_PX) / 2}px;
  border-radius: 50%; background: #5eead4; border: none;
  box-shadow: 0 1px 4px rgba(0,0,0,0.45);
}
.${SLIDER_CLASS}::-moz-range-track {
  height: 4px; border-radius: 999px; background: #2b3441;
}
.${SLIDER_CLASS}::-moz-range-thumb {
  width: ${THUMB_SIZE_PX}px; height: ${THUMB_SIZE_PX}px;
  border-radius: 50%; background: #5eead4; border: none;
}
.${SLIDER_CLASS}:focus-visible { outline: 2px solid #5eead4; outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

type RotationVariant = { sprite?: string; flipH?: boolean };
type DecorEntry = {
  name?: string;
  baseCapacitySlots?: number;
  rotationVariants?: Record<string, RotationVariant>;
};

/** A sprite the preview can show, with the mirroring it must be drawn with. */
export type DecorSpriteState = { spriteIds: string[]; mirrored: boolean };


function getEntry(decorId: string): DecorEntry | null {
  if (!decorId) return null;
  const entry = (decorCatalog as Record<string, unknown>)?.[decorId];
  return entry && typeof entry === "object" ? (entry as DecorEntry) : null;
}

/** Storages (silo, hutch, shed, trough) are the decors the game never rotates. */
export function isStorageDecor(decorId: string): boolean {
  const entry = getEntry(decorId);
  return typeof entry?.baseCapacitySlots === "number";
}

/** `"sprite/decor/MarbleBenchSideways"` -> `"MarbleBenchSideways"`. */
function spriteIdFromRef(ref: string): string {
  const parts = String(ref || "").split("/");
  return parts[parts.length - 1]?.trim() || "";
}

function positiveAngles(entry: DecorEntry | null): number[] {
  return Object.keys(entry?.rotationVariants ?? {})
    .map(Number)
    .filter((angle) => Number.isFinite(angle) && angle > 0)
    .sort((a, b) => a - b);
}

/** Every visually distinct rotation the decor accepts, in slider order. */
export function getDecorRotationStates(decorId: string): number[] {
  const entry = getEntry(decorId);
  if (!entry || isStorageDecor(decorId)) return [ANGLE_NONE];

  const angles = positiveAngles(entry);
  if (angles.length) return [ANGLE_NONE, ...angles];
  return [ANGLE_NONE, ANGLE_MIRRORED_NONE];
}

/** The sprite to draw for one rotation value, mirroring included. */
export function resolveDecorSpriteState(decorId: string, rotation: number): DecorSpriteState {
  const entry = getEntry(decorId);
  const angle = Math.abs(Number(rotation) || 0) % FULL_TURN_DEGREES;
  const variant = angle ? entry?.rotationVariants?.[String(angle)] : undefined;
  const variantId = variant?.sprite ? spriteIdFromRef(variant.sprite) : "";

  // A variant can itself be a mirrored draw of another sprite (90° = the
  // sideways sprite flipped). That flip and the user's flip cancel out, hence
  // the XOR rather than an or.
  const mirrored = Boolean(variant?.flipH) !== ((Number(rotation) || 0) < 0);

  return {
    spriteIds: variantId ? [variantId, decorId] : [decorId],
    mirrored,
  };
}

export function formatRotationLabel(rotation: number): string {
  const value = Number(rotation) || 0;
  const angle = Math.abs(value) % FULL_TURN_DEGREES;
  return value < 0 ? `${angle}° mirrored` : `${angle}°`;
}

function createLabel(text: string): HTMLDivElement {
  const label = document.createElement("div");
  label.textContent = text;
  label.style.fontSize = "12px";
  label.style.opacity = "0.8";
  label.style.textAlign = "center";
  return label;
}

function createPreviewBox(): HTMLDivElement {
  const box = document.createElement("div");
  Object.assign(box.style, {
    width: "100%",
    maxWidth: `${CONTENT_MAX_WIDTH_PX}px`,
    justifySelf: "center",
    boxSizing: "border-box",
    height: `${PREVIEW_SIZE_PX + 14}px`,
    display: "grid",
    placeItems: "center",
    borderRadius: "8px",
    border: "1px solid #2b3441",
    background: "rgba(10,14,20,0.9)",
    overflow: "hidden",
  } as Partial<CSSStyleDeclaration>);
  return box;
}

/** Holds the track narrower than the panel, leaving room for the edge labels. */
function createTrackWrap(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.style.width = "100%";
  wrap.style.maxWidth = `${CONTENT_MAX_WIDTH_PX - TRACK_INSET_PX * 2}px`;
  wrap.style.justifySelf = "center";
  wrap.style.display = "grid";
  wrap.style.gap = "2px";
  return wrap;
}

function createSlider(stopCount: number, value: number): HTMLInputElement {
  ensureSliderStyle();

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = SLIDER_CLASS;
  slider.min = "0";
  slider.max = String(stopCount - 1);
  slider.step = "1";
  slider.value = String(value);
  return slider;
}

/**
 * Labelled notches under the track, one per stop, with the active one lit.
 *
 * Each notch sits where the thumb centre actually lands: the usable travel is
 * `100% - THUMB_SIZE_PX`, offset by half a thumb. Spacing the notches evenly
 * across the full width instead would drift them apart from the thumb, most
 * visibly at the two ends.
 */
function createTicks(labels: string[]): { root: HTMLDivElement; setActive: (index: number) => void } {
  const root = document.createElement("div");
  root.style.position = "relative";
  root.style.width = "100%";
  root.style.height = "20px";

  const lastIndex = Math.max(1, labels.length - 1);

  const cells = labels.map((text, index) => {
    const fraction = index / lastIndex;

    const cell = document.createElement("div");
    cell.style.position = "absolute";
    cell.style.top = "0";
    cell.style.left = `calc(${THUMB_SIZE_PX / 2}px + (100% - ${THUMB_SIZE_PX}px) * ${fraction})`;
    cell.style.transform = "translateX(-50%)";
    cell.style.display = "grid";
    cell.style.justifyItems = "center";
    cell.style.gap = "2px";

    const mark = document.createElement("div");
    mark.style.width = "1px";
    mark.style.height = "5px";
    mark.style.background = "#2b3441";

    const caption = document.createElement("div");
    caption.textContent = text;
    caption.style.fontSize = "10px";
    caption.style.whiteSpace = "nowrap";
    caption.style.color = "#8b97a8";

    cell.append(mark, caption);
    root.appendChild(cell);
    return { mark, caption };
  });

  const setActive = (index: number) => {
    cells.forEach(({ mark, caption }, i) => {
      const active = i === index;
      mark.style.background = active ? "#5eead4" : "#2b3441";
      caption.style.color = active ? "#5eead4" : "#8b97a8";
      caption.style.fontWeight = active ? "700" : "400";
    });
  };

  return { root, setActive };
}

/**
 * "Rotation" slider + live sprite preview for a decor.
 *
 * A decor with a single legal state — every storage, since they never rotate —
 * gets the preview alone, with no slider and no `onSelect`.
 */
export function createDecorRotationControl(
  decorId: string,
  currentRotation: number,
  onSelect: (rotation: number) => void,
): HTMLDivElement {
  const root = document.createElement("div");
  root.style.display = "grid";
  root.style.gap = "6px";
  root.style.width = "100%";
  root.style.maxWidth = "100%";
  root.style.boxSizing = "border-box";
  root.style.overflow = "hidden";

  const preview = createPreviewBox();
  const holder = document.createElement("div");
  holder.style.width = `${PREVIEW_SIZE_PX}px`;
  holder.style.height = `${PREVIEW_SIZE_PX}px`;
  holder.style.display = "grid";
  holder.style.placeItems = "center";
  preview.appendChild(holder);

  const renderSprite = (spriteIds: string[], mirrored: boolean) => {
    holder.innerHTML = "";
    holder.style.transform = mirrored ? "scaleX(-1)" : "none";
    attachSpriteIcon(holder, ["decor"], spriteIds, PREVIEW_SIZE_PX, SPRITE_LOG_TAG, {
      onNoSpriteFound: () => {
        holder.textContent = (decorId || "D").charAt(0).toUpperCase();
      },
    });
  };

  const states = getDecorRotationStates(decorId);
  let index = Math.max(0, states.indexOf(Number(currentRotation) || 0));

  root.append(createLabel("Rotation"), preview);

  if (states.length > 1) {
    const slider = createSlider(states.length, index);
    const ticks = createTicks(states.map(formatRotationLabel));

    const apply = () => {
      const rotation = states[index] ?? ANGLE_NONE;
      const { spriteIds, mirrored } = resolveDecorSpriteState(decorId, rotation);
      renderSprite(spriteIds, mirrored);
      ticks.setActive(index);
    };
    slider.oninput = () => {
      index = Number(slider.value) || 0;
      apply();
      onSelect(states[index] ?? ANGLE_NONE);
    };

    const track = createTrackWrap();
    track.append(slider, ticks.root);
    root.appendChild(track);

    apply();
    return root;
  }

  const rotation = states[0] ?? ANGLE_NONE;
  const { spriteIds, mirrored } = resolveDecorSpriteState(decorId, rotation);
  renderSprite(spriteIds, mirrored);
  return root;
}
