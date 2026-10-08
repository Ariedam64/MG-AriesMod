import { h } from "../../ui/kit/dom";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";

/** The sprite of a shop alert item, with an emoji until the sprite loads. */

const FALLBACK_GLYPH: Record<string, string> = { Seed: "🌱", Egg: "🥚", Tool: "🧰", Decor: "🏠" };

const SPRITE_CATEGORIES: Record<string, string[]> = {
  Seed: ["seed"],
  Egg: ["pet"],
  Tool: ["item"],
  Decor: ["decor"],
};

/** Sprite names to try, best guess first: the catalog key, then the display name. */
function spriteCandidates(type: string, key: string, name: string): string[] {
  const out = new Set<string>();
  const add = (value: string | undefined) => {
    const trimmed = value?.trim();
    if (!trimmed) return;
    out.add(trimmed);
    out.add(trimmed.replace(/\s+/g, ""));
    // Seed and egg names often end with the word; their sprites do not.
    if (type === "Seed" || type === "Egg") {
      const stripped = trimmed.replace(/(?:seed|egg)$/i, "").trim();
      if (stripped) {
        out.add(stripped);
        out.add(stripped.replace(/\s+/g, ""));
      }
    }
  };
  add(key);
  add(name);
  const names = [...out];
  for (const value of names) {
    const base = value.replace(/icon$/i, "");
    if (base) out.add(`${base}Icon`);
  }
  return [...out];
}

/** A square holding the icon of `Seed:Carrot` (or any alert item id) at `size` px. */
export function shopItemIcon(id: string, name: string, size: number, logTag: string): HTMLDivElement {
  const [type = "", key = ""] = id.split(":");
  const wrap = h("div");
  Object.assign(wrap.style, {
    width: `${size}px`,
    height: `${size}px`,
    flex: `0 0 ${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const glyph = h("span", undefined, FALLBACK_GLYPH[type] ?? "🏠");
  glyph.style.fontSize = `${Math.max(10, Math.round(size * 0.75))}px`;
  glyph.setAttribute("aria-hidden", "true");
  wrap.appendChild(glyph);

  const categories = SPRITE_CATEGORIES[type];
  const candidates = spriteCandidates(type, key || name, name);
  if (categories && candidates.length) attachSpriteIcon(wrap, categories, candidates, size, logTag);
  return wrap;
}
