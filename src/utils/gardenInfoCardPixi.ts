// gardenInfoCardPixi.ts
// Shared plumbing for anything that needs to react to the game's Pixi-rendered
// "garden info" card (the crop/egg/decor details panel). The panel moved from
// DOM (Chakra `McGrid`/`McFlex`) to native Pixi rendering in a recent game
// build, so old MutationObserver + CSS-selector approaches no longer find
// anything to attach to.
//
// Hook points used here are the Pixi `.label` strings the game assigns to its
// containers (`GardenInfoCardSystem`, `GardenInfoCardRow`, `GardenInfoObjectCard`).
// Those are plain string literals, not minified identifiers, so they should
// stay far more stable across builds than internal function/variable names.
//
// Multiple features need this same card (the crop coin-value badge and the
// locker purple-border indicator) — they share this one card-system search
// via `watchGardenInfoCard` instead of each running their own copy of it.
import { readSharedGlobal, shareGlobal, pageWindow } from "./page-context";

export interface SpriteStateLike {
  renderer: any;
  app: any;
  ctors: { Text: any; Sprite: any; Texture: any; Rectangle?: any; Container?: any } | null;
}

export interface GardenInfoCardGeometry {
  /** Local-space y of the card's own content top (title row), used to place things above it. */
  top: number;
  width: number;
  height: number;
}

export type GardenInfoCardListener = (card: any, geometry: GardenInfoCardGeometry | null) => void;

const CARD_SYSTEM_LABEL = "GardenInfoCardSystem";
const CARD_ROW_LABEL = "GardenInfoCardRow";
const OBJECT_CARD_LABEL = "GardenInfoObjectCard";
// Anchor on the title row rather than the card's own full bounds — the
// card's icon can be much taller for large/fully-grown crops, which would
// otherwise push dependent content up by a varying, crop-dependent amount.
const TITLE_ROW_LABEL = "GardenInfoObjectTitleRow";
// A sibling section of the row (not a descendant of it) shown above it for
// crops with an active ability/mutation proc callout (e.g. Dawnbinder).
const ABILITIES_SECTION_LABEL = "GardenInfoPlantAbilities";
const SECTION_GAP_ESTIMATE = 8;
const CARD_SYSTEM_FIND_RETRY_MS = 1000;
const CARD_SYSTEM_FIND_LOG_EVERY = 30;

interface GardenInfoCardDebugState {
  findAttempts: number;
  attached: boolean;
  rafTicks: number;
  scriptStartedAt: number;
  listenerCount: number;
}

export function getSpriteState(): SpriteStateLike | null {
  const state = readSharedGlobal<SpriteStateLike>("__MG_SPRITE_STATE__");
  if (!state?.renderer || !state.ctors?.Text) return null;
  return state;
}

export function getStage(state: SpriteStateLike): any {
  return state.renderer.lastObjectRendered ?? state.renderer.stage ?? state.app?.stage ?? null;
}

