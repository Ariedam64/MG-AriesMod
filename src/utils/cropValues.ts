// appendSpanAtEnd.ts
import { startCropPriceWatcherViaGardenObject } from "./cropPrice";
import { coin } from "../data";
import { lockerService } from "../services/locker";
import { readSharedGlobal } from "./page-context";

type QpmGlobal = any;

function getQpmGlobal(): QpmGlobal | undefined {
  return readSharedGlobal<QpmGlobal>("QPM");
}

function getQpmSizeSpan(inner: Element): HTMLElement | null {
  const QPM = getQpmGlobal();
  if (!QPM) return null;
  // On sait que QPM utilise un span.qpm-crop-size pour la taille
  return inner.querySelector<HTMLElement>("span.qpm-crop-size");
}

export interface AppendOptions {
  rootSelector?: string;   // default: '.McFlex.css-fsggty, .McFlex.css-6prrn'
  innerSelector?: string;  // default: '.McFlex.css-1l3zq7, .McFlex.css-11dqzw'
  markerClass?: string;    // default: 'tm-crop-price'
  root?: ParentNode;       // default: document
  log?: boolean | ((...args: unknown[]) => void);
}
export interface AppendController { stop(): void; runOnce(): void; isRunning(): boolean; }

export const DEFAULTS = {
  rootSelector: ".McFlex.css-fsggty, .McFlex.css-6prrn",
  innerSelector: ".McFlex.css-1l3zq7, .McFlex.css-11dqzw",
  markerClass: "tm-crop-price",
} as const;

// Pour le skip ciblé
const OMA_SEL = ".McFlex.css-1l3zq7, .McFlex.css-11dqzw";

// Classes internes de notre bloc marqueur
const ICON_CLASS = "tm-crop-price-icon";
const LABEL_CLASS = "tm-crop-price-label";
const LOCK_TEXT_SELECTOR = ":scope > .chakra-text.css-1jc0opy";

const LOCK_EMOJI = "🔒";
const LOCK_BORDER_STYLE = "2px solid rgb(188, 53, 215)";
const LOCK_BORDER_RADIUS = "15px";
// Hashed chakra class of the tooltip root — changes between game builds
// (css-129757o, then css-7cru8u). Kept as hints; getTooltipRoot falls back to
// the structure (parent of the .McGrid panel) when no class matches.
const TOOLTIP_ROOT_CLASSES = ["css-129757o", "css-7cru8u"];
const LOCK_ICON_CLASS = "tm-locker-tooltip-lock-icon";

const DATASET_KEY_COLOR = "tmLockerOriginalColor";
const DATASET_KEY_DISPLAY = "tmLockerOriginalDisplay";
const DATASET_KEY_ALIGN = "tmLockerOriginalAlign";
const DATASET_KEY_TEXT = "tmLockerOriginalHtml";
const DATASET_KEY_BORDER = "tmLockerOriginalBorder";
const DATASET_KEY_BORDER_RADIUS = "tmLockerOriginalBorderRadius";
const DATASET_KEY_POSITION = "tmLockerOriginalPosition";
const DATASET_KEY_OVERFLOW = "tmLockerOriginalOverflow";

const LOCK_PREFIX_REGEX = new RegExp(`^${LOCK_EMOJI}(?:\\u00A0|\\s|&nbsp;)*`);

const PRICE_FALLBACK = "—";
const nfUS = new Intl.NumberFormat("en-US");
const formatCoins = (value: number | null) =>
  value == null ? PRICE_FALLBACK : nfUS.format(Math.max(0, Math.round(value)));

const hasDOM = typeof window !== "undefined" && typeof document !== "undefined";

type PanelSelectors = {
  rootSelector: string;
  innerSelector: string;
};

type LockerEvent = { harvestAllowed?: boolean | null };

function queryAll(root: ParentNode, sel: string): Element[] {
  return Array.from(root.querySelectorAll(sel));
}

function createLogger(option?: AppendOptions["log"]) {
  if (typeof option === "function") return option;
  if (option) return (...args: unknown[]) => console.debug("[AppendCropPrice/GO]", ...args);
  return () => {};
}

