import type { SpriteItem, AnimFrameGroup, SpriteTexture } from '../types';
import { animParse, categoryOf } from '../utils/path';

export function buildItemsFromTextures(tex: Map<string, SpriteTexture>) {
  const keys = [...tex.keys()].sort((a, b) => a.localeCompare(b));
  const used = new Set<string>();
  const items: SpriteItem[] = [];
  const cats = new Map<string, SpriteItem[]>();

  const addToCat = (key: string, item: SpriteItem) => {
    const cat = categoryOf(key);
    if (!cats.has(cat)) cats.set(cat, []);
    cats.get(cat)!.push(item);
  };

  for (const key of keys) {
    const texEntry = tex.get(key);
    if (!texEntry || used.has(key)) continue;

    const anim = animParse(key);
    if (!anim) {
      const item = { key, isAnim: false as const, first: texEntry };
      items.push(item);
      addToCat(key, item);
      continue;
    }

    const frames: { idx: number; tex: SpriteTexture }[] = [];
    for (const candidate of keys) {
      const maybe = animParse(candidate);
      if (!maybe || maybe.baseKey !== anim.baseKey) continue;
      const t = tex.get(candidate);
      if (!t) continue;
      frames.push({ idx: maybe.idx, tex: t });
      used.add(candidate);
    }
    frames.sort((a, b) => a.idx - b.idx);
    const ordered = frames.map(f => f.tex);
    if (ordered.length === 1) {
      const item = { key: anim.baseKey, isAnim: false as const, first: ordered[0] };
      items.push(item);
      addToCat(anim.baseKey, item);
    } else if (ordered.length > 1) {
      const item: AnimFrameGroup = {
        key: anim.baseKey,
        isAnim: true,
        frames: ordered,
        first: ordered[0],
        count: ordered.length,
      };
      items.push(item);
      addToCat(anim.baseKey, item);
    }
  }

  return { items, cats };
}
