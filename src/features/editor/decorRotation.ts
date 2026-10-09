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
import { h } from "../../ui/kit/dom";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import { ROTATION_THUMB_PX, ensureEditorStyles } from "./ui/styles";

/** Neutral rotation. */
const ANGLE_NONE = 0;
/** The game's encoding for "0°, mirrored", see the note above. */
const ANGLE_MIRRORED_NONE = -360;
const FULL_TURN_DEGREES = 360;

const PREVIEW_SIZE_PX = 64;
const SPRITE_LOG_TAG = "editor-decor-rotation";

// The thumb travels between its own half-widths, not the full track, so the
// notches can only line up if we pin the thumb to a known size. The slider's
// CSS in `ui/styles.ts` uses the same constant.
const THUMB_SIZE_PX = ROTATION_THUMB_PX;

type RotationVariant = { sprite?: string; flipH?: boolean };
type DecorEntry = {
  name?: string;
  baseCapacitySlots?: number;
  rotationVariants?: Record<string, RotationVariant>;
};

/** A sprite the preview can show, with the mirroring it must be drawn with. */
type DecorSpriteState = { spriteIds: string[]; mirrored: boolean };


function getEntry(decorId: string): DecorEntry | null {
  if (!decorId) return null;
  const entry = (decorCatalog as Record<string, unknown>)?.[decorId];
  return entry && typeof entry === "object" ? (entry as DecorEntry) : null;
}

/** Storages (silo, hutch, shed, trough) are the decors the game never rotates. */
function isStorageDecor(decorId: string): boolean {
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
function getDecorRotationStates(decorId: string): number[] {
  const entry = getEntry(decorId);
  if (!entry || isStorageDecor(decorId)) return [ANGLE_NONE];

  const angles = positiveAngles(entry);
  if (angles.length) return [ANGLE_NONE, ...angles];
  return [ANGLE_NONE, ANGLE_MIRRORED_NONE];
}

/** The sprite to draw for one rotation value, mirroring included. */
function resolveDecorSpriteState(decorId: string, rotation: number): DecorSpriteState {
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

function formatRotationLabel(rotation: number): string {
  const value = Number(rotation) || 0;
  const angle = Math.abs(value) % FULL_TURN_DEGREES;
  return value < 0 ? `${angle}° mirrored` : `${angle}°`;
}

function createSlider(stopCount: number, value: number): HTMLInputElement {
  const slider = h("input", "qws-ed-rot__slider");
  slider.type = "range";
  slider.setAttribute("aria-label", "Rotation");
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
  const root = h("div", "qws-ed-rot__ticks");
  const lastIndex = Math.max(1, labels.length - 1);

  const cells = labels.map((text, index) => {
    const fraction = index / lastIndex;
    const cell = h("div", "qws-ed-rot__tick");
    cell.style.left = `calc(${THUMB_SIZE_PX / 2}px + (100% - ${THUMB_SIZE_PX}px) * ${fraction})`;
    cell.append(h("div", "qws-ed-rot__mark"), h("div", "qws-ed-rot__caption", text));
    root.appendChild(cell);
    return cell;
  });

  const setActive = (index: number) => {
    cells.forEach((cell, i) => cell.classList.toggle("is-active", i === index));
  };

  return { root, setActive };
}

/**
 * "Rotation" slider + live sprite preview for a decor.
 *
 * A decor with a single legal state (every storage, since they never rotate)
 * gets the preview alone, with no slider and no `onSelect`.
 */
export function createDecorRotationControl(
  decorId: string,
  currentRotation: number,
  onSelect: (rotation: number) => void,
): HTMLDivElement {
  ensureEditorStyles();
  const root = h("div", "qws-ed-rot");

  const preview = h("div", "qws-ed-rot__preview");
  const holder = h("div");
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

  root.append(h("div", "qws-ed-label", "Rotation"), preview);

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

    const track = h("div", "qws-ed-rot__track");
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
