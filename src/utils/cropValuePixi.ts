// cropValuePixi.ts
// Renders the crop coin value directly into the game's Pixi-based garden info
// card. The card (weight/mutations panel) moved from DOM (Chakra `McGrid`/
// `McFlex`) to native Pixi rendering in a recent game build, so the old
// MutationObserver + CSS-selector approach in cropValues.ts no longer finds
// anything to attach to for this element.
//
// Hook points used here are the Pixi `.label` strings the game assigns to its
// containers (`GardenInfoCardSystem`, `GardenInfoCardRow`, `GardenInfoObjectCard`).
// Those are plain string literals, not minified identifiers, so they should
// stay far more stable across builds than internal function/variable names.
//
// The value text is attached to `GardenInfoObjectCard` specifically (not the
// outer row) because the row can also contain left/right browse-arrow
// buttons laid out beside the card — anchoring at the row's own x=0 would
// land the text under the left arrow instead of under the card content.
//
// The card's own rounded background isn't a reachable display object (no
// Graphics/Sprite/filter matching it was found anywhere near the card across
// several live probes), so instead of trying to resize the game's box, we
// draw our own small rounded badge behind the value text.
import { startCropPriceWatcherViaGardenObject } from "./cropPrice";
import { readSharedGlobal } from "./page-context";
import { coin } from "../data";

const CARD_SYSTEM_LABEL = "GardenInfoCardSystem";
const CARD_ROW_LABEL = "GardenInfoCardRow";
const OBJECT_CARD_LABEL = "GardenInfoObjectCard";
// Anchor on the title row rather than the card's own full bounds — the
// card's icon can be much taller for large/fully-grown crops, which would
// otherwise push the badge up by a varying, crop-dependent amount.
const TITLE_ROW_LABEL = "GardenInfoObjectTitleRow";
// A sibling section of the row (not a descendant of it) shown above it for
// crops with an active ability/mutation proc callout (e.g. Dawnbinder).
const ABILITIES_SECTION_LABEL = "GardenInfoPlantAbilities";
const SECTION_GAP_ESTIMATE = 8;
const VALUE_TEXT_STYLE = { fontFamily: "Arial", fontSize: 14, fontWeight: "700", fill: "#FFD84D" };
const VALUE_BADGE_GAP = 20;
const VALUE_ICON_SIZE = 16;
const VALUE_ICON_GAP = 4;
const BADGE_PADDING_X = 8;
const BADGE_PADDING_Y = 4;
const BADGE_RADIUS = 6;
const BADGE_COLOR = 0x000000;
const BADGE_ALPHA = 0.55;
const CARD_SYSTEM_FIND_RETRY_MS = 1000;
const CARD_SYSTEM_FIND_MAX_ATTEMPTS = 60;

const PRICE_FALLBACK = "—";
const nfUS = new Intl.NumberFormat("en-US");
const formatCoins = (value: number | null) =>
  value == null ? PRICE_FALLBACK : nfUS.format(Math.max(0, Math.round(value)));

interface SpriteStateLike {
  renderer: any;
  app: any;
  ctors: { Text: any; Sprite: any; Texture: any } | null;
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

function getSpriteState(): SpriteStateLike | null {
  const state = readSharedGlobal<SpriteStateLike>("__MG_SPRITE_STATE__");
  if (!state?.renderer || !state.ctors?.Text) return null;
  return state;
}

function getStage(state: SpriteStateLike): any {
  return state.renderer.lastObjectRendered ?? state.renderer.stage ?? state.app?.stage ?? null;
}

function findByLabel(root: any, label: string, limit = 25000): any {
  if (!root) return null;
  const stack = [root];
  const seen = new Set<any>();
  let n = 0;
  while (stack.length && n++ < limit) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    if (node.label === label) return node;
    const children = node.children;
    if (Array.isArray(children)) for (const child of children) stack.push(child);
  }
  return null;
}

// `roundRect`/`clear` are public PIXI.Graphics API methods, so unlike
// minified identifiers they survive the game's build unchanged — used here
// to borrow the game's own Graphics constructor for our own badge.
function findGraphicsCtor(root: any, limit = 25000): any {
  if (!root) return null;
  const stack = [root];
  const seen = new Set<any>();
  let n = 0;
  while (stack.length && n++ < limit) {
    const node = stack.pop();
    if (!node || seen.has(node)) continue;
    seen.add(node);
    if (typeof node.roundRect === "function" && typeof node.clear === "function") {
      return node.constructor;
    }
    const children = node.children;
    if (Array.isArray(children)) for (const child of children) stack.push(child);
  }
  return null;
}

