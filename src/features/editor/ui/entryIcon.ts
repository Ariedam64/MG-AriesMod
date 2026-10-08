// The sprite of a plant or decor, with its initial as a fallback.

import { plantCatalog } from "../../../data";
import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";

/** Every spelling worth trying as a sprite name: as given, without spaces, and the last path segment. */
function spriteCandidates(...names: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const value of names) {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) continue;
    set.add(trimmed);
    set.add(trimmed.replace(/\s+/g, ""));
    const last = trimmed.split(/[./]/).pop();
    if (last && last !== trimmed) {
      set.add(last);
      set.add(last.replace(/\s+/g, ""));
    }
  }
  return Array.from(set).filter(Boolean);
}

/** The atlas key the catalog gives a plant, e.g. "sprite/plant/CloverFourLeaf". */
function plantSpriteKey(species: string): string | null {
  const entry = (plantCatalog as Record<string, any>)[species];
  return entry?.crop?.sprite ?? entry?.plant?.sprite ?? null;
}

/** An icon for a plant (by species) or a decor (by id), `size` pixels square. */
export function entryIcon(kind: "plant" | "decor", id: string, label: string, size: number): HTMLElement {
  const wrap = document.createElement("span");
  Object.assign(wrap.style, {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${Math.max(14, size - 10)}px`,
    lineHeight: "1",
  });
  wrap.setAttribute("aria-hidden", "true");

  const fallback = label?.trim().charAt(0).toUpperCase() || (kind === "decor" ? "D" : "P");
  const applyFallback = () => {
    if (!wrap.querySelector("img")) wrap.textContent = fallback;
  };

  // The atlas key goes first (e.g. "CloverFourLeaf"): fuzzy matching on the
  // catalog key ("FourLeafClover") can land on another sprite.
  const atlasName = kind === "plant" ? plantSpriteKey(id)?.split("/").pop() : null;
  const candidates = spriteCandidates(atlasName, id, label);
  let categories = kind === "decor" ? ["decor"] : ["plant"];
  if (kind === "plant" && /bamboo|cactus/i.test(id || label || "")) categories = ["tallplant", "tallPlant", "plant"];

  if (candidates.length) {
    attachSpriteIcon(wrap, categories, candidates, size, "editor", { onNoSpriteFound: applyFallback });
  } else {
    applyFallback();
  }
  return wrap;
}
