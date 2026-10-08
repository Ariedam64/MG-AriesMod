// Coin values on the inventory: a small badge on each card, and the total of
// what the filters show in the sort bar.

import { coin } from "../../data";
import { Atoms } from "../../game/store/atoms";
import { filterInventoryItems } from "./filters";
import { getInventoryItemValue } from "./itemInfo";

const VALUE_CONTAINER_SELECTOR = ".McFlex.css-1p00rng";
const VALUE_ELEMENT_CLASS = "tm-inventory-item-value";
const VALUE_TEXT_CLASS = `${VALUE_ELEMENT_CLASS}__text`;
const VALUE_DATASET_KEY = "tmInventoryValue";
const GAME_YELLOW = "var(--chakra-colors-Yellow-Magic, #F3D32B)";

const LOADING = "…";
const UNKNOWN = "-";

const COMPACT_UNITS: Array<{ threshold: number; suffix: string }> = [
  { threshold: 1e12, suffix: "T" },
  { threshold: 1e9, suffix: "B" },
  { threshold: 1e6, suffix: "M" },
  { threshold: 1e3, suffix: "K" },
];

const FULL_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });

/**
 * `1234567` -> `"1.2M"`: one decimal and a capital unit, unlike `formatPrice`.
 * It is the text players already know on the cards, so it stays as it is.
 */
export function formatCompactValue(value: number): string {
  const abs = Math.abs(value);
  for (const { threshold, suffix } of COMPACT_UNITS) {
    if (abs >= threshold) return `${(value / threshold).toFixed(1).replace(/\.0$/, "")}${suffix}`;
  }
  return FULL_FORMAT.format(value);
}

const formatFullValue = (value: number): string => FULL_FORMAT.format(value);

/** Puts the item's value under its card, or takes it off when hidden or unknown. */
export function updateCardValue(card: HTMLElement, value: number | null, show: boolean): void {
  const container = card.querySelector<HTMLElement>(VALUE_CONTAINER_SELECTOR);
  const current = container?.querySelector<HTMLElement>(`.${VALUE_ELEMENT_CLASS}`) ?? null;

  if (!container || !show || typeof value !== "number" || !Number.isFinite(value)) {
    if (container) current?.remove();
    delete card.dataset[VALUE_DATASET_KEY];
    return;
  }

  const target = current ?? Object.assign(document.createElement("div"), { className: VALUE_ELEMENT_CLASS });
  Object.assign(target.style, {
    fontSynthesis: "none",
    WebkitFontSmoothing: "antialiased",
    WebkitTextSizeAdjust: "100%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: "0.15rem",
    marginTop: "3px",
    fontFamily: 'var(--chakra-fonts-body, "GreyCliff CF", sans-serif)',
    fontWeight: "700",
    fontSize: "0.65rem",
    lineHeight: "1",
    textTransform: "none",
    color: GAME_YELLOW,
  });

  let text = target.querySelector<HTMLElement>(`.${VALUE_TEXT_CLASS}`);
  if (!text) {
    target.textContent = "";
    text = document.createElement("span");
    text.className = VALUE_TEXT_CLASS;
    Object.assign(text.style, { display: "inline-flex", alignItems: "center", color: "inherit" });
    target.appendChild(text);
  }
  text.textContent = formatCompactValue(value);
  target.title = formatFullValue(value);
  card.dataset[VALUE_DATASET_KEY] = String(value);

  if (target.parentElement !== container || target !== container.lastElementChild) container.appendChild(target);
}

const COIN_ICON_SRC = (() => {
  const src = (coin as { img64?: string } | undefined)?.img64 ?? "";
  if (typeof src !== "string" || !src) return "";
  return src.startsWith("data:") ? src : `data:image/png;base64,${src}`;
})();

/** The bar's total: a coin and a number, with the exact figure as its tooltip. */
export class ValueSummary {
  readonly el: HTMLSpanElement;
  private readonly text: HTMLSpanElement;
  private token: symbol | null = null;

  constructor() {
    this.el = document.createElement("span");
    Object.assign(this.el.style, {
      font: "inherit",
      color: GAME_YELLOW,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "flex-end",
      flex: "1 1 auto",
      whiteSpace: "nowrap",
      marginLeft: "auto",
      textAlign: "right",
      gap: "0.25rem",
    });
    if (COIN_ICON_SRC) {
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      Object.assign(icon.style, {
        width: "1.2rem",
        height: "1.2rem",
        flexShrink: "0",
        display: "inline-block",
        backgroundImage: `url("${COIN_ICON_SRC}")`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        pointerEvents: "none",
        userSelect: "none",
      });
      this.el.appendChild(icon);
    }
    this.text = document.createElement("span");
    Object.assign(this.text.style, { fontWeight: "700", color: "inherit" });
    this.el.appendChild(this.text);
    this.set(LOADING);
  }

  private set(text: string, title?: string): void {
    this.text.textContent = text;
    if (title) this.el.title = title;
    else this.el.removeAttribute("title");
  }

  /** Totals the values of the items these filters show. A newer call wins over a slower older one. */
  async update(filters: string[], searchQuery: string): Promise<void> {
    const token = Symbol("value-summary");
    this.token = token;
    this.set(LOADING);
    try {
      const inventory = await Atoms.inventory.myInventory.get();
      if (this.token !== token) return;
      if (!inventory || typeof inventory !== "object") return this.set(UNKNOWN);

      const items = Array.isArray((inventory as any).items) ? (inventory as any).items : [];
      const shown = filterInventoryItems(items, filters, searchQuery);
      if (!shown.length) return this.set("0", "0");

      const values = shown.map(getInventoryItemValue).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
      if (!values.length) return this.set(UNKNOWN);
      const total = values.reduce((sum, v) => sum + v, 0);
      this.set(formatCompactValue(total), formatFullValue(total));
    } catch (error) {
      console.warn("[InventorySorting] Could not total the filtered value", error);
      if (this.token === token) this.set(UNKNOWN);
    }
  }
}