function forEachInner(
  root: ParentNode,
  selectors: PanelSelectors,
  callback: (inner: Element) => void
): void {
  queryAll(root, selectors.rootSelector).forEach((rootEl) => {
    queryAll(rootEl, selectors.innerSelector).forEach(callback);
  });
}

function updatePanels(
  root: ParentNode,
  selectors: PanelSelectors,
  markerClass: string,
  text: string,
  locked: boolean
): void {
  forEachInner(root, selectors, (inner) => {
    if (shouldSkipInner(inner, markerClass)) {
      removeMarker(inner, markerClass);
      updateLockEmoji(inner, locked);
      return;
    }
    updateLockEmoji(inner, locked);
    ensureSpanAtEnd(inner, text, markerClass);
  });
}

function getLockerHarvestAllowed(): boolean | null {
  try {
    return lockerService.getCurrentSlotSnapshot().harvestAllowed ?? null;
  } catch {
    return null;
  }
}

function subscribeLocker(handler: (event: LockerEvent) => void): (() => void) | null {
  try {
    return lockerService.onSlotInfoChange(handler);
  } catch {
    return null;
  }
}

export function startCropValuesObserverFromGardenAtom(options: AppendOptions = {}): AppendController {
  if (!hasDOM) {
    return { stop() {}, runOnce() {}, isRunning: () => false };
  }

  const selectors: PanelSelectors = {
    rootSelector: options.rootSelector ?? DEFAULTS.rootSelector,
    innerSelector: options.innerSelector ?? DEFAULTS.innerSelector,
  };
  const markerClass = options.markerClass ?? DEFAULTS.markerClass;
  const root: ParentNode = options.root ?? document;
  const logger = createLogger(options.log);
  const priceWatcher = startCropPriceWatcherViaGardenObject();
  const shouldWaitForLocker = lockerService.getState().enabled;

  let running = true;
  let lockerHarvestAllowed = getLockerHarvestAllowed();
  let lockerReady = !shouldWaitForLocker;
  let lastRenderedValue: number | null | undefined = undefined;
  let lastRenderedLocked: boolean | null | undefined = undefined;
  let needsRepositionRender = false;
  let qpmObserver: MutationObserver | null = null;

  const render = () => {
    if (!running) return;
    if (!lockerReady) return;

    // Heal any outline applied outside a real tooltip (runs every cycle, even
    // when the rendered value/lock state did not change).
    cleanupStrayLockedStyles();

    const value = priceWatcher.get();
    const locked = lockerHarvestAllowed === false;
    if (
      value === lastRenderedValue &&
      locked === lastRenderedLocked &&
      !needsRepositionRender
    ) {
      return;
    }
    lastRenderedValue = value;
    lastRenderedLocked = locked;
    needsRepositionRender = false;
    updatePanels(root, selectors, markerClass, formatCoins(value), locked);
    logger("render", { value, locked });
  };

  let lockerReadyTimeout: ReturnType<typeof setTimeout> | null = null;
  const clearLockerReadyTimeout = () => {
    if (lockerReadyTimeout == null) return;
    if (typeof globalThis !== "undefined" && typeof globalThis.clearTimeout === "function") {
      globalThis.clearTimeout(lockerReadyTimeout);
    }
    lockerReadyTimeout = null;
  };

  const startLockerReadyTimeout = () => {
    if (!shouldWaitForLocker || lockerReady || lockerReadyTimeout != null) return;
    if (typeof globalThis === "undefined" || typeof globalThis.setTimeout !== "function") return;
    lockerReadyTimeout = globalThis.setTimeout(() => {
      lockerReadyTimeout = null;
      if (!lockerReady) {
        lockerReady = true;
        render();
      }
    }, 500);
  };

  startLockerReadyTimeout();

  const startQpmObserver = () => {
    if (qpmObserver) return;
    if (typeof MutationObserver === "undefined") return;
    const target = document.body ?? document.documentElement ?? document;
    if (!target) return;

    qpmObserver = new MutationObserver((mutations) => {
      let found = false;
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof Element)) continue;
          if (node.classList.contains("qpm-crop-size")) {
            found = true;
            break;
          }
          if (node.querySelector(".qpm-crop-size")) {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      if (found) {
        needsRepositionRender = true;
        render();
      }
    });
    qpmObserver.observe(target, { childList: true, subtree: true });
  };

  const stopQpmObserver = () => {
    if (!qpmObserver) return;
    try {
      qpmObserver.disconnect();
    } catch {}
    qpmObserver = null;
  };

  startQpmObserver();

  const lockerOff = subscribeLocker((event) => {
    lockerHarvestAllowed = event.harvestAllowed ?? null;
    clearLockerReadyTimeout();
    if (!lockerReady && shouldWaitForLocker) {
      lockerReady = true;
    }
    render();
  });

  if (shouldWaitForLocker && lockerOff == null) {
    clearLockerReadyTimeout();
    lockerReady = true;
  }

  render();
  const off = priceWatcher.onChange(render);

  return {
    stop() {
      if (!running) return;
      running = false;
      clearLockerReadyTimeout();
      stopQpmObserver();
      off?.();
      if (typeof lockerOff === "function") {
        try {
          lockerOff();
        } catch {}
      }
      priceWatcher.stop();
      logger("stopped");
    },
    runOnce() {
      render();
    },
    isRunning() {
      return running;
    },
  };
}

