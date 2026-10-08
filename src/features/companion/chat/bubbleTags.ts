// Game icons inside the companion's bubble.
//
// The game accepts a `tags` field next to `message` in `npcChatBubblesAtom`,
// and only for NPCs: the player bubble path does not pass it on. The companion
// being one, it qualifies.
//
// The markup is `<0/>` for an inline icon and `<0>text</0>` to style a
// fragment, and `tags` is an object keyed by that number. It is what the game
// uses itself: "With all this Rain, your crops are gonna get soaking <0/>!"
// with `{ 0: { mutation: "Wet", backgroundColor } }`.
//
// Pure: it builds the line, it does not speak. Catalog reads live in
// `bubbleIcons.ts`.

/**
 * A mutation chip, as the game draws it in its own weather lines.
 * `icon: false` gives the name without the chip.
 */
export type MutationTag = {
  mutation: string;
  backgroundColor?: number;
  icon?: boolean;
  iconSizePx?: number;
};

/**
 * Any game sprite, given by its atlas key.
 *
 * The renderer does `Sprite.from(sprite)`, so anything the loaded atlases know
 * goes. An empty `name` gives the icon alone, with no label.
 */
export type GameThingTag = {
  gameThing: { name: string; sprite: string };
  iconSizePx?: number;
  /**
   * The thread can draw this key, the game cannot.
   *
   * Two vocabularies carry the same meaning: `tileRef` names a sprite in the
   * atlases the mod loads itself, `sprite` names an entry in the game's texture
   * cache. Sending the first to the game draws an empty square, since
   * `Sprite.from` finds nothing.
   *
   * These tags are therefore removed from the message sent to the game. The
   * markup stays: the game skips a marker whose tag is missing, leaving no gap.
   */
  modOnly?: boolean;
};

/**
 * A specific pet, as the game draws it everywhere else.
 *
 * `pet` is the inventory object, not a name: this is the only tag that goes
 * through the pet renderer, so the only one that really composes its
 * mutations. An empty name gives the icon alone.
 */
export type PetThingTag = {
  petThing: { name: string; pet: unknown };
  iconSizePx?: number;
};

export type BubbleTag = MutationTag | GameThingTag | PetThingTag;

export type BubbleLine = { message: string; tags?: Record<number, BubbleTag> };

/** A piece of sentence: text, an icon, or nothing. */
type Fragment = string | BubbleTag | null | undefined;

/**
 * Puts a sentence and its icons together, numbering the markers.
 *
 * Null fragments vanish without a gap: that is what lets the icon makers
 * return `null` when the catalog does not know the object. An unknown atlas key
 * would raise no error, it would draw an empty square, which is worse than a
 * sentence without a picture.
 */
export function compose(...fragments: Fragment[]): BubbleLine {
  const tags: Record<number, BubbleTag> = {};
  let message = "";
  let next = 0;

  for (const fragment of fragments) {
    if (fragment === null || fragment === undefined) continue;
    if (typeof fragment === "string") {
      message += fragment;
      continue;
    }
    tags[next] = fragment;
    message += `<${next}/>`;
    next += 1;
  }

  // An empty object is truthy: letting it through would switch the game to
  // its tagged rendering for a sentence without a single marker.
  const tidy = tidySpacing(message);
  return next === 0 ? { message: tidy } : { message: tidy, tags };
}

/**
 * Cleans up the blanks a missing fragment leaves.
 *
 * Sentences are written assuming the icon is there; when the catalog does not
 * know it, it vanishes and leaves "12  ready" or "12 . Pick". Cleaning here
 * rather than at every call keeps the next caller from bringing the flaw back.
 * Markers are never touched: `<0/>` has neither spaces nor punctuation.
 */
function tidySpacing(message: string): string {
  return message
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

/**
 * Separates icons with a space, to put them one after the other in a sentence.
 *
 * `compose` does not guess where to break: without this, two tags side by
 * side give `<0/><1/>`, and the game draws two sprites touching.
 */
export function spaced(tags: BubbleTag[]): Fragment[] {
  return tags.flatMap((tag, index) => (index === 0 ? [tag] : [" ", tag]));
}

/**
 * A mutation's chip.
 *
 * `backgroundColor` is the NPC bubble colour in the game's own lines, so the
 * chip matches the background. Optional: without it the game uses its default.
 */
export function mutationChip(mutation: string, backgroundColor?: number): MutationTag {
  return { mutation, ...(backgroundColor === undefined ? {} : { backgroundColor }) };
}

/**
 * The version of a line the game can draw.
 *
 * Tags it cannot resolve go, **and their marker with them**. Removing the tag
 * alone was not enough: the game does skip the orphan marker, but the text
 * closed up badly into "2 . Pick them?". So the sentence is stitched back and
 * the spaces fixed. The numbers of the remaining tags do not move: they are
 * what the surviving markers point to.
 */
export function forGame(line: BubbleLine): BubbleLine {
  if (!line.tags) return line;

  const kept: Record<number, BubbleTag> = {};
  const dropped = new Set<number>();
  for (const [index, tag] of Object.entries(line.tags)) {
    if ("gameThing" in tag && tag.modOnly === true) dropped.add(Number(index));
    else kept[Number(index)] = tag;
  }
  if (dropped.size === 0) return line;

  const message = tidySpacing(
    line.message.replace(/<(\d+)\/>/g, (marker, index) => (dropped.has(Number(index)) ? "" : marker)),
  );
  return Object.keys(kept).length > 0 ? { message, tags: kept } : { message };
}
