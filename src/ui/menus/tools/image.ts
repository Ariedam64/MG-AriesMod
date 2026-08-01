// Shared image helpers for the Tools menu: blob loading (GM first, fetch
// fallback) and the icon tile, which accepts either an emoji or a remote URL.
// Styling lives in styles.ts (`.mgt-tile`).
import { getBlob } from "../../../utils/mgCommon";

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
 * Rounded tile holding a tool icon: an <img> when the icon is a remote URL,
 * the raw character when it is an emoji.
 */
export function createIconTile(icon: string, size: "sm" | "lg" = "sm"): HTMLElement {
  const tile = document.createElement("div");
  tile.className = size === "lg" ? "mgt-tile mgt-tile--lg" : "mgt-tile";

  if (!isImageUrl(icon)) {
    tile.textContent = icon;
    return tile;
  }

  const img = document.createElement("img");
  img.alt = "";
  loadImageInto(img, icon);
  tile.appendChild(img);
  return tile;
}

/**
 * Loads a remote image into an <img> using the GM-first strategy, so images
 * keep working inside the Discord Activity CSP sandbox.
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
