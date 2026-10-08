// The purple border and lock glyph drawn around the game's Pixi garden card
// (see game/pixi/gardenInfoCard.ts) while the selected crop, egg or decor is
// locked: a crop the Harvest Locker refuses, an egg whose hatching is locked,
// or any decor while decor pickup is locked.
import { lockerService } from "./locker";
import { eggIdOf, lockerRestrictionsService } from "./restrictions";
import { Atoms } from "../../game/store/atoms";
import { Subscriptions } from "../../lib/emitter";
import { shareGlobal } from "../../platform/pageContext";
import {
  watchGardenInfoCard,
  getStage,
  findGraphicsCtor,
  type GardenInfoCardGeometry,
} from "../../game/pixi/gardenInfoCard";
import { getReadySpriteState } from "../../game/sprites/context";

// The purple of the locker's DOM outlines, rgb(188, 53, 215).
const BORDER_COLOR = 0xbc35d7;
const BORDER_WIDTH = 3;
const BORDER_RADIUS = 12;
// The card's rendered background is slightly larger than the hit area it is
// measured by, so a border drawn exactly on that edge lets a sliver of the
// background show past it. Drawing a couple of pixels outside covers it.
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
    const eggId = eggIdOf(currentGardenObject);
    if (eggId) return lockerRestrictionsService.isEggLocked(eggId);
    if (isDecorObject(currentGardenObject)) return lockerRestrictionsService.isDecorPickupLocked();
    return lockerService.currentHarvestAllowed() === false;
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

  // Runs from Pixi node events (a card swap) and from locker and atom
  // callbacks. A throw inside the game's own layout pass corrupts it (see
  // gardenInfoCard.ts), so every path stays exception-safe.
  const syncUnsafe = () => {
    debugState.objectType = currentGardenObject?.objectType ?? null;
    if (!running || !currentCard || currentCard.destroyed || !geometry || !isLocked()) {
      removeBorder();
      return;
    }
    const state = getReadySpriteState();
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
      console.warn("[lockerIndicator] sync failed, clearing border", error);
      try { removeBorder(); } catch {}
    }
  };

  const subs = new Subscriptions();
  subs.add(
    watchGardenInfoCard((card, geom) => {
      removeBorder();
      currentCard = card;
      geometry = geom;
      sync();
    }),
  );
  subs.add(lockerService.onSlotInfoChange(sync));
  subs.add(lockerRestrictionsService.subscribe(sync));
  void Atoms.data.myCurrentGardenObject
    .get()
    .then((initial) => {
      currentGardenObject = initial;
      sync();
    })
    .catch(() => {});
  subs.add(
    Atoms.data.myCurrentGardenObject.onChange((next) => {
      currentGardenObject = next;
      sync();
    }),
  );

  return {
    stop() {
      if (!running) return;
      running = false;
      subs.dispose();
      removeBorder();
      currentCard = null;
    },
  };
}
