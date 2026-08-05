// Sprite thumbnails for the Skins tab.
//
// Rendering an original is a GPU extract, so a grid of several hundred cells
// must not render them all up front: cells render when they scroll into view.

import { renderFramePreview } from '../../skins/compositor';
import type { SkinTarget } from '../../skins/types';

let observer: IntersectionObserver | null = null;
const pending = new WeakMap<Element, () => void>();

function ensureObserver(): IntersectionObserver | null {
  if (observer) return observer;
  if (typeof IntersectionObserver === 'undefined') return null;
  observer = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const render = pending.get(entry.target);
        if (!render) continue;
        pending.delete(entry.target);
        observer?.unobserve(entry.target);
        render();
      }
    },
    { rootMargin: '200px' },
  );
  return observer;
}

/** Fits a rendered frame into `box` px without blurring pixel art. */
function fit(canvas: HTMLCanvasElement, box: number): HTMLCanvasElement {
  const scale = Math.min(box / canvas.width, box / canvas.height, 4);
  canvas.style.width = `${Math.max(1, Math.round(canvas.width * scale))}px`;
  canvas.style.height = `${Math.max(1, Math.round(canvas.height * scale))}px`;
  canvas.style.imageRendering = 'pixelated';
  canvas.style.display = 'block';
  return canvas;
}

/**
 * Fills `host` with a frame's artwork once it becomes visible.
 *
 * `blob` renders the user's skin; without it, the game's original. The cached
 * canvas is cloned because one canvas cannot live in two places at once, and
 * the same frame appears in both the grid and the detail panel.
 */
export function mountThumb(
  host: HTMLElement,
  target: SkinTarget,
  blob: Blob | null,
  box: number,
): void {
  const render = async () => {
    try {
      const source = await renderFramePreview(target, blob);
      if (!source || !host.isConnected) return;
      const copy = document.createElement('canvas');
      copy.width = source.width;
      copy.height = source.height;
      copy.getContext('2d')?.drawImage(source, 0, 0);
      host.textContent = '';
      host.appendChild(fit(copy, box));
    } catch {
      /* leave the placeholder in place */
    }
  };

  const io = ensureObserver();
  if (!io) {
    void render();
    return;
  }
  pending.set(host, render);
  io.observe(host);
}
