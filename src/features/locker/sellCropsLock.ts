import { startDomLockIndicator, type DomLockIndicator, type LockLook } from "./domLockMarks";
import { currentFriendBonus, onFriendBonusChange } from "./friendBonus";
import { lockerRestrictionsService } from "./restrictions";

/** The game's old DOM Sell Crops bar: flattened and lifted, with a lock glyph, while selling is locked. */
export const SELL_CROPS_LOCK_LOOK: LockLook = {
  owner: "sell-crops",
  style: {
    border: "none",
    "border-radius": "",
    padding: "",
    "box-sizing": "",
    "box-shadow": "none",
    overflow: "",
    "z-index": "1000",
  },
  glyphOffsetPx: 4,
};

const hasSellCropsButton = (container: HTMLElement): boolean =>
  /sell\s*crops/i.test((container.querySelector("button")?.textContent || "").trim());

/** Marks the Sell Crops button while the friend bonus is below the player's minimum. */
export function startSellCropsLockWatcher(): DomLockIndicator {
  const indicator = startDomLockIndicator({
    look: SELL_CROPS_LOCK_LOOK,
    selector: ".css-vmnhaw",
    isTarget: hasSellCropsButton,
    isLocked: () => !lockerRestrictionsService.allowsCropSale(currentFriendBonus() ?? 0),
  });
  indicator.add(lockerRestrictionsService.subscribe(indicator.refresh));
  indicator.add(onFriendBonusChange(indicator.refresh));
  return indicator;
}
