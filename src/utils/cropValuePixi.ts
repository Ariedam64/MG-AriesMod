// cropValuePixi.ts
// Renders the crop coin value into the game's Pixi-based garden info card
// (see gardenInfoCardPixi.ts for how that card is found and tracked).
//
// The value text is attached to the card itself (not the outer row) because
// the row can also contain left/right browse-arrow buttons laid out beside
// the card — anchoring at the row's own x=0 would land the text under the
// left arrow instead of under the card content.
//
// The card's own rounded background isn't a reachable display object (no
// Graphics/Sprite/filter matching it was found anywhere near the card across
// several live probes), so instead of trying to resize the game's box, we
// draw our own small rounded badge behind the value text.
import { startCropPriceWatcherViaGardenObject } from "./cropPrice";
import { shareGlobal } from "./page-context";
import { coin } from "../data";
import { Atoms } from "../store/atoms";
import {
  watchGardenInfoCard,
  getSpriteState,
  getStage,
  findGraphicsCtor,
  type GardenInfoCardGeometry,
} from "./gardenInfoCardPixi";

// Chrome DevTools only shows console output captured while the panel is
// open — logs from before you open it are gone, not just hidden. So instead
// of relying on console.log for post-hoc debugging, keep a small live status
// object on the page window that can be inspected at any time, e.g.
// `window.__MG_CROP_VALUE_PIXI_DEBUG__` in the console, whenever it's opened.
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

const PRICE_FALLBACK = "—";
const nfUS = new Intl.NumberFormat("en-US");
const formatCoins = (value: number | null) =>
  value == null ? PRICE_FALLBACK : nfUS.format(Math.max(0, Math.round(value)));

// cropPrice.ts's own watcher already returns a null price for non-plant
// objects, which already keeps the badge hidden — this is a second,
// direct check (same pattern as lockerIndicatorPixi.ts/sellAllPetsPixi.ts)
// so the gate is obvious here too, not just an implicit side effect of the
// price computation elsewhere.
function isPlantObject(obj: any): boolean {
  return !!obj && typeof obj === "object" && obj.objectType === "plant";
}

// Coin texture is decoded once from the same base64 asset the old DOM
// overlay used, and shared across every controller instance/card.
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

  // `syncValueNode` runs synchronously inside the game's own Pixi update
  // loop (triggered from its `addChild` → `childAdded` emit). If it throws,
  // the exception bubbles into the game's own rebuild and aborts it partway
  // through — which is what produced a "whole card shifted" symptom in an
  // earlier version of this code. Every path here must stay exception-safe.
  const syncValueNodeUnsafe = () => {
    debugState.objectType = currentGardenObject?.objectType ?? null;
    if (!running || !currentCard || currentCard.destroyed || !geometry || !isPlantObject(currentGardenObject)) {
      detachValueText();
      return;
    }
    const state = getSpriteState();
    if (!state) return;

    const value = priceWatcher.get();
    if (value == null) {
      detachValueText();
      return;
    }

    const text = formatCoins(value);
    if (!valueText) {
      graphicsCtor ??= findGraphicsCtor(getStage(state));
      if (graphicsCtor) {
        valueBadge = new graphicsCtor();
        currentCard.addChild(valueBadge);
      }
      valueText = new state.ctors.Text({ text, style: VALUE_TEXT_STYLE });
      currentCard.addChild(valueText);
    } else if (valueText.text !== text) {
      valueText.text = text;
    }

    if (!valueIcon && state.ctors.Sprite) {
      if (coinTexture) {
        valueIcon = new state.ctors.Sprite(coinTexture);
        valueIcon.width = VALUE_ICON_SIZE;
        valueIcon.height = VALUE_ICON_SIZE;
        currentCard.addChild(valueIcon);
      } else if (!iconRetryScheduled) {
        iconRetryScheduled = true;
        ensureCoinTexture(state.ctors.Texture).then(() => {
          iconRetryScheduled = false;
          if (running) syncValueNode();
        });
      }
    }

    // Row (icon + text) centered horizontally, placed above the existing
    // content (mutations/title) rather than below it.
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
      console.warn("[cropValuePixi] syncValueNode failed, clearing overlay", error);
      try { detachValueText(); } catch {}
    }
  };

  const offCard = watchGardenInfoCard((card, geom) => {
    currentCard = card;
    geometry = geom;
    hitAreaBaseHeight = card?.hitArea?.height ?? 0;
    detachValueText();
    debugState.attached = !!card;
    if (card) syncValueNode();
  });

  const offPrice = priceWatcher.onChange(syncValueNode);

  let unsubGardenObject: (() => void) | null = null;
  void (async () => {
    try {
      currentGardenObject = await Atoms.data.myCurrentGardenObject.get();
      if (running) syncValueNode();
    } catch {}
    try {
      const unsub = await Atoms.data.myCurrentGardenObject.onChange((next: any) => {
        currentGardenObject = next;
        syncValueNode();
      });
      if (typeof unsub === "function") {
        if (running) unsubGardenObject = unsub;
        else unsub();
      }
    } catch {}
  })();

  return {
    stop() {
      if (!running) return;
      running = false;
      unsubGardenObject?.();
      offCard();
      offPrice?.();
      priceWatcher.stop();
      detachValueText();
      currentCard = null;
    },
  };
}
