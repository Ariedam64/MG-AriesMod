// The crop's coin value as a line at the end of the game's old DOM crop
// tooltip, and the Harvest Locker's purple outline and lock glyph around that
// tooltip when the locker refuses the crop.
//
// The garden card now renders in Pixi, where badge.ts and locker/indicator.ts
// draw the same two things. This file only finds the hashed Chakra classes of
// the DOM tooltip, so deleting it and its start call in ui/hud.ts removes the
// DOM half without touching the Pixi one.

import { startCropPriceWatcherViaGardenObject } from "./priceWatcher";
import { onShowCropPriceChange, readShowCropPrice } from "./setting";
import { coin } from "../../data";
import { formatInteger } from "../../lib/format";
import { lockerService } from "../locker/locker";
import { markedElements, markLocked, unmarkLocked, type LockLook } from "../locker/domLockMarks";
import { readSharedGlobal } from "../../platform/pageContext";

/** The tooltip panels, and inside them the blocks the price line goes into. */
const PANEL_SELECTOR = ".McFlex.css-fsggty, .McFlex.css-6prrn";
const BLOCK_SELECTORS = [".McFlex.css-1l3zq7", ".McFlex.css-11dqzw"];
const BLOCK_SELECTOR = BLOCK_SELECTORS.join(", ");

const PRICE_CLASS = "tm-crop-price";
const PRICE_ICON_CLASS = "tm-crop-price-icon";
const PRICE_LABEL_CLASS = "tm-crop-price-label";

// Hashed Chakra classes of the tooltip root, which change between game builds
// (css-129757o, then css-7cru8u). Kept as hints: `tooltipRootOf` falls back on
// the structure, the parent of the .McGrid panel.
const TOOLTIP_ROOT_CLASSES = ["css-129757o", "css-7cru8u"];

const TOOLTIP_LOCK_LOOK: LockLook = {
  owner: "locker-tooltip",
  style: { border: "2px solid rgb(188, 53, 215)", "border-radius": "15px", overflow: "visible" },
  glyph: {
    position: "absolute",
    top: "0",
    right: "0",
    transform: "translate(50%, -50%)",
    "font-size": "18px",
    padding: "2px 8px",
    "border-radius": "999px",
    color: "white",
    "pointer-events": "none",
    "user-select": "none",
    "z-index": "1",
  },
};
const TOOLTIP_GLYPH_CLASS = `tm-${TOOLTIP_LOCK_LOOK.owner}-lock`;

/** How long a locker that is on gets to report the selected crop before the first render goes ahead. */
const LOCKER_FIRST_VERDICT_WAIT_MS = 500;

export function startCropValuesObserverFromGardenAtom(): { stop(): void } {
  const priceWatcher = startCropPriceWatcherViaGardenObject();
  let running = true;
  let harvestAllowed = lockerService.currentHarvestAllowed();
  // A locker that is on reports its verdict right after start: waiting for it
  // avoids drawing an unlocked tooltip that turns locked a moment later.
  let lockerReady = !lockerService.isEnabled();
  let needsReposition = false;
  let last: { value: number | null; locked: boolean; showPrice: boolean } | null = null;

  const render = () => {
    if (!running || !lockerReady) return;
    // Heals an outline left on an element that is no longer a tooltip root,
    // every pass, even when nothing else changed.
    unmarkStrayTooltips();

    const next = { value: priceWatcher.get(), locked: harvestAllowed === false, showPrice: readShowCropPrice() };
    if (!needsReposition && last && last.value === next.value && last.locked === next.locked && last.showPrice === next.showPrice) {
      return;
    }
    last = next;
    needsReposition = false;
    const text = next.value == null ? "-" : formatInteger(next.value, "round");
    for (const panel of Array.from(document.querySelectorAll(PANEL_SELECTOR))) {
      for (const block of Array.from(panel.querySelectorAll(BLOCK_SELECTOR))) {
        if (!(block instanceof HTMLElement)) continue;
        updateTooltipLock(block, next.locked);
        // The locker's outline does not depend on the price setting.
        if (!next.showPrice || isWrapperBlock(block)) removePriceLine(block);
        else ensurePriceLine(block, text);
      }
    }
  };

  const readyTimer = lockerReady
    ? null
    : setTimeout(() => {
        lockerReady = true;
        render();
      }, LOCKER_FIRST_VERDICT_WAIT_MS);

  const offLocker = lockerService.onSlotInfoChange((event) => {
    harvestAllowed = event.harvestAllowed;
    if (readyTimer != null) clearTimeout(readyTimer);
    lockerReady = true;
    render();
  });

  // Another userscript (QPM) adds a size line; the price goes after it, so a
  // new size line means placing the price again.
  const qpmObserver = new MutationObserver((mutations) => {
    const added = mutations.some((m) =>
      Array.from(m.addedNodes).some(
        (node) => node instanceof Element && (node.classList.contains("qpm-crop-size") || !!node.querySelector(".qpm-crop-size")),
      ),
    );
    if (!added) return;
    needsReposition = true;
    render();
  });
  qpmObserver.observe(document.body ?? document.documentElement, { childList: true, subtree: true });

  render();
  const offPrice = priceWatcher.onChange(render);
  const offShowPrice = onShowCropPriceChange(render);

  return {
    stop() {
      if (!running) return;
      running = false;
      if (readyTimer != null) clearTimeout(readyTimer);
      qpmObserver.disconnect();
      offPrice();
      offShowPrice();
      offLocker();
      priceWatcher.stop();
    },
  };
}