export function appendSpanToAll(opts: Omit<AppendOptions, "log"> = {}): void {
  if (!hasDOM) return;

  const selectors: PanelSelectors = {
    rootSelector: opts.rootSelector ?? DEFAULTS.rootSelector,
    innerSelector: opts.innerSelector ?? DEFAULTS.innerSelector,
  };
  const markerClass = opts.markerClass ?? DEFAULTS.markerClass;
  const root: ParentNode = opts.root ?? document;
  const watcher = __singletonPriceWatcherGO();
  const text = formatCoins(watcher.get());
  const locked = getLockerHarvestAllowed() === false;

  updatePanels(root, selectors, markerClass, text, locked);
}

/* ================= helpers ================= */

/** true si inner est un bloc cible avec **exactement 1** enfant élément réel (hors span marqueur),
 *  ou si un enfant direct correspond au même sélecteur (conteneur parent, e.g. css-11dqzw > css-11dqzw). */
function shouldSkipInner(inner: Element, markerClass: string): boolean {
  if (!(inner instanceof Element)) return false;
  if (!inner.matches(OMA_SEL)) return false;

  // Skip si un enfant direct du même type est lui-même un leaf valide (2+ enfants réels).
  // Cas Pine Tree : outer css-11dqzw → inner css-11dqzw avec 2 enfants → outer est un wrapper.
  // Cas Aloe : outer css-11dqzw → inner css-11dqzw avec 1 enfant → inner sera skippé → outer garde le prix.
  const matchedSel = [".McFlex.css-1l3zq7", ".McFlex.css-11dqzw"].find(s => inner.matches(s));
  if (matchedSel) {
    const sameTypeChild = Array.from(inner.children).find(c => c.matches(matchedSel));
    if (sameTypeChild && getRealElementChildren(sameTypeChild, markerClass).length > 1) return true;
  }

  const realChildren = getRealElementChildren(inner, markerClass);
  return realChildren.length === 1;
}

/** Enfants éléments **hors** notre propre span marqueur */
function getRealElementChildren(inner: Element, markerClass: string): Element[] {
  const children = Array.from(inner.children) as Element[];
  return children.filter(
    (el) => !(
      el.tagName === "SPAN" && (
        el.classList.contains(markerClass)
      )
    )
  );
}

function removeMarker(inner: Element, markerClass: string): void {
  const markers = inner.querySelectorAll(`:scope > span.${CSS.escape(markerClass)}`);
  markers.forEach((m) => m.remove());
}

/**
 * A tooltip root either carries one of the known hashed classes, or wraps
 * ONLY the .McGrid crop panel (plus our own lock icon). The in-game screen
 * also nests .McGrid containers — those hold many other children and must
 * never receive the locked outline.
 */