export function startCropValueOverlayInPixi(): PixiCropValueController {
  let running = true;
  let cardSystem: any = null;
  let currentCard: any = null;
  let cardTop = 0;
  let cardWidth = 0;
  let hitAreaBaseHeight = 0;
  let valueText: any = null;
  let valueIcon: any = null;
  let valueBadge: any = null;
  let graphicsCtor: any = null;
  let iconRetryScheduled = false;
  let findAttempts = 0;
  let findTimer: ReturnType<typeof setInterval> | null = null;

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

  const detachCard = () => {
    currentCard = null;
    cardTop = 0;
    cardWidth = 0;
    hitAreaBaseHeight = 0;
    detachValueText();
  };

  // `onChildAdded`/`syncValueNode` run synchronously inside the game's own
  // Pixi update loop (triggered from its `addChild` → `childAdded` emit).
  // If either throws, the exception bubbles into the game's own rebuild and
  // aborts it partway through — which is what produced the "whole card
  // shifted" symptom. Every code path that can run inside that call stack
  // must be exception-safe, so we never risk corrupting the game's own
  // layout pass regardless of the root cause.
  const syncValueNodeUnsafe = () => {
    if (!running || !currentCard || currentCard.destroyed) return;
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
    const badgeTop = cardTop - VALUE_BADGE_GAP - badgeHeight;
    const rowTop = badgeTop + BADGE_PADDING_Y;
    const startX = Math.max(0, (cardWidth - rowWidth) / 2);

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
    } catch (error) {
      console.warn("[cropValuePixi] syncValueNode failed, clearing overlay", error);
      try { detachValueText(); } catch {}
    }
  };

  const onChildAddedUnsafe = (row: any) => {
    if (!running || row?.label !== CARD_ROW_LABEL) return;
    const card = findByLabel(row, OBJECT_CARD_LABEL);
    if (!card) return;
    currentCard = card;
    // Purely local measurement (card.getLocalBounds() doesn't depend on the
    // row's own position), taken before our own nodes are attached so it
    // never includes them. Global-bounds-based measurements are unreliable
    // here: the row hasn't been repositioned by the system's layout pass yet
    // at the exact moment `childAdded` fires (that happens later in the same
    // frame), so `row.getBounds()` reads a stale position.
    const cardBounds = card.getLocalBounds();
    // Prefer the game's own fixed hit-area width over the card's rendered
    // bounds — a large/grown crop's icon can visually overflow past the
    // card's intended box width, which shifted our centering sideways.
    cardWidth = card.hitArea?.width ?? cardBounds.width;
    // Prefer the title row's own top edge over the card's full bounds — the
    // card icon's height varies a lot per crop and shouldn't move the badge.
    const titleRow = (card.children ?? []).find((c: any) => c?.label === TITLE_ROW_LABEL);
    const contentTop = titleRow
      ? titleRow.position.y + titleRow.getLocalBounds().minY
      : cardBounds.minY;
    // If a sibling ability/proc banner is showing above the row this frame,
    // push our reference point up by its own (purely local) height too.
    const abilitiesSection = (cardSystem?.children ?? []).find((c: any) => c?.label === ABILITIES_SECTION_LABEL);
    const extraTopOffset = abilitiesSection
      ? abilitiesSection.getLocalBounds().height + SECTION_GAP_ESTIMATE
      : 0;
    cardTop = contentTop - extraTopOffset;
    hitAreaBaseHeight = card.hitArea?.height ?? 0;
    detachValueText();
    card.once("destroyed", detachCard);
    syncValueNode();
  };

  const onChildAdded = (row: any) => {
    try {
      onChildAddedUnsafe(row);
    } catch (error) {
      console.warn("[cropValuePixi] onChildAdded failed, clearing overlay", error);
      try { detachValueText(); } catch {}
    }
  };

  const attachToCardSystem = (system: any) => {
    cardSystem = system;
    cardSystem.on("childAdded", onChildAdded);
    cardSystem.once("destroyed", () => {
      if (cardSystem === system) {
        cardSystem = null;
        detachCard();
      }
    });
    const existingRow = (system.children ?? []).find((c: any) => c?.label === CARD_ROW_LABEL);
    if (existingRow) onChildAdded(existingRow);
  };

  const tryFindCardSystem = () => {
    if (!running || cardSystem) return;
    const state = getSpriteState();
    if (!state) return;
    const stage = getStage(state);
    const found = findByLabel(stage, CARD_SYSTEM_LABEL);
    if (found) {
      attachToCardSystem(found);
      if (findTimer != null) { clearInterval(findTimer); findTimer = null; }
      return;
    }
    findAttempts += 1;
    if (findAttempts >= CARD_SYSTEM_FIND_MAX_ATTEMPTS && findTimer != null) {
      clearInterval(findTimer);
      findTimer = null;
    }
  };

  tryFindCardSystem();
  if (!cardSystem) {
    findTimer = setInterval(tryFindCardSystem, CARD_SYSTEM_FIND_RETRY_MS);
  }

  const offPrice = priceWatcher.onChange(syncValueNode);

  return {
    stop() {
      if (!running) return;
      running = false;
      if (findTimer != null) { clearInterval(findTimer); findTimer = null; }
      offPrice?.();
      priceWatcher.stop();
      if (cardSystem) {
        try { cardSystem.off("childAdded", onChildAdded); } catch {}
      }
      detachCard();
      cardSystem = null;
    },
  };
}
