import { decorCatalogName, eggCatalogName, seedCatalogName, toolCatalogName } from "../../data/names";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { ShopsService } from "../shops/shops";
import { shopItemIcon } from "./itemIcon";
import { findStockItem, type AvailableItem, type ShopAlerts } from "./shopAlerts";

/** The dropdown under the bell: every followed item in stock, with Buy and Buy all. */

const ROW_BORDER = "1px solid var(--qmm-border)";

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
    this.el = h("div");
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-label", "Tracked items available");
    Object.assign(this.el.style, {
      position: "fixed",
      width: "min(340px, 80vw)",
      maxHeight: "50vh",
      overflow: "auto",
      // Keeps the scroll, and touch gestures, from reaching the game.
      overscrollBehavior: "contain",
      touchAction: "pan-y",
      borderRadius: "var(--chakra-radii-card, 12px)",
      border: "1px solid var(--qmm-border-strong)",
      background: "var(--qmm-panel-bg)",
      backdropFilter: "blur(8px)",
      color: "var(--qmm-text)",
      boxShadow: "var(--qmm-shadow-window)",
      padding: "8px",
      display: "none",
      zIndex: "var(--chakra-zIndices-DialogModal, 7010)",
      pointerEvents: "auto",
    });
    this.el.style.setProperty("-webkit-backdrop-filter", "blur(8px)");
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

    const head = h("div", undefined, "Tracked items available");
    Object.assign(head.style, {
      fontWeight: "700",
      opacity: "0.9",
      padding: "4px 2px",
      borderBottom: ROW_BORDER,
      marginBottom: "4px",
    });
    this.el.replaceChildren(head);

    if (!items.length) {
      const empty = h("div", undefined, "No tracked items are available.");
      Object.assign(empty.style, { opacity: "0.75", padding: "8px 2px" });
      this.el.appendChild(empty);
      return;
    }
    for (const item of items) this.el.appendChild(this.renderRow(item));
  }

  private renderRow({ id, qty }: AvailableItem): HTMLDivElement {
    const row = h("div");
    Object.assign(row.style, {
      display: "grid",
      gridTemplateColumns: "24px 1fr max-content max-content max-content",
      alignItems: "center",
      gap: "8px",
      padding: "6px 4px",
      borderBottom: ROW_BORDER,
    });

    const title = h("div", undefined, itemName(id));
    Object.assign(title.style, {
      fontWeight: "600",
      fontSize: "12px",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });

    const count = h("div", undefined, `×${qty}`);
    Object.assign(count.style, {
      fontVariantNumeric: "tabular-nums",
      opacity: "0.9",
      color: "var(--qmm-text-soft)",
      textAlign: "right",
    });

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

    row.append(shopItemIcon(id, itemName(id), 24, "alerts-overlay"), title, count, buyBtn, buyAllBtn);
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