function isTooltipRoot(el: HTMLElement): boolean {
  if (TOOLTIP_ROOT_CLASSES.some((cls) => el.classList.contains(cls))) return true;
  const children = Array.from(el.children);
  const grid = children.find((c) => c.classList.contains("McGrid"));
  if (!grid) return false;
  const extra = children.filter(
    (c) => c !== grid && !c.classList.contains(LOCK_ICON_CLASS),
  );
  return extra.length === 0;
}

function cleanupLegacyLockIcons(): void {
  if (typeof document === "undefined") return;
  const all = document.querySelectorAll<HTMLElement>(`span.${LOCK_ICON_CLASS}`);
  all.forEach(icon => {
    const parent = icon.parentElement;
    if (!parent || !isTooltipRoot(parent)) icon.remove();
  });
}

/** Restore any element that received the locked styling but is not a tooltip root. */
function cleanupStrayLockedStyles(): void {
  if (typeof document === "undefined") return;
  const all = document.querySelectorAll<HTMLElement>("[data-tm-locker-original-border]");
  all.forEach((el) => {
    if (!isTooltipRoot(el)) {
      restoreTooltipStyles(el);
      removeLockIcon(el);
    }
  });
}

function getTooltipRoot(inner: HTMLElement): HTMLElement | null {
  for (const cls of TOOLTIP_ROOT_CLASSES) {
    const direct = inner.closest<HTMLElement>(`.${cls}`);
    if (direct) return direct;
  }
  // Structural fallback (survives hashed class renames): the crop panel grid
  // must be the DIRECT parent of `inner` (the screen layout also nests
  // .McGrid containers higher up — never anchor on those), and the tooltip
  // root is that grid's parent, provided it wraps nothing else.
  const grid = inner.parentElement;
  if (!(grid instanceof HTMLElement) || !grid.classList.contains("McGrid")) return null;
  const parent = grid.parentElement;
  if (!(parent instanceof HTMLElement)) return null;
  return isTooltipRoot(parent) ? parent : null;
}

function updateLockEmoji(inner: Element, locked: boolean): void {
  if (!(inner instanceof HTMLElement)) return;

  // Nettoie les anciens spans hérités des versions précédentes
  inner.querySelectorAll(":scope > span.tm-locker-lock-emoji").forEach((node) => node.remove());

  // Supprime les locks orphelins qui ne sont pas dans un vrai panel
  cleanupLegacyLockIcons();
  // Et retire la bordure/le cadenas posés par erreur hors tooltip (ex: un
  // conteneur d'écran résolu par un ancien fallback trop large)
  cleanupStrayLockedStyles();

  const textTarget =
    inner.querySelector<HTMLElement>(LOCK_TEXT_SELECTOR) ??
    inner.querySelector<HTMLElement>(":scope > .chakra-text");

  const tooltipRoot = getTooltipRoot(inner);

  // Nettoie les anciennes ancres (v3.1.511 utilisait .css-502lyi qui englobait
  // les flèches Prev/Next dans l'inventaire).
  const legacyOuter = inner.closest<HTMLElement>(".css-502lyi");
  if (legacyOuter && legacyOuter !== tooltipRoot) {
    restoreTooltipStyles(legacyOuter);
    removeLockIcon(legacyOuter);
  }

  if (!locked) {
    if (textTarget) {
      restoreTextContent(textTarget);
      restoreTextStyles(textTarget);
    }
    if (tooltipRoot) {
      restoreTooltipStyles(tooltipRoot);
      removeLockIcon(tooltipRoot);
    }
    return;
  }

  if (textTarget) {
    restoreTextContent(textTarget);
  }

  if (tooltipRoot) {
    storeOriginalTooltipStyles(tooltipRoot);
    applyLockedTooltipStyles(tooltipRoot);
    ensureLockIcon(tooltipRoot);
  }
}


function restoreTextStyles(textTarget: HTMLElement): void {
  restoreStyleFromDataset(textTarget, DATASET_KEY_COLOR, "color");
  restoreStyleFromDataset(textTarget, DATASET_KEY_DISPLAY, "display");
  restoreStyleFromDataset(textTarget, DATASET_KEY_ALIGN, "align-items");
}

