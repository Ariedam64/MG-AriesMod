// Right-hand panel of the Skins menu: the selected object's slots and state.

import { badge } from '../../ui/kit/badges';
import { button } from '../../ui/kit/button';
import { sectionLabel } from '../../ui/kit/card';
import { h } from '../../ui/kit/dom';
import { importSkin, removeSkin } from './index';
import { mountThumb } from './thumb';
import type { SkinApplyResult, SkinEntry, SkinTarget, SkinnableObject } from './types';

const SLOT_THUMB_PX = 44;

function pickImageFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/webp,image/jpeg,image/gif';
    input.style.display = 'none';
    input.addEventListener('change', () => {
      resolve(input.files?.[0] ?? null);
      input.remove();
    });
    document.body.appendChild(input);
    input.click();
  });
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A title and a one-line hint, centred, for a panel with nothing to show. */
export function emptyState(title: string, hint?: string): HTMLElement {
  const el = h('div', 'qws-skins__empty');
  el.appendChild(h('div', 'qws-skins__empty-title', title));
  if (hint) el.appendChild(h('div', 'qws-skins__empty-hint', hint));
  return el;
}

interface SlotDeps {
  entry: SkinEntry | undefined;
  result: SkinApplyResult | undefined;
  /** False when the object has a single slot, whose name would repeat the title. */
  showName: boolean;
  onError: (message: string) => void;
  onChanged: () => void;
}

function buildSlot(target: SkinTarget, index: number, deps: SlotDeps): HTMLElement {
  const { entry, result, showName, onError, onChanged } = deps;

  // Two rows rather than one: a single line cannot fit two thumbnails, an
  // arrow, the name, a status pill and two buttons in a 316px panel without
  // them colliding.
  const row = h('div', 'qws-skins-slot');

  const upload = async () => {
    const file = await pickImageFile();
    if (!file) return;
    try {
      await importSkin(target.frameKey, file);
      onChanged();
    } catch (error) {
      onError(errorText(error));
    }
  };

  // Top line: name and the image size on the left, status badge on the right.
  const head = h('div', 'qws-skins-slot__head');
  const text = h('div', 'qws-skins-slot__text');
  if (showName) {
    const name = h('div', 'qws-skins-slot__name', target.frameKey.split('/').pop() || `Stage ${index + 1}`);
    name.title = target.frameKey;
    text.appendChild(name);
  }
  // The exact box an import is fitted into. Shown because it is the one thing
  // worth knowing before exporting an image: match it and nothing is scaled or
  // letterboxed.
  const dims = h('div', 'qws-skins-slot__dims', `Best size ${target.logicalSize.w}×${target.logicalSize.h} px`);
  dims.title = 'Ideal image size for this slot';
  text.appendChild(dims);
  head.appendChild(text);

  if (entry) {
    const applied = result?.applied !== false;
    const status = badge(applied ? 'Active' : 'Waiting', applied ? 'ok' : 'warn');
    if (result?.error) status.title = result.error;
    head.appendChild(status);
  }

  const before = h('div', 'qws-skins-thumb');
  before.title = 'Original';
  mountThumb(before, target, null, SLOT_THUMB_PX);

  // The new image's box doubles as the upload target when the slot takes one.
  let after: HTMLElement;
  if (target.skinnable) {
    const pick = h('button', entry ? 'qws-skins-thumb is-filled' : 'qws-skins-thumb');
    pick.type = 'button';
    pick.title = entry ? 'Replace this image' : 'Upload an image';
    pick.setAttribute('aria-label', pick.title);
    pick.addEventListener('click', async () => {
      pick.classList.add('is-busy');
      try {
        await upload();
      } finally {
        pick.classList.remove('is-busy');
      }
    });
    after = pick;
  } else {
    after = h('div', 'qws-skins-thumb');
  }
  if (entry) mountThumb(after, target, entry.blob, SLOT_THUMB_PX);
  else if (target.skinnable) after.appendChild(h('span', 'qws-skins-thumb__plus', '+'));

  const actions = h('div', 'qws-skins-slot__actions');
  if (!target.skinnable) {
    actions.appendChild(badge(target.blockedReason || 'Unavailable', 'warn'));
  } else {
    actions.appendChild(
      button(entry ? 'Replace' : 'Upload', {
        variant: entry ? 'default' : 'primary',
        size: 'sm',
        lockWhilePending: true,
        onClick: upload,
      }),
    );
    if (entry) {
      const remove = button('✕', {
        variant: 'ghost',
        size: 'sm',
        title: 'Remove this skin',
        ariaLabel: 'Remove this skin',
        lockWhilePending: true,
        onClick: async () => {
          try {
            await removeSkin(target.frameKey);
            onChanged();
          } catch (error) {
            onError(errorText(error));
          }
        },
      });
      remove.classList.add('qws-skins-slot__remove');
      actions.appendChild(remove);
    }
  }

  // Bottom line: before, arrow, after, then the actions pushed to the right.
  const body = h('div', 'qws-skins-slot__body');
  body.append(
    before,
    h('span', 'qws-skins-slot__arrow', '→'),
    after,
    h('div', 'qws-skins-slot__spacer'),
    actions,
  );
  row.append(head, body);
  return row;
}

export interface DetailOptions {
  object: SkinnableObject | null;
  entries: Map<string, SkinEntry>;
  results: Map<string, SkinApplyResult>;
  onError: (message: string) => void;
  onChanged: () => void;
}

export function buildDetail(options: DetailOptions): HTMLElement {
  const { object, entries, results, onError, onChanged } = options;

  const host = h('div', 'qws-skins-detail');

  if (!object) {
    host.appendChild(emptyState('Pick a sprite', 'Choose one on the left to give it your own image.'));
    return host;
  }

  const head = h('div', 'qws-skins-detail__head');
  const title = h('div', 'qws-skins-detail__title', object.label);
  title.title = object.key;
  const count = object.slots.length;
  head.append(
    sectionLabel(object.category),
    title,
    h('div', 'qws-skins-detail__sub', count === 1 ? 'One image' : `${count} images, one per stage or frame`),
  );
  host.appendChild(head);

  // Ground tiles go through @pixi/tilemap: `tilemap.tile(texture, ...)` copies
  // the UVs and texture binding into its geometry buffer once, and never reads
  // the Texture object again. Retargeting succeeds but changes nothing on
  // screen, so say so rather than let the slot report a false "Active".
  if (object.category === 'tile') {
    host.appendChild(
      h('div', 'qws-skins-detail__notice', 'Ground tiles are baked into the map and cannot be skinned.'),
    );
  }

  const list = h('div', 'qws-pnl-scroll qws-skins-detail__list');
  object.slots.forEach((target, index) => {
    list.appendChild(
      buildSlot(target, index, {
        entry: entries.get(target.frameKey),
        result: results.get(target.frameKey),
        showName: count > 1,
        onError,
        onChanged,
      }),
    );
  });
  host.appendChild(list);

  return host;
}
