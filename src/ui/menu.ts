// src/ui/menu.ts
// Menu générique à onglets, compact, avec helpers UI + persistance LS.
// + Helpers réutilisables : split2 (layout 2 colonnes) et VTabs (tabs verticaux)

import { readAriesPath, writeAriesPath } from "../utils/localStorage";
import { beginKeybindCapture, endKeybindCapture } from "../utils/keyboard";

type TabRender = (root: HTMLElement, api: Menu) => void;
type Handler = (...args: any[]) => void;

type ButtonVariant = "default" | "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonOptions = {
  onClick?: () => void;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  icon?: string | HTMLElement;
  iconPosition?: "left" | "right";
  tooltip?: string;
  size?: ButtonSize;
  disabled?: boolean;
  active?: boolean;
  ariaLabel?: string;
  title?: string;
};

type FlexRowOptions = {
  gap?: number;
  justify?: "start" | "center" | "end" | "between" | "around";
  align?: "start" | "center" | "end" | "stretch";
  wrap?: boolean;
  fullWidth?: boolean;
  className?: string;
};

type FormGridOptions = {
  columns?: string;
  columnGap?: number;
  rowGap?: number;
  align?: "start" | "center" | "end";
};

type FormRowOptions = {
  alignTop?: boolean;
  labelWidth?: string;
  gap?: number;
  wrap?: boolean;
};

type CardTone = "default" | "muted" | "accent";

type CardOptions = {
  subtitle?: string;
  icon?: string | HTMLElement;
  maxWidth?: number | string;
  align?: "left" | "center" | "stretch";
  tone?: CardTone;
  padding?: string;
  gap?: number;
  description?: string;
  actions?: HTMLElement[];
  compactHeader?: boolean;
};

type ToggleChipOptions = {
  checked?: boolean;
  description?: string;
  icon?: string | HTMLElement;
  name?: string;
  value?: string;
  type?: "checkbox" | "radio";
  badge?: string;
  tooltip?: string;
};

type SelectOptions = {
  id?: string;
  width?: string;
  placeholder?: string;
};

type RangeDualHandle = {
  root: HTMLDivElement;
  min: HTMLInputElement;
  max: HTMLInputElement;
  setValues: (minValue: number, maxValue: number) => void;
  refresh: () => void;
};

type ErrorBarHandle = {
  el: HTMLDivElement;
  show: (message: string) => void;
  clear: () => void;
};

export type Control =
  | HTMLButtonElement
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

export interface MenuOptions {
  id?: string;
  classes?: string;
  startHidden?: boolean;
  compact?: boolean;
  windowSelector?: string;
  startWindowHidden?: boolean;
}

export type Hotkey = {
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  code: string;
  key?: string;
};

export type HotkeyButtonElement = HTMLButtonElement & {
  refreshHotkey: (hk: Hotkey | null) => void;
};

const MOD_ONLY = new Set(["Shift","Control","Alt","Meta"]);

/** Un seul bouton de raccourci peut écouter le clavier à la fois. */
let activeHotkeyRecorder: (() => void) | null = null;
/** Filet de sécurité : une écoute oubliée s'arrête d'elle-même. */
const HOTKEY_RECORDING_TIMEOUT_MS = 8000;

type TabDef = {
  title: string;
  render: TabRender;
  view?: HTMLElement;
  btn?: HTMLButtonElement;
  badge?: HTMLElement | null;
};

/* --------------------------- VTabs Types --------------------------- */
export type VTabItem = {
  id: string;
  title: string;
  subtitle?: string;
  avatarUrl?: string;
  statusColor?: string;   // ex: "#48d170" (point à gauche)
  badge?: string | null;  // petit compteur/drapeau à droite du libellé
  disabled?: boolean;
};

export type VTabsOptions = {
  /** placeholder du filtre (si omis : pas de filtre) */
  filterPlaceholder?: string;
  /** texte affiché quand liste vide */
  emptyText?: string;
  /** sélection initiale (id) */
  initialId?: string | null;
  /** callback de sélection */
  onSelect?: (id: string | null, item: VTabItem | null) => void;
  /** hauteur max de la liste (overflow:auto). Si absent => pas de limite */
  maxHeightPx?: number;
  /** rendu custom d’un item (facultatif) */
  renderItem?: (item: VTabItem, btn: HTMLButtonElement) => void;
  /** occupe toute la hauteur dispo et active un scroll interne */
  fillAvailableHeight?: boolean;
};

/* ================================================================== */

export class Menu {
  // NOTE: je rends root public pour pouvoir faire ui.root.appendChild(...) côté menus
  public root!: HTMLElement;
  private tabBar!: HTMLElement;
  private views!: HTMLElement;
  private tabs: Map<string, TabDef> = new Map();
  private events: Map<string, Set<Handler>> = new Map();
  private currentId: string | null = null;
  private lsKeyActive: string;
  private menuId: string;

  constructor(private opts: MenuOptions = {}) {
    this.menuId = this.opts.id || "default";
    this.lsKeyActive = `menu:${this.menuId}:activeTab`;
  }

  /** Monte le menu dans un conteneur */
  mount(container: HTMLElement) {
    this.ensureStyles();
    container.innerHTML = '';
    this.root = el('div', `qmm ${this.opts.classes || ''} ${this.opts.compact ? 'qmm-compact' : ''}`);
    if (this.opts.startHidden) this.root.style.display = 'none';

    this.tabBar = el('div', 'qmm-tabs');
    this.views = el('div', 'qmm-views');

    this.root.appendChild(this.tabBar);
    this.root.appendChild(this.views);
    container.appendChild(this.root);

    // créer vues déjà enregistrées
    if (this.tabs.size) {
      for (const [id, def] of this.tabs) this.createTabView(id, def);
      this.restoreActive();
    }

    // si aucun onglet => masquer la barre (évite une ligne vide)
    this.updateTabsBarVisibility();

    this.root.addEventListener('pointerenter', this._onEnter);
    this.root.addEventListener('pointerleave', this._onLeave);

    window.addEventListener('keydown', this._onKey, true);
    window.addEventListener('keyup',   this._onKey, true);
    window.addEventListener('blur',    this._onBlur);
    document.addEventListener('visibilitychange', this._onBlur);

    if (this.opts.startWindowHidden) this.setWindowVisible(false);
    this.emit('mounted');
  }

  /** Démonte le menu (optionnel) */
  unmount() {
    this.root?.removeEventListener('pointerenter', this._onEnter);
    this.root?.removeEventListener('pointerleave', this._onLeave);

    window.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('keyup',   this._onKey, true);
    window.removeEventListener('blur',    this._onBlur);
    document.removeEventListener('visibilitychange', this._onBlur);
    if (this.root?.parentElement) this.root.parentElement.removeChild(this.root);
    this.emit('unmounted');
  }

  /** Retourne l'élément fenêtre englobant (barre – / ×) */
  private getWindowEl(): HTMLElement | null {
    if (!this.root) return null;
    const sel = this.opts.windowSelector || '.qws-win';
    return this.root.closest<HTMLElement>(sel);
  }

  /** Affiche/masque la FENÊTRE (barre incluse) */
  setWindowVisible(visible: boolean) {
    const win = this.getWindowEl();
    if (!win) return;
    win.classList.toggle('is-hidden', !visible);
    this.emit(visible ? 'window:show' : 'window:hide');
  }

  /** Bascule l’état de la fenêtre. Retourne true si maintenant visible. */
  toggleWindow(): boolean {
    const win = this.getWindowEl();
    if (!win) return false;
    const willShow = win.classList.contains('is-hidden');
    this.setWindowVisible(willShow);
    return willShow;
  }

  /** Donne l’état courant de la fenêtre (true = visible) */
  isWindowVisible(): boolean {
    const win = this.getWindowEl();
    if (!win) return true;
    return !win.classList.contains('is-hidden') && getComputedStyle(win).display !== 'none';
  }

  /** Affiche/masque le root */
  setVisible(visible: boolean) {
    if (!this.root) return;
    this.root.style.display = visible ? '' : 'none';
    this.emit(visible ? 'show' : 'hide');
  }
  toggle(): boolean {
    if (!this.root) return false;
    const v = this.root.style.display === 'none';
    this.setVisible(v);
    return v;
  }

  /** Ajoute un onglet (peut être appelé avant ou après mount) */
  addTab(id: string, title: string, render: TabRender): Menu {
    this.tabs.set(id, { title, render, badge: null });
    if (this.root) {
      this.createTabView(id, this.tabs.get(id)!);
      this.updateTabsBarVisibility();
    }
    return this;
  }

  /** Ajoute plusieurs onglets en une fois */
  addTabs(defs: Array<{ id: string; title: string; render: TabRender }>): Menu {
    defs.forEach(d => this.addTab(d.id, d.title, d.render));
    return this;
  }

  /** Met à jour le titre de l’onglet (ex: compteur, libellé) */
  setTabTitle(id: string, title: string) {
    const def = this.tabs.get(id);
    if (!def) return;
    def.title = title;
    if (def.btn) {
      const label = def.btn.querySelector('.label');
      if (label) label.textContent = title;
    }
  }

  /** Ajoute/retire un badge à droite du titre (ex: “3”, “NEW”, “!”) */
  setTabBadge(id: string, text: string | null) {
    const def = this.tabs.get(id);
    if (!def || !def.btn) return;
    if (!def.badge) {
      def.badge = document.createElement('span');
      def.badge.className = 'badge';
      def.btn.appendChild(def.badge);
    }
    if (text == null || text === '') {
      def.badge.style.display = 'none';
    } else {
      def.badge.textContent = text;
      def.badge.style.display = '';
    }
  }

  /** Force le re-render d’un onglet (ré-exécute son render) */
  refreshTab(id: string) {
    const def = this.tabs.get(id);
    if (!def?.view) return;

    // --- Préserve le scroll du conteneur scrollable le plus proche ---
    const scroller = this.findScrollableAncestor(def.view);
    const st = scroller ? scroller.scrollTop : null;
    const sl = scroller ? scroller.scrollLeft : null;
    const activeId = (document.activeElement as HTMLElement | null)?.id || null;

    def.view.innerHTML = '';
    try { def.render(def.view, this); } catch (e) {
      def.view.textContent = String(e);
    }
    if (this.currentId === id) this.switchTo(id);
    this.emit('tab:render', id);

    // --- Restaure scroll + focus ---
    if (scroller && st != null) {
      requestAnimationFrame(() => {
        try { scroller.scrollTop = st!; scroller.scrollLeft = sl ?? 0; } catch {}
        if (activeId) {
          const n = document.getElementById(activeId);
          if (n && (n as any).focus) try { (n as any).focus(); } catch {}
        }
      });
    }
  }

  private findScrollableAncestor(start: HTMLElement): HTMLElement | null {
    function isScrollable(el: HTMLElement) {
      const s = getComputedStyle(el);
      const oy = s.overflowY || s.overflow;
      return (/(auto|scroll)/).test(oy) && el.scrollHeight > el.clientHeight;
    }
    let el: HTMLElement | null = start;
    while (el) {
      if (isScrollable(el)) return el;
      el = el.parentElement;
    }
    // fallback : fenêtre HUD
    return document.querySelector('.qws-win') as HTMLElement | null;
  }

  private firstTabId(): string | null {
    const it = this.tabs.keys().next();
    return it.done ? null : it.value ?? null;
  }

  private _altDown = false;
  private _insertDown = false;
  private _hovering = false;

  private _onKey = (e: KeyboardEvent) => {
    if (e.code === 'Insert' || e.key === 'Insert') {
      this._insertDown = e.type === 'keydown';
    }
    const alt = e.altKey || this._insertDown;   // état courant de ALT ou Insert
    if (alt !== this._altDown) {
      this._altDown = alt;
      this._updateAltCursor();
    }
  };
  private _onBlur = () => {                // reset si on quitte la fenêtre/onglet
    this._altDown = false;
    this._insertDown = false;
    this._updateAltCursor();
  };
  private _onEnter = () => {
    this._hovering = true;
    this._updateAltCursor();
  };
  private _onLeave = () => {
    this._hovering = false;
    this._updateAltCursor();
  };
  private _updateAltCursor() {
    if (!this.root) return;
    this.root.classList.toggle('qmm-alt-drag', this._altDown && this._hovering);
    // ⇧ si tu veux que ce soit UNIQUEMENT sur la barre d’onglets,
    // remplace this.root par this.tabBar.
  }

