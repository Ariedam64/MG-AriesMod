// lockerIndicatorPixi.ts
// Purple lock-border indicator drawn around the game's Pixi-rendered garden
// info card (see gardenInfoCardPixi.ts for how that card is found/tracked).
//
// This replaces three separate DOM overlays that all drew the same
// `3px solid rgb(188, 53, 215)` border on a Chakra tooltip element
// (`.css-502lyi` / the crop tooltip root) that no longer exists now that
// this card renders natively in Pixi: the crop harvest-lock border in
// cropValues.ts, eggHatchLockIndicator.ts, and decorPickupLockIndicator.ts.
import { lockerService } from "../services/locker";
import { lockerRestrictionsService } from "../services/lockerRestrictions";
import { Atoms } from "../store/atoms";
import { shareGlobal } from "./page-context";
import {
  watchGardenInfoCard,
  getSpriteState,
  getStage,
  findGraphicsCtor,
  type GardenInfoCardGeometry,
} from "./gardenInfoCardPixi";

// Same purple as the old DOM border (`rgb(188, 53, 215)`).
const BORDER_COLOR = 0xbc35d7;
const BORDER_WIDTH = 3;
const BORDER_RADIUS = 12;
// Draw the border a couple pixels outside the card's own measured bounds —
// the card's actual rendered background is very slightly larger than the
// hit-area/local-bounds size we measure it by, so a border drawn exactly on
// that boundary lets a sliver of the card's own background peek past it.
const BORDER_EXPAND = 2;
const LOCK_ICON_TEXT = "🔒";
const LOCK_ICON_STYLE = { fontSize: 16 };
const LOCK_ICON_X_NUDGE = 4;
const LOCK_ICON_Y_NUDGE = 4;

interface LockerIndicatorDebugState {
  lastError: string | null;
  hasBorder: boolean;
  objectType: string | null;
}

export interface LockerIndicatorController {
  stop(): void;
}

function extractEggId(obj: any): string | null {
  if (!obj || typeof obj !== "object" || obj.objectType !== "egg") return null;
  const eggId = obj.eggId;
  return typeof eggId === "string" && eggId ? eggId : null;
}

function isDecorObject(obj: any): boolean {
  return !!obj && typeof obj === "object" && obj.objectType === "decor";
}

export function startLockerIndicatorInPixi(): LockerIndicatorController {
  let running = true;
  let currentCard: any = null;
  let geometry: GardenInfoCardGeometry | null = null;
  let border: any = null;
  let lockIcon: any = null;
  let graphicsCtor: any = null;
  let currentGardenObject: any = null;

  const debugState: LockerIndicatorDebugState = { lastError: null, hasBorder: false, objectType: null };
  shareGlobal("__MG_LOCKER_INDICATOR_PIXI_DEBUG__", debugState);

  const isLocked = (): boolean => {
    const eggId = extractEggId(currentGardenObject);
    if (eggId) return lockerRestrictionsService.isEggLocked(eggId);
    if (isDecorObject(currentGardenObject)) return lockerRestrictionsService.isDecorPickupLocked();
    return lockerService.getCurrentSlotSnapshot().harvestAllowed === false;
  };

  const removeBorder = () => {
    if (border) {
      try { border.destroy(); } catch {}
      border = null;
    }
    if (lockIcon) {
      try { lockIcon.destroy(); } catch {}
      lockIcon = null;
    }
    debugState.hasBorder = false;
  };

  // Runs from Pixi node events (card swap) and from locker/atom change
  // callbacks — none of those call stacks tolerate an uncaught throw here
  // without corrupting the game's own layout pass (see gardenInfoCardPixi.ts).
  const syncUnsafe = () => {
    debugState.objectType = currentGardenObject?.objectType ?? null;
    if (!running || !currentCard || currentCard.destroyed || !geometry || !isLocked()) {
      removeBorder();
      return;
    }
    const state = getSpriteState();
    if (!graphicsCtor) {
      graphicsCtor = state ? findGraphicsCtor(getStage(state)) : null;
      if (!graphicsCtor) return;
    }
    if (!border) {
      border = new graphicsCtor();
      currentCard.addChild(border);
    }

    const left = -BORDER_EXPAND;
    const top = -BORDER_EXPAND;
    const width = Math.max(0, geometry.width + BORDER_EXPAND * 2);
    const height = Math.max(0, geometry.height + BORDER_EXPAND * 2);
    const inset = BORDER_WIDTH / 2;
    border.clear();
    border
      .roundRect(left + inset, top + inset, Math.max(0, width - BORDER_WIDTH), Math.max(0, height - BORDER_WIDTH), BORDER_RADIUS)
      .stroke({ width: BORDER_WIDTH, color: BORDER_COLOR, alpha: 1 });
    debugState.hasBorder = true;

    // Lock glyph centered on the border's top-right corner, straddling it.
    if (!lockIcon && state?.ctors?.Text) {
      lockIcon = new state.ctors.Text({ text: LOCK_ICON_TEXT, style: LOCK_ICON_STYLE });
      currentCard.addChild(lockIcon);
    }
    if (lockIcon) {
      const right = left + width;
      lockIcon.position.set(right - lockIcon.width / 2 - LOCK_ICON_X_NUDGE, top - lockIcon.height / 2 + LOCK_ICON_Y_NUDGE);
    }
  };

  const sync = () => {
    try {
      syncUnsafe();
      debugState.lastError = null;
    } catch (error) {
      debugState.lastError = String((error as Error)?.message ?? error);
      console.warn("[lockerIndicatorPixi] sync failed, clearing border", error);
      try { removeBorder(); } catch {}
    }
  };

  const offCard = watchGardenInfoCard((card, geom) => {
    removeBorder();
    currentCard = card;
    geometry = geom;
    sync();
  });

  const offSlot = lockerService.onSlotInfoChange(() => sync());
  const offRestrictions = lockerRestrictionsService.subscribe(() => sync());

  let unsubAtom: (() => void) | null = null;
  void (async () => {
    try {
      currentGardenObject = await Atoms.data.myCurrentGardenObject.get();
      if (running) sync();
    } catch {}
    try {
      const unsub = await Atoms.data.myCurrentGardenObject.onChange((next: any) => {
        currentGardenObject = next;
        sync();
      });
      if (typeof unsub === "function") {
        if (running) unsubAtom = unsub;
        else unsub();
      }
    } catch {}
  })();

  return {
    stop() {
      if (!running) return;
      running = false;
      offCard();
      offSlot?.();
      offRestrictions?.();
      unsubAtom?.();
      removeBorder();
      currentCard = null;
    },
  };
}
