// How a pet's abilities are drawn: coloured squares in pet rows, a coloured
// pill with the name in the Logs tab.

import { getAbilityChipColors, type AbilityChipColors } from "./abilityChipColors";
import { abilityName } from "./abilityNames";
import { ensurePetsStyles } from "./styles";

/** The ability's colours, read by the stylesheet for the fill and its hover. */
function paint(el: HTMLElement, colors: AbilityChipColors): void {
  el.style.setProperty("--pt-ability", colors.bg);
  el.style.setProperty("--pt-ability-hover", colors.hover);
}

/** One small square per ability, named on hover. `emptyText` stands in for a pet without any. */
export function abilityDots(abilityIds: string[], opts: { size?: number; gap?: number; emptyText?: string } = {}): HTMLElement {
  ensurePetsStyles();
  const size = opts.size ?? 12;
  const wrap = document.createElement("span");
  wrap.className = "pt-abilities";
  wrap.style.gap = `${opts.gap ?? 8}px`;

  const ids = abilityIds.filter(Boolean);
  if (!ids.length && opts.emptyText) {
    const empty = document.createElement("span");
    empty.className = "pt-abilities__empty";
    empty.textContent = opts.emptyText;
    wrap.appendChild(empty);
    return wrap;
  }

  for (const id of ids) {
    const dot = document.createElement("span");
    dot.className = "pt-ability-dot";
    dot.title = abilityName(id) || id;
    dot.setAttribute("aria-label", dot.title);
    dot.style.width = dot.style.height = `${size}px`;
    paint(dot, getAbilityChipColors(id));
    wrap.appendChild(dot);
  }
  return wrap;
}

/** The ability's name on its colour, cut with an ellipsis when it does not fit. */
export function abilityPill(abilityId: string, label: string): HTMLElement {
  ensurePetsStyles();
  const pill = document.createElement("span");
  pill.className = "pt-ability-pill";
  pill.textContent = label;
  pill.title = label;
  paint(pill, getAbilityChipColors(abilityId));
  return pill;
}
