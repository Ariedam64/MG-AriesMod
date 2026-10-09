import { ensureKitStyles } from "./styles";

/** Creates an element with a class and optional text, making sure the kit stylesheet is in. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  ensureKitStyles();
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

/** An icon given as text (an emoji) or as a ready element. */
export function iconNode(icon: string | HTMLElement, className: string): HTMLElement {
  const node = typeof icon === "string" ? h("span", undefined, icon) : icon;
  node.classList.add(className);
  return node;
}

/**
 * Calls `refresh` every `everyMs` while `el` is on screen, and once right
 * away whenever it shows again. A closed window or a tab that is not
 * selected (`display: none` above it) runs nothing. Returns a function that
 * stops it for good.
 *
 * Without IntersectionObserver it falls back on a plain interval.
 */
export function refreshWhileVisible(el: Element, refresh: () => void, everyMs: number): () => void {
  let timer: ReturnType<typeof setInterval> | null = null;
  const run = () => {
    try {
      refresh();
    } catch (error) {
      console.warn("[kit] refresh failed", error);
    }
  };
  const start = () => {
    if (timer == null) timer = setInterval(run, everyMs);
  };
  const stop = () => {
    if (timer != null) clearInterval(timer);
    timer = null;
  };
  if (typeof IntersectionObserver === "undefined") {
    start();
    return stop;
  }
  const observer = new IntersectionObserver((entries) => {
    if (entries[entries.length - 1]?.isIntersecting) {
      run();
      start();
    } else {
      stop();
    }
  });
  observer.observe(el);
  return () => {
    observer.disconnect();
    stop();
  };
}