  /** Récupère la vue DOM d’un onglet (pratique pour updates ciblées) */
  getTabView(id: string): HTMLElement | null {
    return this.tabs.get(id)?.view ?? null;
  }

  /** Retire un onglet */
  removeTab(id: string) {
    const def = this.tabs.get(id);
    if (!def) return;
    this.tabs.delete(id);
    // nettoie barre + vue
    const btn = this.tabBar?.querySelector<HTMLButtonElement>(`button[data-id="${cssq(id)}"]`);
    if (btn && btn.parentElement) btn.parentElement.removeChild(btn);
    if (def.view && def.view.parentElement) def.view.parentElement.removeChild(def.view);
    if (this.currentId === id) {
      // activer le premier restant
      const first = this.tabs.keys().next().value || null;
      this.switchTo(first);
    }
    this.updateTabsBarVisibility();
  }

  /** Active un onglet (id=null => affiche toutes les vues) */
  switchTo(id: string | null) {
    this.currentId = id;
    // maj barre
    [...this.tabBar.children].forEach(ch => ch.classList.toggle('active', (ch as HTMLElement).dataset.id === id || id === null));
    // maj vues
    [...this.views.children].forEach(ch => ch.classList.toggle('active', (ch as HTMLElement).dataset.id === id || id === null));
    this.persistActive();
    this.emit('tab:change', id);
  }

  /** Événements */
  on(event: string, handler: Handler) {
    if (!this.events.has(event)) this.events.set(event, new Set());
    this.events.get(event)!.add(handler);
    return () => this.off(event, handler);
  }
  off(event: string, handler: Handler) {
    this.events.get(event)?.delete(handler);
  }
  emit(event: string, ...args: any[]) {
    this.events.get(event)?.forEach(h => {
      try { h(...args); } catch {}
    });
  }

  // ---------- Helpers UI publics (réutilisables dans tes tabs) ----------

  btn(label: string, onClickOrOpts?: (() => void) | ButtonOptions) {
    const opts: ButtonOptions = typeof onClickOrOpts === 'function'
      ? { onClick: onClickOrOpts }
      : { ...(onClickOrOpts || {}) };

    const b = el('button', 'qmm-btn') as HTMLButtonElement;
    b.type = 'button';

    let iconEl: HTMLElement | null = null;
    if (opts.icon) {
      iconEl = typeof opts.icon === 'string'
        ? document.createElement('span')
        : opts.icon;
      if (typeof opts.icon === 'string' && iconEl) {
        iconEl.textContent = opts.icon;
      }
      if (iconEl) {
        iconEl.classList.add('qmm-btn__icon');
      }
    }

    const trimmedLabel = (label ?? '').trim();
    const shouldRenderLabel = !iconEl || trimmedLabel.length > 0;
    const labelSpan = shouldRenderLabel ? document.createElement('span') : null;
    if (labelSpan) {
      labelSpan.className = 'label';
      labelSpan.textContent = label;
    }

    if (iconEl) {
      if (trimmedLabel.length === 0) {
        b.classList.add('qmm-btn--icon');
      }
      if (opts.iconPosition === 'right') {
        iconEl.classList.add('is-right');
        if (labelSpan) b.append(labelSpan);
        b.append(iconEl);
      } else {
        iconEl.classList.add('is-left');
        b.append(iconEl);
        if (labelSpan) b.append(labelSpan);
      }
    } else {
      if (labelSpan) b.append(labelSpan);
    }

    const variant = opts.variant && opts.variant !== 'default' ? opts.variant : null;
    if (variant) b.classList.add(`qmm-btn--${variant}`);
    if (opts.fullWidth) b.classList.add('qmm-btn--full');
    if (opts.size === 'sm') b.classList.add('qmm-btn--sm');
    if (opts.active) b.classList.add('active');

    if (opts.tooltip || opts.title) b.title = opts.tooltip || opts.title || '';
    if (opts.ariaLabel) b.setAttribute('aria-label', opts.ariaLabel);

    if (opts.onClick) b.addEventListener('click', opts.onClick);
    if (opts.disabled) this.setButtonEnabled(b, false);

    (b as any).setEnabled = (enabled: boolean) => this.setButtonEnabled(b, enabled);
    (b as any).setActive = (active: boolean) => b.classList.toggle('active', !!active);

    return b;
  }

  setButtonEnabled(button: HTMLButtonElement, enabled: boolean) {
    button.disabled = !enabled;
    button.classList.toggle('is-disabled', !enabled);
    button.setAttribute('aria-disabled', (!enabled).toString());
  }

  flexRow(opts: FlexRowOptions = {}) {
    const row = document.createElement('div');
    row.className = ['qmm-flex', opts.className || ''].filter(Boolean).join(' ').trim();
    row.style.display = 'flex';
    row.style.alignItems = this.mapAlign(opts.align ?? 'center');
    row.style.justifyContent = this.mapJustify(opts.justify ?? 'start');
    row.style.gap = `${opts.gap ?? 8}px`;
    row.style.flexWrap = opts.wrap === false ? 'nowrap' : 'wrap';
    if (opts.fullWidth) row.style.width = '100%';
    return row;
  }

  formGrid(opts: FormGridOptions = {}) {
    const grid = document.createElement('div');
    grid.className = 'qmm-form-grid';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = opts.columns || 'max-content 1fr';
    grid.style.columnGap = `${opts.columnGap ?? 8}px`;
    grid.style.rowGap = `${opts.rowGap ?? 8}px`;
    grid.style.alignItems = opts.align ? opts.align : 'center';
    return grid;
  }

  formRow(labelText: string, control: HTMLElement, opts: FormRowOptions = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'qmm-form-row';
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = `${opts.labelWidth || '160px'} 1fr`;
    wrap.style.columnGap = `${opts.gap ?? 10}px`;
    wrap.style.alignItems = opts.alignTop ? 'start' : 'center';
    if (opts.wrap) wrap.classList.add('is-wrap');

    const lab = this.label(labelText);
    lab.classList.add('qmm-form-row__label');
    lab.style.margin = '0';
    lab.style.justifySelf = 'start';
    if (opts.alignTop) lab.style.alignSelf = 'start';

    wrap.append(lab, control);
    return { root: wrap, label: lab };
  }

  card(title: string, opts: CardOptions = {}) {
    const root = document.createElement('div');
    root.className = 'qmm-card';
    root.dataset.tone = opts.tone || 'default';
    if (opts.align === 'center') root.classList.add('is-center');
    if (opts.align === 'stretch') root.classList.add('is-stretch');
    if (opts.padding) root.style.padding = opts.padding;
    if (opts.gap != null) root.style.gap = `${opts.gap}px`;
    if (opts.maxWidth) {
      const max = typeof opts.maxWidth === 'number' ? `${opts.maxWidth}px` : opts.maxWidth;
      root.style.width = `min(${max}, 100%)`;
    }

    const header = document.createElement('div');
    header.className = 'qmm-card__header';
    if (opts.compactHeader) header.classList.add('is-compact');

    const titleWrap = document.createElement('div');
    titleWrap.className = 'qmm-card__title';
    titleWrap.textContent = title;

    if (opts.icon) {
      const icon = typeof opts.icon === 'string' ? document.createElement('span') : opts.icon;
      if (typeof opts.icon === 'string' && icon) icon.textContent = opts.icon;
      if (icon) {
        icon.classList.add('qmm-card__icon');
        header.appendChild(icon);
      }
    }

    header.appendChild(titleWrap);

    if (opts.subtitle || opts.description) {
      const sub = document.createElement('div');
      sub.className = 'qmm-card__subtitle';
      sub.textContent = opts.subtitle || opts.description || '';
      header.appendChild(sub);
    }

    if (opts.actions?.length) {
      const actions = document.createElement('div');
      actions.className = 'qmm-card__actions';
      opts.actions.forEach(a => actions.appendChild(a));
      header.appendChild(actions);
    }

    const body = document.createElement('div');
    body.className = 'qmm-card__body';

    root.append(header, body);

    return {
      root,
      header,
      body,
      setTitle(next: string) { titleWrap.textContent = next; },
    };
  }

  toggleChip(labelText: string, opts: ToggleChipOptions = {}) {
    const wrap = document.createElement('label');
    wrap.className = 'qmm-chip-toggle';
    if (opts.tooltip) wrap.title = opts.tooltip;

    const input = document.createElement('input');
    input.type = opts.type || 'checkbox';
    if (opts.name) input.name = opts.name;
    if (opts.value) input.value = opts.value;
    input.checked = !!opts.checked;

    const face = document.createElement('div');
    face.className = 'qmm-chip-toggle__face';

    if (opts.icon) {
      const icon = typeof opts.icon === 'string' ? document.createElement('span') : opts.icon;
      if (typeof opts.icon === 'string' && icon) icon.textContent = opts.icon;
      if (icon) {
        icon.classList.add('qmm-chip-toggle__icon');
        face.appendChild(icon);
      }
    }

    const labelEl = document.createElement('span');
    labelEl.className = 'qmm-chip-toggle__label';
    labelEl.textContent = labelText;
    face.appendChild(labelEl);

    if (opts.description) {
      const desc = document.createElement('span');
      desc.className = 'qmm-chip-toggle__desc';
      desc.textContent = opts.description;
      face.appendChild(desc);
    }

    if (opts.badge) {
      const badge = document.createElement('span');
      badge.className = 'qmm-chip-toggle__badge';
      badge.textContent = opts.badge;
      face.appendChild(badge);
    }

    wrap.append(input, face);

    return { root: wrap, input, label: labelEl };
  }

  select(opts: SelectOptions = {}) {
    const sel = document.createElement('select');
    sel.className = 'qmm-input qmm-select';
    if (opts.id) sel.id = opts.id;
    if (opts.width) sel.style.minWidth = opts.width;
    if (opts.placeholder) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = opts.placeholder;
      opt.disabled = true;
      opt.selected = true;
      sel.appendChild(opt);
    }
    return sel;
  }

  errorBar(): ErrorBarHandle {
    const el = document.createElement('div');
    el.className = 'qmm-error';
    el.style.display = 'none';
    return {
      el,
      show(message: string) {
        el.textContent = message;
        el.style.display = 'block';
      },
      clear() {
        el.textContent = '';
        el.style.display = 'none';
      },
    };
  }

  private mapAlign(al: "start" | "center" | "end" | "stretch") {
    if (al === 'start') return 'flex-start';
    if (al === 'end') return 'flex-end';
    if (al === 'stretch') return 'stretch';
    return 'center';
  }

  private mapJustify(j: "start" | "center" | "end" | "between" | "around") {
    if (j === 'center') return 'center';
    if (j === 'end') return 'flex-end';
    if (j === 'between') return 'space-between';
    if (j === 'around') return 'space-around';
    return 'flex-start';
  }
  label(text: string) {
    const l = el('label', 'qmm-label');
    l.textContent = text;
    return l;
  }
  row(...children: HTMLElement[]) {
    const r = el('div', 'qmm-row'); children.forEach(c => r.appendChild(c)); return r;
  }
  section(title: string) {
    const s = el('div', 'qmm-section');
    s.appendChild(el('div', 'qmm-section-title', escapeHtml(title)));
    return s;
  }

