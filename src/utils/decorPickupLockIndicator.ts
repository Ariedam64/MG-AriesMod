import { decorCatalog } from "../data";
import { lockerRestrictionsService } from "../services/lockerRestrictions";

const CONTAINER_SELECTOR = ".css-502lyi";
const LOCK_CLASS = "tm-decor-lock";
const BORDER_COLOR = "rgb(188, 53, 215)";
const DATA_BORDER = "tmDecorLockBorder";
const DATA_RADIUS = "tmDecorLockRadius";
const DATA_POSITION = "tmDecorLockPosition";
const DATA_OVERFLOW = "tmDecorLockOverflow";

type Controller = { stop(): void };

const DECOR_LABELS = (() => {
  const labels = new Set<string>();
  try {
    Object.entries(decorCatalog as Record<string, any>).forEach(([decorId, entry]) => {
      if (decorId) labels.add(decorId.toLowerCase());
      const name = (entry as any)?.name;
      if (typeof name === "string" && name) {
        labels.add(name.toLowerCase());
      }
    });
  } catch {
    /* ignore */
  }
  return Array.from(labels).filter(Boolean);
})();

export function startDecorPickupLockIndicator(): Controller {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { stop() {} };
  }

  let running = true;
  const disposables: Array<() => void> = [];

  const isLocked = () => lockerRestrictionsService.isDecorPickupLocked();

  const applyLockState = () => {
    if (!running) return;
    const locked = isLocked();
    const containers = Array.from(document.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR));
    containers.forEach((el) => {
      if (!looksLikeDecorItem(el)) {
        restore(el);
        return;
      }
      setLocked(el, locked);
    });
  };

  const observeDom = () => {
    const mo = new MutationObserver(() => applyLockState());
    mo.observe(document.documentElement, { childList: true, subtree: true });
    disposables.push(() => mo.disconnect());
  };

  const subscribeLocker = () => {
    const unsub = lockerRestrictionsService.subscribe(() => applyLockState());
    disposables.push(unsub);
  };

  observeDom();
  subscribeLocker();
  applyLockState();

  return {
    stop() {
      running = false;
      disposables.splice(0).forEach((fn) => {
        try {
          fn();
        } catch {}
      });
      const containers = Array.from(document.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR));
      containers.forEach(restore);
    },
  };
}

function looksLikeDecorItem(el: HTMLElement): boolean {
  const text = (el.textContent || "").toLowerCase();
  if (!text) return false;
  if (!el.querySelector("canvas")) return false;
  return DECOR_LABELS.some((label) => label && text.includes(label));
}

function setLocked(el: HTMLElement, locked: boolean) {
  if (!locked) {
    restore(el);
    return;
  }

  storeStyle(el, DATA_BORDER, "border");
  storeStyle(el, DATA_RADIUS, "borderRadius");
  storeStyle(el, DATA_POSITION, "position");
  storeStyle(el, DATA_OVERFLOW, "overflow");

  el.style.border = `3px solid ${BORDER_COLOR}`;
  el.style.borderRadius = "16px";
  el.style.overflow = "visible";
  const pos = window.getComputedStyle(el).position;
  if (pos === "static") {
    el.style.position = "relative";
  }
  ensureLockIcon(el);
}

function restore(el: HTMLElement) {
  restoreStyle(el, DATA_BORDER, "border");
  restoreStyle(el, DATA_RADIUS, "borderRadius");
  restoreStyle(el, DATA_POSITION, "position");
  restoreStyle(el, DATA_OVERFLOW, "overflow");
  removeLockIcon(el);
}

function storeStyle(el: HTMLElement, key: string, cssProperty: keyof CSSStyleDeclaration) {
  const data = el.dataset as Record<string, string | undefined>;
  if (data[key] !== undefined) return;
  data[key] = el.style[cssProperty] as string;
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

function ensureLockIcon(el: HTMLElement) {
  const existing = el.querySelector<HTMLElement>(`span.${LOCK_CLASS}`);
  if (existing) return;
  const icon = document.createElement("span");
  icon.className = LOCK_CLASS;
  icon.textContent = "🔒";
  icon.style.position = "absolute";
  icon.style.top = "-8px";
  icon.style.right = "-8px";
  icon.style.fontSize = "16px";
  icon.style.pointerEvents = "none";
  icon.style.userSelect = "none";
  icon.style.zIndex = "2";
  el.appendChild(icon);
}

function removeLockIcon(el: HTMLElement) {
  el.querySelectorAll(`span.${LOCK_CLASS}`).forEach((node) => node.remove());
}
