// Crop sprites for the price simulator: which atlas names to try for a
// species, the big preview with its mutations, and the small list icon.

import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import { h } from "../../ui/kit/dom";
import {
  getLockerSeedEmojiForKey,
  getLockerSeedEmojiForSeedName,
  type LockerSeedOption,
} from "../locker/seedOptions";

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

/** The emoji that stands in for a crop until its sprite loads. */
export function cropEmoji(option: LockerSeedOption | undefined, key: string): string {
  return (
    getLockerSeedEmojiForKey(key) ||
    (option?.seedName ? getLockerSeedEmojiForSeedName(option.seedName) : undefined) ||
    "🌱"
  );
}

/** A small crop icon with an emoji until the sprite loads. */
export function cropListIcon(option: LockerSeedOption, emoji: string, size: number): HTMLElement {
  const wrap = h("span", "qws-calc-icon", emoji.trim() ? emoji : "??");
  wrap.style.width = wrap.style.height = `${size}px`;
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
  const root = h("span", "qws-calc-sprite");
  root.style.width = root.style.height = `${PREVIEW_SPRITE_PX}px`;
  const fallback = h("span", "qws-calc-sprite__fallback");
  const layer = h("span", "qws-calc-sprite__layer");
  root.append(fallback, layer);

  const syncFallback = () => {
    root.classList.toggle("has-sprite", layer.childElementCount > 0);
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
