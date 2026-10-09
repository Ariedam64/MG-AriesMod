// The crop's coin value, drawn as a small badge above the game's Pixi garden
// card (see game/pixi/gardenInfoCard.ts for how the card is found).
//
// The badge hangs off the card itself, not the outer row: the row also holds
// the left and right browse arrows, so the row's x=0 sits under the left arrow.
// The card's own rounded background is not a reachable display object, so the
// badge draws its own rounded backing instead of resizing the game's box.
import { startCropPriceWatcherViaGardenObject } from "./priceWatcher";
import { onShowCropPriceChange, readShowCropPrice } from "./setting";
import { shareGlobal } from "../../platform/pageContext";
import { formatInteger } from "../../lib/format";
import { Subscriptions } from "../../lib/emitter";
import { coin } from "../../data";
import { Atoms } from "../../game/store/atoms";
import { watchGardenInfoCard, type GardenInfoCardGeometry } from "../../game/pixi/gardenInfoCard";
import { getStage, findGraphicsCtor } from "../../game/pixi/stageSearch";
import { getReadySpriteState } from "../../game/sprites/context";

// DevTools only shows console output captured while it is open, so a live
// status object on the page window (`__MG_CROP_VALUE_PIXI_DEBUG__`) is what
// tells what the badge last did.
interface CropValuePixiDebugState {
  attached: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
  hasValueText: boolean;
  hasCoinTexture: boolean;
  objectType: string | null;
}

const VALUE_TEXT_STYLE = { fontFamily: "Arial", fontSize: 14, fontWeight: "700", fill: "#FFD84D" };
const VALUE_BADGE_GAP = 20;
const VALUE_ICON_SIZE = 16;
const VALUE_ICON_GAP = 4;
const BADGE_PADDING_X = 8;
const BADGE_PADDING_Y = 4;
const BADGE_RADIUS = 6;
const BADGE_COLOR = 0x000000;
const BADGE_ALPHA = 0.55;

// The price watcher already has no price for anything but a plant; checking
// here as well keeps the gate visible where the badge is drawn.
function isPlantObject(obj: any): boolean {
  return !!obj && typeof obj === "object" && obj.objectType === "plant";
}

// The coin texture is decoded once, from the coin catalog image, and shared
// by every card.
let coinTexture: any = null;
let coinTexturePromise: Promise<any> | null = null;
function ensureCoinTexture(TextureCtor: any): Promise<any> {
  if (coinTexture) return Promise.resolve(coinTexture);
  if (!coinTexturePromise) {
    coinTexturePromise = new Promise<any>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try { coinTexture = TextureCtor.from(img); } catch { coinTexture = null; }
        resolve(coinTexture);
      };
      img.onerror = () => resolve(null);
      img.src = coin.img64;
    });
  }
  return coinTexturePromise;
}

export interface PixiCropValueController {
  stop(): void;
}

