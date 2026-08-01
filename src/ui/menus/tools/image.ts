// Shared image helpers for the Tools menu: blob loading (GM first, fetch fallback)
// and icon elements that accept either an emoji or a remote image URL.
import { getBlob } from "../../../utils/mgCommon";

const ICON_SIZE_PX = 22;
const EMOJI_FONT_SIZE_PX = 18;

export async function fetchImageBlob(url: string): Promise<Blob> {
  try {
    return await getBlob(url);
  } catch (gmError) {
    console.warn("[Tools] GM_xmlhttpRequest failed, trying fetch:", gmError);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} while loading ${url}`);
    }
    return await res.blob();
  }
}

export function isImageUrl(icon: string): boolean {
  return /^https?:\/\//i.test(icon.trim());
}

/**
 * Builds an icon element for a tool: an <img> when the icon is a remote URL,
 * a plain text span when it is an emoji/character.
 */
export function createToolIcon(icon: string): HTMLElement {
  if (!isImageUrl(icon)) {
    const span = document.createElement("span");
    span.textContent = icon;
    span.style.fontSize = `${EMOJI_FONT_SIZE_PX}px`;
    span.style.lineHeight = "1";
    span.style.flexShrink = "0";
    return span;
  }

  const img = document.createElement("img");
  img.alt = "";
  img.style.width = `${ICON_SIZE_PX}px`;
  img.style.height = `${ICON_SIZE_PX}px`;
  img.style.objectFit = "contain";
  img.style.display = "block";
  img.style.flexShrink = "0";
  img.style.mixBlendMode = "screen";
  img.style.isolation = "isolate";

  void (async () => {
    try {
      const blob = await fetchImageBlob(icon);
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => URL.revokeObjectURL(objectUrl);
      img.src = objectUrl;
    } catch (error) {
      console.warn("[Tools] Unable to load icon:", icon, error);
      img.remove();
    }
  })();

  return img;
}

/**
 * Loads an avatar URL into an <img> using the same GM-first strategy, so
 * creator avatars keep working inside the Discord Activity CSP sandbox.
 */
export function loadImageInto(img: HTMLImageElement, url: string): void {
  void (async () => {
    try {
      const blob = await fetchImageBlob(url);
      const objectUrl = URL.createObjectURL(blob);
      img.onload = () => URL.revokeObjectURL(objectUrl);
      img.src = objectUrl;
    } catch (error) {
      console.warn("[Tools] Unable to load image:", url, error);
      img.style.display = "none";
    }
  })();
}
