// Draws in the thread the thumbnails the bubble shows in the game.
//
// Two mechanisms, one intent. In the game the companion sets a tag and the
// game's engine draws it. Here we are in the DOM, where the game's markup
// would show as is, so the same objects are drawn again from the mod's atlas.
// The description comes from the same place in both cases, the bubble's tags,
// so the menu never ends up saying something other than the bubble.

import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import type { BubbleTag } from "../chat/bubbleTags";
import { iconSlot } from "./dom";

const SPRITE_LOG_TAG = "companion-thread";

/**
 * Splits an atlas key into category and name.
 *
 * Tags carry the full path (`sprite/plant/Carrot`) because that is what the
 * game expects; the mod's resolver wants the two halves apart. The query goes
 * before the extension: a live catalog adds `?v=1125`, and the other order
 * would leave the extension stuck to the name.
 */
function splitSpriteKey(key: string): { category: string; name: string } | null {
  const parts = key.split(/[?#]/)[0].split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const name = parts[parts.length - 1].replace(/\.[a-z0-9]+$/i, "");
  return name ? { category: parts[parts.length - 2], name } : null;
}

function holder(sizePx: number): HTMLElement {
  const box = iconSlot(sizePx, true);
  box.style.verticalAlign = "-4px";
  box.style.marginRight = "4px";
  return box;
}

/** A pet's species, read on the inventory object the tag carries. */
function petSpeciesOf(pet: unknown): string | null {
  const species = (pet as { petSpecies?: unknown } | null)?.petSpecies;
  return typeof species === "string" && species ? species : null;
}

/**
 * A thumbnail for a bubble tag, or `null` when it cannot be drawn.
 *
 * `null` rather than an empty box: the text stands on its own, and a grey
 * square in front of every message would be worse than no picture.
 */
function tagIcon(tag: BubbleTag, sizePx: number): HTMLElement | null {
  if ("mutation" in tag) {
    const box = holder(sizePx);
    // The `ui` atlas holds the round badges; the `mutation` category holds the
    // overlays put on the plant, unreadable at this size.
    attachSpriteIcon(box, ["ui", "mutation"], [`Mutation${tag.mutation}`, tag.mutation], sizePx, SPRITE_LOG_TAG);
    return box;
  }

  if ("petThing" in tag) {
    const species = petSpeciesOf(tag.petThing.pet);
    if (!species) return null;
    const box = holder(sizePx);
    attachSpriteIcon(box, ["pet"], [species, species.replace(/\s+/g, "")], sizePx, SPRITE_LOG_TAG);
    return box;
  }

  const split = splitSpriteKey(tag.gameThing.sprite);
  if (!split) return null;
  const box = holder(sizePx);
  attachSpriteIcon(box, [split.category], [split.name], sizePx, SPRITE_LOG_TAG);
  return box;
}

/** All of a message's thumbnails, in the order the bubble places them. */
export function tagIcons(tags: BubbleTag[] | undefined, sizePx: number): HTMLElement[] {
  if (!tags || tags.length === 0) return [];
  return tags.map((tag) => tagIcon(tag, sizePx)).filter((icon): icon is HTMLElement => icon !== null);
}

/** The game's markup: `<0/>` for an inline icon. */
const TAG_MARKER = /<(\d+)\/>/g;

/**
 * Cuts up a tagged sentence and returns its pieces, icons in place.
 *
 * That is the difference between "a sprite then three names" and "each name
 * with its sprite". A marker pointing to an icon that cannot be found simply
 * vanishes, and the text around closes over it.
 */
export function renderTagged(text: string, tags: BubbleTag[] | undefined, sizePx: number): Node[] {
  if (!tags || tags.length === 0) return [document.createTextNode(text)];

  const out: Node[] = [];
  let cursor = 0;

  for (const match of text.matchAll(TAG_MARKER)) {
    const at = match.index ?? 0;
    if (at > cursor) out.push(document.createTextNode(text.slice(cursor, at)));
    cursor = at + match[0].length;

    const tag = tags[Number(match[1])];
    const icon = tag ? tagIcon(tag, sizePx) : null;
    if (icon) out.push(icon);
  }

  if (cursor < text.length) out.push(document.createTextNode(text.slice(cursor)));
  return out;
}
