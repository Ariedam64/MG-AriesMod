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