inputNumber(min = 0, max = 9999, step = 1, value = 0) {
  // wrapper horizontal: [ input ][ pile up/down ]
  const wrap = el('div', 'qmm-input-number'); 

  const i = el('input', 'qmm-input qmm-input-number-input') as HTMLInputElement;
  i.type = 'number';
  i.min  = String(min);
  i.max  = String(max);
  i.step = String(step);
  i.value = String(value);
  i.inputMode = 'numeric';

  // pile verticale à droite (séparée du champ)
  const spin = el('div', 'qmm-spin');
  const up   = el('button', 'qmm-step qmm-step--up',   '▲') as HTMLButtonElement;
  const down = el('button', 'qmm-step qmm-step--down', '▼') as HTMLButtonElement;
  up.type = down.type = 'button';

  const clamp = () => {
    const n = Number(i.value);
    if (Number.isFinite(n)) {
      const lo = Number(i.min), hi = Number(i.max);
      const clamped = Math.max(lo, Math.min(hi, n));
      if (clamped !== n) i.value = String(clamped);
    }
  };
  const bump = (dir: 1 | -1) => {
    if (dir < 0) i.stepDown(); else i.stepUp();
    clamp();
    i.dispatchEvent(new Event('input',  { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
  };

  // tap = ±1, appui long = auto-repeat
  const addSpin = (btn: HTMLButtonElement, dir: 1 | -1) => {
    let pressTimer: number | null = null;
    let repeatTimer: number | null = null;
    let suppressNextClick = false;

    const start = (ev: PointerEvent) => {
      suppressNextClick = false;
      pressTimer = window.setTimeout(() => {
        suppressNextClick = true;
        bump(dir);
        repeatTimer = window.setInterval(() => bump(dir), 60);
      }, 300);
      btn.setPointerCapture?.((ev as any).pointerId);
    };
    const stop = () => {
      if (pressTimer != null)  { clearTimeout(pressTimer); pressTimer = null; }
      if (repeatTimer != null) { clearInterval(repeatTimer); repeatTimer = null; }
    };

    btn.addEventListener('pointerdown', start);
    ['pointerup','pointercancel','pointerleave','blur'].forEach(ev =>
      btn.addEventListener(ev, stop)
    );
    btn.addEventListener('click', (e) => {
      if (suppressNextClick) { e.preventDefault(); e.stopPropagation(); suppressNextClick = false; return; }
      bump(dir);
    });
  };

  addSpin(up, +1);
  addSpin(down, -1);
  i.addEventListener('change', clamp);

  spin.append(up, down);
  wrap.append(i, spin);

  // API compatible: on retourne l’<input>, mais on expose le wrapper
  (i as any).wrap = wrap;
  return i;
}

  inputText(placeholder = '', value = '') {
    const i = el('input', 'qmm-input') as HTMLInputElement;
    i.type = 'text'; i.placeholder = placeholder; i.value = value;
    return i;
  }
  
  checkbox(checked = false) {
    const i = el('input', 'qmm-check') as HTMLInputElement;
    i.type = 'checkbox'; i.checked = checked;
    return i;
  }
  radio(name: string, value: string, checked = false) {
    const i = el('input', 'qmm-radio') as HTMLInputElement;
    i.type = 'radio'; i.name = name; i.value = value; i.checked = checked;
    return i;
  }
  slider(min = 0, max = 100, step = 1, value = 0) {
    const i = el('input', 'qmm-range') as HTMLInputElement;
    i.type = 'range'; i.min = String(min); i.max = String(max); i.step = String(step); i.value = String(value);
    return i;
  }

  rangeDual(min = 0, max = 100, step = 1, valueMin = min, valueMax = max): RangeDualHandle {
    const wrap = el('div', 'qmm-range-dual');
    const track = el('div', 'qmm-range-dual-track');
    const fill = el('div', 'qmm-range-dual-fill');
    track.appendChild(fill);
    wrap.appendChild(track);

    const createHandle = (value: number, extraClass: string) => {
      const input = this.slider(min, max, step, value);
      input.classList.add('qmm-range-dual-input', extraClass);
      wrap.appendChild(input);
      return input;
    };

    const minInput = createHandle(valueMin, 'qmm-range-dual-input--min');
    const maxInput = createHandle(valueMax, 'qmm-range-dual-input--max');

    const updateFill = () => {
      const minValue = Number(minInput.value);
      const maxValue = Number(maxInput.value);
      const total = max - min;
      if (!Number.isFinite(total) || total <= 0) {
        fill.style.left = '0%';
        fill.style.right = '100%';
        return;
      }
      const clampPercent = (value: number) => Math.max(0, Math.min(100, value));
      const start = ((Math.min(minValue, maxValue) - min) / total) * 100;
      const end = ((Math.max(minValue, maxValue) - min) / total) * 100;
      fill.style.left = `${clampPercent(start)}%`;
      fill.style.right = `${clampPercent(100 - end)}%`;
    };

    minInput.addEventListener('input', updateFill);
    maxInput.addEventListener('input', updateFill);

    const handle: RangeDualHandle = {
      root: wrap,
      min: minInput,
      max: maxInput,
      setValues(minValue: number, maxValue: number) {
        minInput.value = String(minValue);
        maxInput.value = String(maxValue);
        updateFill();
      },
      refresh: updateFill,
    };

    handle.refresh();
    return handle;
  }

  switch(checked = false) {
    const i = this.checkbox(checked);
    i.classList.add("qmm-switch");
    return i;
  }

  // Helpers “tableau simple” pour lister les items
  table(
    headers: (string | { label: string; align?: "left" | "center" | "right"; width?: string })[],
    opts?: { minimal?: boolean; compact?: boolean; maxHeight?: string; fixed?: boolean }
  ) {
    const wrap = document.createElement("div");
    wrap.className = "qmm-table-wrap";
    if (opts?.minimal) wrap.classList.add("qmm-table-wrap--minimal");

    // scroller pour limiter la hauteur proprement
    const scroller = document.createElement("div");
    scroller.className = "qmm-table-scroll";
    if (opts?.maxHeight) scroller.style.maxHeight = opts.maxHeight;
    wrap.appendChild(scroller);

    const t = document.createElement("table");
    t.className = "qmm-table";
    if (opts?.minimal) t.classList.add("qmm-table--minimal");
    if (opts?.compact) t.classList.add("qmm-table--compact");
    if (opts?.fixed) t.style.tableLayout = "fixed"; // permet d'utiliser les widths de th

    const thead = document.createElement("thead");
    const trh = document.createElement("tr");

    (headers as any[]).forEach(h => {
      const th = document.createElement("th");
      if (typeof h === "string") {
        th.textContent = h;
      } else {
        th.textContent = h.label ?? "";
        if (h.align) th.classList.add(`is-${h.align}`);
        if (h.width)  th.style.width = h.width;
      }
      trh.appendChild(th);
    });

    thead.appendChild(trh);
    const tbody = document.createElement("tbody");

    t.append(thead, tbody);
    scroller.appendChild(t);

    return { root: wrap, tbody };
  }

  segmented<T extends string>(
  items: Array<{ value: T; label: string; disabled?: boolean }>,
  selected: T,
  onChange?: (val: T) => void,
  opts?: { fullWidth?: boolean; id?: string; ariaLabel?: string }
) {
  const root = document.createElement("div");
  root.className = "qmm-seg";
  if (opts?.fullWidth) root.classList.add("qmm-seg--full");
  if (opts?.id) root.id = opts.id;
  root.setAttribute("role", "radiogroup");
  if (opts?.ariaLabel) root.setAttribute("aria-label", opts.ariaLabel);

  const rail = document.createElement("div");
  rail.className = "qmm-seg__indicator";
  root.appendChild(rail);

  const reduceMotionQuery =
    typeof window !== "undefined" && "matchMedia" in window
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
  const canAnimateIndicator = typeof rail.animate === "function";
  if (canAnimateIndicator) {
    rail.style.transition = "none";
  }

  let indicatorMetrics: { left: number; width: number } | null = null;
  let indicatorAnimation: Animation | null = null;

  const applyIndicatorStyles = (left: number, width: number) => {
    rail.style.transform = `translate3d(${left}px,0,0)`;
    rail.style.width = `${width}px`;
  };

  const cancelIndicatorAnimation = () => {
    if (!indicatorAnimation) return;
    indicatorAnimation.cancel();
    indicatorAnimation = null;
  };

  let value: T = selected;
  const btns: HTMLButtonElement[] = [];

  const setSelected = (v: T, focus = false) => {
    if (v === value) {
      if (focus) {
        const alreadyActive = btns.find(b => b.dataset.value === v);
        alreadyActive?.focus();
      }
      onChange?.(value);
      return;
    }
    value = v;
    for (const b of btns) {
      const active = b.dataset.value === v;
      b.setAttribute("aria-checked", active ? "true" : "false");
      b.tabIndex = active ? 0 : -1;
      b.classList.toggle("active", active);
      if (active && focus) b.focus();
    }
    moveIndicator(true);
    onChange?.(value);
  };

  const moveIndicator = (animate = false) => {
    const active = btns.find(b => b.dataset.value === value);
    if (!active) return;

    const i = btns.indexOf(active);
    const n = btns.length;

    const cs    = getComputedStyle(root);
    const gap   = parseFloat(cs.gap || cs.columnGap || "0") || 0;
    const bL    = parseFloat(cs.borderLeftWidth  || "0") || 0;
    const bR    = parseFloat(cs.borderRightWidth || "0") || 0;

    // Mesures en sub-pixels
    const rRoot = root.getBoundingClientRect();
    const rBtn  = active.getBoundingClientRect();

    // left/width relatifs à la *padding box* du conteneur
    let left   = (rBtn.left  - rRoot.left) - bL;
    let width  =  rBtn.width;
    const padW =  rRoot.width - bL - bR; // largeur interne (sans bordures)

    if (n === 1) {
      // un seul segment → couvrir toute la padding box
      left = 0;
      width = padW;
    } else if (i === 0) {
      // premier → inclure demi gap à droite + padding gauche
      const rightEdge = left + width + gap / 2;
      left = 0;
      width = rightEdge - left;
    } else if (i === n - 1) {
      // dernier → demi gap à gauche + padding droit
      left  = left - gap / 2;
      width = padW - left;
    } else {
      // milieu → demi gap de chaque côté
      left  = left  - gap / 2;
      width = width + gap;
    }

    // Snap au device pixel pour tuer le 1px ghosting
    const dpr  = window.devicePixelRatio || 1;
    const snap = (x: number) => Math.round(x * dpr) / dpr;

    const targetLeft = snap(left);
    const targetWidth = snap(width);

    const previous = indicatorMetrics;
    indicatorMetrics = { left: targetLeft, width: targetWidth };

    const applyFinal = () => applyIndicatorStyles(targetLeft, targetWidth);

    const shouldAnimate =
      animate &&
      canAnimateIndicator &&
      !reduceMotionQuery?.matches &&
      previous != null &&
      previous.width > 0 &&
      Number.isFinite(previous.width) &&
      targetWidth > 0 &&
      Number.isFinite(targetWidth);

    if (!shouldAnimate) {
      cancelIndicatorAnimation();
      applyFinal();
      return;
    }

    cancelIndicatorAnimation();
    applyIndicatorStyles(previous.left, previous.width);

    indicatorAnimation = rail.animate(
      [
        {
          transform: `translate3d(${previous.left}px,0,0)`,
          width: `${previous.width}px`,
          opacity: 0.92,
          offset: 0,
        },
        {
          transform: `translate3d(${targetLeft}px,0,0)`,
          width: `${targetWidth}px`,
          opacity: 1,
          offset: 1,
        },
      ],
      {
        duration: 260,
        easing: "cubic-bezier(.22,.7,.28,1)",
        fill: "forwards",
      }
    );

    const finalize = () => {
      applyFinal();
      indicatorAnimation = null;
    };

    indicatorAnimation.addEventListener("finish", finalize, { once: true });
    indicatorAnimation.addEventListener("cancel", finalize, { once: true });
  };



  items.forEach(({ value: v, label, disabled }) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "qmm-seg__btn";
    b.dataset.value = String(v);
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", v === selected ? "true" : "false");
    b.tabIndex = v === selected ? 0 : -1;
    b.disabled = !!disabled;

    const labelSpan = document.createElement("span");
    labelSpan.className = "qmm-seg__btn-label";
    labelSpan.textContent = label;            // support emoji direct dans label
    b.appendChild(labelSpan);

    b.addEventListener("click", () => {
      if (!b.disabled) setSelected(v, false);
    });

    b.addEventListener("keydown", (e) => {
      if (!["ArrowRight","ArrowLeft","Home","End"].includes(e.key)) return;
      e.preventDefault();

      const idx = items.findIndex(it => it.value === value);

      if (e.key === "Home") { setSelected(items[0].value, true); return; }
      if (e.key === "End")  { setSelected(items[items.length - 1].value, true); return; }

      const dir = e.key === "ArrowRight" ? 1 : -1;
      let j = idx;
      for (let k = 0; k < items.length; k++) {
        j = (j + dir + items.length) % items.length;
        if (!items[j].disabled) { setSelected(items[j].value, true); break; }
      }
    });


    btns.push(b);
    root.appendChild(b);
  });

  // Layout & resize
  const ro = (window as any).ResizeObserver ? new ResizeObserver(() => moveIndicator(false)) : null;
  if (ro) ro.observe(root);
  window.addEventListener("resize", () => moveIndicator(false));
  // première position après insertion dans le DOM
  queueMicrotask(() => moveIndicator(false));

  // expose petite API
  (root as any).get = () => value;
  (root as any).set = (v: T) => setSelected(v, false);

  return root;
}

  radioGroup<T extends string>(
    name: string,
    options: { value: T; label: string }[],
    selected: T | null,
    onChange: (val: T) => void
  ) {
    const wrap = el("div", "qmm-radio-group");
    for (const { value, label } of options) {
      const r = this.radio(name, value, selected === value);
      const lab = document.createElement("label");
      lab.className = "qmm-radio-label";
      lab.appendChild(r);
      lab.appendChild(document.createTextNode(label));
      r.onchange = () => {
        if (r.checked) onChange(value);
      };
      wrap.appendChild(lab);
    }
    return wrap;
  }

  /** Bind LS: sauvegarde automatique via toStr/parse */
  bindLS<T>(key: string, read: () => T, write: (v: T) => void, parse: (s: string) => T, toStr: (v: T) => string) {
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) write(parse(raw));
    } catch {}
    return { save: () => { try { localStorage.setItem(key, toStr(read())); } catch {} } };
  }

  /* -------------------------- split2 helper -------------------------- */
  /** Crée un layout 2 colonnes (gauche/droite) en CSS Grid.
   *  leftWidth: ex "200px" | "18rem" | "minmax(160px, 30%)" */
  split2(leftWidth = "260px") {
    const root = el('div', 'qmm-split');
    root.style.gridTemplateColumns = "minmax(160px, max-content) 1fr"; // pas de min-height => s’adapte
    const left = el('div', 'qmm-split-left');
    const right = el('div', 'qmm-split-right');
    root.appendChild(left);
    root.appendChild(right);
    return { root, left, right };
  }

  /* -------------------------- VTabs factory -------------------------- */
  /** Crée des “tabs verticaux” génériques (liste sélectionnable + filtre). */
  vtabs(options: VTabsOptions = {}) {
    return new VTabs(this, options);
  }

 hotkeyButton(
  initial: Hotkey | null,
  onChange?: (hk: Hotkey | null, stored?: string) => void,
  opts?: {
    storageKey?: string;
    emptyLabel?: string;
    listeningLabel?: string;
    clearable?: boolean;
    allowModifierOnly?: boolean;
  }
 ): HotkeyButtonElement {
  const emptyLabel = opts?.emptyLabel ?? "None";
  const listeningLabel = opts?.listeningLabel ?? "Press a key…";
  const clearable = opts?.clearable ?? true;
  let hk: Hotkey | null = initial ?? null;
  let recording = false;
  let recordingTimeout: number | null = null;

  if (opts?.storageKey) {
    try {
      hk = stringToHotkey(localStorage.getItem(opts.storageKey) || "") ?? initial ?? null;
    } catch {}
  }

  const btn = document.createElement("button") as HotkeyButtonElement;
  btn.type = "button";
  btn.className = "qmm-hotkey";
  btn.setAttribute("aria-live", "polite");

  const render = () => {
    btn.classList.toggle("is-recording", recording);
    btn.classList.toggle("is-empty", !hk);
    btn.classList.toggle("is-assigned", !recording && !!hk);
    if (recording) {
      btn.textContent = listeningLabel;
      btn.title = "Listening… press a key (Esc to cancel, Backspace to clear)";
    } else if (!hk) {
      btn.textContent = emptyLabel;
      btn.title = "No key assigned";
    } else {
      btn.textContent = hotkeyToPretty(hk);
      btn.title = "Click to rebind • Right-click to clear";
    }
  };

  const applyHotkey = (value: Hotkey | null, skipRender = false) => {
    hk = value ? { ...value } : null;
    if (!skipRender) render();
  };

  btn.refreshHotkey = (value: Hotkey | null) => {
    applyHotkey(value);
  };

  // Un seul bouton peut écouter à la fois, et l'écoute doit TOUJOURS s'arrêter
  // (clic ailleurs, perte de focus, menu fermé, timeout). Sans ça le listener
  // window/capture restait armé indéfiniment : la prochaine touche pressée
  // (typiquement Alt+X pour ouvrir le menu) était capturée et réassignée à
  // l'action de ce bouton, en écrasant le raccourci existant.
  const stopRecording = () => {
    if (!recording) return;
    recording = false;
    if (activeHotkeyRecorder === stopRecording) activeHotkeyRecorder = null;
    window.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("pointerdown", handlePointerDown, true);
    window.removeEventListener("blur", handleWindowBlur);
    if (recordingTimeout !== null) {
      clearTimeout(recordingTimeout);
      recordingTimeout = null;
    }
    endKeybindCapture();
    render();
  };

  const startRecording = () => {
    if (recording) return;
    activeHotkeyRecorder?.();
    recording = true;
    activeHotkeyRecorder = stopRecording;
    beginKeybindCapture();
    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    // Sans capture : seul le blur de la fenêtre remonte ici, pas celui des éléments
    // (btn.focus() ci-dessous en déclencherait un et annulerait aussitôt l'écoute).
    window.addEventListener("blur", handleWindowBlur);
    recordingTimeout = window.setTimeout(stopRecording, HOTKEY_RECORDING_TIMEOUT_MS);
    render();
  };

  const save = () => {
    if (opts?.storageKey) {
      const str = hotkeyToString(hk);
      try {
        if (str) localStorage.setItem(opts.storageKey, str);
        else     localStorage.removeItem(opts.storageKey);
      } catch {}
    }
    onChange?.(hk, opts?.storageKey ? hotkeyToString(hk) : undefined);
  };

  const handlePointerDown = (e: Event) => {
    if (e.target instanceof Node && btn.contains(e.target)) return;
    stopRecording();
  };

  const handleWindowBlur = (e: Event) => {
    if (e.target !== window) return;
    stopRecording();
  };

  function handleKeyDown(e: KeyboardEvent): void {
    if (!recording) return;
    // Le bouton a été retiré du DOM (menu fermé/re-rendu) pendant l'écoute :
    // on abandonne au lieu d'assigner la touche à une action invisible.
    if (!btn.isConnected) {
      stopRecording();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") { // annuler
      stopRecording();
      return;
    }
    if ((e.key === "Backspace" || e.key === "Delete") && clearable) { // effacer
      applyHotkey(null, true);
      save();
      stopRecording();
      return;
    }
    const next = eventToHotkey(e, opts?.allowModifierOnly ?? false);
    if (!next) {
      // si modif seul, on attend la vraie touche
      return;
    }
    applyHotkey(next, true);
    save();
    stopRecording();
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    if (recording) {
      stopRecording();
      return;
    }
    startRecording();
    // petit trick: focus visuel seulement en mode recording (déjà géré par .is-recording)
    btn.focus();
  });

  if (clearable) {
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (hk) {
        applyHotkey(null, true); save(); render();
      }
    });
  }

  render();
  return btn;
}

  // ---------- internes ----------

  private createTabView(id: string, def: TabDef) {
    // bouton avec label + badge
    const b = document.createElement('button');
    b.className = 'qmm-tab';
    b.dataset.id = id;
    b.innerHTML = `<span class="label">${escapeHtml(def.title)}</span><span class="badge" style="display:none"></span>`;
    const badgeEl = b.querySelector('.badge') as HTMLElement;
    def.btn = b; def.badge = badgeEl;

    b.onclick = () => this.switchTo(id);
    this.tabBar.appendChild(b);

    // vue
    const view = el('div', 'qmm-view') as HTMLDivElement;
    view.dataset.id = id;
    def.view = view;
    this.views.appendChild(view);

    // appel render
    try { def.render(view, this); } catch (e) { view.textContent = String(e); }

    // activer par défaut si aucune sélection
    if (!this.currentId) this.switchTo(id);
  }

  private persistActive() {
    if (!this.currentId) return;
    try {
      writeAriesPath(`menu.activeTabs.${this.menuId}`, this.currentId);
      try { localStorage.removeItem(this.lsKeyActive); } catch {}
    } catch {}
  }
  private restoreActive() {
    let id: string | null = null;
    try {
      const stored = readAriesPath<string>(`menu.activeTabs.${this.menuId}`);
      if (typeof stored === "string" && stored) id = stored;
    } catch {}
    try { id = localStorage.getItem(this.lsKeyActive); } catch {}
    if (id && this.tabs.has(id)) this.switchTo(id);
    else if (this.tabs.size) this.switchTo(this.firstTabId());
  }

  private updateTabsBarVisibility() {
    if (!this.tabBar || !this.root) return;
    const hasTabs = this.tabs.size > 0;

    if (hasTabs) {
        // s'assurer que la barre d’onglets est présente AVANT .qmm-views
        if (!this.tabBar.parentElement) {
        this.root.insertBefore(this.tabBar, this.views);
        }
        this.tabBar.style.display = 'flex';
        this.root.classList.remove('qmm-no-tabs');
    } else {
        // la retirer complètement du DOM pour éviter tout espace résiduel
        if (this.tabBar.parentElement) {
        this.tabBar.parentElement.removeChild(this.tabBar);
        }
        this.root.classList.add('qmm-no-tabs');
    }
    }


  private ensureStyles() {
    if (document.getElementById('__qmm_css__')) return;
    const css = `
    /* ================= Modern UI for qmm ================= */
.qmm{
  --qmm-bg:        #0a0e14;
  --qmm-bg-soft:   #080c12;
  --qmm-panel:     rgba(10,14,20,0.96);
  --qmm-border:    rgba(255,255,255,0.14);
  --qmm-border-2:  rgba(255,255,255,0.08);
  --qmm-accent:    #5eead4;
  --qmm-accent-2:  #2dd4bf;
  --qmm-text:      #e7eef7;
  --qmm-text-dim:  #b9c3cf;
  --qmm-shadow:    0 18px 44px rgba(0,0,0,.45);
  --qmm-blur:      10px;

  display:flex; flex-direction:column; gap:10px; color:var(--qmm-text);
}
.qmm-compact{ gap:6px }

/* ---------- Tabs (pill nav) ---------- */
.qmm-tabs{
  display:flex; gap:4px; flex-wrap:wrap; align-items:center;
  padding:8px 10px; position:relative; isolation:isolate;
  border-bottom:1px solid rgba(255,255,255,0.08);
  background:linear-gradient(120deg, rgba(22,28,40,0.9), rgba(12,17,26,0.92));
  border-top-left-radius:18px; border-top-right-radius:18px;
}
.qmm-no-tabs .qmm-views{ margin-top:0; border-radius:18px; }

.qmm-tab{
  flex:1 1 0; min-width:0; cursor:pointer;
  display:inline-flex; justify-content:center; align-items:center; gap:8px;
  padding:8px 12px; color:#c9d4e6;
  background:transparent; border:1px solid transparent;
  border-radius:12px;
  position:relative; margin:0;
  font-size:12px;
  transition:background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.qmm-compact .qmm-tab{ padding:6px 10px }
.qmm-tab:hover{ background:rgba(94,234,212,0.08); color:#e7eef7; }
.qmm-tab:active{ transform:translateY(1px) }
.qmm-tab:focus-visible{ outline:2px solid var(--qmm-accent); outline-offset:2px; border-radius:12px }

.qmm-tab .badge{
  font-size:11px; line-height:1; padding:2px 6px; border-radius:999px;
  background:rgba(94,234,212,0.12); border:1px solid rgba(94,234,212,0.25);
  color:#5eead4;
}

.qmm-tab.active{
  background:rgba(94,234,212,0.18);
  border-color:rgba(94,234,212,0.35);
  color:#ecfdf5;
}

/* ---------- Views panel ---------- */
.qmm-views{
  border:1px solid rgba(255,255,255,0.14); border-radius:18px; padding:14px;
  background:linear-gradient(160deg, rgba(15,20,30,0.95) 0%, rgba(10,14,20,0.95) 60%, rgba(8,12,18,0.96) 100%);
  backdrop-filter:blur(10px);
  display:flex; flex-direction:column;
  min-width:0; min-height:0; overflow:auto; box-shadow:0 18px 44px rgba(0,0,0,.45);
  scrollbar-width:thin;
  scrollbar-color:rgba(94,234,212,0.20) rgba(255,255,255,0.03);
}
.qmm-views::-webkit-scrollbar{ width:8px; }
.qmm-views::-webkit-scrollbar-track{ background:rgba(255,255,255,0.03); border-radius:4px; }
.qmm-views::-webkit-scrollbar-thumb{ background:rgba(94,234,212,0.20); border-radius:4px; }
.qmm-views::-webkit-scrollbar-thumb:hover{ background:rgba(94,234,212,0.35); }
.qmm-compact .qmm-views{ padding:8px }
.qmm-tabs + .qmm-views{ margin-top:0; border-top:none; border-top-left-radius:0; border-top-right-radius:0; }

.qmm-view{ display:none; min-width:0; min-height:0; }
.qmm-view.active{ display:block; }

/* ---------- Basic controls ---------- */
.qmm-row{ display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin:6px 0 }
.qmm-section{ margin-top:8px }
.qmm-section-title{ font-weight:650; margin:2px 0 8px 0; color:var(--qmm-text) }

.qmm-label{ opacity:.9 }
.qmm-val{ min-width:24px; text-align:center }

/* Buttons */
.qmm-btn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  padding:8px 14px;
  border-radius:10px;
  border:1px solid var(--qmm-border);
  background:linear-gradient(180deg, rgba(255,255,255,.08), rgba(255,255,255,.02));
  color:var(--qmm-text);
  font-weight:600;
  font-size:13px;
  line-height:1.2;
  cursor:pointer;
  user-select:none;
  transition:background 120ms ease, border-color 120ms ease, transform 100ms ease, box-shadow 120ms ease, color 120ms ease;
}
.qmm-compact .qmm-btn{ padding:6px 10px }
.qmm-btn:hover{ background:linear-gradient(180deg, rgba(255,255,255,.12), rgba(255,255,255,.04)); border-color:rgba(255,255,255,0.24) }
.qmm-btn:active{ transform:translateY(1px) }
.qmm-btn:focus-visible{ outline:2px solid var(--qmm-accent); outline-offset:2px; }
.qmm-btn:disabled,
.qmm-btn.is-disabled{
  opacity:.55;
  cursor:not-allowed;
  filter:saturate(.6);
  box-shadow:none;
}
.qmm-btn--full{ width:100%; justify-content:center; }
.qmm-btn--sm{ padding:6px 10px; font-size:12px; border-radius:8px; }
.qmm-btn--icon{ padding:6px; width:34px; height:34px; border-radius:50%; gap:0; }
.qmm-btn__icon{ display:inline-flex; align-items:center; justify-content:center; font-size:1.1em; }
.qmm-btn__icon.is-right{ order:2; }
.qmm-btn__icon.is-left{ order:0; }

/* Button variants */
.qmm-btn--primary,
.qmm-btn.qmm-primary{
  background:linear-gradient(180deg, rgba(94,234,212,.32), rgba(45,212,191,.14));
  border-color:rgba(94,234,212,0.45);
  box-shadow:0 4px 14px rgba(94,234,212,.18);
}
.qmm-btn--primary:hover,
.qmm-btn.qmm-primary:hover{ border-color:rgba(94,234,212,0.65); background:linear-gradient(180deg, rgba(94,234,212,.42), rgba(45,212,191,.22)); }
.qmm-btn--secondary{
  background:linear-gradient(180deg, rgba(255,255,255,.05), rgba(255,255,255,.01));
}
.qmm-btn--danger,
.qmm-btn.qmm-danger{
  background:linear-gradient(180deg, rgba(255,86,86,.32), rgba(255,86,86,.14));
  border-color:#ff6a6a55;
  box-shadow:0 4px 14px rgba(255,86,86,.25);
}
.qmm-btn--ghost{ background:transparent; border-color:transparent; }
.qmm-btn--ghost:hover{ background:rgba(255,255,255,.06); border-color:#ffffff2a; }
.qmm-btn.active{
  background:rgba(94,234,212,0.14);
  border-color:rgba(94,234,212,0.40);
  box-shadow:inset 0 0 0 1px rgba(94,234,212,0.20);
}

.qmm-flex{ display:flex; flex-wrap:wrap; gap:8px; align-items:center; }

.qmm-form-grid{ width:100%; }

.qmm-form-row{ width:100%; }
.qmm-form-row.is-wrap{ grid-template-columns:1fr; }
.qmm-form-row__label{ font-weight:600; opacity:.9; }

.qmm-card{
  display:grid;
  gap:12px;
  border:1px solid rgba(255,255,255,0.12);
  border-radius:14px;
  padding:14px;
  background:linear-gradient(160deg, rgba(18,24,34,0.95), rgba(12,17,26,0.96));
  backdrop-filter:blur(10px);
  box-shadow:0 8px 24px rgba(0,0,0,.35);
  width:100%;
  transition:border-color 120ms ease, box-shadow 120ms ease;
}
.qmm-card.is-center{ text-align:center; align-items:center; }
.qmm-card.is-stretch{ align-items:stretch; }
.qmm-card__header{
  display:flex;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
  justify-content:space-between;
}
.qmm-card__header.is-compact{ gap:6px; }
.qmm-card__icon{ font-size:18px; }
.qmm-card__title{ font-weight:700; font-size:14px; letter-spacing:.01em; }
.qmm-card__subtitle{ font-size:12px; opacity:.75; flex-basis:100%; }
.qmm-card__actions{ display:flex; gap:6px; margin-left:auto; }
.qmm-card__body{ display:grid; gap:10px; }
.qmm-card[data-tone="muted"]{
  background:rgba(10,14,20,.92);
  border-color:rgba(255,255,255,0.08);
  box-shadow:none;
}
.qmm-card[data-tone="accent"]{
  border-color:rgba(94,234,212,0.45);
  box-shadow:0 10px 26px rgba(94,234,212,.15);
}

.qmm .stats-collapse-toggle{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  padding:6px 12px;
  min-height:32px;
  border-radius:999px;
  border:1px solid rgba(94,234,212,.40);
  background:linear-gradient(135deg, rgba(94,234,212,.14), rgba(15,30,30,.18));
  color:rgba(220,240,236,.92);
  font-size:12px;
  font-weight:600;
  letter-spacing:.01em;
  text-transform:uppercase;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12), 0 10px 24px rgba(9,13,27,.28);
  transition:background .26s ease, border-color .26s ease, box-shadow .26s ease, color .26s ease, transform .16s ease;
}
.qmm .stats-collapse-toggle:hover{
  background:linear-gradient(135deg, rgba(94,234,212,.22), rgba(20,100,90,.22));
  border-color:rgba(94,234,212,.55);
  color:#fff;
  box-shadow:0 14px 30px rgba(45,212,191,.25), inset 0 1px 0 rgba(255,255,255,.18);
}
.qmm .stats-collapse-toggle:active{
  transform:translateY(1px) scale(.99);
}
.qmm-card--collapsible[data-collapsed="true"] .stats-collapse-toggle{
  background:linear-gradient(135deg, rgba(94,234,212,.08), rgba(8,30,28,.12));
  border-color:rgba(94,234,212,.25);
  color:rgba(196,240,236,.85);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.1), 0 6px 18px rgba(9,13,27,.22);
}
.qmm-card--collapsible[data-collapsed="false"] .stats-collapse-toggle{
  background:linear-gradient(135deg, rgba(94,234,212,.30), rgba(45,212,191,.25));
  border-color:rgba(94,234,212,.72);
  color:#fff;
  box-shadow:0 16px 32px rgba(45,212,191,.28), inset 0 1px 0 rgba(255,255,255,.22);
}
.qmm .stats-collapse-toggle__icon{
  width:16px;
  height:16px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  position:relative;
  color:inherit;
  transition:transform .24s ease;
}
.qmm .stats-collapse-toggle__icon::before{
  content:"";
  position:absolute;
  width:8px;
  height:8px;
  border-right:2px solid currentColor;
  border-bottom:2px solid currentColor;
  transform:rotate(45deg);
  transition:transform .24s ease;
}
.qmm .stats-collapse-toggle__label{
  color:inherit;
  font-size:11px;
  letter-spacing:.08em;
  font-weight:700;
}
.qmm-card--collapsible[data-collapsed="false"] .stats-collapse-toggle__icon::before{
  transform:rotate(-135deg);
}
.qmm-card--collapsible[data-collapsed="true"] .stats-collapse-toggle__icon::before{
  transform:rotate(45deg);
}

.qmm-chip-toggle{
  display:inline-flex;
  align-items:stretch;
  border-radius:999px;
  border:1px solid #ffffff1f;
  background:rgba(255,255,255,.05);
  cursor:pointer;
  transition:border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .1s ease;
}
.qmm-chip-toggle input{ display:none; }
.qmm-chip-toggle__face{
  display:flex;
  align-items:center;
  gap:8px;
  padding:6px 12px;
  border-radius:999px;
}
.qmm-chip-toggle__icon{ font-size:14px; }
.qmm-chip-toggle__label{ font-weight:600; }
.qmm-chip-toggle__desc{ font-size:12px; opacity:.75; }
.qmm-chip-toggle__badge{ font-size:11px; padding:2px 6px; border-radius:999px; background:#ffffff1a; border:1px solid #ffffff22; }
.qmm-chip-toggle:hover{ border-color:rgba(94,234,212,0.30); background:rgba(94,234,212,0.09); }
.qmm-chip-toggle input:checked + .qmm-chip-toggle__face{
  background:linear-gradient(180deg, rgba(94,234,212,.22), rgba(94,234,212,.08));
  box-shadow:0 0 0 1px rgba(94,234,212,0.35) inset, 0 6px 18px rgba(94,234,212,.15);
}

.qmm .stats-metric-grid{
  display:grid;
  gap:10px;
  grid-template-columns:repeat(auto-fit, minmax(160px, 1fr));
}
.qmm .stats-metric{
  border-radius:12px;
  padding:12px 14px;
  background:linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02));
  border:1px solid rgba(255,255,255,.08);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08);
  display:flex;
  flex-direction:column;
  gap:6px;
  transition:border-color .18s ease, background .18s ease, transform .14s ease;
}
.qmm .stats-metric:hover{
  border-color:rgba(94,234,212,0.30);
  background:linear-gradient(180deg, rgba(94,234,212,.14), rgba(94,234,212,.06));
  transform:translateY(-1px);
}
.qmm .stats-metric__label{
  font-size:12px;
  letter-spacing:.02em;
  text-transform:uppercase;
  color:var(--qmm-text-dim);
}
.qmm .stats-metric__value{
  font-size:20px;
  font-weight:700;
  color:#fff;
}

.qmm .stats-list{
  display:flex;
  flex-direction:column;
  gap:6px;
}
.qmm .stats-list__row{
  display:grid;
  align-items:center;
  gap:10px;
  padding:10px 12px;
  border-radius:10px;
  background:rgba(255,255,255,.035);
  border:1px solid rgba(255,255,255,.08);
  transition:border-color .18s ease, background .18s ease;
}
.qmm .stats-list__row:not(.stats-list__row--header):hover{
  background:rgba(94,234,212,0.09);
  border-color:rgba(94,234,212,0.28);
}
.qmm .stats-list__row--header{
  background:transparent;
  border:none;
  padding:0 6px 2px 6px;
  font-size:11px;
  letter-spacing:.05em;
  text-transform:uppercase;
  color:var(--qmm-text-dim);
}
.qmm .stats-list__row--header .stats-list__cell{
  font-weight:600;
}
.qmm .stats-list__header-label--gold,
.qmm .stats-list__header-label--rainbow{
  display:inline-block;
}
.qmm .stats-list__header-label--gold{
  color:#f7d774;
  background:linear-gradient(135deg,#fff5c0 0%,#f3c76a 55%,#f5b84f 100%);
  background-clip:text;
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  text-shadow:0 1px 4px rgba(0,0,0,.35);
}
.qmm .stats-list__header-label--rainbow{
  color:#ffd6ff;
  background:linear-gradient(90deg,#ff6b6b 0%,#ffd86f 25%,#6bff8f 50%,#6bc7ff 75%,#b86bff 100%);
  background-clip:text;
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
  text-shadow:0 1px 4px rgba(0,0,0,.35);
}
.qmm .stats-list__cell{
  min-width:0;
  font-size:13px;
}
.qmm .stats-pet__species{
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-width:0;
}
.qmm .stats-pet__label{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.qmm .stats-pet__total-label{
  font-weight:700;
}
.qmm .stats-pet__total-value{
  font-weight:700;
}
.qmm .stats-weather__name{
  display:inline-flex;
  align-items:center;
  gap:8px;
  min-width:0;
}
.qmm .stats-weather__icon{
  width:32px;
  height:32px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  border-radius:6px;
  background:rgba(255,255,255,.08);
  overflow:hidden;
  flex-shrink:0;
}
.qmm .stats-weather__icon img{
  width:100%;
  height:100%;
  object-fit:contain;
  image-rendering:pixelated;
}
.qmm .stats-weather__label{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}
.qmm .stats-list__cell--align-right{ text-align:right; }
.qmm .stats-list__cell--align-center{ text-align:center; }

.qmm .stats-pet-group{
  border:1px solid var(--stats-pet-group-border-color, rgba(255,255,255,.09));
  border-radius:12px;
  padding:10px 12px;
  background:rgba(255,255,255,.05);
  transition:border-color .18s ease, background .18s ease;
  display:flex;
  flex-direction:column;
  align-items:stretch;
  width:100%;
}
.qmm .stats-pet-group + .stats-pet-group{
  margin-top:8px;
}
.qmm .stats-pet-group__summary{
  display:flex;
  align-items:center;
  gap:6px;
  font-weight:650;
  font-size:13px;
  color:var(--qmm-text);
  margin:0;
  user-select:none;
  justify-content:center;
  text-align:center;
}
.qmm .stats-pet-group__content{
  margin-top:8px;
  display:flex;
  flex-direction:column;
  align-items:stretch;
  gap:8px;
}

.qmm-error{
  border:1px solid #ff6a6a55;
  background:rgba(120,20,20,.35);
  border-radius:10px;
  color:#ffdada;
  padding:10px;
  font-size:13px;
  line-height:1.4;
}

.qmm-select{
  background-image:linear-gradient(45deg, transparent 50%, #ffffff80 50%), linear-gradient(135deg, #ffffff80 50%, transparent 50%), linear-gradient(90deg, transparent 50%, rgba(255,255,255,.1) 50%);
  background-position:calc(100% - 18px) 50%, calc(100% - 13px) 50%, 100% 0;
  background-size:5px 5px, 5px 5px, 2.5rem 2.5rem;
  background-repeat:no-repeat;
  padding-right:34px;
}

.qmm-vlist-wrap{ display:flex; flex-direction:column; width:100%; }

/* Inputs */
.qmm-input{
  min-width:90px; background:rgba(255,255,255,0.04); color:#fff;
  border:1px solid rgba(255,255,255,0.12); border-radius:10px;
  padding:8px 10px; box-shadow:inset 0 1px 0 rgba(255,255,255,.06);
  transition:border-color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}
.qmm-input::placeholder{ color:#cbd6e780 }
.qmm-input:focus{ outline:none; border-color:var(--qmm-accent); background:rgba(8,12,20,0.9); box-shadow:0 0 0 2px rgba(94,234,212,0.20) }

/* Number input + spinner (unchanged API) */
.qmm-input-number{ display:inline-flex; align-items:center; gap:6px }
.qmm-input-number-input{ width:70px; text-align:center; padding-right:8px }
.qmm-spin{ display:inline-flex; flex-direction:column; gap:2px }
.qmm-step{
  width:22px; height:16px; font-size:11px; line-height:1;
  display:inline-flex; align-items:center; justify-content:center;
  border-radius:6px; border:1px solid var(--qmm-border);
  background:rgba(255,255,255,.08); color:#fff; cursor:pointer; user-select:none;
  transition:background .18s ease, border-color .18s ease, transform .08s ease;
}
.qmm-step:hover{ background:#ffffff18; border-color:#ffffff40 }
.qmm-step:active{ transform:translateY(1px) }

/* Switch (checkbox) */
.qmm-switch{
  appearance:none; width:42px; height:24px; background:#6c7488aa; border-radius:999px;
  position:relative; outline:none; cursor:pointer; transition:background .18s ease, box-shadow .18s ease;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.12);
}
.qmm-switch::before{
  content:""; position:absolute; top:2px; left:2px; width:20px; height:20px;
  background:#fff; border-radius:50%; transition:transform .2s ease;
  box-shadow:0 2px 8px rgba(0,0,0,.35);
}
.qmm-switch:checked{ background:linear-gradient(180deg, rgba(94,234,212,.90), rgba(45,212,191,.65)) }
.qmm-switch:checked::before{ transform:translateX(18px) }
.qmm-switch:focus-visible{ outline:2px solid var(--qmm-accent); outline-offset:2px }

/* Checkbox & radio (native inputs skinned lightly) */
.qmm-check, .qmm-radio{ transform:scale(1.1); accent-color: var(--qmm-accent) }

/* Slider */
.qmm-range{
  width:180px; appearance:none; background:transparent; height:22px;
}
.qmm-range:focus{ outline:none }
.qmm-range::-webkit-slider-runnable-track{
  height:6px; background:linear-gradient(90deg, var(--qmm-accent), rgba(94,234,212,0.25));
  border-radius:999px; box-shadow:inset 0 1px 0 rgba(255,255,255,.14);
}
.qmm-range::-moz-range-track{
  height:6px; background:linear-gradient(90deg, var(--qmm-accent), rgba(94,234,212,0.25));
  border-radius:999px; box-shadow:inset 0 1px 0 rgba(255,255,255,.14);
}
.qmm-range::-webkit-slider-thumb{
  appearance:none; width:16px; height:16px; border-radius:50%; margin-top:-5px;
  background:#fff; box-shadow:0 2px 10px rgba(0,0,0,.35), 0 0 0 2px #ffffff66 inset;
  transition:transform .1s ease;
}
.qmm-range:active::-webkit-slider-thumb{ transform:scale(1.04) }
.qmm-range::-moz-range-thumb{
  width:16px; height:16px; border-radius:50%; background:#fff; border:none;
  box-shadow:0 2px 10px rgba(0,0,0,.35), 0 0 0 2px #ffffff66 inset;
}

.qmm-range-dual{
  position:relative;
  width:100%;
  padding:18px 0 10px;
}
.qmm-range-dual-track{
  position:absolute;
  left:0;
  right:0;
  top:50%;
  transform:translateY(-50%);
  height:8px;
  border-radius:999px;
  background:linear-gradient(90deg, rgba(8,19,33,.8), rgba(27,43,68,.9));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.08), inset 0 0 0 1px rgba(94,234,212,.08);
}
.qmm-range-dual-fill{
  position:absolute;
  top:50%;
  transform:translateY(-50%);
  height:8px;
  border-radius:999px;
  background:linear-gradient(90deg, var(--qmm-accent), rgba(94,234,212,0.55));
  box-shadow:0 4px 14px rgba(94,234,212,.22);
  transition:left .12s ease, right .12s ease;
}
.qmm-range-dual-input{
  position:absolute;
  left:0;
  right:0;
  top:50%;
  transform:translateY(-50%);
  width:100%;
  height:28px;
  margin:0;
  background:transparent;
  pointer-events:none;
}
.qmm-range-dual-input::-webkit-slider-runnable-track{ background:none; }
.qmm-range-dual-input::-moz-range-track{ background:none; }
.qmm-range-dual-input::-webkit-slider-thumb{
  pointer-events:auto;
  width:18px;
  height:18px;
  border-radius:50%;
  background:linear-gradient(145deg, #fff, #d6f5ef);
  border:2px solid rgba(94,234,212,.65);
  box-shadow:0 4px 12px rgba(0,0,0,.35);
  transition:transform .12s ease, box-shadow .12s ease;
}
.qmm-range-dual-input:active::-webkit-slider-thumb,
.qmm-range-dual-input:focus-visible::-webkit-slider-thumb{
  transform:scale(1.05);
  box-shadow:0 6px 16px rgba(0,0,0,.4);
}
.qmm-range-dual-input::-moz-range-thumb{
  pointer-events:auto;
  width:18px;
  height:18px;
  border-radius:50%;
  background:linear-gradient(145deg, #fff, #d6f5ef);
  border:2px solid rgba(94,234,212,.65);
  box-shadow:0 4px 12px rgba(0,0,0,.35);
  transition:transform .12s ease, box-shadow .12s ease;
}
.qmm-range-dual-input:active::-moz-range-thumb,
.qmm-range-dual-input:focus-visible::-moz-range-thumb{
  transform:scale(1.05);
  box-shadow:0 6px 16px rgba(0,0,0,.4);
}
.qmm-range-dual-input--min{ z-index:2; }
.qmm-range-dual-input--max{ z-index:3; }
.qmm-range-dual-bubble{
  position:absolute;
  top:14px;
  transform:translate(-50%, -100%);
  padding:4px 8px;
  border-radius:6px;
  font-size:11px;
  line-height:1;
  font-weight:600;
  color:#d6f5ef;
  background:rgba(17,28,46,.9);
  box-shadow:0 4px 14px rgba(0,0,0,.35);
  pointer-events:none;
  transition:opacity .12s ease, transform .12s ease;
  opacity:.85;
}
.qmm-range-dual-bubble::after{
  content:"";
  position:absolute;
  left:50%;
  bottom:-4px;
  width:8px;
  height:8px;
  background:inherit;
  transform:translateX(-50%) rotate(45deg);
  border-radius:2px;
  box-shadow:0 4px 14px rgba(0,0,0,.35);
}
.qmm-range-dual-input--min:focus-visible + .qmm-range-dual-bubble--min,
.qmm-range-dual-input--max:focus-visible + .qmm-range-dual-bubble--max,
.qmm-range-dual-input--min:active + .qmm-range-dual-bubble--min,
.qmm-range-dual-input--max:active + .qmm-range-dual-bubble--max{
  opacity:1;
  transform:translate(-50%, -110%) scale(1.02);
}

/* ---------- Minimal table ---------- */
/* container */
.qmm-table-wrap--minimal{
  border:1px solid #263040; border-radius:8px; background:#0b0f14; box-shadow:none;
}
/* scroller (height cap) */
.qmm-table-scroll{
  overflow:auto; max-height:44vh; /* override via opts.maxHeight */
}

/* base */
.qmm-table--minimal{
  width:100%;
  border-collapse:collapse;
  background:transparent;
  font-size:13px; line-height:1.35; color:var(--qmm-text, #cdd6e3);
}

/* header */
.qmm-table--minimal thead th{
  position:sticky; top:0; z-index:1;
  text-align:left; font-weight:600;
  padding:8px 10px;
  color:#cbd5e1; background:#0f1318;
  border-bottom:1px solid #263040;
  text-transform:none; letter-spacing:0;
}
.qmm-table--minimal thead th.is-center { text-align: center; }
.qmm-table--minimal thead th.is-left   { text-align: left; }   /* déjà présent, ok */
.qmm-table--minimal thead th.is-right  { text-align: right; }
.qmm-table--minimal thead th,
.qmm-table--minimal td { vertical-align: middle; }

/* cells */
.qmm-table--minimal td{
  padding:8px 10px; border-bottom:1px solid #1f2937; vertical-align:middle;
}
.qmm-table--minimal tbody tr:hover{ background:#0f1824; }

/* compact variant */
.qmm-table--compact thead th,
.qmm-table--compact td{ padding:6px 8px; font-size:12px }

/* utils */
.qmm-table--minimal td.is-num{ text-align:right; font-variant-numeric:tabular-nums }
.qmm-table--minimal td.is-center{ text-align:center }
.qmm-ellipsis{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap }
.qmm-prewrap{ white-space:pre-wrap; word-break:break-word }


/* ---------- Split panels ---------- */
.qmm-split{
  display:grid; gap:12px;
  grid-template-columns:minmax(180px,260px) minmax(0,1fr);
  align-items:start;
}
.qmm-split-left{ display:flex; flex-direction:column; gap:10px }
.qmm-split-right{
  border:1px solid rgba(255,255,255,0.12); border-radius:14px; padding:12px;
  display:flex; flex-direction:column; gap:12px;
  background:linear-gradient(160deg, rgba(15,20,30,0.95), rgba(10,14,20,0.95));
  backdrop-filter:blur(10px);
  box-shadow:0 8px 24px rgba(0,0,0,.35);
}

/* ---------- VTabs (vertical list + filter) ---------- */
.qmm-vtabs{ display:flex; flex-direction:column; gap:8px; min-width:0 }
.qmm-vtabs .filter{ display:block }
.qmm-vtabs .filter input{ width:100% }

.qmm-vlist{
  flex:0 0 auto; overflow:visible;
  border:1px solid var(--qmm-border); border-radius:12px; padding:6px;
  background:linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.01));
  box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
}

.qmm-vtab{
  width:100%; text-align:left; cursor:pointer;
  display:grid; grid-template-columns:28px 1fr auto; align-items:center; gap:10px;
  padding:8px 10px; border-radius:10px; border:1px solid #ffffff18;
  background:rgba(255,255,255,.03); color:inherit;
  transition:background .18s ease, border-color .18s ease, transform .08s ease;
}
.qmm-vtab:hover{ background:rgba(255,255,255,.07); border-color:#ffffff34 }
.qmm-vtab:active{ transform:translateY(1px) }
.qmm-vtab.active{
  background:linear-gradient(180deg, rgba(94,234,212,.16), rgba(94,234,212,.07));
  border-color:rgba(94,234,212,0.35);
  box-shadow:0 1px 14px rgba(94,234,212,.14) inset;
}

.qmm-dot{ width:10px; height:10px; border-radius:50%; justify-self:center; box-shadow:0 0 0 1px #0006 inset }
.qmm-chip{ display:flex; align-items:center; gap:8px; min-width:0 }
.qmm-chip img{
  width:20px; height:20px; border-radius:50%; object-fit:cover; border:1px solid #4446;
  box-shadow:0 1px 0 rgba(255,255,255,.08) inset;
}
.qmm-chip .t{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis }
.qmm-tag{
  font-size:11px; line-height:1; padding:3px 7px; border-radius:999px;
  background:#ffffff14; border:1px solid #ffffff26;
}

/* ---------- Small helpers (optional) ---------- */
  .qmm .qmm-help{ font-size:12px; color:var(--qmm-text-dim) }
  .qmm .qmm-sep{ height:1px; background:linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent); width:100%; border:none; }

/* drag handle */
.qmm-grab {
  margin-left:auto; opacity:.8; cursor:grab; user-select:none;
  display:grid; grid-template-columns:repeat(2, 3px); grid-template-rows:repeat(3, 3px);
  gap:2px; padding:4px 3px; align-content:center; justify-content:center;
}
.qmm-grab:active { cursor:grabbing; }
.qmm-grab-dot {
  width:3px; height:3px; border-radius:999px;
  background:rgba(255,255,255,.82); box-shadow:0 0 0 1px #0005 inset;
}
.qmm-dragging { opacity:.6; }

/* items animables */
.qmm-team-item {
  will-change: transform;
  transition: transform 160ms ease;
}
.qmm-team-item.drag-ghost {
  opacity: .4;
}

.qmm.qmm-alt-drag { cursor: grab; }
.qmm.qmm-alt-drag:active { cursor: grabbing; }

.qws-win.is-hidden { display: none !important; }

.qmm-hotkey{
  cursor:pointer; user-select:none;
  border:1px solid var(--qmm-border); border-radius:10px;
  padding:8px 12px;
  background:linear-gradient(180deg, #ffffff10, #ffffff06);
  color:var(--qmm-text);
  box-shadow:0 1px 0 #000 inset, 0 1px 16px rgba(0,0,0,.18);
  transition:
    background .18s ease,
    border-color .18s ease,
    box-shadow .18s ease,
    transform .08s ease,
    color .18s ease;
}
.qmm-hotkey{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  white-space:nowrap;
  width: var(--qmm-hotkey-w, 180px); 
}
.qmm-hotkey:hover{ background:linear-gradient(180deg, #ffffff16, #ffffff08); border-color:#ffffff40 }
.qmm-hotkey:active{ transform:translateY(1px) }

.qmm-hotkey:focus-visible{ outline:none }

.qmm-hotkey.is-empty{
  color:var(--qmm-text-dim);
  font-style:italic;
}

.qmm-hotkey.is-assigned{
  border-color:rgba(94,234,212,0.40);
  box-shadow:0 1px 0 #000 inset, 0 1px 16px rgba(0,0,0,.18), 0 0 0 2px rgba(94,234,212,0.20);
}

.qmm-hotkey.is-recording{
  outline:2px solid var(--qmm-accent);
  outline-offset:2px;
  border-color:var(--qmm-accent);
  background:linear-gradient(180deg, rgba(94,234,212,.22), rgba(94,234,212,.08));
  animation:qmm-hotkey-breathe 1.2s ease-in-out infinite;
}

@keyframes qmm-hotkey-breathe{
  0%   { box-shadow: 0 0 0 0 rgba(94,234,212,.50), 0 1px 16px rgba(0,0,0,.25); }
  60%  { box-shadow: 0 0 0 12px rgba(94,234,212,0), 0 1px 16px rgba(0,0,0,.25); }
  100% { box-shadow: 0 0 0 0 rgba(94,234,212,0),  0 1px 16px rgba(0,0,0,.25); }
}

/* ---------- Segmented (minimal, modern) ---------- */
.qmm-seg{
  --seg-pad: 8px;
  --seg-radius: 999px;
  --seg-stroke: 1.2px;      /* épaisseur du trait */
  --seg-nudge-x: 0px;       /* micro-ajustements optionnels */
  --seg-nudge-w: 0px;
  --seg-fill: rgba(94,234,212,.07);
  --seg-stroke-color: rgba(94,234,212,.55);

  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: var(--seg-pad);
  border-radius: var(--seg-radius);
  background: var(--qmm-bg-soft);
  border: 1px solid var(--qmm-border-2);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
  overflow: hidden;
  background-clip: padding-box; /* important pour que le fond ne passe pas sous la bordure */
}

.qmm-seg--full{ display:flex; width:100% }

.qmm-seg__btn{
  position: relative;
  z-index: 1;
  appearance: none; background: transparent; border: 0; cursor: pointer;
  padding: 8px 14px;
  border-radius: 999px;
  color: var(--qmm-text-dim);
  font: inherit; line-height: 1; white-space: nowrap;
  transition: color .15s ease, transform .06s ease;
}
.qmm-seg__btn-label{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: inherit;
}
.qmm-compact .qmm-seg__btn{ padding: 6px 10px }
.qmm-seg__btn:hover{ color: var(--qmm-text); }
.qmm-seg__btn.active{ color:#fff; font-weight:600; }
.qmm-seg__btn:active{ transform: translateY(1px); }
.qmm-seg__btn[disabled]{ opacity:.5; cursor:not-allowed; }

.qmm-seg__indicator{
  position: absolute;
  top: 0; left: 0;
  height: 100%;
  width: 40px;                      /* maj en JS */
  border-radius: inherit;
  background: var(--seg-fill);              /* ⬅️ applique la couleur */
  outline: var(--seg-stroke,1.2px) solid var(--seg-stroke-color);
  outline-offset: calc(-1 * var(--seg-stroke));

  box-shadow: 0 1px 4px rgba(94,234,212,.08);
  transform-origin: left center;
  will-change: transform, width, opacity;
  transition: transform .18s cubic-bezier(.2,.8,.2,1),
              width .18s cubic-bezier(.2,.8,.2,1),
              opacity .18s ease-out;
  pointer-events: none;
}

/* Accessibilité */
@media (prefers-reduced-motion: reduce){
  .qmm-seg__indicator, .qmm-seg__btn { transition: none; }
}

/* ---------- Card bounce utility ---------- */
@keyframes qmm-card-bounce{
  0%   { transform:translateY(0); }
  30%  { transform:translateY(-4px); }
  60%  { transform:translateY(1px); }
  100% { transform:translateY(0); }
}
.qmm-card.is-bouncing{ animation:qmm-card-bounce 320ms ease; }

    `;
    const st = document.createElement('style');
    st.id = '__qmm_css__';
    st.textContent = css;
    (document.documentElement || document.body).appendChild(st);
  }
}

