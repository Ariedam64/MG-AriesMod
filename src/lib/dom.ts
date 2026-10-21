/** Appends a `<style>` element with `css` to the document head. */
export function addStyle(css: string): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  return style;
}

/**
 * Runs `fn` once `document.body` exists: now if it does, else when the page
 * is parsed. The mod starts at document-start, when the head can already be
 * there while the body is not, so a head check is no substitute.
 */
export function whenBodyReady(fn: () => void): void {
  if (document.body) fn();
  else document.addEventListener("DOMContentLoaded", () => fn(), { once: true });
}

/**
 * Calls `onChange` after nodes are added or removed anywhere under `target`,
 * at most once per animation frame however many batches of changes arrive
 * in between. Returns a function that stops watching.
 */
export function onSubtreeChange(target: Node, onChange: () => void): () => void {
  let queued = false;
  let stopped = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (!stopped) onChange();
    });
  });
  observer.observe(target, { childList: true, subtree: true });
  return () => {
    stopped = true;
    observer.disconnect();
  };
}