export function findByLabel(root: any, label: string, limit = 25000): any {
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

/**
 * Same walk as findByLabel, but gives each top-level branch of `root` its
 * own search budget instead of pooling one `limit` across the whole tree.
 * The game's world/tile layer alone can hold tens of thousands of sprite
 * nodes — a single shared budget starting there exhausts before ever
 * reaching sibling UI layers, making anything only found there (the card
 * system) unreachable once the world grows large enough. That's a race
 * against world size, not a real "not found".
 */
export function findAcrossBranches(root: any, pred: (node: any) => boolean, limitPerBranch = 25000): any {
  if (!root) return null;
  if (pred(root)) return root;
  const children = root.children;
  if (!Array.isArray(children)) return null;
  for (const child of children) {
    const stack = [child];
    const seen = new Set<any>();
    let n = 0;
    while (stack.length && n++ < limitPerBranch) {
      const node = stack.pop();
      if (!node || seen.has(node)) continue;
      seen.add(node);
      if (pred(node)) return node;
      const kids = node.children;
      if (Array.isArray(kids)) for (const kid of kids) stack.push(kid);
    }
  }
  return null;
}

// `roundRect`/`clear` are public PIXI.Graphics API methods, so unlike
// minified identifiers they survive the game's build unchanged — used to
// borrow the game's own Graphics constructor for our own drawn elements.
//
// Cached at module level once found: it's a stable class reference for the
// whole page session, never per-card state. Callers used to re-derive it on
// every card change, which re-walks the whole stage (including the
// world/tile layer) — with multiple consumers each doing that on every
// tooltip open/close while the player walks around, that was visible lag.
let cachedGraphicsCtor: any = null;
export function findGraphicsCtor(root: any): any {
  if (cachedGraphicsCtor) return cachedGraphicsCtor;
  const found = findAcrossBranches(
    root,
    (node: any) => typeof node?.roundRect === "function" && typeof node?.clear === "function",
  )?.constructor ?? null;
  if (found) cachedGraphicsCtor = found;
  return found;
}

let cardSystem: any = null;
let currentCard: any = null;
let findAttempts = 0;
let findRafId: number | null = null;
let lastFindCheckAt = 0;
const listeners = new Set<GardenInfoCardListener>();

const debugState: GardenInfoCardDebugState = {
  findAttempts: 0,
  attached: false,
  rafTicks: 0,
  scriptStartedAt: Date.now(),
  listenerCount: 0,
};
shareGlobal("__MG_GARDEN_INFO_CARD_DEBUG__", debugState);

function computeGeometry(card: any): GardenInfoCardGeometry {
  const cardBounds = card.getLocalBounds();
  // Prefer the game's own fixed hit-area size over the card's rendered
  // bounds — a large/grown crop's icon can visually overflow past the
  // card's intended box, which throws off anything anchored to it.
  const width = card.hitArea?.width ?? cardBounds.width;
  const height = card.hitArea?.height ?? cardBounds.height;
  const titleRow = (card.children ?? []).find((c: any) => c?.label === TITLE_ROW_LABEL);
  const contentTop = titleRow
    ? titleRow.position.y + titleRow.getLocalBounds().minY
    : cardBounds.minY;
  const abilitiesSection = (cardSystem?.children ?? []).find((c: any) => c?.label === ABILITIES_SECTION_LABEL);
  const extraTopOffset = abilitiesSection
    ? abilitiesSection.getLocalBounds().height + SECTION_GAP_ESTIMATE
    : 0;
  return { top: contentTop - extraTopOffset, width, height };
}

function notifyListeners(card: any | null, geometry: GardenInfoCardGeometry | null) {
  for (const listener of listeners) {
    try {
      listener(card, geometry);
    } catch (error) {
      console.warn("[gardenInfoCardPixi] listener failed", error);
    }
  }
}

// Runs synchronously inside the game's own Pixi update loop (triggered from
// its `addChild` → `childAdded` emit). If this throws, the exception bubbles
// into the game's own rebuild and aborts it partway through, corrupting its
// layout — so every path here must stay exception-safe.
function onChildAddedUnsafe(row: any) {
  if (row?.label !== CARD_ROW_LABEL) return;
  const card = findByLabel(row, OBJECT_CARD_LABEL);
  if (!card) return;
  currentCard = card;
  const geometry = computeGeometry(card);
  card.once("destroyed", () => {
    if (currentCard === card) {
      currentCard = null;
      notifyListeners(null, null);
    }
  });
  notifyListeners(card, geometry);
}

function onChildAdded(row: any) {
  try {
    onChildAddedUnsafe(row);
  } catch (error) {
    console.warn("[gardenInfoCardPixi] onChildAdded failed", error);
  }
}

function attachToCardSystem(system: any) {
  cardSystem = system;
  cardSystem.on("childAdded", onChildAdded);
  cardSystem.once("destroyed", () => {
    if (cardSystem === system) {
      cardSystem = null;
      debugState.attached = false;
      currentCard = null;
      notifyListeners(null, null);
      // The game can destroy and fully recreate its whole Pixi tree (e.g.
      // WebGL context loss after the tab/window is backgrounded a while,
      // such as switching away and back with alt-tab) — the search loop
      // had already stopped scheduling itself once found the first time,
      // so without this it would never look for the new one again.
      restartSearchIfNeeded();
    }
  });
  debugState.attached = true;
  console.info(`[gardenInfoCardPixi] attached to ${CARD_SYSTEM_LABEL} after ${findAttempts} attempt(s)`);
  const existingRow = (system.children ?? []).find((c: any) => c?.label === CARD_ROW_LABEL);
  if (existingRow) onChildAdded(existingRow);
}

// No attempt cap: the sprite catalog (renderer/ctors) can take a variable
// amount of time to become ready depending on how fast the page loads, so
// giving up after a fixed number of attempts risked never finding the card
// system at all on a fast load. Retrying forever costs nothing once found
// (scheduling stops immediately below).
function tryFindCardSystem() {
  if (cardSystem) return;
  const state = getSpriteState();
  if (!state) return;
  const stage = getStage(state);
  const found = findAcrossBranches(stage, (node: any) => node?.label === CARD_SYSTEM_LABEL);
  if (found) {
    attachToCardSystem(found);
    return;
  }
  findAttempts += 1;
  debugState.findAttempts = findAttempts;
  if (findAttempts % CARD_SYSTEM_FIND_LOG_EVERY === 0) {
    console.info(`[gardenInfoCardPixi] still searching for ${CARD_SYSTEM_LABEL} (${findAttempts} attempts so far)`);
  }
}

// Driven by requestAnimationFrame rather than setInterval: browsers can
// throttle setInterval/setTimeout heavily depending on tab/frame focus
// state. The game's own renderer keeps calling RAF as long as it's
// rendering at all, so piggybacking on it avoids that throttling.
//
// Critically, this must be `pageWindow.requestAnimationFrame`, not the bare
// global — Tampermonkey's sandboxed script context has its own `window`
// separate from the page's real `unsafeWindow` in some injection modes, and
// that sandbox realm isn't tied to the page's actual rendering.
const raf: (cb: (t: number) => void) => number = (pageWindow as any).requestAnimationFrame.bind(pageWindow);

function scheduleFind(now: number) {
  findRafId = null;
  debugState.rafTicks += 1;
  if (!listeners.size || cardSystem) return;
  if (now - lastFindCheckAt >= CARD_SYSTEM_FIND_RETRY_MS) {
    lastFindCheckAt = now;
    tryFindCardSystem();
  }
  if (!listeners.size || cardSystem) return;
  findRafId = raf(scheduleFind);
}

/** (Re)kicks the search loop if there are subscribers but nothing found yet. */
function restartSearchIfNeeded() {
  if (!listeners.size || cardSystem) return;
  tryFindCardSystem();
  if (!cardSystem && findRafId == null) {
    findRafId = raf(scheduleFind);
  }
}

/**
 * Subscribe to the game's Pixi-rendered garden info card. `listener` is
 * called with the card container + its geometry whenever a card is shown,
 * and with `(null, null)` when it's removed. Multiple subscribers share the
 * same underlying card-system search — only one instance of it runs
 * regardless of how many callers subscribe.
 */
export function watchGardenInfoCard(listener: GardenInfoCardListener): () => void {
  listeners.add(listener);
  debugState.listenerCount = listeners.size;
  restartSearchIfNeeded();
  if (currentCard) {
    try {
      listener(currentCard, computeGeometry(currentCard));
    } catch (error) {
      console.warn("[gardenInfoCardPixi] listener failed", error);
    }
  }
  return () => {
    listeners.delete(listener);
    debugState.listenerCount = listeners.size;
  };
}
