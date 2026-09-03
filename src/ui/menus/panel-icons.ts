// src/ui/menus/panel-icons.ts
// Sprite rendering for panel components: atlas frame keys and hosted images.

import { attachSpriteIcon } from '../spriteIconCache';
import { setImageSafe } from '../../utils/discordCsp';

// Kept local rather than imported from panel-ui: panel-ui builds on these
// helpers, and importing back the other way would make the pair circular.
const css = (el: HTMLElement, style: Partial<CSSStyleDeclaration>) =>
  Object.assign(el.style, style);

/**
 * Splits an atlas frame key into the category/name pair the sprite API uses.
 *
 * The API pluralises some categories (`sprite/object/…` is served under
 * `objects/`), and a few sprites exist under more than one, so candidates are
 * returned rather than a single guess — `attachSpriteIcon` takes the first that
 * resolves.
 */
export function spriteLookup(frameKey: string): { categories: string[]; name: string } {
  const parts = frameKey.split('/').filter(Boolean);
  const name = parts[parts.length - 1] ?? frameKey;
  const category = parts.length >= 2 ? parts[parts.length - 2] : '';
  const categories = [category, `${category}s`, 'ui', 'decor', 'objects'].filter(
    (value, index, all) => value && all.indexOf(value) === index,
  );
  return { categories, name };
}

/**
 * Square icon holder for an atlas frame key (`sprite/decor/SeedSilo`) or a
 * hosted image URL. Remote URLs go through `setImageSafe`, which routes them via
 * GM inside the Discord Activity where the CSP blocks direct loads.
 */
export function iconBox(source: string, sizePx: number, logTag: string): HTMLElement {
  const box = document.createElement('div');
  css(box, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    flex: '0 0 auto',
  });
  if (/^https?:\/\//i.test(source)) {
    const img = document.createElement('img');
    // Smooth, not pixelated: these are full-resolution PNGs being scaled *down*
    // into a small box, where nearest-neighbour just shreds the edges. The
    // atlas path in spriteIconCache already renders with `auto` for the same
    // reason.
    css(img, { maxWidth: '100%', maxHeight: '100%', imageRendering: 'auto' });
    img.alt = '';
    setImageSafe(img, source);
    box.appendChild(img);
  } else {
    const { categories, name } = spriteLookup(source);
    attachSpriteIcon(box, categories, name, sizePx, logTag);
  }
  return box;
}
