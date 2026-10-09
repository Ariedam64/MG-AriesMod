import { addStyle } from "../../lib/dom";
import { decorCatalogName, eggCatalogName, seedCatalogName, toolCatalogName } from "../../data/names";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { ShopsService } from "../shops/shops";
import { shopItemIcon } from "./itemIcon";
import { findStockItem, type AvailableItem, type ShopAlerts } from "./shopAlerts";

/** The dropdown under the bell: every followed item in stock, with Buy and Buy all. */

const STYLE_ID = "qws-buy-style";

const CSS = `
.qws-buy {
  position: fixed; z-index: var(--chakra-zIndices-DialogModal, 7010); pointer-events: auto;
  width: min(340px, 80vw); max-height: 50vh; overflow: auto; box-sizing: border-box; padding: 10px;
  /* Keeps the scroll, and touch gestures, from reaching the game. */
  overscroll-behavior: contain; touch-action: pan-y;
  border: 3px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-lg);
  background: var(--qmm-paper); color: var(--qmm-text); box-shadow: var(--qmm-shadow-raise);
  font-family: var(--qmm-font); font-size: var(--qmm-fs-md);
  scrollbar-width: thin; scrollbar-color: var(--qmm-scrollbar) transparent;
}
.qws-buy__title { padding: 2px 4px 8px; font-size: var(--qmm-fs-lg); font-weight: 900; }
.qws-buy__list { display: flex; flex-direction: column; gap: 2px; }
.qws-buy__row {
  display: grid; grid-template-columns: 28px minmax(0, 1fr) auto auto auto; align-items: center;
  gap: var(--qmm-space-md); padding: 6px; border-radius: var(--qmm-radius-md);
}
.qws-buy__row:hover { background: var(--qmm-paper-deep); }
.qws-buy__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 800; }
.qws-buy__qty { font-weight: 800; font-variant-numeric: tabular-nums; color: var(--qmm-text-soft); }
.qws-buy__empty { padding: 12px 4px; text-align: center; color: var(--qmm-text-dim); }
`;

function ensureBuyStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  addStyle(CSS).id = STYLE_ID;
}

/** The display name of an alert item (`Seed:Carrot`). */
function itemName(id: string): string {
  const [type, raw] = id.split(":");
  switch (type) {
    case "Seed":
      return seedCatalogName(raw) ?? raw;
    case "Egg":
      return eggCatalogName(raw) ?? raw;
    case "Tool":
      return toolCatalogName(raw) ?? raw;
    case "Decor":
      return decorCatalogName(raw) ?? raw;
    default:
      return raw;
  }
}

/** Runs a purchase with the button showing "Buying..." and locked meanwhile. */
async function withBusyButton(btn: HTMLButtonElement, label: string, purchase: () => Promise<void>): Promise<void> {
  btn.disabled = true;
  const labelEl = btn.querySelector(".label");
  if (labelEl) labelEl.textContent = "Buying...";
  try {
    await purchase();
  } catch {
  } finally {
    if (labelEl) labelEl.textContent = label;
    btn.disabled = false;
  }
}

export class BuyPanel {
  readonly el: HTMLDivElement;
  private lastSig: string | null = null;

  constructor(private readonly alerts: ShopAlerts) {
    ensureBuyStyles();
    this.el = h("div", "qws-buy");
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-label", "Followed items in stock");
    this.el.style.display = "none";
    this.stopScrollReachingGame();
  }

  get isOpen(): boolean {
    return this.el.style.display === "block";
  }

  setOpen(open: boolean): void {
    this.el.style.display = open ? "block" : "none";
  }

  /** Redraws the list, unless the items and quantities are unchanged. */
  render(items: AvailableItem[]): void {
    const sig = JSON.stringify(items.map((r) => [r.id, r.qty]));
    if (sig === this.lastSig) return;
    this.lastSig = sig;

    const head = h("div", "qws-buy__title", "In stock now");
    if (!items.length) {
      this.el.replaceChildren(head, h("div", "qws-buy__empty", "None of your followed items is in stock."));
      return;
    }
    const list = h("div", "qws-buy__list");
    list.append(...items.map((item) => this.renderRow(item)));
    this.el.replaceChildren(head, list);
  }

  private renderRow({ id, qty }: AvailableItem): HTMLDivElement {
    const row = h("div", "qws-buy__row");
    const title = h("div", "qws-buy__name", itemName(id));
    title.title = itemName(id);
    const count = h("div", "qws-buy__qty", `×${qty}`);

    const buyBtn = button("Buy", { size: "xs", variant: "primary" });
    const buyAllBtn = button("Buy all", { size: "xs" });
    buyBtn.onclick = (e) => {
      e.stopPropagation();
      void this.buy(id, buyBtn, "Buy", (stock) => ShopsService.buyOne(stock.kind, stock.item));
    };
    buyAllBtn.onclick = (e) => {
      e.stopPropagation();
      // Read at click time: the quantity may have dropped since the row was drawn.
      const available = this.alerts.items().find((r) => r.id === id)?.qty ?? 0;
      if (available <= 0) {
        buyAllBtn.disabled = true;
        return;
      }
      void this.buy(id, buyAllBtn, "Buy all", (stock) => ShopsService.buyEach(stock.kind, stock.item, available));
    };

    if (!findStockItem(this.alerts.shopsSnapshot(), id)) {
      for (const btn of [buyBtn, buyAllBtn]) {
        btn.setEnabled(false);
        btn.title = "Unavailable";
      }
    }

    row.append(shopItemIcon(id, itemName(id), 28, "alerts-overlay"), title, count, buyBtn, buyAllBtn);
    return row;
  }

  private async buy(
    id: string,
    btn: HTMLButtonElement,
    label: string,
    purchase: (stock: NonNullable<ReturnType<typeof findStockItem>>) => Promise<void>,
  ): Promise<void> {
    const stock = findStockItem(this.alerts.shopsSnapshot(), id);
    if (!stock) {
      btn.disabled = true;
      return;
    }
    await withBusyButton(btn, label, () => purchase(stock));
  }

  /** Lets the panel scroll without the wheel or touch reaching the game's canvas. */
  private stopScrollReachingGame(): void {
    const stop = (e: Event) => e.stopPropagation();
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    for (const type of ["wheel", "mousewheel", "DOMMouseScroll", "touchmove"]) {
      this.el.addEventListener(type, stop, opts);
    }
  }
}
