// The tabbed menu shell every HUD window builds on: a tab bar, one view per
// tab, the remembered tab, and a small event bus.
//
// The form helpers further down (`btn`, `card`, `switch`...) predate the
// component functions in this folder and only forward to them. They stay so
// the menus written against them keep working; new code calls the components
// directly, and each helper can go once nothing calls it.

import { readAriesPath, writeAriesPath } from "../../platform/storage";
import { h } from "./dom";

type TabRender = (root: HTMLElement, api: Menu) => void;
type Handler = (...args: any[]) => void;

export interface MenuOptions {
  /** Names the menu in storage, where its last tab is remembered. */
  id?: string;
  /** Tighter tabs, buttons and padding. Every menu in the mod uses it. */
  compact?: boolean;
  /** The window that `setWindowVisible` shows and hides. */
  windowSelector?: string;
}

type TabDef = { title: string; render: TabRender };

export class Menu {
  /** Public so a menu can reach its own `.qmm-views` panel. */
  public root!: HTMLElement;
  private tabBar!: HTMLElement;
  private views!: HTMLElement;
  private tabs = new Map<string, TabDef>();
  private events = new Map<string, Set<Handler>>();
  private currentId: string | null = null;
  private menuId: string;
  /** The tab to reopen, until it is added or the player picks another. */
  private wantedId: string | null;

  constructor(private opts: MenuOptions = {}) {
    this.menuId = opts.id || "default";
    this.wantedId = readSavedTab(this.menuId);
  }

  mount(container: HTMLElement): void {
    container.innerHTML = "";
    this.root = h("div", this.opts.compact ? "qmm qmm-compact" : "qmm");
    this.tabBar = h("div", "qmm-tabs");
    this.views = h("div", "qmm-views");
    this.root.append(this.tabBar, this.views);
    container.appendChild(this.root);

    for (const [id, def] of this.tabs) this.createTabView(id, def);
    this.updateTabBar();

    this.root.addEventListener("pointerenter", this.onEnter);
    this.root.addEventListener("pointerleave", this.onLeave);
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("keyup", this.onKey, true);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onBlur);
  }

  /** Shows or hides the HUD window around the menu, title bar included. */
  setWindowVisible(visible: boolean): void {
    const win = this.root?.closest<HTMLElement>(this.opts.windowSelector || ".qws-win");
    if (!win) return;
    win.classList.toggle("is-hidden", !visible);
  }

  /** Adds a tab, before or after `mount`. */
  addTab(id: string, title: string, render: TabRender): Menu {
    const def: TabDef = { title, render };
    this.tabs.set(id, def);
    if (this.root) {
      this.createTabView(id, def);
      this.updateTabBar();
    }
    return this;
  }

  addTabs(defs: Array<{ id: string; title: string; render: TabRender }>): Menu {
    defs.forEach((d) => this.addTab(d.id, d.title, d.render));
    return this;
  }

  /** Shows a tab and remembers it as the one to reopen. `null` shows every view. */
  switchTo(id: string | null): void {
    if (id) writeAriesPath(`menu.activeTabs.${this.menuId}`, id);
    if (!this.root) {
      this.wantedId = id;
      return;
    }
    this.wantedId = null;
    this.show(id);
  }

  on(event: string, handler: Handler): () => void {
    if (!this.events.has(event)) this.events.set(event, new Set());
    this.events.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler): void {
    this.events.get(event)?.delete(handler);
  }

  emit(event: string, ...args: unknown[]): void {
    this.events.get(event)?.forEach((handler) => {
      try {
        handler(...args);
      } catch {
        /* one broken listener must not stop the others */
      }
    });
  }

  private show(id: string | null): void {
    this.currentId = id;
    const isShown = (el: Element) => id === null || (el as HTMLElement).dataset.id === id;
    for (const tab of Array.from(this.tabBar.children)) tab.classList.toggle("active", isShown(tab));
    for (const view of Array.from(this.views.children)) view.classList.toggle("active", isShown(view));
    this.emit("tab:change", id);
  }

  private createTabView(id: string, def: TabDef): void {
    const tab = h("button", "qmm-tab");
    tab.dataset.id = id;
    tab.appendChild(h("span", "label", def.title));
    tab.onclick = () => this.switchTo(id);
    this.tabBar.appendChild(tab);

    const view = h("div", "qmm-view");
    view.dataset.id = id;
    this.views.appendChild(view);

    try {
      def.render(view, this);
    } catch (e) {
      view.textContent = String(e);
    }

    // The first tab shows until the remembered one arrives. Neither choice is
    // saved, or showing the first tab would overwrite the remembered one: only
    // `switchTo` (a click on a tab, or the menu itself) saves.
    if (id === this.wantedId) {
      this.wantedId = null;
      this.show(id);
    } else if (!this.currentId) {
      this.show(id);
    }
  }

  /** A menu without tabs drops the bar so its panel starts at the top. */
  private updateTabBar(): void {
    if (this.tabs.size > 0) {
      if (!this.tabBar.parentElement) this.root.insertBefore(this.tabBar, this.views);
    } else {
      this.tabBar.remove();
    }
  }

  // Holding Alt (or Insert) over a menu shows the grab cursor: windows can be
  // dragged from anywhere while it is held.
  private altDown = false;
  private insertDown = false;
  private hovering = false;

  private onKey = (e: KeyboardEvent) => {
    if (e.code === "Insert" || e.key === "Insert") this.insertDown = e.type === "keydown";
    const alt = e.altKey || this.insertDown;
    if (alt !== this.altDown) {
      this.altDown = alt;
      this.updateAltCursor();
    }
  };
  private onBlur = () => {
    this.altDown = false;
    this.insertDown = false;
    this.updateAltCursor();
  };
  private onEnter = () => {
    this.hovering = true;
    this.updateAltCursor();
  };
  private onLeave = () => {
    this.hovering = false;
    this.updateAltCursor();
  };
  private updateAltCursor(): void {
    this.root?.classList.toggle("qmm-alt-drag", this.altDown && this.hovering);
  }
}

/**
 * The tab a menu should reopen on. Builds before the shared storage kept it
 * under a raw localStorage key; that key is read once, moved, and dropped.
 */
function readSavedTab(menuId: string): string | null {
  const path = `menu.activeTabs.${menuId}`;
  const saved = readAriesPath<string>(path);
  if (typeof saved === "string" && saved) return saved;

  const legacyKey = `menu:${menuId}:activeTab`;
  let legacy: string | null = null;
  try {
    legacy = localStorage.getItem(legacyKey);
    if (legacy !== null) localStorage.removeItem(legacyKey);
  } catch {
    /* storage blocked: nothing to migrate */
  }
  if (!legacy) return null;
  writeAriesPath(path, legacy);
  return legacy;
}