/** Children of a block, without the price line itself. */
const contentChildren = (block: Element): Element[] =>
  Array.from(block.children).filter((el) => !(el.tagName === "SPAN" && el.classList.contains(PRICE_CLASS)));

/**
 * A block that only wraps the real one gets no price line: one with a single
 * child, or one holding a block of its own kind with two or more children (a
 * Pine Tree's outer block holds the real one; an Aloe's inner block holds one
 * child, so the outer block keeps the price).
 */
function isWrapperBlock(block: Element): boolean {
  if (!block.matches(BLOCK_SELECTOR)) return false;
  const own = BLOCK_SELECTORS.find((selector) => block.matches(selector));
  if (own) {
    const inner = Array.from(block.children).find((child) => child.matches(own));
    if (inner && contentChildren(inner).length > 1) return true;
  }
  return contentChildren(block).length === 1;
}

function removePriceLine(block: Element): void {
  block.querySelectorAll(`:scope > span.${PRICE_CLASS}`).forEach((line) => line.remove());
}

function ensurePriceLine(block: Element, text: string): void {
  const lines = Array.from(block.querySelectorAll<HTMLSpanElement>(`:scope > span.${PRICE_CLASS}`));
  lines.slice(1).forEach((extra) => extra.remove());
  let line = lines[0];
  if (!line) {
    line = document.createElement("span");
    line.className = PRICE_CLASS;
    Object.assign(line.style, { display: "block", marginTop: "6px", fontWeight: "700", color: "#FFD84D", fontSize: "14px" });
  }

  let icon = line.querySelector<HTMLSpanElement>(`:scope > span.${PRICE_ICON_CLASS}`);
  if (!icon) {
    icon = document.createElement("span");
    icon.className = PRICE_ICON_CLASS;
    icon.setAttribute("aria-hidden", "true");
    Object.assign(icon.style, {
      width: "18px",
      height: "18px",
      display: "inline-block",
      verticalAlign: "middle",
      marginRight: "6px",
      userSelect: "none",
      pointerEvents: "none",
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    });
    line.insertBefore(icon, line.firstChild);
  }
  const background = `url("${coin.img64}")`;
  if (icon.style.backgroundImage !== background) icon.style.backgroundImage = background;

  let label = line.querySelector<HTMLSpanElement>(`:scope > span.${PRICE_LABEL_CLASS}`);
  if (!label) {
    label = document.createElement("span");
    label.className = PRICE_LABEL_CLASS;
    label.style.display = "inline";
    line.appendChild(label);
  }
  if (label.textContent !== text) label.textContent = text;

  // After QPM's size line when there is one, else last.
  const qpmSize = readSharedGlobal("QPM") ? block.querySelector<HTMLElement>("span.qpm-crop-size") : null;
  if (qpmSize) {
    if (qpmSize.nextElementSibling !== line) block.insertBefore(line, qpmSize.nextElementSibling);
  } else if (block.lastElementChild !== line) {
    block.appendChild(line);
  }
}

/**
 * A tooltip root carries one of the known hashed classes, or wraps only the
 * .McGrid crop panel (and the lock glyph). The game screen also nests .McGrid
 * containers, which hold many other children and must never be outlined.
 */
function isTooltipRoot(el: HTMLElement): boolean {
  if (TOOLTIP_ROOT_CLASSES.some((cls) => el.classList.contains(cls))) return true;
  const children = Array.from(el.children);
  const grid = children.find((child) => child.classList.contains("McGrid"));
  return !!grid && children.every((child) => child === grid || child.classList.contains(TOOLTIP_GLYPH_CLASS));
}

function tooltipRootOf(block: HTMLElement): HTMLElement | null {
  for (const cls of TOOLTIP_ROOT_CLASSES) {
    const root = block.closest<HTMLElement>(`.${cls}`);
    if (root) return root;
  }
  // The crop panel grid must be the block's direct parent: the screen layout
  // nests .McGrid containers higher up, which are never the tooltip.
  const grid = block.parentElement;
  if (!grid?.classList.contains("McGrid")) return null;
  const root = grid.parentElement;
  return root && isTooltipRoot(root) ? root : null;
}

/** Undoes outlines and glyphs left on elements that are no longer tooltip roots. */
function unmarkStrayTooltips(): void {
  for (const el of markedElements(TOOLTIP_LOCK_LOOK.owner)) {
    if (!isTooltipRoot(el)) unmarkLocked(el, TOOLTIP_LOCK_LOOK.owner);
  }
  document.querySelectorAll<HTMLElement>(`span.${TOOLTIP_GLYPH_CLASS}`).forEach((glyph) => {
    const parent = glyph.parentElement;
    if (!parent || !isTooltipRoot(parent)) glyph.remove();
  });
}

function updateTooltipLock(block: HTMLElement, locked: boolean): void {
  const root = tooltipRootOf(block);
  if (!root) return;
  if (locked) markLocked(root, TOOLTIP_LOCK_LOOK);
  else unmarkLocked(root, TOOLTIP_LOCK_LOOK.owner);
}