export function startCropValueOverlayInPixi(): PixiCropValueController {
  let running = true;
  let currentCard: any = null;
  let geometry: GardenInfoCardGeometry | null = null;
  let hitAreaBaseHeight = 0;
  let valueText: any = null;
  let valueIcon: any = null;
  let valueBadge: any = null;
  let graphicsCtor: any = null;
  let iconRetryScheduled = false;
  let currentGardenObject: any = null;

  const debugState: CropValuePixiDebugState = {
    attached: false,
    lastSyncAt: null,
    lastError: null,
    hasValueText: false,
    hasCoinTexture: false,
    objectType: null,
  };
  shareGlobal("__MG_CROP_VALUE_PIXI_DEBUG__", debugState);

  const priceWatcher = startCropPriceWatcherViaGardenObject();

  const detachValueText = () => {
    if (valueBadge) {
      try { valueBadge.destroy(); } catch {}
      valueBadge = null;
    }
    if (valueIcon) {
      try { valueIcon.destroy(); } catch {}
      valueIcon = null;
    }
    if (valueText) {
      try { valueText.destroy(); } catch {}
      valueText = null;
    }
    if (currentCard?.hitArea) {
      currentCard.hitArea.y = 0;
      currentCard.hitArea.height = hitAreaBaseHeight;
    }
  };

  // Runs inside the game's own Pixi update (its `addChild` emits
  // `childAdded`). A throw aborts the game's rebuild partway, which once
  // showed as the whole card shifting, so every path stays exception-safe.
  const syncValueNodeUnsafe = () => {
    debugState.objectType = currentGardenObject?.objectType ?? null;
    if (
      !running ||
      !currentCard ||
      currentCard.destroyed ||
      !geometry ||
      !isPlantObject(currentGardenObject) ||
      // Switched off in the Misc menu: the card is left as the game drew it.
      !readShowCropPrice()
    ) {
      detachValueText();
      return;
    }
    const state = getReadySpriteState();
    const ctors = state?.ctors;
    if (!state || !ctors) return;

    const value = priceWatcher.get();
    if (value == null) {
      detachValueText();
      return;
    }

    const text = formatInteger(value, "round");
    if (!valueText) {
      graphicsCtor ??= findGraphicsCtor(getStage(state));
      if (graphicsCtor) {
        valueBadge = new graphicsCtor();
        currentCard.addChild(valueBadge);
      }
      valueText = new ctors.Text({ text, style: VALUE_TEXT_STYLE });
      currentCard.addChild(valueText);
    } else if (valueText.text !== text) {
      valueText.text = text;
    }

    if (!valueIcon && ctors.Sprite) {
      if (coinTexture) {
        valueIcon = new ctors.Sprite(coinTexture);
        valueIcon.width = VALUE_ICON_SIZE;
        valueIcon.height = VALUE_ICON_SIZE;
        currentCard.addChild(valueIcon);
      } else if (!iconRetryScheduled) {
        iconRetryScheduled = true;
        ensureCoinTexture(ctors.Texture).then(() => {
          iconRetryScheduled = false;
          if (running) syncValueNode();
        });
      }
    }

    // The icon and text, centred, above the card's title and mutations.
    const rowHeight = Math.max(valueIcon ? VALUE_ICON_SIZE : 0, valueText.height);
    const rowWidth = (valueIcon ? VALUE_ICON_SIZE + VALUE_ICON_GAP : 0) + valueText.width;
    const badgeHeight = rowHeight + BADGE_PADDING_Y * 2;
    const badgeTop = geometry.top - VALUE_BADGE_GAP - badgeHeight;
    const rowTop = badgeTop + BADGE_PADDING_Y;
    const startX = Math.max(0, (geometry.width - rowWidth) / 2);

    if (valueIcon) {
      valueIcon.position.set(startX, rowTop + (rowHeight - VALUE_ICON_SIZE) / 2);
      valueText.position.set(startX + VALUE_ICON_SIZE + VALUE_ICON_GAP, rowTop + (rowHeight - valueText.height) / 2);
    } else {
      valueText.position.set(startX, rowTop + (rowHeight - valueText.height) / 2);
    }

    if (valueBadge) {
      const badgeWidth = rowWidth + BADGE_PADDING_X * 2;
      valueBadge.clear();
      valueBadge.roundRect(0, 0, badgeWidth, badgeHeight, BADGE_RADIUS).fill({ color: BADGE_COLOR, alpha: BADGE_ALPHA });
      valueBadge.position.set(startX - BADGE_PADDING_X, badgeTop);
    }

    if (currentCard.hitArea) {
      currentCard.hitArea.y = badgeTop;
      currentCard.hitArea.height = hitAreaBaseHeight - badgeTop;
    }
  };

  const syncValueNode = () => {
    try {
      syncValueNodeUnsafe();
      debugState.lastSyncAt = Date.now();
      debugState.lastError = null;
      debugState.hasValueText = !!valueText;
      debugState.hasCoinTexture = !!coinTexture;
    } catch (error) {
      debugState.lastError = String((error as Error)?.message ?? error);
      console.warn("[cropPrice] badge sync failed, clearing overlay", error);
      try { detachValueText(); } catch {}
    }
  };

  const subs = new Subscriptions();
  subs.add(
    watchGardenInfoCard((card, geom) => {
      currentCard = card;
      geometry = geom;
      hitAreaBaseHeight = card?.hitArea?.height ?? 0;
      detachValueText();
      debugState.attached = !!card;
      if (card) syncValueNode();
    }),
  );
  subs.add(priceWatcher.onChange(syncValueNode));
  subs.add(onShowCropPriceChange(() => syncValueNode()));
  void Atoms.data.myCurrentGardenObject
    .get()
    .then((initial) => {
      currentGardenObject = initial;
      syncValueNode();
    })
    .catch(() => {});
  subs.add(
    Atoms.data.myCurrentGardenObject.onChange((next: any) => {
      currentGardenObject = next;
      syncValueNode();
    }),
  );

  return {
    stop() {
      if (!running) return;
      running = false;
      subs.dispose();
      priceWatcher.stop();
      detachValueText();
      currentCard = null;
    },
  };
}
