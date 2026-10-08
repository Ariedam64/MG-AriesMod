// Small DOM helpers for the companion's own layouts (chat thread, tiles,
// planting grid), which the kit has no component for.

import { h } from "../../../ui/kit/dom";

type Style = Partial<CSSStyleDeclaration>;

/** An element with inline style and optional text. */
export function styled<K extends keyof HTMLElementTagNameMap>(tag: K, style: Style, text?: string): HTMLElementTagNameMap[K] {
  const el = h(tag, undefined, text);
  Object.assign(el.style, style);
  return el;
}

/** A fixed-size, centred box for a sprite icon. */
export function iconSlot(sizePx: number, inline = false): HTMLElement {
  return styled(inline ? "span" : "div", {
    display: inline ? "inline-flex" : "flex",
    alignItems: "center",
    justifyContent: "center",
    width: `${sizePx}px`,
    height: `${sizePx}px`,
    flex: "0 0 auto",
  });
}

/**
 * Every plausible spelling of a name in an atlas.
 *
 * A catalog may serve a path (`sprite/pet/CommonEgg`) where the atlas only
 * wants the last segment, and spaces or punctuation vary from one source to
 * the next. All forms are offered rather than betting on one; the plain name
 * always comes first.
 */
export function spriteSpellings(...names: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const name of names) {
    const trimmed = (name ?? "").trim();
    if (!trimmed) continue;
    for (const form of [trimmed, trimmed.split(/[./]/).pop() ?? trimmed]) {
      if (!form) continue;
      out.add(form);
      out.add(form.replace(/\s+/g, ""));
      out.add(form.replace(/\W+/g, ""));
    }
  }
  return [...out].filter(Boolean);
}
