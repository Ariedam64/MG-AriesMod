// src/ui/notificationOverlay.ts
import { NotifierService, type NotifierRule } from "../../services/notifier";
import { ShopsService, type Kind as ShopKind } from "../../services/shops";
import { audio, type PlaybackMode, type TriggerOverrides } from "../../utils/audio"; // ← utilise le singleton unifié
import {
  eggNameFromId,          // NEW
  toolNameFromId,         // NEW
  decorNameFromId,
  seedNameFromSpecies
} from "../../utils/catalogIndex";
import { attachSpriteIcon } from "../spriteIconCache";
import { startNotificationBellPixi, type NotificationBellPixiController } from "../../utils/notificationBellPixi";
import {
  BELL_MODE_EVENT,
  BELL_WIDGET_Z_INDEX,
  isFloatingBellEnabled,
  startNotificationBellFloating,
  type NotificationBellFloatingController,
} from "../../utils/notificationBellFloating";

/* ========= Types min ========= */
type SeedItem  = { itemType: "Seed";  species: string; initialStock: number };
type ToolItem  = { itemType: "Tool";  toolId: string;  initialStock: number };
type EggItem   = { itemType: "Egg";   eggId:  string;  initialStock: number };
type DecorItem = { itemType: "Decor"; decorId:string;  initialStock: number };

type Section<T> = { inventory: T[]; secondsUntilRestock: number };

export type ShopsSnapshot = {
  seed:  Section<SeedItem>;
  tool:  Section<ToolItem>;
  egg:   Section<EggItem>;
  decor: Section<DecorItem>;
};

export type PurchasesSnapshot = {
  seed:  { createdAt: number; purchases: Record<string, number> };
  egg:   { createdAt: number; purchases: Record<string, number> };
  tool:  { createdAt: number; purchases: Record<string, number> };
  decor: { createdAt: number; purchases: Record<string, number> };
};

/* ========= Utils ========= */
// The Pixi bell can move after the fact (window resize, rail re-layout,
// late-loading rail icons) — the DOM badge/panel are re-glued to it on this
// cadence in addition to the immediate `resize` listener.
const OVERLAY_REPOSITION_INTERVAL_MS = 1000;

const style = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);
const setProps = (el: HTMLElement, props: Record<string, string>) => {
  for (const [k, v] of Object.entries(props)) el.style.setProperty(k, v);
};

function iconOf(id: string, size = 24): HTMLElement {
  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: `0 0 ${size}px`,
  });

  const [rawType] = id.split(":") as [string | undefined, string | undefined];
  const fallback =
    rawType === "Seed" ? "seed" :
    rawType === "Egg"  ? "egg" :
    rawType === "Tool" ? "tool" :
    rawType === "Decor" ? "decor" : "item";

  const span = document.createElement("span");
  span.textContent = fallback;
  span.style.fontSize = `${Math.max(10, size - 2)}px`;
  span.setAttribute("aria-hidden", "true");
  wrap.appendChild(span);

  const categories =
    rawType === "Seed" ? ["seed"] :
    rawType === "Egg"  ? ["pet"] :
    rawType === "Tool" ? ["item"] :
    rawType === "Decor" ? ["decor"] : null;
  if (categories) {
    const label = labelOf(id);
    const candidatesSet = new Set<string>();
    const addCandidate = (value?: string | null) => {
      if (!value) return;
      const trimmed = value.trim();
      if (!trimmed) return;
      candidatesSet.add(trimmed);
      candidatesSet.add(trimmed.replace(/\s+/g, ""));
      const last = trimmed.split(/[./]/).pop();
      if (last && last !== trimmed) {
        candidatesSet.add(last);
        candidatesSet.add(last.replace(/\s+/g, ""));
      }
    };
    addCandidate(id.split(":")[1]);
    addCandidate(label);
    if (rawType) addCandidate(rawType);
    const originals = Array.from(candidatesSet);
    const iconized = originals
      .map(value => value.replace(/icon$/i, ""))
      .filter(Boolean)
      .map(value => `${value}Icon`);
    const candidates = Array.from(new Set([...originals, ...iconized])).filter(Boolean);
    if (candidates.length) {
      attachSpriteIcon(wrap, categories, candidates, size, "alerts-overlay");
    }
  }

  return wrap;
}