/* ----------------------------- VTabs class ----------------------------- */
export class VTabs {
  root: HTMLElement;
  private filterWrap: HTMLElement | null = null;
  private filterInput: HTMLInputElement | null = null;
  private list: HTMLElement;
  private listWrap: HTMLElement | null = null;
  private items: VTabItem[] = [];
  private selectedId: string | null = null;
  private onSelectCb: ((id: string | null, item: VTabItem | null) => void) | undefined;
  private renderItemCustom?: (item: VTabItem, btn: HTMLButtonElement) => void;
  private emptyText: string;

  constructor(private api: Menu, private opts: VTabsOptions = {}) {
    this.root = el('div', 'qmm-vtabs');
    this.root.style.minWidth = '0'; 
    this.emptyText = opts.emptyText || "Aucun élément.";
    this.renderItemCustom = opts.renderItem;

    if (opts.filterPlaceholder) {
      this.filterWrap = el('div', 'filter');
      this.filterInput = document.createElement('input');
      this.filterInput.type = 'search';
      this.filterInput.placeholder = opts.filterPlaceholder;
      this.filterInput.className = 'qmm-input';
      this.filterInput.oninput = () => this.renderList();
      this.filterWrap.appendChild(this.filterInput);
      this.root.appendChild(this.filterWrap);
    }

    this.list = el('div', 'qmm-vlist');
    this.list.style.minWidth = '0';
    if (opts.maxHeightPx) {
      this.list.style.maxHeight = `${opts.maxHeightPx}px`;
      this.list.style.overflow = 'auto';
      (this.list as HTMLElement).style.flex = '1 1 auto';
    }

    if (opts.fillAvailableHeight) {
      this.listWrap = document.createElement('div');
      this.listWrap.className = 'qmm-vlist-wrap';
      Object.assign(this.listWrap.style, {
        flex: '1 1 auto',
        minHeight: '0',
        display: 'flex',
        flexDirection: 'column',
      });
      this.list.style.flex = '1 1 auto';
      if (!opts.maxHeightPx) this.list.style.overflow = 'auto';
      this.listWrap.appendChild(this.list);
      this.root.appendChild(this.listWrap);
    } else {
      this.root.appendChild(this.list);
    }

    this.selectedId = opts.initialId ?? null;
    this.onSelectCb = opts.onSelect;
  }

