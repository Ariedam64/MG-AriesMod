import { Atoms } from "../store/atoms";
import {
  friendBonusPercentFromMultiplier,
  friendBonusPercentFromPlayers,
  lockerRestrictionsService,
} from "../services/lockerRestrictions";

const CONTAINER_SELECTOR = ".css-vmnhaw";
const LOCK_ICON_CLASS = "tm-sell-crops-lock";

const DATA_BORDER = "tmSellLockBorder";
const DATA_RADIUS = "tmSellLockRadius";
const DATA_POSITION = "tmSellLockPosition";
const DATA_PADDING = "tmSellLockPadding";
const DATA_BOX = "tmSellLockBox";
const DATA_SHADOW = "tmSellLockShadow";
const DATA_OVERFLOW = "tmSellLockOverflow";

type Controller = { stop(): void };

export function startSellCropsLockWatcher(): Controller {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { stop() {} };
  }

  let bonusFromMultiplier: number | null = null;
  let bonusFromPlayers: number | null = friendBonusPercentFromPlayers(1);
  let running = true;
  const disposables: Array<() => void> = [];

  const resolveCurrentBonus = () => bonusFromMultiplier ?? bonusFromPlayers ?? 0;

  const applyLockState = (locked: boolean) => {
    const containers = Array.from(
      document.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR),
    );

    containers.forEach((wrap) => setContainerLocked(wrap, locked));
  };

  const recompute = () => {
    if (!running) return;
    const requiredPct = lockerRestrictionsService.getRequiredPercent();
    const current = resolveCurrentBonus();
    const locked =
      requiredPct > 0 && !(Number.isFinite(current) && current + 0.0001 >= requiredPct);
    applyLockState(locked);
  };

  const observeDom = () => {
    const mo = new MutationObserver(() => recompute());
    mo.observe(document.documentElement, { childList: true, subtree: true });
    disposables.push(() => mo.disconnect());
  };

  const subscribeAtoms = async () => {
    try {
      const initial = await Atoms.server.friendBonusMultiplier.get();
      bonusFromMultiplier = friendBonusPercentFromMultiplier(initial);
    } catch {}
    try {
      const unsub = await Atoms.server.friendBonusMultiplier.onChange((next) => {
        bonusFromMultiplier = friendBonusPercentFromMultiplier(next);
        recompute();
      });
      if (typeof unsub === "function") disposables.push(unsub);
    } catch {}

    try {
      const initialPlayers = await Atoms.server.numPlayers.get();
      bonusFromPlayers = friendBonusPercentFromPlayers(initialPlayers);
    } catch {}
    try {
      const unsubPlayers = await Atoms.server.numPlayers.onChange((next) => {
        bonusFromPlayers = friendBonusPercentFromPlayers(next);
        recompute();
      });
      if (typeof unsubPlayers === "function") disposables.push(unsubPlayers);
    } catch {}
  };

  observeDom();
  disposables.push(lockerRestrictionsService.subscribe(() => recompute()));
  void subscribeAtoms();
  recompute();

  return {
    stop() {
      running = false;
      disposables.splice(0).forEach((fn) => {
        try {
          fn();
        } catch {}
      });
      applyLockState(false);
    },
  };
}

function setContainerLocked(container: HTMLElement, locked: boolean) {
  if (!container) return;

  const sellButton = findSellButton(container);
  if (!sellButton) {
    restoreContainerStyles(container);
    removeLockIcon(container);
    return;
  }

  if (!locked) {
    restoreContainerStyles(container);
    removeLockIcon(container);
    return;
  }

  storeOriginalStyle(container, DATA_BORDER, "border");
  storeOriginalStyle(container, DATA_RADIUS, "borderRadius");
  storeOriginalStyle(container, DATA_POSITION, "position");
  storeOriginalStyle(container, DATA_PADDING, "padding");
  storeOriginalStyle(container, DATA_BOX, "boxSizing");
  storeOriginalStyle(container, DATA_SHADOW, "boxShadow");
  storeOriginalStyle(container, DATA_OVERFLOW, "overflow");

  container.style.border = "none";
  container.style.borderRadius = "";
  container.style.padding = "";
  container.style.boxSizing = "";
  container.style.boxShadow = "none";
  container.style.overflow = "";
  const computedPos = window.getComputedStyle(container).position;
  if (computedPos === "static") {
    container.style.position = "relative";
  }
  container.style.zIndex = "1000";

  ensureLockIcon(container);
}

function storeOriginalStyle(el: HTMLElement, key: string, cssProperty: keyof CSSStyleDeclaration) {
  const data = el.dataset as Record<string, string | undefined>;
  if (data[key] !== undefined) return;
  data[key] = el.style[cssProperty] as string;
}

function restoreContainerStyles(el: HTMLElement) {
  restoreStyle(el, DATA_BORDER, "border");
  restoreStyle(el, DATA_RADIUS, "borderRadius");
  restoreStyle(el, DATA_POSITION, "position");
  restoreStyle(el, DATA_PADDING, "padding");
  restoreStyle(el, DATA_BOX, "boxSizing");
  restoreStyle(el, DATA_SHADOW, "boxShadow");
  restoreStyle(el, DATA_OVERFLOW, "overflow");
}

function restoreStyle(el: HTMLElement, key: string, cssProperty: keyof CSSStyleDeclaration) {
  const data = el.dataset as Record<string, string | undefined>;
  if (data[key] === undefined) return;
  const value = data[key];
  if (value) {
    el.style.setProperty(camelToKebab(cssProperty as string), value);
  } else {
    el.style.removeProperty(camelToKebab(cssProperty as string));
  }
  delete data[key];
}

function camelToKebab(str: string): string {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}

function ensureLockIcon(btn: HTMLElement) {
  const existing = btn.querySelector<HTMLElement>(`span.${LOCK_ICON_CLASS}`);
  if (existing) return;
  const icon = document.createElement("span");
  icon.className = LOCK_ICON_CLASS;
  icon.textContent = "🔒";
  icon.style.position = "absolute";
  icon.style.top = "-4px";
  icon.style.right = "-4px";
  icon.style.fontSize = "16px";
  icon.style.pointerEvents = "none";
  icon.style.userSelect = "none";
  icon.style.zIndex = "2";
  btn.appendChild(icon);
}

function removeLockIcon(btn: HTMLElement) {
  btn.querySelectorAll(`span.${LOCK_ICON_CLASS}`).forEach((node) => node.remove());
}

function findSellButton(container: HTMLElement): HTMLButtonElement | null {
  const btn = container.querySelector<HTMLButtonElement>("button");
  if (!btn) return null;
  const text = (btn.textContent || "").trim();
  return /sell\s*crops/i.test(text) ? btn : null;
}