function labelOf(id: string): string {
  const [type, raw] = id.split(":") as ["Seed"|"Egg"|"Tool"|"Decor", string];
  switch (type) {
    case "Seed":  return seedNameFromSpecies(raw) ?? raw;
    case "Egg":   return eggNameFromId(raw) ?? raw;
    case "Tool":  return toolNameFromId(raw) ?? raw;
    case "Decor": return decorNameFromId(raw) ?? raw;
    default:      return raw;
  }
}

/* ========= Helpers achat ========= */
function purchasedCountForId(
  id: string,
  purchases: PurchasesSnapshot | null | undefined
): number {
  if (!purchases) return 0;
  const [type, raw] = String(id).split(":") as ["Seed"|"Egg"|"Tool"|"Decor", string];

  const sec =
    type === "Seed" ? purchases.seed :
    type === "Egg"  ? purchases.egg  :
    type === "Tool" ? purchases.tool : purchases.decor;

  if (!sec || !sec.purchases) return 0;
  const n = sec.purchases[raw];
  return typeof n === "number" && n > 0 ? n : 0;
}

/* ========= Overlay (affichage + subs) ========= */
class OverlayBarebone {
  private slot:  HTMLDivElement    = document.createElement("div");
  private badge: HTMLSpanElement   = document.createElement("span");
  private panel: HTMLDivElement    = document.createElement("div");
  private bell: NotificationBellPixiController | NotificationBellFloatingController | null = null;
  private repositionIntervalId: number | null = null;
  private onWindowResize: (() => void) | null = null;
  private onBellModeChanged: (() => void) | null = null;
  // Prime audio au premier clic utilisateur (une seule fois, tous modes)
  private audioPrimedOnce = false;

  private lastShops: ShopsSnapshot | null = null;
  private lastPurch: PurchasesSnapshot | null = null;

  // Suivi des IDs visibles dans l'overlay (pour loops & diff)
  private prevOverlayIds = new Set<string>();
  private currentOverlayIds = new Set<string>();
  private rulesById = new Map<string, NotifierRule>();

  private shopUpdates = 0;
  private purchasesUpdates = 0;
  private bootArmed = false;
  private justRestocked = false;

  // Items à afficher dans l'overlay (déjà filtrés)
  private rows: Array<{ id: string; qty: number }> = [];
  private lastPanelSig: string | null = null;

  constructor() {
    this.slot = this.createSlot();
    this.slot.id = "qws-notifier-slot";
    (globalThis as any).__qws_notifier_slot = this.slot;
    this.badge = this.createBadge();
    this.panel = this.createPanel();
    this.installScrollGuards(this.panel);

    this.startBell();

    // Recréer la cloche dans l'autre mode quand le setting change (Alerts >
    // Settings), sans reload.
    this.onBellModeChanged = () => this.startBell();
    window.addEventListener(BELL_MODE_EVENT, this.onBellModeChanged);

    this.slot.append(this.badge, this.panel);
    document.body.appendChild(this.slot);

    // Fermer en cliquant dehors
    window.addEventListener("pointerdown", (e) => {
      if (this.panel.style.display !== "block") return;
      const t = e.target as Node;
      if (!this.slot.contains(t) && !this.isClickOnBellButton(e.clientX, e.clientY)) {
        this.panel.style.display = "none";
      }
    });

    // Recoller badge/panneau à la cloche quand elle bouge
    this.onWindowResize = () => this.repositionOverlay();
    window.addEventListener("resize", this.onWindowResize);
    this.repositionIntervalId = window.setInterval(
      () => this.repositionOverlay(),
      OVERLAY_REPOSITION_INTERVAL_MS,
    );

    // Brancher le "purchase checker" pour le mode "Until purchase"
    audio.setPurchaseChecker((itemId) => {
      if (!itemId) return false;
      if (this.currentOverlayIds.has(itemId)) return false;
      return purchasedCountForId(itemId, this.lastPurch) > 0;
    });
  }