  setItems(items: VTabItem[]) {
    this.items = Array.isArray(items) ? items.slice() : [];
    if (this.selectedId && !this.items.some(i => i.id === this.selectedId)) {
      this.selectedId = this.items[0]?.id ?? null;
    }
    this.renderList();
  }

  getSelected(): VTabItem | null {
    return this.items.find(i => i.id === this.selectedId) ?? null;
  }

  select(id: string | null) {
    this.selectedId = id;
    this.renderList();
    this.onSelectCb?.(this.selectedId, this.getSelected());
  }

  onSelect(cb: (id: string | null, item: VTabItem | null) => void) {
    this.onSelectCb = cb;
  }

  setBadge(id: string, text: string | null) {
    const btn = this.list.querySelector<HTMLButtonElement>(`button[data-id="${cssq(id)}"]`);
    if (!btn) return;
    let tag = btn.querySelector('.qmm-tag') as HTMLElement | null;
    if (!tag && text != null) {
      tag = el('span', 'qmm-tag') as HTMLElement;
      btn.appendChild(tag);
    }
    if (!tag) return;
    if (text == null || text === '') tag.style.display = 'none';
    else { tag.textContent = text; tag.style.display = ''; }
  }

  getFilter(): string {
    return (this.filterInput?.value || '').trim().toLowerCase();
  }

