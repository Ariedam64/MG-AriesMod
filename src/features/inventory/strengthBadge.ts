// A pet card's "STR 72/85" line: rewritten from the computed strength, with a
// MAX badge tinted by the pet's colour mutation once it is fully grown, and
// shifted so it lines up against the favourite button.

import { clamp } from "../../lib/math";
import { getInventoryItemMutations } from "./itemInfo";
import { getPetStrengthInfo } from "./petStrength";

const STRENGTH_WRAPPER_SELECTOR = ".McFlex.css-15lpbqz";
const STRENGTH_TEXT_SELECTOR = ".chakra-text.css-wqvsdi";
const FAVORITE_BUTTON_SELECTOR = "button.chakra-button.css-1iytwn1";

const LABEL_CLASS = "tm-strength__label";
const CURRENT_CLASS = "tm-strength__current";
const MAX_CLASS = "tm-strength__max";
const BADGE_CLASS = "tm-strength__badge";
const IS_MAX_DATASET_KEY = "tmStrengthIsMax";
const BASE_TRANSFORM_DATASET_KEY = "tmStrengthBaseTransform";

/** The game's own yellow, as its price text uses it. */
const GAME_YELLOW = "var(--chakra-colors-Yellow-Magic, #F3D32B)";
const GAME_YELLOW_SOFT = "rgba(243, 211, 43, 0.25)";
const RAINBOW_TEXT = "linear-gradient(90deg, #ff6b6b 0%, #ffd86f 25%, #6bff8f 50%, #6bc7ff 75%, #b86bff 100%)";

type BadgeTone = "normal" | "gold" | "rainbow";

function badgeTone(item: any): BadgeTone {
  const mutations = new Set(getInventoryItemMutations(item).map((m) => m.toLowerCase()));
  if (mutations.has("rainbow")) return "rainbow";
  if (mutations.has("gold") || mutations.has("golden")) return "gold";
  return "normal";
}

