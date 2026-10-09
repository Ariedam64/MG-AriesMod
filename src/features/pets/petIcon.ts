// The small framed pet portrait used across the Pets menu: team list, Team
// Builder, Feeding list and Logs.

import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import { ensurePetsStyles } from "./styles";

export type PetIconSource = {
  petSpecies?: string | null;
  mutations?: string[] | null;
  name?: string | null;
};

/**
 * Sprite URLs already resolved, by species and mutations. A rebuilt list
 * draws its icons at once from here instead of blinking while the sprite
 * loader resolves them again.
 */
const resolvedSprites = new Map<string, string>();

function spriteImg(src: string, size: number): HTMLImageElement {
  const img = document.createElement("img");
  img.src = src;
  img.width = size;
  img.height = size;
  img.alt = "";
  img.draggable = false;
  img.style.width = img.style.height = `${size}px`;
  return img;
}

/**
 * A pet portrait in a rounded frame. Shows the first letter of the species or
 * name until the sprite loads, or for good when there is none. `null` draws an
 * empty, faded slot.
 */
export function petIcon(pet: PetIconSource | null, size: number): HTMLElement {
  ensurePetsStyles();
  const holder = document.createElement("div");
  holder.className = "pt-pet-icon";
  holder.style.width = holder.style.height = `${size}px`;
  holder.style.borderRadius = `${Math.round(size / 3.5)}px`;
  holder.style.fontSize = `${Math.max(9, Math.round(size * 0.45))}px`;

  if (!pet) {
    holder.classList.add("is-empty");
    holder.textContent = "·";
    return holder;
  }

  const species = String(pet.petSpecies ?? "").trim();
  const mutations = Array.isArray(pet.mutations) ? pet.mutations : [];
  const cacheKey = `${species}|${mutations.join(",")}`;

  const cached = resolvedSprites.get(cacheKey);
  if (cached) {
    holder.appendChild(spriteImg(cached, size));
    return holder;
  }

  holder.textContent = (pet.name || species || "pet").charAt(0).toUpperCase();
  if (species) {
    attachSpriteIcon(holder, ["pet"], species, size, "pet-icon", {
      mutations,
      onSpriteApplied: (img) => resolvedSprites.set(cacheKey, img.src),
    });
  }
  return holder;
}
