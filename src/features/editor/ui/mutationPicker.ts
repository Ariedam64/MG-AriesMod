// Mutation icons and the "active mutations + add" row both slot editors use.

import { memoOnCatalogs, mutationCatalog, weatherCatalog } from "../../../data";
import { mutationName } from "../../../data/names";
import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import { color } from "../../../ui/kit/theme";
import {
  mutationCatalogKeyFor,
  sortMutationCatalogKeys,
  sortStoredMutationIds,
  storedMutationIdFor,
} from "../mutationOrder";

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

const TILE_PX = 34;
const PLUS_BG_CLOSED = color.sunken;
const PLUS_BG_OPEN = color.hoverBg;

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

function squareButton(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  Object.assign(btn.style, {
    width: `${TILE_PX}px`,
    height: `${TILE_PX}px`,
    padding: "0",
    borderRadius: "8px",
    border: `1px solid ${color.borderStrong}`,
    background: color.sunken,
    color: color.text,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  });
  return btn;
}

/** A square mutation button, lit when the mutation is on the slot. */
function mutationToggle(storedId: string, active: boolean, onClick: () => void): HTMLButtonElement {
  const label = mutationName(mutationCatalogKeyFor(storedId));
  const btn = squareButton();
  if (active) {
    Object.assign(btn.style, {
      border: `1px solid ${color.accentBorderHover}`,
      background: color.accentSoft,
      boxShadow: `0 0 0 1px ${color.accentBorder} inset`,
    });
  } else {
    btn.style.opacity = "0.85";
  }
  btn.title = active ? `Remove ${label}` : `Add ${label}`;
  btn.appendChild(mutationIcon(storedId, 24));
  btn.onclick = onClick;
  return btn;
}

/** A tag showing one mutation, for read-only lists. */
export function mutationTag(storedId: string): HTMLElement {
  const tag = document.createElement("span");
  Object.assign(tag.style, {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    borderRadius: "8px",
    border: `1px solid ${color.borderStrong}`,
    background: color.sunken,
  });
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
  const row = document.createElement("div");
  Object.assign(row.style, { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" });

  const dropdown = document.createElement("div");
  Object.assign(dropdown.style, {
    display: "none",
    flexWrap: "wrap",
    gap: "6px",
    padding: "6px",
    border: `1px solid ${color.borderStrong}`,
    borderRadius: "8px",
    background: color.sunken,
  });

  const render = (active: string[]) => {
    const wasOpen = dropdown.style.display !== "none";
    row.replaceChildren();
    dropdown.replaceChildren();
    if (prefix) row.appendChild(prefix);

    for (const id of sortMutationIds(active)) row.appendChild(mutationToggle(id, true, () => onToggle(id)));

    const available = orderedMutationKeys()
      .map(storedMutationIdFor)
      .filter((id) => !active.includes(id));
    if (!available.length) {
      dropdown.style.display = "none";
      return;
    }

    const plus = squareButton();
    plus.textContent = "+";
    plus.title = "Add mutation";
    Object.assign(plus.style, { fontWeight: "900", fontSize: "16px", background: wasOpen ? PLUS_BG_OPEN : PLUS_BG_CLOSED });
    plus.onclick = () => {
      const open = dropdown.style.display === "none";
      dropdown.style.display = open ? "flex" : "none";
      plus.style.background = open ? PLUS_BG_OPEN : PLUS_BG_CLOSED;
    };
    row.appendChild(plus);

    for (const id of available) dropdown.appendChild(mutationToggle(id, false, () => onToggle(id)));
  };

  return { row, dropdown, render };
}
