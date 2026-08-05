// "Skins" menu — replace the game's sprites with your own images.

import { buildDetail } from './skins-detail';
import { mountThumb } from './skins-thumb';
import {
  DANGER,
  TEXT_DIM,
  WARN,
  button,
  card,
  css,
  ensureSkinStyles,
  sectionLabel,
  toggle,
} from './skins-ui';
import {
  areSkinsEnabled,
  getSkinsSnapshot,
  initSkins,
  onSkinsChanged,
  removeAllSkins,
  setSkinsEnabled,
} from '../../skins/index';
import type { SkinnableObject } from '../../skins/types';

const ALL_CATEGORIES = '__all__';
const MAX_VISIBLE = 400;
const GRID_THUMB_PX = 52;
const CONFIRM_RESET_MS = 4000;

interface MenuState {
  category: string;
  query: string;
  selectedKey: string | null;
}

const menuState: MenuState = { category: ALL_CATEGORIES, query: '', selectedKey: null };

function filterObjects(objects: SkinnableObject[]): SkinnableObject[] {
  const needle = menuState.query.trim().toLowerCase();
  return objects.filter(object => {
    if (menuState.category !== ALL_CATEGORIES && object.category !== menuState.category) return false;
    return !needle || object.key.toLowerCase().includes(needle);
  });
}