  // Un seul handler de clic partagé par les deux implémentations de cloche
  // (Pixi dans le rail du jeu, ou widget DOM flottant).
  private handleBellClick = async (): Promise<void> => {
    if (!this.audioPrimedOnce) {
      this.audioPrimedOnce = true;
      try { await audio.prime(); } catch {}
    }
    const on = this.panel.style.display !== "block";
    this.panel.style.display = on ? "block" : "none";
    if (on) {
      this.updatePanelPosition();
      this.renderPanel();
      this.updateBadgePosition();
    }
    this.updateBellWiggle();
  };

  // (Re)crée la cloche dans le mode courant. Appelé au boot et à chaque
  // toggle du setting "floating bell" — l'ancienne implémentation est
  // arrêtée proprement avant d'instancier l'autre.
  private startBell(): void {
    if (this.bell) {
      try { this.bell.stop(); } catch {}
      this.bell = null;
    }
    const onClick = () => { void this.handleBellClick(); };
    const floating = isFloatingBellEnabled();
    this.bell = floating
      ? startNotificationBellFloating({ onClick, onMoved: () => this.repositionOverlay() })
      : startNotificationBellPixi({ onClick });
    // `slot` is a fixed-position stacking context holding the badge and the
    // panel. Its default z-index sits above the game canvas but *below* the
    // floating widget, which hid the badge behind the bell button — in
    // floating mode, lift the whole slot just above the widget so the badge
    // bubble renders on top of it.
    this.slot.style.zIndex = floating ? String(BELL_WIDGET_Z_INDEX + 1) : "9999";
    this.repositionOverlay();
    this.updateBellWiggle();
  }

