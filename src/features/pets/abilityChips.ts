// How a pet's abilities are drawn: coloured squares in pet rows, a coloured
// pill with the name in the Logs tab.

import { color } from "../../ui/kit/theme";
import { getAbilityChipColors, type AbilityChipColors } from "./abilityChipColors";
import { abilityName } from "./abilityNames";

const RING = `0 0 0 1px ${color.shade} inset, 0 0 0 1px ${color.border}`;
const RING_HOVER = `0 0 0 1px ${color.shade} inset, 0 0 0 1px ${color.borderHover}`;

function paintOnHover(el: HTMLElement, colors: AbilityChipColors, grow: boolean): void {
  el.onmouseenter = () => {
    el.style.background = colors.hover;
    if (grow) {
      el.style.transform = "scale(1.08)";
      el.style.boxShadow = RING_HOVER;
    }
  };
  el.onmouseleave = () => {
    el.style.background = colors.bg;
    if (grow) {
      el.style.transform = "none";
      el.style.boxShadow = RING;
    }
  };
}

/** One small square per ability, named on hover. `emptyText` stands in for a pet without any. */
export function abilityDots(abilityIds: string[], opts: { size?: number; gap?: number; emptyText?: string } = {}): HTMLElement {
  const size = opts.size ?? 12;
  const wrap = document.createElement("span");
  Object.assign(wrap.style, { display: "inline-flex", alignItems: "center", gap: `${opts.gap ?? 8}px`, lineHeight: "1" });

  const ids = abilityIds.filter(Boolean);
  if (!ids.length && opts.emptyText) {
    const empty = document.createElement("span");
    empty.textContent = opts.emptyText;
    Object.assign(empty.style, { opacity: "0.75", fontSize: "12px" });
    wrap.appendChild(empty);
    return wrap;
  }

  for (const id of ids) {
    const colors = getAbilityChipColors(id);
    const dot = document.createElement("span");
    dot.title = abilityName(id) || id;
    dot.setAttribute("aria-label", dot.title);
    Object.assign(dot.style, {
      display: "inline-block",
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: "3px",
      background: colors.bg,
      boxShadow: RING,
      cursor: "default",
      transition: "transform 80ms ease, box-shadow 120ms ease, background 120ms ease",
    });
    paintOnHover(dot, colors, true);
    wrap.appendChild(dot);
  }
  return wrap;
}

/** The ability's name on its colour, cut with an ellipsis when it does not fit. */
export function abilityPill(abilityId: string, label: string): HTMLElement {
  const colors = getAbilityChipColors(abilityId);
  const pill = document.createElement("span");
  pill.textContent = label;
  pill.title = label;
  Object.assign(pill.style, {
    display: "inline-block",
    maxWidth: "100%",
    padding: "3px 9px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: "700",
    lineHeight: "1.5",
    color: color.onLeaf,
    textShadow: `0 1px 2px ${color.shade}`,
    background: colors.bg,
    boxShadow: `0 0 0 1px ${color.shade} inset`,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    transition: "background 120ms ease",
  });
  paintOnHover(pill, colors, false);
  return pill;
}
