// Mutation icons and the "active mutations + add" row both slot editors use.

import { memoOnCatalogs, mutationCatalog, weatherCatalog } from "../../../data";
import { mutationName } from "../../../data/names";
import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import { h } from "../../../ui/kit/dom";
import {
  mutationCatalogKeyFor,
  sortMutationCatalogKeys,
  sortStoredMutationIds,
  storedMutationIdFor,
} from "../mutationOrder";
import { ensureEditorStyles } from "./styles";

/** Every catalog mutation key in display order. */
const orderedMutationKeys = memoOnCatalogs(() =>
  sortMutationCatalogKeys(Object.keys(mutationCatalog || {}), mutationCatalog, weatherCatalog),
);

/** Stored mutation ids in display order. */
export const sortMutationIds = (ids: string[]): string[] => sortStoredMutationIds(ids, orderedMutationKeys());

/** Letter colours for a mutation whose sprite cannot be found. Keyed by stored id. */
const FALLBACK_COLORS: Record<string, string> = {
  Gold: "rgba(200, 170, 0, 1)",
  Rainbow: "linear-gradient(135deg, #ff0000, #ff7a00, #ffeb3b, #00c853, #40c4ff, #8e24aa)",
  Wet: "rgb(30, 140, 230)",
  Chilled: "rgb(100, 190, 200)",
  Frozen: "rgb(100, 120, 255)",
  Thunderstruck: "rgb(16, 141, 163)",
  Thundercharged: "rgb(10, 100, 190)",
  Dawnlit: "rgba(120, 100, 180, 1)",
  Ambershine: "rgba(160, 70, 50, 1)",
  Dawncharged: "rgba(160, 140, 220, 1)",
  Ambercharged: "rgba(240, 110, 80, 1)",
};

const ICON_CATEGORIES = ["ui", "mutation", "weather"];

/** A mutation's sprite, or its coloured initial when there is no sprite. */
function mutationIcon(storedId: string, size = 22): HTMLElement {
  const catalogKey = mutationCatalogKeyFor(storedId);
  const label = mutationName(catalogKey) || storedId || "?";

  const wrap = document.createElement("span");
  Object.assign(wrap.style, {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${Math.max(11, size - 8)}px`,
    fontWeight: "900",
    lineHeight: "1",
  });

  const applyFallback = () => {
    if (wrap.querySelector("img")) return;
    wrap.textContent = label.charAt(0).toUpperCase() || "?";
    const fill = FALLBACK_COLORS[storedId] ?? FALLBACK_COLORS[catalogKey];
    if (!fill) return;
    if (fill.startsWith("linear-gradient")) {
      Object.assign(wrap.style, {
        backgroundImage: fill,
        backgroundClip: "text",
        webkitBackgroundClip: "text",
        color: "transparent",
        webkitTextFillColor: "transparent",
      });
    } else {
      wrap.style.color = fill;
    }
  };

  const candidates = Array.from(new Set([`Mutation${catalogKey}`, `Mutation${storedId}`, catalogKey, storedId]));
  attachSpriteIcon(wrap, ICON_CATEGORIES, candidates, size, "editor", { onNoSpriteFound: applyFallback });
  return wrap;
}

/** A square mutation button, lit when the mutation is on the slot. */
function mutationToggle(storedId: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const label = mutationName(mutationCatalogKeyFor(storedId));
  const btn = h("button", active ? "qws-ed-mut is-on" : "qws-ed-mut");
  btn.type = "button";
  btn.title = active ? `Remove ${label}` : `Add ${label}`;
  btn.setAttribute("aria-label", btn.title);
  btn.appendChild(mutationIcon(storedId, 24));
  btn.onclick = onClick;
  return btn;
}

/** A tag showing one mutation, for read-only lists. */
export function mutationTag(storedId: string): HTMLElement {
  ensureEditorStyles();
  const tag = h("span", "qws-ed-tag");
  tag.title = mutationName(mutationCatalogKeyFor(storedId));
  tag.appendChild(mutationIcon(storedId, 20));
  return tag;
}

export type MutationPicker = {
  /** The active mutations, then a "+" that opens `dropdown`. */
  row: HTMLDivElement;
  /** Every mutation not on the slot yet. */
  dropdown: HTMLDivElement;
  /** Redraws for this list of active mutations, keeping the dropdown open if it was. */
  render(active: string[]): void;
};

/**
 * The active mutations of a slot, a "+" button, and a dropdown of the others.
 * Clicking any of them calls `onToggle` with its stored id. `prefix` sits at
 * the start of the row.
 */
export function mutationPicker(onToggle: (storedId: string) => void, prefix?: HTMLElement): MutationPicker {
  ensureEditorStyles();
  const row = h("div", "qws-ed-muts");
  const dropdown = h("div", "qws-ed-muts__more");
  dropdown.hidden = true;

  const render = (active: string[]) => {
    const wasOpen = !dropdown.hidden;
    row.replaceChildren();
    dropdown.replaceChildren();
    if (prefix) row.appendChild(prefix);

    for (const id of sortMutationIds(active)) row.appendChild(mutationToggle(id, true, () => onToggle(id)));

    const available = orderedMutationKeys()
      .map(storedMutationIdFor)
      .filter((id) => !active.includes(id));
    if (!available.length) {
      dropdown.hidden = true;
      return;
    }

    const plus = h("button", "qws-ed-mut is-add", "+");
    plus.type = "button";
    plus.title = "Add mutation";
    const showOpen = (open: boolean) => {
      plus.classList.toggle("is-open", open);
      plus.setAttribute("aria-expanded", open ? "true" : "false");
    };
    showOpen(wasOpen);
    plus.onclick = () => {
      dropdown.hidden = !dropdown.hidden;
      showOpen(!dropdown.hidden);
    };
    row.appendChild(plus);

    for (const id of available) dropdown.appendChild(mutationToggle(id, false, () => onToggle(id)));
  };

  return { row, dropdown, render };
}