  private isClickOnBellButton(clientX: number, clientY: number): boolean {
    const rect = this.bell?.getScreenRect();
    if (!rect) return false;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  destroy() {
    if (this.repositionIntervalId != null) {
      window.clearInterval(this.repositionIntervalId);
      this.repositionIntervalId = null;
    }
    if (this.onWindowResize) {
      window.removeEventListener("resize", this.onWindowResize);
      this.onWindowResize = null;
    }
    if (this.onBellModeChanged) {
      window.removeEventListener(BELL_MODE_EVENT, this.onBellModeChanged);
      this.onBellModeChanged = null;
    }

    if (this.bell) {
      try { this.bell.stop(); } catch {}
      this.bell = null;
    }

    try { this.slot.remove(); } catch {}
    try {
      if ((globalThis as any).__qws_notifier_slot === this.slot) {
        delete (globalThis as any).__qws_notifier_slot;
      }
    } catch {}
    // Stop toutes les boucles audio liées à l'overlay
    try { audio.stopAllLoops(); } catch {}
  }

  /* ========= SETTERS (subs) ========= */
  setShops(s: ShopsSnapshot) {
    const prev = this.lastShops;
    this.lastShops = s;
    this.shopUpdates++;

    // reset si le compteur de restock remonte dans au moins une section
    this.justRestocked = !!(prev && (
      (prev.seed?.secondsUntilRestock  ?? 0) < (s.seed?.secondsUntilRestock  ?? 0) ||
      (prev.tool?.secondsUntilRestock  ?? 0) < (s.tool?.secondsUntilRestock  ?? 0) ||
      (prev.egg?.secondsUntilRestock   ?? 0) < (s.egg?.secondsUntilRestock   ?? 0) ||
      (prev.decor?.secondsUntilRestock ?? 0) < (s.decor?.secondsUntilRestock ?? 0)
    ));

    this.recompute();
  }

  setPurchases(p: PurchasesSnapshot) {
    this.lastPurch = p;
    this.purchasesUpdates++;
    this.recompute();
  }

  notifyStateUpdated() {
    void this.recompute();
  }

  setRules(rules: Record<string, NotifierRule>) {
    this.rulesById.clear();
    for (const [id, rule] of Object.entries(rules)) {
      if (!id || !rule) continue;
      this.rulesById.set(id, { ...rule });
    }
    this.refreshActiveLoops();
  }

  /* ========= Core compute ========= */
  private buildTriggerOverrides(rule?: NotifierRule | null): TriggerOverrides | null {
    if (!rule) return null;
    const overrides: TriggerOverrides = {};
    if (rule.sound) overrides.sound = rule.sound;
    if (rule.volume != null && Number.isFinite(rule.volume)) {
      overrides.volume = Math.max(0, Math.min(1, Number(rule.volume)));
    }
    if (rule.playbackMode === "loop" || rule.playbackMode === "oneshot") {
      overrides.mode = rule.playbackMode;
    }
    if (rule.stopMode === "purchase") overrides.stop = { mode: "purchase" };
    else if (rule.stopMode === "manual") overrides.stop = { mode: "manual" };
    if (rule.loopIntervalMs != null && Number.isFinite(rule.loopIntervalMs)) {
      overrides.loopIntervalMs = Math.max(150, Math.floor(Number(rule.loopIntervalMs)));
    }
    return Object.keys(overrides).length ? overrides : null;
  }

  private triggerMany(ids: Iterable<string>) {
    type TriggerEntry = {
      id: string;
      overrides: TriggerOverrides;
      mode: PlaybackMode;
      soundKey: string;
    };

    const entries: TriggerEntry[] = [];

    for (const id of ids) {
      const overrides = this.buildTriggerOverrides(this.rulesById.get(id)) ?? {};
      const mode = this.resolvePlaybackMode(id);
      const soundKeyBase = overrides.sound
        ? `sound:${overrides.sound.trim().toLowerCase()}`
        : "sound:__default__";
      const vol = overrides.volume;
      const volKey = vol != null ? `vol:${Math.round(Math.max(0, Math.min(1, vol)) * 1000)}` : "vol:__default__";
      const soundKey = `${soundKeyBase}|${volKey}`;
      entries.push({ id, overrides, mode, soundKey });
    }

    if (!entries.length) return;

    const grouped = new Map<string, { loops: TriggerEntry[]; oneshots: TriggerEntry[] }>();

    for (const entry of entries) {
      const bucket = grouped.get(entry.soundKey) ?? { loops: [], oneshots: [] };
      if (entry.mode === "loop") bucket.loops.push(entry);
      else bucket.oneshots.push(entry);
      grouped.set(entry.soundKey, bucket);
    }

    for (const { loops, oneshots } of grouped.values()) {
      if (loops.length) {
        for (const entry of loops) {
          audio.trigger(entry.id, entry.overrides, "shops").catch(() => {});
        }
        continue; // oneshots sharing the sound are skipped when a loop exists
      }

      if (oneshots.length) {
        const first = oneshots[0];
        audio.trigger(first.id, first.overrides, "shops").catch(() => {});
      }
    }
  }

  private triggerWithRule(id: string) {
    this.triggerMany([id]);
  }

  private resolvePlaybackMode(id: string): PlaybackMode {
    const rule = this.rulesById.get(id);
    const baseMode = audio.getPlaybackMode("shops");
    if (!rule) return baseMode;
    if (rule.playbackMode === "loop") return "loop";
    if (rule.playbackMode === "oneshot") return "oneshot";
    if ((rule.stopMode || rule.loopIntervalMs != null) && baseMode === "loop") return "loop";
    return baseMode;
  }

  private refreshActiveLoops() {
    if (!this.currentOverlayIds.size) return;
    const loopIds: string[] = [];
    for (const id of this.currentOverlayIds) {
      if (this.resolvePlaybackMode(id) === "loop") {
        audio.stopLoop(id);
        loopIds.push(id);
      }
    }
    if (loopIds.length) this.triggerMany(loopIds);
  }

  private async recompute() {
    if (!this.lastShops || !this.lastPurch) return;

    // ===== 1) Calcul overlay (popup + stock restant > 0)
    const out: Array<{ id: string; qty: number }> = [];

    const consider = (id: string, initialStock: number) => {
      const pref = (NotifierService.getPref?.(id) as any) || {};
      if (!pref.popup) return; // overlay = source de vérité
      const bought = purchasedCountForId(id, this.lastPurch!);
      const remaining = Math.max(initialStock - bought, 0);
      if (remaining > 0) out.push({ id, qty: remaining });
    };

    for (const it of this.lastShops.seed.inventory)  consider(`Seed:${it.species}`, it.initialStock);
    for (const it of this.lastShops.tool.inventory)  consider(`Tool:${it.toolId}`,   it.initialStock);
    for (const it of this.lastShops.egg.inventory)   consider(`Egg:${it.eggId}`,     it.initialStock);
    for (const it of this.lastShops.decor.inventory) consider(`Decor:${it.decorId}`, it.initialStock);

    // ---- Render (badge / panel) + MAJ cloche
    this.rows = out;
    this.renderBadge();
    if (this.panel.style.display === "block") this.renderPanel();
    this.updateBellWiggle();

    // ===== 2) Gate de boot (stabilité initiale)
    const overlayIds = new Set(out.map(r => r.id));
    this.currentOverlayIds = overlayIds;
    const shopEmpty =
      (this.lastShops.seed?.inventory?.length ?? 0) +
      (this.lastShops.tool?.inventory?.length ?? 0) +
      (this.lastShops.egg?.inventory?.length ?? 0)  +
      (this.lastShops.decor?.inventory?.length ?? 0) === 0;

    const ready = this.shopUpdates >= 3 && this.purchasesUpdates >= 2 && !shopEmpty;

    if (!this.bootArmed) {
      if (!ready) {
        // baseline: on garde les ids tels quels sans jouer
        this.prevOverlayIds = overlayIds;
        return;
      }
      // Armement du boot: s'il y a déjà des items suivis visibles, on déclenche pour chacun
      this.bootArmed = true;
      if (overlayIds.size > 0) {
        this.triggerMany(overlayIds);
      }
      this.prevOverlayIds = overlayIds;
      this.justRestocked = false;
      return;
    }

    // ===== 3) Après boot

    // Si overlay vide → stop toutes les boucles et baseline
    if (overlayIds.size === 0) {
      audio.stopAllLoops();
      this.prevOverlayIds = overlayIds;
      this.justRestocked = false;
      return;
    }

    // a) Reset (restock) détecté → redémarrer les loops pour tous les items visibles
    if (this.justRestocked) {
      // On redémarre (trigger) tous les ids courants
      this.triggerMany(overlayIds);
      // Et on stoppe d'éventuelles boucles d'IDs qui ont disparu
      for (const oldId of this.prevOverlayIds) {
        if (!overlayIds.has(oldId)) audio.stopLoop(oldId);
      }
      this.prevOverlayIds = overlayIds;
      this.justRestocked = false;
      return;
    }

    // b) Sinon, on déclenche sur les NOUVEAUX IDs et on coupe ceux sortis
    const newIds: string[] = [];
    for (const id of overlayIds) {
      if (!this.prevOverlayIds.has(id)) {
        newIds.push(id);
      }
    }
    if (newIds.length) this.triggerMany(newIds);
    for (const oldId of this.prevOverlayIds) {
      if (!overlayIds.has(oldId)) {
        audio.stopLoop(oldId);
      }
    }

    this.prevOverlayIds = overlayIds;
    this.justRestocked = false;

    // (en mode oneshot, trigger joue 1x; en mode loop, ça démarre la boucle)
    // pas besoin de bip global de plus.
  }

  /* ========= Render ========= */
  private renderBadge() {
    const n = this.rows.length;
    this.badge.textContent = n ? String(n) : "";
    style(this.badge, { display: n ? "inline-flex" : "none" });
    this.updateBadgePosition();
  }

  private resolveShopItem(id: string): { kind: ShopKind; item: any } | null {
    if (!this.lastShops) return null;
    const [type, raw] = String(id).split(":") as [string | undefined, string | undefined];
    if (!type || !raw) return null;

    if (type === "Seed") {
      const item = this.lastShops.seed?.inventory?.find((it) => String(it.species) === raw);
      return item ? { kind: "seeds", item } : null;
    }
    if (type === "Tool") {
      const item = this.lastShops.tool?.inventory?.find((it) => String(it.toolId) === raw);
      return item ? { kind: "tools", item } : null;
    }
    if (type === "Egg") {
      const item = this.lastShops.egg?.inventory?.find((it) => String(it.eggId) === raw);
      return item ? { kind: "eggs", item } : null;
    }
    if (type === "Decor") {
      const item = this.lastShops.decor?.inventory?.find((it) => String(it.decorId) === raw);
      return item ? { kind: "decor", item } : null;
    }
    return null;
  }

  private async handleBuyClick(id: string, btn: HTMLButtonElement) {
    const resolved = this.resolveShopItem(id);
    if (!resolved) {
      btn.disabled = true;
      return;
    }
    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = "Buying...";
    try {
      await Promise.resolve(ShopsService.buyOne(resolved.kind, resolved.item));
    } catch {
    } finally {
      btn.textContent = prevLabel || "Buy";
      btn.disabled = false;
    }
  }

  private async handleBuyAllClick(id: string, btn: HTMLButtonElement) {
    const resolved = this.resolveShopItem(id);
    if (!resolved) {
      btn.disabled = true;
      return;
    }
    const available = this.rows.find((r) => r.id === id)?.qty ?? 0;
    if (available <= 0) {
      btn.disabled = true;
      return;
    }
    btn.disabled = true;
    const prevLabel = btn.textContent;
    btn.textContent = "Buying...";
    try {
      for (let i = 0; i < available; i++) {
        await Promise.resolve(ShopsService.buyOne(resolved.kind, resolved.item));
      }
    } catch {
    } finally {
      btn.textContent = prevLabel || "Buy all";
      btn.disabled = false;
    }
  }

  private renderPanel() {
    const sig = JSON.stringify(this.rows.map((r) => [r.id, r.qty]));
    if (sig === this.lastPanelSig) return;
    this.lastPanelSig = sig;

    this.panel.replaceChildren();

    const head = document.createElement("div");
    head.textContent = "Tracked items available";
    style(head, {
      fontWeight: "700",
      opacity: "0.9",
      padding: "4px 2px",
      borderBottom: "1px solid var(--qws-border-2, #ffffff14)",
      marginBottom: "4px",
    });
    this.panel.appendChild(head);

    if (!this.rows.length) {
      const empty = document.createElement("div");
      empty.textContent = "No tracked items are available.";
      style(empty, { opacity: "0.75", padding: "8px 2px" });
      this.panel.appendChild(empty);
      return;
    }

    for (const r of this.rows) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid",
        gridTemplateColumns: "24px 1fr max-content max-content max-content",
        alignItems: "center",
        gap: "8px",
        padding: "6px 4px",
        borderBottom: "1px solid var(--qws-border-2, #ffffff14)",
      });

