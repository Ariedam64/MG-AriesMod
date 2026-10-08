// A "Sell all Pets" button injected next to the game's old DOM "Sell <pet>"
// button. The Pet sell prompt now renders in Pixi, where pixiButton.ts adds
// the same button; this file only finds the old DOM one, so deleting it and
// its start call in ui/hud.ts removes the DOM half alone.

import { runSellAllPetsFlow } from "./flow";

/** The pet sell panel, and a block every real panel holds. */
const PANEL_SELECTOR = ".McFlex.css-1svwxx0";
const PANEL_GATE_SELECTOR = ".McGrid";
const BUTTON_SELECTOR = "button.chakra-button.css-1glc7hj, button.chakra-button, button.css-1glc7hj";
const INJECTED_CLASS = "tm-injected-sell-all";
const LABEL = "Sell all Pets";

/** The game's own blue button colours, with their Chakra variables. */
const THEME = {
  text: "var(--chakra-colors-Neutral-TrueWhite, #FFFFFF)",
  bg: "var(--chakra-colors-Blue-Magic, #0067B4)",
  border: "var(--chakra-colors-Blue-Light, #48ADF4)",
  hoverBg: "var(--chakra-colors-Blue-Light, #48ADF4)",
  hoverBorder: "var(--chakra-colors-Blue-Baby, #25AAE2)",
  activeBg: "var(--chakra-colors-Blue-Dark, #264093)",
  ring: "var(--chakra-ring-color, rgba(66,153,225,0.6))",
};

const labelOf = (el: Element): string =>
  ((el.textContent || "").replace(/\s+/g, " ").trim() || (el.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim());

/**
 * The game's single-pet sell button: "Sell <name>" (exactly two words), or a
 * bare "Sell" holding the pet's canvas icon. Never "Sell Crops", nor our own.
 */
function findSellPetButton(panel: Element): HTMLButtonElement | null {
  for (const btn of Array.from(panel.querySelectorAll(BUTTON_SELECTOR))) {
    if (!(btn instanceof HTMLButtonElement) || btn.classList.contains(INJECTED_CLASS)) continue;
    const label = labelOf(btn);
    if (/crops/i.test(label)) continue;
    const words = label.split(/\s+/).filter(Boolean);
    if (words.length === 2 && /^sell$/i.test(words[0])) return btn;
    if (/^sell$/i.test(label) && btn.querySelector("canvas")) return btn;
  }
  return null;
}

function placeNextTo(target: HTMLButtonElement): void {
  const parent = (target.parentElement || target.closest(".McFlex, .css-0")) as HTMLElement | null;
  if (!parent) return;

  const existing = parent.querySelector<HTMLButtonElement>(`.${INJECTED_CLASS}`);
  if (existing) {
    if (target.nextElementSibling !== existing) parent.insertBefore(existing, target.nextSibling);
    if (existing.textContent !== LABEL) existing.textContent = LABEL;
    return;
  }

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `${INJECTED_CLASS} chakra-button`;
  btn.textContent = LABEL;
  btn.title = LABEL;
  btn.setAttribute("aria-label", LABEL);
  btn.style.marginLeft = "8px";
  if (getComputedStyle(parent).display !== "flex") {
    btn.style.display = "inline-flex";
    btn.style.alignItems = "center";
  }
  btn.addEventListener("click", () => {
    void runSellAllPetsFlow().catch(() => {});
  });
  parent.insertBefore(btn, target.nextSibling);
}

function ensureStyle(): void {
  const id = `${INJECTED_CLASS}-style`;
  if (document.getElementById(id)) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = `
.${INJECTED_CLASS} {
  display: inline-flex; align-items: center; justify-content: center; appearance: none; cursor: pointer;
  user-select: none; white-space: nowrap; vertical-align: middle; text-transform: none; overflow: hidden;
  -webkit-font-smoothing: antialiased; -webkit-tap-highlight-color: transparent; font-synthesis: none;
  outline: transparent solid 2px; outline-offset: 2px; line-height: 1.2; height: auto;
  min-width: var(--chakra-sizes-10, 2.5rem);
  padding: var(--chakra-space-3, 0.75rem) var(--chakra-space-4, 1rem);
  border: 2px solid ${THEME.border}; border-radius: 15px;
  color: ${THEME.text}; background: ${THEME.bg};
  font-size: 20px; font-weight: 700;
  box-shadow: rgba(0, 0, 0, 0.3) 0px 4px 12px; transform: translateY(0px); transition: 0.2s;
}
.${INJECTED_CLASS}:hover { transform: translateY(-1px); background: ${THEME.hoverBg}; border-color: ${THEME.hoverBorder}; }
.${INJECTED_CLASS}:active { transform: translateY(1px); background: ${THEME.activeBg}; }
.${INJECTED_CLASS}:focus-visible { box-shadow: 0 0 0 3px ${THEME.ring}; }
`.trim();
  document.head.appendChild(style);
}

/** Watches the DOM for the old pet sell panel and keeps one injected button beside its sell button. */
export function startInjectSellAllPets(): { stop(): void } {
  ensureStyle();
  let pending = false;

  const processPanels = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      for (const panel of Array.from(document.querySelectorAll(PANEL_SELECTOR))) {
        const target = panel.querySelector(PANEL_GATE_SELECTOR) ? findSellPetButton(panel) : null;
        if (target) placeNextTo(target);
        else panel.querySelectorAll(`.${INJECTED_CLASS}`).forEach((n) => n.remove());
      }
    });
  };

  const observer = new MutationObserver(processPanels);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  processPanels();
  return { stop: () => observer.disconnect() };
}