export function renderSkinsMenu(container: HTMLElement): void {
  ensureSkinStyles();
  void initSkins();

  css(container, { padding: '0', overflow: 'hidden' });
  container.innerHTML = '';

  const root = document.createElement('div');
  css(root, {
    display: 'grid',
    gridTemplateColumns: 'minmax(0,1fr) 300px',
    gap: '12px',
    padding: '14px',
    // A *definite* height, not 100%: the HUD window (`.qws-win`) is itself the
    // scroller (`max-height:90vh; overflow:auto`) and has no fixed height, so
    // `height:100%` collapses to the content height and the whole menu ends up
    // scrolling instead of the sprite list.
    width: '820px',
    maxWidth: '100%',
    height: 'min(72vh, 620px)',
    overflow: 'hidden',
    boxSizing: 'border-box',
    background:
      'linear-gradient(160deg, rgba(15,20,30,0.95) 0%, rgba(10,14,20,0.95) 60%, rgba(8,12,18,0.96) 100%)',
  });
  container.appendChild(root);

  // `overflow: hidden` on the cards is what confines scrolling to the two lists
  // inside them; without it the overflow escapes up to the panel.
  const browser = card();
  const detail = card();
  css(browser, { overflow: 'hidden' });
  css(detail, { overflow: 'hidden' });
  root.append(browser, detail);

  // ── Toolbar ───────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  css(header, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' });

  const enableWrap = document.createElement('div');
  css(enableWrap, { display: 'flex', alignItems: 'center', gap: '8px' });
  const enableToggle = toggle(areSkinsEnabled(), on => void setSkinsEnabled(on));
  enableToggle.title = 'Enable skins';
  enableWrap.append(sectionLabel('Sprites'), enableToggle);

  let confirmTimer: number | null = null;
  const clearBtn = button('Clear all', 'danger', async () => {
    // Two-step: this deletes every image the user imported, with no undo.
    if (clearBtn.dataset.armed !== 'yes') {
      clearBtn.dataset.armed = 'yes';
      clearBtn.textContent = 'Delete every skin?';
      confirmTimer = window.setTimeout(resetClear, CONFIRM_RESET_MS);
      return;
    }
    resetClear();
    await removeAllSkins();
    renderAll();
  });
  function resetClear(): void {
    if (confirmTimer !== null) window.clearTimeout(confirmTimer);
    confirmTimer = null;
    clearBtn.dataset.armed = '';
    clearBtn.textContent = 'Clear all';
  }

  header.append(enableWrap, clearBtn);
  browser.appendChild(header);

  const filters = document.createElement('div');
  css(filters, { display: 'flex', gap: '8px' });
  const categorySelect = document.createElement('select');
  categorySelect.className = 'qws-sk-input';
  css(categorySelect, { flex: '0 0 auto', maxWidth: '150px' });
  const search = document.createElement('input');
  search.className = 'qws-sk-input';
  search.type = 'search';
  search.placeholder = 'Search';
  css(search, { flex: '1 1 auto', minWidth: '0' });
  filters.append(categorySelect, search);
  browser.appendChild(filters);

  const grid = document.createElement('div');
  grid.className = 'qws-sk-scroll';
  css(grid, {
    display: 'grid',
    gap: '8px',
    gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
    overflowY: 'auto',
    minHeight: '0',
    flex: '1 1 auto',
    alignContent: 'start',
    paddingRight: '2px',
  });
  browser.appendChild(grid);

  const status = document.createElement('div');
  css(status, { fontSize: '11px', color: TEXT_DIM, minHeight: '15px' });
  browser.appendChild(status);

  const errorEl = document.createElement('div');
  css(errorEl, { fontSize: '11px', color: DANGER, display: 'none' });
  detail.appendChild(errorEl);
  const detailHost = document.createElement('div');
  css(detailHost, { display: 'flex', flexDirection: 'column', minHeight: '0', flex: '1 1 auto' });
  detail.appendChild(detailHost);

  const showError = (message: string) => {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  };

  // ── Rendering ─────────────────────────────────────────────────────────────
  const renderCategories = (objects: SkinnableObject[]) => {
    const previous = menuState.category;
    const categories = [...new Set(objects.map(o => o.category))].sort();
    categorySelect.innerHTML = '';
    const all = document.createElement('option');
    all.value = ALL_CATEGORIES;
    all.textContent = 'All';
    categorySelect.appendChild(all);
    for (const category of categories) {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    }
    categorySelect.value = categories.includes(previous) ? previous : ALL_CATEGORIES;
    menuState.category = categorySelect.value;
  };

  const renderDetail = () => {
    const snapshot = getSkinsSnapshot();
    detailHost.textContent = '';
    detailHost.appendChild(
      buildDetail({
        object: snapshot.objects.find(o => o.key === menuState.selectedKey) ?? null,
        entries: snapshot.entries,
        results: snapshot.results,
        onError: showError,
        onChanged: () => {
          errorEl.style.display = 'none';
          renderAll();
        },
      }),
    );
  };

  const renderGrid = () => {
    const snapshot = getSkinsSnapshot();
    grid.textContent = '';

    const matches = filterObjects(snapshot.objects);
    for (const object of matches.slice(0, MAX_VISIBLE)) {
      const cell = document.createElement('div');
      cell.className = 'qws-sk-cell';
      cell.title = object.label;
      if (object.key === menuState.selectedKey) cell.classList.add('is-active');
      if (object.slots.some(slot => snapshot.entries.has(slot.frameKey))) {
        cell.classList.add('is-skinned');
      }
      mountThumb(cell, object.slots[0], null, GRID_THUMB_PX);
      cell.addEventListener('click', () => {
        menuState.selectedKey = object.key;
        renderGrid();
        renderDetail();
      });
      grid.appendChild(cell);
    }

    if (!matches.length) {
      const empty = document.createElement('div');
      css(empty, { gridColumn: '1 / -1', fontSize: '12px', color: TEXT_DIM, padding: '24px 0', textAlign: 'center' });
      empty.textContent = snapshot.ready ? 'No match' : 'Loading…';
      grid.appendChild(empty);
    }
  };

  const renderStatus = () => {
    const snapshot = getSkinsSnapshot();
    const hasSkins = snapshot.entries.size > 0;

    clearBtn.style.display = hasSkins ? '' : 'none';
    if (!hasSkins) resetClear();
    (enableToggle as any).setChecked?.(areSkinsEnabled());

    const parts: string[] = [];
    if (snapshot.error) parts.push(`⚠ ${snapshot.error}`);
    if (hasSkins && snapshot.rebaked === null) parts.push('⚠ Mutated plants keep their original look');
    status.textContent = parts.join(' · ');
    status.style.color = parts.some(p => p.startsWith('⚠')) ? WARN : TEXT_DIM;
  };

  const renderAll = () => {
    renderCategories(getSkinsSnapshot().objects);
    renderGrid();
    renderDetail();
    renderStatus();
  };

  categorySelect.addEventListener('change', () => {
    menuState.category = categorySelect.value;
    renderGrid();
  });
  search.addEventListener('input', () => {
    menuState.query = search.value;
    renderGrid();
  });
  search.value = menuState.query;

  // Detach lazily on the next event rather than watching the DOM: the game
  // mutates the page every frame, so an observer would be pure overhead.
  const unsubscribe = onSkinsChanged(() => {
    if (!container.isConnected) {
      unsubscribe();
      return;
    }
    renderAll();
  });

  renderAll();
}