      const icon = iconOf(r.id, 24);

      const title = document.createElement("div");
      title.textContent = labelOf(r.id);
      Object.assign(title.style, {
        fontWeight: "600",
        fontSize: "12px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        color: "var(--qws-text, #e7eef7)",
      });

      const qty = document.createElement("div");
      qty.textContent = `×${r.qty}`;
      Object.assign(qty.style, {
        fontVariantNumeric: "tabular-nums",
        opacity: "0.9",
        color: "var(--qws-text-dim, #b9c3cf)",
        textAlign: "right",
      });

      const buyBtn = document.createElement("button");
      buyBtn.type = "button";
      buyBtn.textContent = "Buy";
      Object.assign(buyBtn.style, {
        padding: "4px 10px",
        borderRadius: "10px",
        border: "1px solid var(--qws-border, #ffffff33)",
        background: "var(--qws-accent, #7aa2ff)",
        color: "#0b1017",
        fontWeight: "700",
        cursor: "pointer",
        fontSize: "12px",
        boxShadow: "var(--qws-shadow, 0 6px 18px rgba(0,0,0,.35))",
        transition: "filter 120ms ease, transform 120ms ease",
      });
      buyBtn.onmouseenter = () => { buyBtn.style.filter = "brightness(1.05)"; };
      buyBtn.onmouseleave = () => { buyBtn.style.filter = ""; buyBtn.style.transform = ""; };
      buyBtn.onmousedown = () => { buyBtn.style.transform = "translateY(1px)"; };
      buyBtn.onmouseup = () => { buyBtn.style.transform = ""; };
      buyBtn.onclick = (e) => {
        e.stopPropagation();
        void this.handleBuyClick(r.id, buyBtn);
      };

      if (!this.resolveShopItem(r.id)) {
        buyBtn.disabled = true;
        buyBtn.style.opacity = "0.6";
        buyBtn.style.cursor = "not-allowed";
        buyBtn.title = "Unavailable";
      }

      const buyAllBtn = document.createElement("button");
      buyAllBtn.type = "button";
      buyAllBtn.textContent = "Buy all";
      Object.assign(buyAllBtn.style, {
        padding: "4px 10px",
        borderRadius: "10px",
        border: "1px solid var(--qws-border, #ffffff33)",
        background: "var(--qws-panel, #111823cc)",
        color: "var(--qws-text, #e7eef7)",
        fontWeight: "700",
        cursor: "pointer",
        fontSize: "12px",
        boxShadow: "var(--qws-shadow, 0 6px 18px rgba(0,0,0,.35))",
        transition: "filter 120ms ease, transform 120ms ease",
      });
      buyAllBtn.onmouseenter = () => { buyAllBtn.style.filter = "brightness(1.08)"; };
      buyAllBtn.onmouseleave = () => { buyAllBtn.style.filter = ""; buyAllBtn.style.transform = ""; };
      buyAllBtn.onmousedown = () => { buyAllBtn.style.transform = "translateY(1px)"; };
      buyAllBtn.onmouseup = () => { buyAllBtn.style.transform = ""; };
      buyAllBtn.onclick = (e) => {
        e.stopPropagation();
        void this.handleBuyAllClick(r.id, buyAllBtn);
      };

      if (!this.resolveShopItem(r.id)) {
        buyAllBtn.disabled = true;
        buyAllBtn.style.opacity = "0.6";
        buyAllBtn.style.cursor = "not-allowed";
        buyAllBtn.title = "Unavailable";
      }

      row.append(icon, title, qty, buyBtn, buyAllBtn);
      this.panel.appendChild(row);
    }
  }

  /* ========= DOM bits ========= */
  private createSlot(): HTMLDivElement {
    const d = document.createElement("div");
    style(d, {
      position: "fixed",
      top: "0",
      right: "0",
      pointerEvents: "none",
      zIndex: "9999",
      fontFamily: "var(--chakra-fonts-body, GreyCliff CF), system-ui, sans-serif",
      color: "var(--chakra-colors-chakra-body-text, #e7eef7)",
      userSelect: "none",
    });
    setProps(d, {
      "-webkit-font-smoothing": "antialiased",
      "-webkit-text-size-adjust": "100%",
      "text-rendering": "optimizeLegibility",
    });
    return d;
  }

  private repositionOverlay(): void {
    this.updateBadgePosition();
    if (this.panel.style.display === "block") this.updatePanelPosition();
  }

  private updateBadgePosition(): void {
    const rect = this.bell?.getScreenRect();
    if (rect && this.badge) {
      style(this.badge, {
        top: `${rect.top - 4}px`,
        right: `${window.innerWidth - rect.right - 4}px`,
      });
    }
  }

  private updatePanelPosition(): void {
    const rect = this.bell?.getScreenRect();
    if (rect && this.panel) {
      style(this.panel, {
        position: "fixed",
        top: `${rect.bottom + 8}px`,
        right: `${window.innerWidth - rect.right}px`,
      });
    }
  }

  private updateBellWiggle() {
    // Shake seulement si l'overlay a au moins 1 item ET que le panneau est fermé
    const shouldWiggle = (this.rows.length > 0) && (this.panel.style.display !== "block");
    this.bell?.setWiggle(shouldWiggle);
  }

  private createBadge(): HTMLSpanElement {
    const badge = document.createElement("span");
    style(badge, {
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
    return badge;
  }

  private createPanel(): HTMLDivElement {
    const panel = document.createElement("div");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Tracked items available");
    style(panel, {
      position: "fixed",
      width: "min(340px, 80vw)",        // ← largeur réduite (était 360px)
      maxHeight: "50vh",
      overflow: "auto",
      overscrollBehavior: "contain",     // ← empêche le scroll de "remonter" au jeu
      touchAction: "pan-y",              // ← gestes tactiles = scroll vertical, pas zoom/pan global
      borderRadius: "var(--chakra-radii-card, 12px)",
      border: "1px solid var(--qws-border, #ffffff22)",
      background: "var(--qws-panel, #111823cc)",
      backdropFilter: "blur(var(--qws-blur, 8px))",
      color: "var(--qws-text, #e7eef7)",
      boxShadow: "var(--qws-shadow, 0 10px 36px rgba(0,0,0,.45))",
      padding: "8px",
      display: "none",
      zIndex: "var(--chakra-zIndices-DialogModal, 7010)",
      pointerEvents: "auto",
    });
    setProps(panel, { "-webkit-backdrop-filter": "blur(var(--qws-blur, 8px))" });
    return panel;
  }

  private installScrollGuards(el: HTMLElement) {
    const stop = (e: Event) => {
      // On laisse le scroll par défaut (pas de preventDefault),
      // mais on empêche le wheel d'aller jusqu'au canvas/jeu.
      e.stopPropagation();
    };
    // Souris/trackpad
    el.addEventListener("wheel", stop, { passive: true, capture: true });
    // Compat anciens events
    el.addEventListener("mousewheel", stop as any, { passive: true, capture: true } as any);
    el.addEventListener("DOMMouseScroll", stop as any, { passive: true, capture: true } as any);
    // Tactile
    el.addEventListener("touchmove", stop, { passive: true, capture: true });
  }
}

/* ===== Mount + SUBS ===== */
export async function renderOverlay() {
  const overlay = new OverlayBarebone();

  const unsubPurch = await NotifierService.onPurchasesChangeNow((p) => overlay.setPurchases(p));
  const unsubShops = await NotifierService.onShopsChangeNow((s) => overlay.setShops(s));
  const unsubState = await NotifierService.onChangeNow(() => overlay.notifyStateUpdated());
  const unsubRules = await NotifierService.onRulesChangeNow((rules) => overlay.setRules(rules));

  (window as any).__qws_cleanup_notifier = () => {
    try { unsubShops(); } catch {}
    try { unsubPurch(); } catch {}
    try { unsubState(); } catch {}
    try { unsubRules(); } catch {}
    try { overlay.destroy(); } catch {}
  };
}
