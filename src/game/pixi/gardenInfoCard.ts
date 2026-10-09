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
// locker purple-border indicator); they share this one card-system search
// via `watchGardenInfoCard` instead of each running their own copy of it.
import { shareGlobal } from "../../platform/pageContext";
import { findByLabel, watchStageNode, type StageNodeWatch } from "./stageSearch";

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
// Anchor on the title row rather than the card's own full bounds: the
// card's icon can be much taller for large/fully-grown crops, which would
// otherwise push dependent content up by a varying, crop-dependent amount.
const TITLE_ROW_LABEL = "GardenInfoObjectTitleRow";
// A sibling section of the row (not a descendant of it) shown above it for
// crops with an active ability/mutation proc callout (e.g. Dawnbinder).
const ABILITIES_SECTION_LABEL = "GardenInfoPlantAbilities";
const SECTION_GAP_ESTIMATE = 8;

interface GardenInfoCardDebugState {
  findAttempts: number;
  attached: boolean;
  scriptStartedAt: number;
  listenerCount: number;
}

let cardSystem: any = null;
let currentCard: any = null;
/** The card system search, running while anyone listens. */
let search: StageNodeWatch | null = null;
const listeners = new Set<GardenInfoCardListener>();

const debugState: GardenInfoCardDebugState = {
  findAttempts: 0,
  attached: false,
  scriptStartedAt: Date.now(),
  listenerCount: 0,
};
shareGlobal("__MG_GARDEN_INFO_CARD_DEBUG__", debugState);

function computeGeometry(card: any): GardenInfoCardGeometry {
  const cardBounds = card.getLocalBounds();
  // Prefer the game's own fixed hit-area size over the card's rendered
  // bounds: a large/grown crop's icon can visually overflow past the
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
// layout, so every path here must stay exception-safe.
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
  debugState.attached = true;
  const existingRow = (system.children ?? []).find((c: any) => c?.label === CARD_ROW_LABEL);
  if (existingRow) onChildAdded(existingRow);
}

// The game can destroy and fully recreate its whole Pixi tree (e.g. WebGL
// context loss after the tab/window is backgrounded a while, such as
// switching away and back with alt-tab): the search then starts again.
function detachFromCardSystem() {
  cardSystem = null;
  debugState.attached = false;
  currentCard = null;
  notifyListeners(null, null);
  stopSearchIfUnused();
}

function startSearchIfNeeded() {
  if (!listeners.size || search) return;
  search = watchStageNode({
    label: CARD_SYSTEM_LABEL,
    logTag: "[gardenInfoCardPixi]",
    onFound: attachToCardSystem,
    onLost: detachFromCardSystem,
    onSearch: (attempts) => {
      debugState.findAttempts = attempts;
    },
  });
}

/** Nobody listens and nothing is attached: no point searching. */
function stopSearchIfUnused() {
  if (listeners.size || cardSystem || !search) return;
  search.stop();
  search = null;
}

/**
 * Subscribe to the game's Pixi-rendered garden info card. `listener` is
 * called with the card container + its geometry whenever a card is shown,
 * and with `(null, null)` when it's removed. Multiple subscribers share the
 * same underlying card-system search: only one instance of it runs
 * regardless of how many callers subscribe.
 */
export function watchGardenInfoCard(listener: GardenInfoCardListener): () => void {
  listeners.add(listener);
  debugState.listenerCount = listeners.size;
  startSearchIfNeeded();
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
    stopSearchIfUnused();
  };
}