function restoreTextContent(textTarget: HTMLElement): void {
  const originalHtml = textTarget.dataset[DATASET_KEY_TEXT];
  if (originalHtml !== undefined) {
    textTarget.innerHTML = originalHtml;
    delete textTarget.dataset[DATASET_KEY_TEXT];
    return;
  }

  const currentHtml = textTarget.innerHTML;
  const sanitizedHtml = stripLockPrefix(currentHtml);
  if (sanitizedHtml !== currentHtml) {
    textTarget.innerHTML = sanitizedHtml;
  }
}

function restoreStyleFromDataset(el: HTMLElement, datasetKey: string, cssProperty: string): void {
  const datasetMap = el.dataset as Record<string, string | undefined>;
  const originalValue = datasetMap[datasetKey];
  if (originalValue === undefined) return;

  if (originalValue) {
    el.style.setProperty(cssProperty, originalValue);
  } else {
    el.style.removeProperty(cssProperty);
  }

  delete datasetMap[datasetKey];
}

function storeOriginalTooltipStyles(tooltip: HTMLElement): void {
  if (tooltip.dataset[DATASET_KEY_BORDER] === undefined) {
    tooltip.dataset[DATASET_KEY_BORDER] = tooltip.style.border ?? "";
  }
  if (tooltip.dataset[DATASET_KEY_BORDER_RADIUS] === undefined) {
    tooltip.dataset[DATASET_KEY_BORDER_RADIUS] = tooltip.style.borderRadius ?? "";
  }
  if (tooltip.dataset[DATASET_KEY_OVERFLOW] === undefined) {
    tooltip.dataset[DATASET_KEY_OVERFLOW] = tooltip.style.overflow ?? "";
  }
}

function applyLockedTooltipStyles(tooltip: HTMLElement): void {
  tooltip.style.border = LOCK_BORDER_STYLE;
  tooltip.style.borderRadius = LOCK_BORDER_RADIUS;
  tooltip.style.overflow = "visible";

  const computedPosition = typeof window !== "undefined"
    ? window.getComputedStyle(tooltip).position
    : tooltip.style.position || "static";
  if (computedPosition === "static") {
    if (tooltip.dataset[DATASET_KEY_POSITION] === undefined) {
      tooltip.dataset[DATASET_KEY_POSITION] = tooltip.style.position ?? "";
    }
    tooltip.style.position = "relative";
  }
}

function restoreTooltipStyles(tooltip: HTMLElement): void {
  const originalBorder = tooltip.dataset[DATASET_KEY_BORDER];
  if (originalBorder !== undefined) {
    if (originalBorder) {
      tooltip.style.border = originalBorder;
    } else {
      tooltip.style.removeProperty("border");
    }
    delete tooltip.dataset[DATASET_KEY_BORDER];
  } else {
    tooltip.style.removeProperty("border");
  }

  const originalBorderRadius = tooltip.dataset[DATASET_KEY_BORDER_RADIUS];
  if (originalBorderRadius !== undefined) {
    if (originalBorderRadius) {
      tooltip.style.borderRadius = originalBorderRadius;
    } else {
      tooltip.style.removeProperty("border-radius");
    }
    delete tooltip.dataset[DATASET_KEY_BORDER_RADIUS];
  } else {
    tooltip.style.removeProperty("border-radius");
  }

  const originalOverflow = tooltip.dataset[DATASET_KEY_OVERFLOW];
  if (originalOverflow !== undefined) {
    if (originalOverflow) {
      tooltip.style.overflow = originalOverflow;
    } else {
      tooltip.style.removeProperty("overflow");
    }
    delete tooltip.dataset[DATASET_KEY_OVERFLOW];
  } else {
    tooltip.style.removeProperty("overflow");
  }

  const originalPosition = tooltip.dataset[DATASET_KEY_POSITION];
  if (originalPosition !== undefined) {
    if (originalPosition) {
      tooltip.style.position = originalPosition;
    } else {
      tooltip.style.removeProperty("position");
    }
    delete tooltip.dataset[DATASET_KEY_POSITION];
  } else if (tooltip.style.position === "relative") {
    tooltip.style.removeProperty("position");
  }
}

