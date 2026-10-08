// Vertical tabs: a selectable list with an optional filter box.

import { h } from "./dom";

export type VTabItem = {
  id: string;
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  /** Colour of the status dot on the left, e.g. "#48d170". */
  statusColor?: string;
  /** Small counter or flag right of the label. */
  badge?: string | null;
  disabled?: boolean;
};

export type VTabsOptions = {
  /** Placeholder of the filter box. Without one there is no filter. */
  filterPlaceholder?: string;
  /** Shown when the list is empty. */
  emptyText?: string;
  initialId?: string | null;
  onSelect?: (id: string | null, item: VTabItem | null) => void;
  /** Caps the list height and scrolls inside it. */
  maxHeightPx?: number;
  /** Replaces the default dot, avatar, title and badge layout of an item. */
  renderItem?: (item: VTabItem, btn: HTMLButtonElement) => void;
  /** Takes the available height and scrolls inside it. */
  fillAvailableHeight?: boolean;
};

export class VTabs {
  root: HTMLElement;
  private filterInput: HTMLInputElement | null = null;
  private list: HTMLElement;
  private items: VTabItem[] = [];
  private selectedId: string | null;
  private onSelectCb: VTabsOptions["onSelect"];
  private renderItemCustom: VTabsOptions["renderItem"];
  private emptyText: string;

  constructor(opts: VTabsOptions = {}) {
    this.root = h("div", "qmm-vtabs");
    this.emptyText = opts.emptyText || "Aucun élément.";
    this.renderItemCustom = opts.renderItem;
    this.selectedId = opts.initialId ?? null;
    this.onSelectCb = opts.onSelect;

    if (opts.filterPlaceholder) {
      const filter = h("div", "filter");
      this.filterInput = h("input", "qmm-input");
      this.filterInput.type = "search";
      this.filterInput.placeholder = opts.filterPlaceholder;
      this.filterInput.oninput = () => this.renderList();
      filter.appendChild(this.filterInput);
      this.root.appendChild(filter);
    }

    this.list = h("div", "qmm-vlist");
    if (opts.maxHeightPx || opts.fillAvailableHeight) this.list.classList.add("is-scroll");
    if (opts.maxHeightPx) this.list.style.maxHeight = `${opts.maxHeightPx}px`;

    if (opts.fillAvailableHeight) {
      const wrap = h("div", "qmm-vlist-wrap");
      wrap.appendChild(this.list);
      this.root.appendChild(wrap);
    } else {
      this.root.appendChild(this.list);
    }
  }

  setItems(items: VTabItem[]): void {
    this.items = Array.isArray(items) ? items.slice() : [];
    if (this.selectedId && !this.items.some((i) => i.id === this.selectedId)) {
      this.selectedId = this.items[0]?.id ?? null;
    }
    this.renderList();
  }

  getSelected(): VTabItem | null {
    return this.items.find((i) => i.id === this.selectedId) ?? null;
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.renderList();
    this.onSelectCb?.(this.selectedId, this.getSelected());
  }

  onSelect(cb: (id: string | null, item: VTabItem | null) => void): void {
    this.onSelectCb = cb;
  }

  private filterText(): string {
    return (this.filterInput?.value || "").trim().toLowerCase();
  }

  private renderList(): void {
    const keepScroll = this.list.scrollTop;
    this.list.replaceChildren();

    const q = this.filterText();
    const shown = q
      ? this.items.filter((it) => (it.title || "").toLowerCase().includes(q) || (it.subtitle || "").toLowerCase().includes(q))
      : this.items;

    if (!shown.length) {
      this.list.appendChild(h("div", "qmm-vlist__empty", this.emptyText));
      return;
    }

    const ul = h("ul", "qmm-vlist__items");
    for (const it of shown) {
      const btn = h("button", "qmm-vtab");
      btn.dataset.id = it.id;
      btn.disabled = !!it.disabled;
      if (this.renderItemCustom) this.renderItemCustom(it, btn);
      else this.renderDefaultItem(it, btn);
      btn.classList.toggle("active", it.id === this.selectedId);
      btn.onclick = () => this.select(it.id);

      const li = h("li");
      li.appendChild(btn);
      ul.appendChild(li);
    }
    this.list.appendChild(ul);
    this.list.scrollTop = keepScroll;
  }

  private renderDefaultItem(it: VTabItem, btn: HTMLButtonElement): void {
    const dot = h("div", "qmm-dot");
    dot.style.background = it.statusColor || "#999a";

    const img = h("img");
    img.src = it.avatarUrl || "";
    img.alt = it.title;
    const text = h("div", "qmm-chip__text");
    text.appendChild(h("div", "t", it.title));
    if (it.subtitle) text.appendChild(h("div", "qmm-chip__sub", it.subtitle));
    const chip = h("div", "qmm-chip");
    chip.append(img, text);

    btn.append(dot, chip, it.badge != null ? h("span", "qmm-tag", String(it.badge)) : h("div"));
  }
}
