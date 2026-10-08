// Icons of the locker menu: a stand-in glyph that the game's sprite replaces
// once it loads.

import { attachSpriteIcon, attachWeatherSpriteIcon } from "../../ui/kit/sprites/iconCache";
import { getLockerSeedEmojiForKey, getLockerSeedEmojiForSeedName } from "./seedOptions";
import { NO_WEATHER_TAG } from "./settings";
import { weatherMutationLabel } from "./weatherTags";

function iconHolder(sizePx: number, fallback: string, fontScale: number): HTMLSpanElement {
  const holder = document.createElement("span");
  holder.className = "lk-icon";
  holder.style.width = `${sizePx}px`;
  holder.style.height = `${sizePx}px`;
  holder.style.fontSize = `${Math.round(sizePx * fontScale)}px`;
  holder.textContent = fallback;
  holder.setAttribute("aria-hidden", "true");
  return holder;
}

/**
 * A crop's icon. The catalog's exact sprite name comes first, since a fuzzy
 * match on the species can land on another sprite (Clover on CloverFourLeaf).
 */
export function seedIcon(seedKey: string, sizePx: number, spriteKey?: string): HTMLSpanElement {
  const fallback = getLockerSeedEmojiForKey(seedKey) ?? getLockerSeedEmojiForSeedName(seedKey) ?? "🌱";
  const holder = iconHolder(sizePx, fallback, 0.75);
  const spriteName = spriteKey?.split("/").pop();
  attachSpriteIcon(holder, ["plant", "tallplant", "crop"], spriteName ? [spriteName, seedKey] : seedKey, sizePx, "plant");
  return holder;
}

export function eggIcon(eggId: string, label: string, sizePx: number): HTMLSpanElement {
  const holder = iconHolder(sizePx, "🥚", 0.75);
  const candidates = new Set<string>();
  for (const value of [eggId, label]) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const last = trimmed.split(/[./]/).pop() ?? trimmed;
    for (const name of [trimmed, last]) {
      candidates.add(name);
      candidates.add(name.replace(/\s+/g, ""));
    }
  }
  attachSpriteIcon(holder, ["pet"], Array.from(candidates), sizePx, "locker-eggs");
  return holder;
}

/** A weather mutation's icon: its initial in a round badge until the sprite loads, a red cross for "no weather". */
export function weatherIcon(tag: string, sizePx: number): HTMLElement {
  const holder = document.createElement("span");
  holder.className = "lk-tile__icon";
  if (tag === NO_WEATHER_TAG) {
    const cross = iconHolder(Math.max(24, sizePx), "✖", 0.65);
    cross.classList.add("lk-no-weather");
    holder.appendChild(cross);
    return holder;
  }
  const label = weatherMutationLabel(tag);
  const badge = iconHolder(Math.max(16, sizePx), label.charAt(0) || "?", 0.55);
  badge.classList.add("lk-weather-badge");
  badge.title = label;
  badge.setAttribute("aria-label", label);
  holder.appendChild(badge);
  attachWeatherSpriteIcon(holder, tag, sizePx);
  return holder;
}