function ensureLockIcon(tooltip: HTMLElement): void {
  // On ne garde qu’un lock par tooltip
  const icons = tooltip.querySelectorAll<HTMLElement>(`:scope > span.${LOCK_ICON_CLASS}`);
  icons.forEach((node, idx) => {
    if (idx > 0) node.remove();
  });

  let icon = icons[0] ?? null;
  if (!icon) {
    icon = document.createElement("span");
    icon.className = LOCK_ICON_CLASS;
    tooltip.append(icon);
  }

  icon.textContent = LOCK_EMOJI;
  icon.style.position = "absolute";
  icon.style.top = "0";
  icon.style.right = "0";
  icon.style.left = "";
  icon.style.transform = "translate(50%, -50%)";
  icon.style.fontSize = "18px";
  icon.style.padding = "2px 8px";
  icon.style.borderRadius = "999px";
  icon.style.border = "none";
  icon.style.background = "transparent";
  icon.style.color = "white";
  icon.style.pointerEvents = "none";
  icon.style.userSelect = "none";
  icon.style.zIndex = "1";
}

function removeLockIcon(tooltip: HTMLElement): void {
  tooltip.querySelectorAll(`:scope > span.${LOCK_ICON_CLASS}`).forEach((node) => node.remove());
}

function stripLockPrefix(content: string): string {
  return content.replace(LOCK_PREFIX_REGEX, "");
}

function ensureSpanAtEnd(inner: Element, text: string, markerClass: string): void {
  // Récupère/instancie le span marqueur
  const spans = Array.from(
    inner.querySelectorAll(`:scope > span.${CSS.escape(markerClass)}`)
  ) as HTMLSpanElement[];

  let span: HTMLSpanElement | null = spans[0] ?? null;
  for (let i = 1; i < spans.length; i++) spans[i].remove();

  if (!span) {
    span = document.createElement("span") as HTMLSpanElement;
    span.className = markerClass;
  }

  // Style du conteneur (jaune)
  span.style.display = "block";
  span.style.marginTop = "6px";
  span.style.fontWeight = "700";
  span.style.color = "#FFD84D";
  span.style.fontSize = "14px";

  // Icône (span en background) + label interne séparé
  let icon = span.querySelector<HTMLElement>(`:scope > span.${ICON_CLASS}`);
  if (!icon) {
    icon = document.createElement("span");
    icon.className = ICON_CLASS;
    icon.setAttribute("aria-hidden", "true");

    icon.style.width = "18px";
    icon.style.height = "18px";
    icon.style.display = "inline-block";
    icon.style.verticalAlign = "middle";
    icon.style.marginRight = "6px";
    icon.style.userSelect = "none";
    icon.style.pointerEvents = "none";

    // important pour afficher correctement l'image
    icon.style.backgroundSize = "contain";
    icon.style.backgroundRepeat = "no-repeat";
    icon.style.backgroundPosition = "center";

    span.insertBefore(icon, span.firstChild);
  }

  const bg = `url("${coin.img64}")`;
  if (icon.style.backgroundImage !== bg) {
    icon.style.backgroundImage = bg;
  }

  let label = span.querySelector<HTMLSpanElement>(`:scope > span.${LABEL_CLASS}`);
  if (!label) {
    label = document.createElement("span");
    label.className = LABEL_CLASS;
    label.style.display = "inline";
    span.appendChild(label);
  }
  if (label.textContent !== text) {
    label.textContent = text;
  }

  // ==========================
  // Compat QPM : prix APRÈS la size
  // ==========================
  const sizeSpan = getQpmSizeSpan(inner);

  if (sizeSpan) {
    const next = sizeSpan.nextElementSibling;
    if (next !== span) {
      inner.insertBefore(span, next); // insertBefore(nextSibling) == après
    }
    return; // on ne retouche plus la position après ça
  }

  // ==========================
  // Fallback : QPM pas là
  // ==========================
  if (inner.lastElementChild !== span) {
    inner.appendChild(span);
  }
}


// singleton pour appendSpanToAll()
let __goWatcher: ReturnType<typeof startCropPriceWatcherViaGardenObject> | null = null;
function __singletonPriceWatcherGO() {
  if (!__goWatcher) __goWatcher = startCropPriceWatcherViaGardenObject();
  return __goWatcher;
}