function applyBadgeTone(badge: HTMLSpanElement, tone: BadgeTone): void {
  if (badge.dataset.tmStrengthTone === tone) return;
  badge.dataset.tmStrengthTone = tone;
  const style = badge.style;
  style.backgroundImage = "";
  style.backgroundColor = "";
  style.color = "";
  style.backgroundClip = "";
  style.webkitBackgroundClip = "";
  style.backgroundOrigin = "";
  style.webkitTextFillColor = "";
  style.fontWeight = "700";

  if (tone === "rainbow") {
    style.color = "transparent";
    style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.25)), ${RAINBOW_TEXT}`;
    style.backgroundClip = "padding-box, text";
    style.webkitBackgroundClip = "padding-box, text";
    style.backgroundOrigin = "padding-box, text";
    style.webkitTextFillColor = "transparent";
  } else if (tone === "gold") {
    style.color = GAME_YELLOW;
    style.backgroundColor = GAME_YELLOW_SOFT;
  } else {
    style.color = "#8fd3ff";
    style.backgroundColor = "rgba(79, 166, 255, 0.28)";
  }
}

function ensureBadge(textEl: HTMLElement, before: HTMLElement): HTMLSpanElement {
  let badge = textEl.querySelector<HTMLSpanElement>(`.${BADGE_CLASS}`);
  if (!badge) {
    badge = document.createElement("span");
    badge.className = BADGE_CLASS;
    badge.textContent = "MAX";
    Object.assign(badge.style, {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 3px",
      marginRight: "0",
      borderRadius: "3px",
      fontSize: "0.5rem",
      lineHeight: "1",
      fontWeight: "700",
      color: GAME_YELLOW,
      backgroundColor: GAME_YELLOW_SOFT,
    });
  }
  if (badge.parentElement !== textEl) textEl.insertBefore(badge, before);
  return badge;
}

/** "STR ", the current value and "/max" as three spans, so each can be styled alone. */
function ensureParts(textEl: HTMLElement): { label: HTMLSpanElement; current: HTMLSpanElement; max: HTMLSpanElement } {
  let label = textEl.querySelector<HTMLSpanElement>(`.${LABEL_CLASS}`);
  let current = textEl.querySelector<HTMLSpanElement>(`.${CURRENT_CLASS}`);
  let max = textEl.querySelector<HTMLSpanElement>(`.${MAX_CLASS}`);
  if (!label || !current || !max) {
    textEl.textContent = "";
    label = Object.assign(document.createElement("span"), { className: LABEL_CLASS });
    current = Object.assign(document.createElement("span"), { className: CURRENT_CLASS });
    max = Object.assign(document.createElement("span"), { className: MAX_CLASS });
    textEl.append(label, current, max);
  }
  return { label, current, max };
}

const parseFirstInteger = (text: string): number | null => {
  const match = text.match(/(\d+)/);
  const parsed = match ? Number(match[1]) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

const setText = (el: HTMLElement, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};

/** Rewrites the card's strength line for `item`, keeping the value the game printed. */
export function updateStrengthText(card: HTMLElement, item: any): void {
  const wrap = card.querySelector<HTMLElement>(STRENGTH_WRAPPER_SELECTOR);
  const textEl = wrap?.querySelector<HTMLElement>(STRENGTH_TEXT_SELECTOR);
  if (!wrap || !textEl) return;

  const info = getPetStrengthInfo(item);
  if (!info || !Number.isFinite(info.maxStrength) || info.maxStrength <= 0) return;

  const printed = parseFirstInteger(textEl.textContent ?? "");
  const currentStrength = printed ?? (Number.isFinite(info.strength) ? Math.round(info.strength) : null);
  if (currentStrength == null) return;

  const max = Math.round(info.maxStrength);
  if (!Number.isFinite(max) || max <= 0) return;
  const current = clamp(currentStrength, 0, max);
  const isMax = current >= max;

  const parts = ensureParts(textEl);
  setText(parts.label, "STR ");
  setText(parts.current, String(current));
  parts.current.style.setProperty("color", "#ffffff", "important");
  parts.current.style.setProperty("font-weight", "700", "important");

  if (isMax) {
    applyBadgeTone(ensureBadge(textEl, parts.label), badgeTone(item));
    setText(parts.max, "");
    parts.max.style.display = "none";
  } else {
    textEl.querySelector(`.${BADGE_CLASS}`)?.remove();
    setText(parts.max, `/${max}`);
    parts.max.style.display = "";
    parts.max.style.setProperty("font-weight", "700", "important");
  }
  parts.max.style.visibility = "";
  parts.max.style.setProperty("color", "#ffffff", "important");

  wrap.dataset[IS_MAX_DATASET_KEY] = isMax ? "1" : "0";
}

function ancestorContaining(start: HTMLElement, selector: string): HTMLElement | null {
  for (let current: HTMLElement | null = start; current; current = current.parentElement) {
    if (current.querySelector(selector)) return current;
  }
  return null;
}

/**
 * Shifts the strength line sideways: a MAX badge to the card row's left
 * edge, and "STR 72/85" so it ends just left of the favourite icon.
 */
export function alignStrengthText(card: HTMLElement): void {
  const wrap = card.querySelector<HTMLElement>(STRENGTH_WRAPPER_SELECTOR);
  if (!wrap) return;

  if (wrap.dataset[BASE_TRANSFORM_DATASET_KEY] == null) {
    wrap.dataset[BASE_TRANSFORM_DATASET_KEY] = wrap.style.transform ?? "";
  }
  const baseTransform = wrap.dataset[BASE_TRANSFORM_DATASET_KEY] ?? "";
  wrap.style.transform = baseTransform;

  const textEl = wrap.querySelector<HTMLElement>(STRENGTH_TEXT_SELECTOR);
  if (!textEl) return;

  const isMax = wrap.dataset[IS_MAX_DATASET_KEY];
  const shouldAlign = isMax === "0" || isMax === "1" || (isMax == null && !!textEl.textContent?.includes("/"));
  if (!shouldAlign) {
    if (wrap.style.pointerEvents) wrap.style.pointerEvents = "";
    return;
  }

  const row = ancestorContaining(wrap, FAVORITE_BUTTON_SELECTOR) ?? ancestorContaining(card, FAVORITE_BUTTON_SELECTOR);
  const favorite = row?.querySelector<HTMLElement>(FAVORITE_BUTTON_SELECTOR);
  if (!row || !favorite) return;
  const anchor = favorite.querySelector<HTMLElement>("svg") ?? favorite.querySelector<HTMLElement>(".chakra-icon") ?? favorite;

  const rowRect = row.getBoundingClientRect();
  if (!rowRect.width) return;

  const GAP_PX_MAX = 5;
  const GAP_PX_NON_MAX = 7;
  let deltaX: number | null = null;
  if (isMax === "1") {
    const badgeRect = textEl.querySelector<HTMLElement>(`.${BADGE_CLASS}`)?.getBoundingClientRect();
    if (badgeRect?.width) deltaX = rowRect.left + GAP_PX_MAX - badgeRect.left;
  }
  if (deltaX == null) {
    const anchorRect = anchor.getBoundingClientRect();
    const textRect = textEl.getBoundingClientRect();
    if (!anchorRect.width || !textRect.width) return;
    deltaX = anchorRect.left - textRect.right - GAP_PX_NON_MAX;
  }
  if (!Number.isFinite(deltaX)) return;

  const shift = `translateX(${Math.round(deltaX)}px)`;
  wrap.style.transform = baseTransform ? `${baseTransform} ${shift}` : shift;
  textEl.style.margin = "0";
  if (wrap.style.pointerEvents) wrap.style.pointerEvents = "";
}