  private renderList() {
    const keepScroll = this.list.scrollTop;
    this.list.innerHTML = '';

    const q = this.getFilter();
    const filtered = q
      ? this.items.filter(it => (it.title || '').toLowerCase().includes(q) || (it.subtitle || '').toLowerCase().includes(q))
      : this.items;

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.style.opacity = '0.75';
      empty.textContent = this.emptyText;
      this.list.appendChild(empty);
      return;
    }

    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.margin = '0';
    ul.style.padding = '0';
    ul.style.display = 'flex';
    ul.style.flexDirection = 'column';
    ul.style.gap = '4px';

    for (const it of filtered) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'qmm-vtab';
      btn.dataset.id = it.id;
      btn.disabled = !!it.disabled;

      if (this.renderItemCustom) {
        this.renderItemCustom(it, btn);
      } else {
        const dot = el('div', 'qmm-dot') as HTMLDivElement;
        dot.style.background = it.statusColor || '#999a';

        const chip = el('div', 'qmm-chip');
        const img = document.createElement('img');
        img.src = it.avatarUrl || '';
        img.alt = it.title;
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.flexDirection = 'column';
        wrap.style.gap = '2px';
        const t = el('div', 't') as HTMLDivElement;
        t.textContent = it.title;
        const sub = document.createElement('div');
        sub.textContent = it.subtitle || '';
        sub.style.opacity = '0.7';
        sub.style.fontSize = '12px';
        if (!it.subtitle) sub.style.display = 'none';

        wrap.appendChild(t);
        wrap.appendChild(sub);
        chip.appendChild(img);
        chip.appendChild(wrap);

        btn.appendChild(dot);
        btn.appendChild(chip);

        if (it.badge != null) {
          const tag = el('span', 'qmm-tag', escapeHtml(String(it.badge)));
          btn.appendChild(tag);
        } else {
          const spacer = document.createElement('div');
          spacer.style.width = '0';
          btn.appendChild(spacer);
        }
      }

