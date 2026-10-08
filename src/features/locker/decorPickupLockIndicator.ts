import { decorCatalog, memoOnCatalogs } from "../../data";
import { startDomLockIndicator, type DomLockIndicator } from "./domLockMarks";
import { lockerRestrictionsService } from "./restrictions";

/** Every decor id and name, lowercased, to recognise a decor tooltip by its text. */
const decorLabels = memoOnCatalogs(() => {
  const labels = new Set<string>();
  for (const [decorId, entry] of Object.entries(decorCatalog as Record<string, any>)) {
    if (decorId) labels.add(decorId.toLowerCase());
    if (typeof entry?.name === "string" && entry.name) labels.add(entry.name.toLowerCase());
  }
  return Array.from(labels);
});

function looksLikeDecorTooltip(el: HTMLElement): boolean {
  const text = (el.textContent || "").toLowerCase();
  return !!text && !!el.querySelector("canvas") && decorLabels().some((label) => text.includes(label));
}

/** Outlines the old DOM decor tooltip while decor pickup is locked. */
export function startDecorPickupLockIndicator(): DomLockIndicator {
  const indicator = startDomLockIndicator({
    look: { owner: "decor", style: { border: "3px solid rgb(188, 53, 215)", "border-radius": "16px", overflow: "visible" }, glyphOffsetPx: 8 },
    selector: ".css-502lyi",
    isTarget: looksLikeDecorTooltip,
    isLocked: () => lockerRestrictionsService.isDecorPickupLocked(),
  });
  indicator.add(lockerRestrictionsService.subscribe(indicator.refresh));
  return indicator;
}
