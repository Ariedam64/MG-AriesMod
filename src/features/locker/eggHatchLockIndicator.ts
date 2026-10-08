import { Atoms } from "../../game/store/atoms";
import { cornerGlyph, startDomLockIndicator, type DomLockIndicator } from "./domLockMarks";
import { eggIdOf, lockerRestrictionsService } from "./restrictions";

/** Outlines the old DOM egg tooltip while the selected egg's hatching is locked. */
export function startEggHatchLockIndicator(): DomLockIndicator {
  let currentEggId: string | null = null;
  const indicator = startDomLockIndicator({
    look: { owner: "egg", style: { border: "3px solid rgb(188, 53, 215)", "border-radius": "16px", overflow: "visible" }, glyph: cornerGlyph(8) },
    selector: ".css-502lyi",
    isTarget: (el) => (el.textContent || "").toLowerCase().includes("egg"),
    isLocked: () => lockerRestrictionsService.isEggLocked(currentEggId),
  });
  indicator.add(lockerRestrictionsService.subscribe(indicator.refresh));
  void Atoms.data.myCurrentGardenObject
    .get()
    .then((initial) => {
      currentEggId = eggIdOf(initial);
    })
    .catch(() => {});
  indicator.add(
    Atoms.data.myCurrentGardenObject.onChange((next) => {
      currentEggId = eggIdOf(next);
      indicator.refresh();
    }),
  );
  return indicator;
}