      btn.classList.toggle('active', it.id === this.selectedId);
      btn.onclick = () => this.select(it.id);

      li.appendChild(btn);
      ul.appendChild(li);
    }

    this.list.appendChild(ul);
    this.list.scrollTop = keepScroll;
  }
}

/* ----------------------------- utils locaux ----------------------------- */
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
function cssq(s: string) { return s.replace(/"/g, '\\"'); }
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]!));
}


const _MOD_CODES = new Set([
  "ShiftLeft","ShiftRight","ControlLeft","ControlRight","AltLeft","AltRight","MetaLeft","MetaRight"
]);

function codesMatch(expected: string, actual: string): boolean {
  if (expected === actual) return true;
  const altCodes = expected === "AltLeft" || expected === "AltRight";
  const ctrlCodes = expected === "ControlLeft" || expected === "ControlRight";
  const shiftCodes = expected === "ShiftLeft" || expected === "ShiftRight";
  const metaCodes = expected === "MetaLeft" || expected === "MetaRight";
  if (altCodes && (actual === "AltLeft" || actual === "AltRight")) return true;
  if (ctrlCodes && (actual === "ControlLeft" || actual === "ControlRight")) return true;
  if (shiftCodes && (actual === "ShiftLeft" || actual === "ShiftRight")) return true;
  if (metaCodes && (actual === "MetaLeft" || actual === "MetaRight")) return true;
  return false;
}

