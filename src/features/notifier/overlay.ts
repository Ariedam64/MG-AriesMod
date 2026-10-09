import { h } from "../../ui/kit/dom";
import { setMenuBadge } from "../../ui/kit/menuBadges";
import { audio } from "./audio/audio";
import { startPixiBell } from "./bell/pixiBell";
import { BELL_MODE_EVENT, BELL_WIDGET_Z_INDEX, isFloatingBellEnabled, startFloatingBell } from "./bell/floatingBell";
import type { BellController } from "./bell/ring";
import { BuyPanel } from "./buyPanel";
import { NotifierService } from "./notifier";
import { ShopAlerts, type AvailableItem } from "./shopAlerts";

/**
 * The notification bell with its count badge and its buy panel. The bell
 * sits in the game's icon rail, or floats when the player prefers; the badge
 * and the panel are DOM, glued to wherever the bell is.
 */

// The Pixi bell can move after the fact (window resize, rail re-layout,
// late-loading rail icons), so the badge and panel are re-glued to it on
// this cadence as well as on `resize`.
const REPOSITION_INTERVAL_MS = 1000;

/** Above the game canvas. In floating mode the slot goes above the widget instead. */
const SLOT_Z_INDEX = 9999;

class Overlay {
  /** A fixed stacking context holding the badge and the panel. */
  private readonly slot = h("div");
  private readonly badge = h("span");
  private readonly panel: BuyPanel;
  private bell: BellController | null = null;
  private items: AvailableItem[] = [];
  private audioPrimed = false;

  constructor(alerts: ShopAlerts) {
    this.panel = new BuyPanel(alerts);
    this.styleSlot();
    this.styleBadge();
    this.slot.id = "qws-notifier-slot";
    this.slot.append(this.badge, this.panel.el);
    document.body.appendChild(this.slot);

    this.startBell();
    // The bell mode is a setting (Alerts > Settings): swap bells without a reload.
    window.addEventListener(BELL_MODE_EVENT, () => this.startBell());
    window.addEventListener("pointerdown", (e) => this.closeOnOutsideClick(e));
    window.addEventListener("resize", () => this.reposition());
    // Follows the bell as the game moves it, while there is something to place.
    window.setInterval(() => {
      if (this.items.length || this.panel.isOpen) this.reposition();
    }, REPOSITION_INTERVAL_MS);

    alerts.onChange((items) => this.show(items));
  }

  private show(items: AvailableItem[]): void {
    this.items = items;
    setMenuBadge("alerts", items.length);
    this.badge.textContent = items.length ? String(items.length) : "";
    this.badge.style.display = items.length ? "inline-flex" : "none";
    this.placeBadge();
    if (this.panel.isOpen) this.panel.render(items);
    this.updateWiggle();
  }

  /** (Re)creates the bell in the current mode, stopping the other one first. */
  private startBell(): void {
    this.bell?.stop();
    const onClick = () => void this.toggleBell();
    const floating = isFloatingBellEnabled();
    this.bell = floating
      ? startFloatingBell({ onClick, onMoved: () => this.reposition() })
      : startPixiBell({ onClick });
    // The floating widget would hide the badge: lift the slot just above it.
    this.slot.style.zIndex = String(floating ? BELL_WIDGET_Z_INDEX + 1 : SLOT_Z_INDEX);
    this.reposition();
    this.updateWiggle();
  }

  private async toggleBell(): Promise<void> {
    // Browsers only allow sound after a user gesture: the first click on the
    // bell unlocks it.
    if (!this.audioPrimed) {
      this.audioPrimed = true;
      try {
        await audio.prime();
      } catch {}
    }
    const open = !this.panel.isOpen;
    this.panel.setOpen(open);
    if (open) {
      this.placePanel();
      this.panel.render(this.items);
      this.placeBadge();
    }
    this.updateWiggle();
  }

  private closeOnOutsideClick(e: PointerEvent): void {
    if (!this.panel.isOpen) return;
    if (this.slot.contains(e.target as Node) || this.isOnBell(e.clientX, e.clientY)) return;
    this.panel.setOpen(false);
  }

  private isOnBell(x: number, y: number): boolean {
    const rect = this.bell?.getScreenRect();
    return !!rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  private reposition(): void {
    this.placeBadge();
    if (this.panel.isOpen) this.placePanel();
  }

  private placeBadge(): void {
    const rect = this.bell?.getScreenRect();
    if (!rect) return;
    this.badge.style.top = `${rect.top - 4}px`;
    this.badge.style.right = `${window.innerWidth - rect.right - 4}px`;
  }

  private placePanel(): void {
    const rect = this.bell?.getScreenRect();
    if (!rect) return;
    this.panel.el.style.top = `${rect.bottom + 8}px`;
    this.panel.el.style.right = `${window.innerWidth - rect.right}px`;
  }

  /** The bell rings while items wait and the panel is closed. */
  private updateWiggle(): void {
    this.bell?.setWiggle(this.items.length > 0 && !this.panel.isOpen);
  }

  private styleSlot(): void {
    Object.assign(this.slot.style, {
      position: "fixed",
      top: "0",
      right: "0",
      pointerEvents: "none",
      zIndex: String(SLOT_Z_INDEX),
      fontFamily: "var(--chakra-fonts-body, GreyCliff CF), system-ui, sans-serif",
      color: "var(--chakra-colors-chakra-body-text, #e7eef7)",
      userSelect: "none",
    });
    this.slot.style.setProperty("-webkit-font-smoothing", "antialiased");
    this.slot.style.setProperty("-webkit-text-size-adjust", "100%");
    this.slot.style.setProperty("text-rendering", "optimizeLegibility");
  }

  /** The game's own red notification bubble. */
  private styleBadge(): void {
    Object.assign(this.badge.style, {
      position: "fixed",
      minWidth: "18px",
      height: "18px",
      padding: "0 6px",
      borderRadius: "999px",
      background: "var(--chakra-colors-Red-Magic, #D02128)",
      color: "var(--chakra-colors-Neutral-TrueWhite, #fff)",
      fontSize: "12px",
      fontWeight: "700",
      display: "none",
      alignItems: "center",
      justifyContent: "center",
      border: "1px solid rgba(0,0,0,.35)",
      lineHeight: "18px",
      pointerEvents: "none",
      zIndex: "10000",
    });
  }
}

/** Mounts the bell for the rest of the session and wires it to the alerts. */
export async function renderOverlay(): Promise<void> {
  const alerts = new ShopAlerts();
  new Overlay(alerts);
  await NotifierService.onPurchasesChangeNow((p) => alerts.setPurchases(p));
  await NotifierService.onShopsChangeNow((s) => alerts.setShops(s));
  await NotifierService.onChangeNow(() => alerts.refresh());
  await NotifierService.onRulesChangeNow((rules) => alerts.setRules(rules));
}
