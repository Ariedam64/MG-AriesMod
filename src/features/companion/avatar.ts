// The borrowed NPC's outfit, as the game stores it.
//
// The game publishes no character sprite: a look is a stack of cosmetic PNGs
// (body, bottom, middle, top, expression) that it layers on screen.
// `npcAvatarDataAtom` holds each NPC's list of outfit files. It is read, put
// in layer order, and the menu stacks them, the same way as player avatars.

import { makeAtom } from "../../game/store/hub";
import { gameVersion } from "../../game/gameVersion";

const npcAvatarData = makeAtom<Record<string, unknown>>("npcAvatarDataAtom");

/**
 * Layer order, from the back to the front.
 *
 * Cosmetics carry their category as a file name prefix (`Top_AviatorHat.png`).
 * The `/assets/cosmetics` API does serve that category in a field of its own,
 * but it returns an empty catalog today, so the prefix is the only source. An
 * unknown category is skipped rather than drawn at random: a headband on the
 * face would be worse than none.
 */
const LAYER_ORDER = ["Default", "Bottom", "Mid", "Top", "Expression"];

function layerRank(filename: string): number {
  const prefix = filename.split("_")[0];
  return LAYER_ORDER.indexOf(prefix);
}

/**
 * Pulls a list of cosmetic files out of an atom value.
 *
 * The entry's exact shape is not guaranteed from one game version to the
 * next: a plain array is accepted as well as an object holding one. Only what
 * looks like a cosmetic is kept, so a wrong guess gives nothing rather than an
 * absurd picture.
 */
function cosmeticsIn(value: unknown, depth = 0): string[] {
  if (depth > 3 || !value) return [];

  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.endsWith(".png"));
  }
  if (typeof value !== "object") return [];

  for (const nested of Object.values(value as Record<string, unknown>)) {
    const found = cosmeticsIn(nested, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

/**
 * An NPC's outfit layers, in drawing order.
 *
 * Empty when the NPC is unknown or its outfit has not arrived yet: the caller
 * keeps its fallback.
 */
export async function readNpcOutfit(npcId: string): Promise<string[]> {
  if (!npcId) return [];

  let all: Record<string, unknown> | null = null;
  try {
    all = await npcAvatarData.get();
  } catch {
    return [];
  }
  if (!all || typeof all !== "object") return [];

  return cosmeticsIn(all[npcId])
    .filter((filename) => layerRank(filename) >= 0)
    .sort((a, b) => layerRank(a) - layerRank(b));
}

/**
 * A cosmetic PNG's URL.
 *
 * Cosmetics live in the game's versioned assets:
 * `<origin>/version/<version>/assets/cosmetic/<file>`. Without a known version
 * no URL is guessed: better no avatar than a request bound to fail.
 */
export function cosmeticUrl(filename: string): string | null {
  if (!gameVersion || !filename) return null;
  const origin = typeof location !== "undefined" ? location.origin.replace(/\/$/, "") : "";
  if (!origin) return null;
  return `${origin}/version/${gameVersion}/assets/cosmetic/${filename}`;
}