function isMac(): boolean {
  return navigator.platform?.toLowerCase().includes("mac") || /mac|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function eventToHotkey(e: KeyboardEvent, allowModifierOnly = false): Hotkey | null {
  const isModifier =
    _MOD_CODES.has(e.code) ||
    e.key === "Shift" ||
    e.key === "Control" ||
    e.key === "Alt" ||
    e.key === "Meta";
  if (isModifier && !allowModifierOnly) {
    return null;
  }
  return {
    code: e.code,
    ctrl:  e.ctrlKey,
    alt:   e.altKey,
    shift: e.shiftKey,
    meta:  e.metaKey,
  };
}

export function matchHotkey(e: KeyboardEvent, h: Hotkey | null | undefined): boolean {
  if (!h) return false;
  if (!!h.ctrl  !== e.ctrlKey)  return false;
  if (!!h.shift !== e.shiftKey) return false;
  if (!!h.alt   !== e.altKey)   return false;
  if (!!h.meta  !== e.metaKey)  return false;
  return codesMatch(h.code, e.code);
}

// Canonical storage string: "Ctrl+Shift+Alt+Meta+KeyK"
export function hotkeyToString(hk: Hotkey | null): string {
  if (!hk) return "";
  const parts: string[] = [];
  if (hk.ctrl)  parts.push("Ctrl");
  if (hk.shift) parts.push("Shift");
  if (hk.alt)   parts.push("Alt");
  if (hk.meta)  parts.push("Meta");
  if (hk.code)  parts.push(hk.code);
  return parts.join("+");
}

export function stringToHotkey(s: string | null | undefined): Hotkey | null {
  if (!s) return null;
  const parts = s.split("+").map(p => p.trim()).filter(Boolean);
  if (!parts.length) return null;
  const code = canonicalizeCode(parts.pop() || "");
  const hk: Hotkey = { code };
  for (const p of parts) {
    const P = p.toLowerCase();
    if (P === "ctrl"  || P === "control") hk.ctrl  = true;
    else if (P === "shift") hk.shift = true;
    else if (P === "alt")   hk.alt   = true;
    else if (P === "meta" || P === "cmd" || P === "command") hk.meta = true;
  }
  return hk.code ? hk : null;
}

const CANONICAL_CODES: Record<string, string> = {
  space: "Space",
  enter: "Enter",
  escape: "Escape",
  tab: "Tab",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  bracketleft: "BracketLeft",
  bracketright: "BracketRight",
  backslash: "Backslash",
  slash: "Slash",
  minus: "Minus",
  equal: "Equal",
  semicolon: "Semicolon",
  quote: "Quote",
  backquote: "Backquote",
  comma: "Comma",
  period: "Period",
  dot: "Period",
  capslock: "CapsLock",
  numlock: "NumLock",
  scrolllock: "ScrollLock",
  pause: "Pause",
  contextmenu: "ContextMenu",
  printscreen: "PrintScreen",
  metaleft: "MetaLeft",
  metaright: "MetaRight",
  altleft: "AltLeft",
  altright: "AltRight",
  controlleft: "ControlLeft",
  controlright: "ControlRight",
  shiftleft: "ShiftLeft",
  shiftright: "ShiftRight",
};

function canonicalizeCode(rawCode: string): string {
  const trimmed = rawCode.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();

  const keyMatch = lower.match(/^key([a-z])$/);
  if (keyMatch) return `Key${keyMatch[1].toUpperCase()}`;

  const digitMatch = lower.match(/^digit([0-9])$/);
  if (digitMatch) return `Digit${digitMatch[1]}`;

  const numpadDigitMatch = lower.match(/^numpad([0-9])$/);
  if (numpadDigitMatch) return `Numpad${numpadDigitMatch[1]}`;

  if (lower.startsWith("numpad")) {
    const suffix = lower.slice(6);
    if (!suffix) return "Numpad";
    const mappedSuffix = CANONICAL_CODES[suffix] ?? capitalizeWord(suffix);
    return `Numpad${mappedSuffix}`;
  }

  const fMatch = lower.match(/^f([0-9]{1,2})$/);
  if (fMatch) return `F${fMatch[1]}`;

  const arrowMatch = lower.match(/^arrow([a-z]+)$/);
  if (arrowMatch) {
    const suffix = arrowMatch[1];
    const mappedSuffix = CANONICAL_CODES[suffix] ?? capitalizeWord(suffix);
    return `Arrow${mappedSuffix}`;
  }

  if (CANONICAL_CODES[lower]) {
    return CANONICAL_CODES[lower];
  }

  return trimmed[0].toUpperCase() + trimmed.slice(1);
}

function capitalizeWord(word: string): string {
  if (!word) return "";
  return word[0].toUpperCase() + word.slice(1);
}

function prettyCode(code: string): string {
  // KeyK -> K, Digit1 -> 1, Numpad1 -> Numpad 1, ArrowUp -> ↑, Space -> Space, etc.
  if (code === "AltLeft" || code === "AltRight") return "Alt";
  if (code === "ControlLeft" || code === "ControlRight") return "Ctrl";
  if (code === "ShiftLeft" || code === "ShiftRight") return "Shift";
  if (code === "MetaLeft" || code === "MetaRight") return isMac() ? "⌘" : "Meta";
  if (code.startsWith("Key"))   return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return "Numpad " + code.slice(6);
  const arrows: Record<string,string> = { ArrowUp:"↑", ArrowDown:"↓", ArrowLeft:"←", ArrowRight:"→" };
  if (arrows[code]) return arrows[code];
  return code; // F1, Escape, Tab, Space, etc.
}

export function hotkeyToPretty(h: Hotkey | null): string {
  if (!h) return "—";
  const mac = isMac();
  const mods: string[] = [];
  if (mac) {
    if (h.ctrl)  mods.push("⌃");
    if (h.alt)   mods.push("⌥");
    if (h.shift) mods.push("⇧");
    if (h.meta)  mods.push("⌘");
  } else {
    if (h.ctrl)  mods.push("Ctrl");
    if (h.alt)   mods.push("Alt");
    if (h.shift) mods.push("Shift");
    if (h.meta)  mods.push("Meta");
  }
  const modifierCode =
    (h.alt && (h.code === "AltLeft" || h.code === "AltRight")) ||
    (h.ctrl && (h.code === "ControlLeft" || h.code === "ControlRight")) ||
    (h.shift && (h.code === "ShiftLeft" || h.code === "ShiftRight")) ||
    (h.meta && (h.code === "MetaLeft" || h.code === "MetaRight"));

  const parts = mods.slice();
  const codePretty = prettyCode(h.code);
  if (!modifierCode || parts.length === 0) {
    parts.push(codePretty);
  }
  if (!parts.length) return codePretty;
  return parts.join(mac ? "" : " + ");
}
