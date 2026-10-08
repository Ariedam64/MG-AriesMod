// The Skins menu: replace the game's sprites with your own images.

import { button } from '../../ui/kit/button';
import { plainCard, sectionLabel } from '../../ui/kit/card';
import { h } from '../../ui/kit/dom';
import { select, textInput } from '../../ui/kit/fields';
import { switchInput } from '../../ui/kit/toggles';
import { buildDetail } from './detail';
import { mountThumb } from './thumb';
import {
  areSkinsEnabled,
  getSkinsSnapshot,
  initSkins,
  onSkinsChanged,
  removeAllSkins,
  setSkinsEnabled,
} from './index';
import { ensureSkinsStyles } from './styles';
import type { SkinnableObject } from './types';

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
  ensureSkinsStyles();
  void initSkins();

  container.style.padding = '0';
  container.style.overflow = 'hidden';

  // A definite height (in the stylesheet), not 100%: the HUD window
  // (`.qws-win`) is itself the scroller and has no fixed height, so
  // `height:100%` would collapse to the content and the whole menu would
  // scroll instead of the sprite list. The cards clip their overflow so only
  // the two lists inside them scroll.
  const root = h('div', 'qws-skins');
  const browser = plainCard();
  const detail = plainCard();
  root.append(browser, detail);
  container.replaceChildren(root);

  // Toolbar
  const enableToggle = switchInput(areSkinsEnabled(), on => void setSkinsEnabled(on));
  enableToggle.title = 'Enable skins';
  const enableWrap = h('div', 'qws-skins__enable');
  enableWrap.append(sectionLabel('Sprites'), enableToggle);

  let confirmTimer: number | null = null;
  const clearBtn = button('Clear all', {
    variant: 'danger',
    size: 'sm',
    lockWhilePending: true,
    onClick: async () => {
      // Two steps: this deletes every image the player imported, with no undo.
      if (clearBtn.dataset.armed !== 'yes') {
        clearBtn.dataset.armed = 'yes';
        clearBtn.textContent = 'Delete every skin?';
        confirmTimer = window.setTimeout(resetClear, CONFIRM_RESET_MS);
        return;
      }
      resetClear();
      await removeAllSkins();
      renderAll();
    },
  });
  function resetClear(): void {
    if (confirmTimer !== null) window.clearTimeout(confirmTimer);
    confirmTimer = null;
    clearBtn.dataset.armed = '';
    clearBtn.textContent = 'Clear all';
  }

  const header = h('div', 'qws-skins__header');
  header.append(enableWrap, clearBtn);

  const categorySelect = select({ small: true });
  categorySelect.classList.add('qws-skins__category');
  const search = textInput('Search', '', { small: true });
  search.type = 'search';
  search.classList.add('qws-skins__search');
  const filters = h('div', 'qws-skins__filters');
  filters.append(categorySelect, search);

  const grid = h('div', 'qws-pnl-scroll qws-skins__grid');
  const status = h('div', 'qws-skins__status');
  browser.append(header, filters, grid, status);

  const errorEl = h('div', 'qws-skins__error');
  errorEl.hidden = true;
  const detailHost = h('div', 'qws-skins__detail-host');
  detail.append(errorEl, detailHost);

  const showError = (message: string) => {
    errorEl.textContent = message;
    errorEl.hidden = false;
  };

  const renderCategories = (objects: SkinnableObject[]) => {
    const previous = menuState.category;
    const categories = [...new Set(objects.map(o => o.category))].sort();
    categorySelect.replaceChildren();
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
          errorEl.hidden = true;
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
      cell.className = 'qws-pnl-cell';
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
      grid.appendChild(h('div', 'qws-skins__empty', snapshot.ready ? 'No match' : 'Loading…'));
    }
  };

  const renderStatus = () => {
    const snapshot = getSkinsSnapshot();
    const hasSkins = snapshot.entries.size > 0;

    clearBtn.style.display = hasSkins ? '' : 'none';
    if (!hasSkins) resetClear();
    enableToggle.setChecked(areSkinsEnabled());

    const parts: string[] = [];
    if (snapshot.error) parts.push(`⚠ ${snapshot.error}`);
    if (hasSkins && snapshot.rebaked === null) parts.push('⚠ Mutated plants keep their original look');
    status.textContent = parts.join(' · ');
    status.classList.toggle('is-warn', parts.length > 0);
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
