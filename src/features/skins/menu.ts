// The Skins menu: replace the game's sprites with your own images.

import { formatInteger } from '../../lib/format';
import { button } from '../../ui/kit/button';
import { errorBar, plainCard } from '../../ui/kit/card';
import { h } from '../../ui/kit/dom';
import { select, textInput } from '../../ui/kit/fields';
import { settingRow } from '../../ui/kit/layout';
import { switchInput } from '../../ui/kit/toggles';
import { buildDetail, emptyState } from './detail';
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
const CLEAR_LABEL = 'Remove all';

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

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (n: number, word: string) => `${formatInteger(n)} ${word}${n === 1 ? '' : 's'}`;

export function renderSkinsMenu(container: HTMLElement): void {
  ensureSkinsStyles();
  void initSkins();

  container.style.padding = '0';
  container.style.overflow = 'hidden';

  // A definite height (in the stylesheet), not 100%: the HUD window
  // (`.qws-win`) is itself the scroller and has no fixed height, so
  // `height:100%` would collapse to the content and the whole menu would
  // scroll instead of the sprite list. The panes clip their overflow so only
  // the two lists inside them scroll.
  const root = h('div', 'qws-skins');
  container.replaceChildren(root);

  // The master switch, on its own line above everything it governs.
  const enableToggle = switchInput(areSkinsEnabled(), on => void setSkinsEnabled(on));
  enableToggle.setAttribute('aria-label', 'Show skins');
  const enableRow = settingRow('Show skins', "Your images in place of the game's sprites.", enableToggle).row;

  const notice = h('div', 'qws-skins__notice');
  notice.hidden = true;

  const browser = plainCard();
  browser.classList.add('qws-skins__pane');
  const detail = plainCard();
  detail.classList.add('qws-skins__pane');
  const panes = h('div', 'qws-skins__panes');
  panes.append(browser, detail);
  root.append(enableRow, notice, panes);

  // Browser: search, category, the sprite grid, and a footer with the count.
  const search = textInput('Search sprites', '', { small: true });
  search.type = 'search';
  search.classList.add('qws-skins__search');
  const categorySelect = select({ small: true });
  categorySelect.classList.add('qws-skins__category');
  categorySelect.setAttribute('aria-label', 'Sprite type');
  const filters = h('div', 'qws-skins__filters');
  filters.append(search, categorySelect);

  const grid = h('div', 'qws-pnl-scroll qws-skins__grid');

  let confirmTimer: number | null = null;
  const clearBtn = button(CLEAR_LABEL, {
    variant: 'ghost',
    size: 'sm',
    lockWhilePending: true,
    onClick: async () => {
      // Two steps: this deletes every image the player imported, with no undo.
      if (clearBtn.dataset.armed !== 'yes') {
        clearBtn.dataset.armed = 'yes';
        clearBtn.classList.add('qmm-btn--danger');
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
    clearBtn.classList.remove('qmm-btn--danger');
    clearBtn.textContent = CLEAR_LABEL;
  }

  const countEl = h('div');
  const foot = h('div', 'qws-skins__foot');
  foot.append(countEl, clearBtn);
  browser.append(filters, grid, foot);

  // Detail: an error strip above the selected sprite's slots.
  const error = errorBar();
  let detailEl: HTMLElement = h('div', 'qws-skins-detail');
  detail.append(error.el, detailEl);

  const renderCategories = (objects: SkinnableObject[]) => {
    const previous = menuState.category;
    const categories = [...new Set(objects.map(o => o.category))].sort();
    categorySelect.replaceChildren(new Option('All types', ALL_CATEGORIES));
    for (const category of categories) {
      categorySelect.appendChild(new Option(capitalize(category), category));
    }
    categorySelect.value = categories.includes(previous) ? previous : ALL_CATEGORIES;
    menuState.category = categorySelect.value;
  };

  const renderDetail = () => {
    const snapshot = getSkinsSnapshot();
    const next = buildDetail({
      object: snapshot.objects.find(o => o.key === menuState.selectedKey) ?? null,
      entries: snapshot.entries,
      results: snapshot.results,
      onError: error.show,
      onChanged: () => {
        error.clear();
        renderAll();
      },
    });
    detailEl.replaceWith(next);
    detailEl = next;
  };

  const cells = new Map<string, HTMLElement>();

  const selectObject = (key: string) => {
    cells.get(menuState.selectedKey ?? '')?.classList.remove('is-active');
    menuState.selectedKey = key;
    cells.get(key)?.classList.add('is-active');
    renderDetail();
  };

  const renderGrid = () => {
    const snapshot = getSkinsSnapshot();
    // Rebuilding empties the grid, which would snap the list back to the top.
    const scrollTop = grid.scrollTop;
    grid.textContent = '';
    cells.clear();

    const matches = filterObjects(snapshot.objects);
    for (const object of matches.slice(0, MAX_VISIBLE)) {
      const cell = h('button', 'qws-pnl-cell');
      cell.type = 'button';
      cell.title = object.label;
      if (object.key === menuState.selectedKey) cell.classList.add('is-active');
      if (object.slots.some(slot => snapshot.entries.has(slot.frameKey))) {
        cell.classList.add('is-skinned');
      }
      const art = h('div', 'qws-skins-cell__art');
      mountThumb(art, object.slots[0], null, GRID_THUMB_PX);
      cell.append(art, h('div', 'qws-skins-cell__name', object.label));
      cell.addEventListener('click', () => selectObject(object.key));
      cells.set(object.key, cell);
      grid.appendChild(cell);
    }

    if (!matches.length) {
      grid.appendChild(
        !snapshot.ready
          ? emptyState('Loading sprites…')
          : snapshot.objects.length
            ? emptyState('No sprite matches', 'Try another word or type.')
            : emptyState('No sprites yet', 'They show up once the game has loaded.'),
      );
    }
    grid.scrollTop = scrollTop;

    // The empty state already says there is nothing; a "0 sprites" under it would repeat it.
    const skins = snapshot.entries.size;
    const shown = !matches.length
      ? ''
      : matches.length > MAX_VISIBLE
        ? `First ${formatInteger(MAX_VISIBLE)} of ${formatInteger(matches.length)}, search to narrow`
        : plural(matches.length, 'sprite');
    countEl.textContent = [shown, skins ? plural(skins, 'skin') : ''].filter(Boolean).join(' · ');
  };

  const renderStatus = () => {
    const snapshot = getSkinsSnapshot();
    const hasSkins = snapshot.entries.size > 0;

    clearBtn.hidden = !hasSkins;
    if (!hasSkins) resetClear();
    enableToggle.setChecked(areSkinsEnabled());

    const warnings: string[] = [];
    if (snapshot.error) warnings.push(snapshot.error);
    if (hasSkins && snapshot.rebaked === null) warnings.push('Mutated plants keep their original look.');
    notice.replaceChildren(...warnings.map(text => h('div', undefined, text)));
    notice.hidden = warnings.length === 0;
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
