// Crop sprites for the price simulator: which atlas names to try for a
// species, the big preview with its mutations, and the small list icon.

import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import { h } from "../../ui/kit/dom";
import type { LockerSeedOption } from "../locker/menu";

const PREVIEW_SPRITE_PX = 96;

const DEFAULT_CATEGORIES = ["tallplant", "plant", "crop"];
/** Species whose plant sprite is the one to show, ahead of the tall plant. */
const PLANT_FIRST_SPECIES = new Set([
  "dawncelestial",
  "mooncelestial",
  "dawnbinder",
  "moonbinder",
  "dawnbinderbulb",
  "moonbinderbulb",
  "dawnbinderpod",
  "moonbinderpod",
]);

/** The atlas names the game uses for mutations whose display name differs. */
const MUTATION_SPRITE_NAMES: Record<string, string> = {
  Dawnbound: "Dawncharged",
  Amberlit: "Ambershine",
  Amberbound: "Ambercharged",
};

/** "sprite/plant/CloverFourLeaf.png?v=163" -> "CloverFourLeaf". */
function spriteNameFromPath(path: string): string | null {
  const file = String(path || "").trim().split("/").pop() || "";
  return file.replace(/\.[a-z0-9]+(\?.*)?$/i, "") || null;
}

/** Names to try for a species, the catalog's sprite path first since it is exact. */
function spriteCandidates(species: string, option?: LockerSeedOption | null): string[] {
  const names = new Set<string>();
  const add = (value?: string | null) => {
    const trimmed = String(value ?? "").trim();
    if (!trimmed) return;
    names.add(trimmed);
    names.add(trimmed.replace(/\W+/g, ""));
  };
  if (option?.spriteKey) add(spriteNameFromPath(option.spriteKey));
  add(species);
  if (option) {
    add(option.cropName);
    add(option.seedName);
  }
  const iconNames = Array.from(names, (name) => name.replace(/icon$/i, "")).filter(Boolean);
  const all = Array.from(new Set([...iconNames.map((name) => `${name}Icon`), ...names])).filter(Boolean);
  return all.length ? all : [species];
}

function spriteCategories(option: LockerSeedOption): string[] {
  for (const name of [option.key, option.seedName, option.cropName]) {
    if (PLANT_FIRST_SPECIES.has(String(name ?? "").trim().toLowerCase())) return ["plant", "tallplant", "crop"];
  }
  return [...DEFAULT_CATEGORIES];
}

/** A small crop icon with an emoji until the sprite loads. */
export function cropListIcon(option: LockerSeedOption, emoji: string, size: number): HTMLElement {
  const wrap = h("span", undefined, emoji.trim() ? emoji : "??");
  Object.assign(wrap.style, {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  attachSpriteIcon(wrap, spriteCategories(option), spriteCandidates(option.key, option), size, "calculator-list");
  return wrap;
}

export type CropPreview = {
  root: HTMLElement;
  /** Shows a crop with its mutations, the emoji standing in until the sprite loads. */
  show(option: LockerSeedOption, mutations: string[], emoji: string): void;
  /** Scales the sprite with the Size, 50 to 100 percent. */
  setSize(size: number): void;
  clear(): void;
};

export function cropPreview(): CropPreview {
  const root = h("span");
  Object.assign(root.style, {
    position: "relative",
    display: "inline-flex",
    flexShrink: "0",
    width: `${PREVIEW_SPRITE_PX}px`,
    height: `${PREVIEW_SPRITE_PX}px`,
    transformOrigin: "center",
  });

  const fill = { position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center" };
  const fallback = h("span");
  Object.assign(fallback.style, fill, { zIndex: "0", fontSize: "42px" });
  const layer = h("span");
  Object.assign(layer.style, fill, { zIndex: "1" });
  root.append(fallback, layer);

  const syncFallback = () => {
    fallback.style.opacity = layer.childElementCount > 0 ? "0" : "";
  };

  return {
    root,
    show(option, mutations, emoji) {
      fallback.textContent = emoji.trim() ? emoji : "??";
      syncFallback();
      attachSpriteIcon(layer, spriteCategories(option), spriteCandidates(option.key, option), PREVIEW_SPRITE_PX, "calculator", {
        mutations: mutations.length ? mutations.map((m) => MUTATION_SPRITE_NAMES[m] ?? m) : undefined,
        onSpriteApplied: syncFallback,
      });
    },
    setSize(size) {
      root.style.transform = `scale(${size / 100})`;
    },
    clear() {
      fallback.textContent = "";
      layer.replaceChildren();
      syncFallback();
    },
  };
}
