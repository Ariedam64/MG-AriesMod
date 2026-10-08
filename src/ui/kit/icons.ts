// Square icon holders for atlas frame keys and hosted images.

import { attachSpriteIcon } from "./sprites/iconCache";
import { setImageSafe } from "../../platform/discordCsp";
import { h } from "./dom";

/**
 * Splits an atlas frame key into the category/name pair the sprite API uses.
 *
 * The API pluralises some categories (`sprite/object/...` is served under
 * `objects/`), and a few sprites exist under more than one, so candidates are
 * returned rather than a single guess. `attachSpriteIcon` takes the first that
 * resolves.
 */
function spriteLookup(frameKey: string): { categories: string[]; name: string } {
  const parts = frameKey.split("/").filter(Boolean);
  const name = parts[parts.length - 1] ?? frameKey;
  const category = parts.length >= 2 ? parts[parts.length - 2] : "";
  const categories = [category, `${category}s`, "ui", "decor", "objects"].filter(
    (value, index, all) => value && all.indexOf(value) === index,
  );
  return { categories, name };
}

/**
 * Icon holder for an atlas frame key (`sprite/decor/SeedSilo`) or a hosted
 * image URL. Remote URLs go through `setImageSafe`, which routes them via GM
 * inside the Discord Activity where the CSP blocks direct loads.
 */
export function iconBox(source: string, sizePx: number, logTag: string): HTMLElement {
  const box = h("div", "qmm-icon-box");
  box.style.width = `${sizePx}px`;
  box.style.height = `${sizePx}px`;
  if (/^https?:\/\//i.test(source)) {
    // Smoothed, not pixelated: these are full-resolution PNGs scaled down into
    // a small box, where nearest-neighbour shreds the edges.
    const img = document.createElement("img");
    img.alt = "";
    setImageSafe(img, source);
    box.appendChild(img);
  } else {
    const { categories, name } = spriteLookup(source);
    attachSpriteIcon(box, categories, name, sizePx, logTag);
  }
  return box;
}
