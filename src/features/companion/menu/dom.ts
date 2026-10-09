// Small DOM helpers for the companion's own layouts (chat thread, tiles,
// planting grid), which the kit has no component for.

import { h } from "../../../ui/kit/dom";
import { openModal, type Modal, type ModalOptions } from "../../../ui/kit/modal";
import { ensureCompanionStyles } from "./styles";

type Style = Partial<CSSStyleDeclaration>;

/** An element with a class from the companion's stylesheet, and optional text. */
export function part<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  ensureCompanionStyles();
  return h(tag, className, text);
}

/** The kit's popup, marked so the companion's rules reach inside it. */
export function openCompanionModal(options: ModalOptions): Modal {
  ensureCompanionStyles();
  const modal = openModal(options);
  modal.body.classList.add("qws-cmp-modal");
  return modal;
}

/** An element with inline style and optional text. */
export function styled<K extends keyof HTMLElementTagNameMap>(tag: K, style: Style, text?: string): HTMLElementTagNameMap[K] {
  const el = h(tag, undefined, text);
  Object.assign(el.style, style);
  return el;
}

/**
 * A fixed-size, centred box for a sprite icon.
 *
 * Inline styles on purpose: the Garden tab borrows these icons, and must not
 * depend on the companion's stylesheet.
 */
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
