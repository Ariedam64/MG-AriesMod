// Right-hand panel of the Skins menu: the selected object's slots and state.

import { badge } from '../../ui/kit/badges';
import { button } from '../../ui/kit/button';
import { sectionLabel } from '../../ui/kit/card';
import { h } from '../../ui/kit/dom';
import { importSkin, removeSkin } from './index';
import { mountThumb } from './thumb';
import type { SkinApplyResult, SkinEntry, SkinTarget, SkinnableObject } from './types';

const SLOT_THUMB_PX = 46;

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

function thumbBox(empty = false): HTMLElement {
  const el = h('div', 'qws-skins-thumb');
  if (empty) el.appendChild(h('span', 'qws-skins-thumb__plus', '+'));
  return el;
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

interface SlotDeps {
  entry: SkinEntry | undefined;
  result: SkinApplyResult | undefined;
  onError: (message: string) => void;
  onChanged: () => void;
}

function buildSlot(target: SkinTarget, index: number, deps: SlotDeps): HTMLElement {
  const { entry, result, onError, onChanged } = deps;

  // Two rows rather than one: a single line cannot fit two thumbnails, an
  // arrow, the name, a status pill and two buttons in a 300px panel without
  // them colliding.
  const row = h('div', 'qws-skins-slot');

  const before = thumbBox();
  mountThumb(before, target, null, SLOT_THUMB_PX);

  const after = thumbBox(!entry);
  if (entry) mountThumb(after, target, entry.blob, SLOT_THUMB_PX);

  // Top line: name on the left, status badge on the right.
  const head = h('div', 'qws-skins-slot__head');
  const name = h('div', 'qws-skins-slot__name', target.frameKey.split('/').pop() || `Stage ${index + 1}`);
  name.title = target.frameKey;
  head.appendChild(name);

  if (entry) {
    const applied = result?.applied !== false;
    const status = badge(applied ? 'Active' : 'Waiting', applied ? 'ok' : 'warn');
    if (result?.error) status.title = result.error;
    head.appendChild(status);
  }

  // The exact box an import is fitted into. Shown because it is the one thing
  // worth knowing before exporting an image: match it and nothing is scaled or
  // letterboxed.
  const dims = h('div', 'qws-skins-slot__dims', `${target.logicalSize.w}×${target.logicalSize.h}`);
  dims.title = 'Ideal image size for this slot';

  const actions = h('div', 'qws-skins-slot__actions');
  if (!target.skinnable) {
    actions.appendChild(badge(target.blockedReason || 'Unavailable', 'warn'));
  } else {
    actions.appendChild(
      button(entry ? 'Replace' : 'Set', {
        variant: entry ? 'default' : 'primary',
        size: 'sm',
        lockWhilePending: true,
        onClick: async () => {
          const file = await pickImageFile();
          if (!file) return;
          try {
            await importSkin(target.frameKey, file);
            onChanged();
          } catch (error) {
            onError(errorText(error));
          }
        },
      }),
    );
    if (entry) {
      actions.appendChild(
        button('✕', {
          variant: 'danger',
          size: 'sm',
          title: 'Remove this skin',
          lockWhilePending: true,
          onClick: async () => {
            try {
              await removeSkin(target.frameKey);
              onChanged();
            } catch (error) {
              onError(errorText(error));
            }
          },
        }),
      );
    }
  }

  // Bottom line: before, arrow, after, then the actions pushed to the right.
  const body = h('div', 'qws-skins-slot__body');
  body.append(
    before,
    h('span', 'qws-skins-slot__arrow', '→'),
    after,
    dims,
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
    host.appendChild(h('div', 'qws-skins-detail__empty', 'Pick a sprite'));
    return host;
  }

  host.appendChild(sectionLabel(object.category));

  // Ground tiles go through @pixi/tilemap: `tilemap.tile(texture, ...)` copies
  // the UVs and texture binding into its geometry buffer once, and never reads
  // the Texture object again. Retargeting succeeds but changes nothing on
  // screen, so say so rather than let the slot report a false "Active".
  if (object.category === 'tile') {
    host.appendChild(
      h('div', 'qws-skins-detail__notice', 'Ground tiles are baked into the map and cannot be skinned.'),
    );
  }

  const title = h('div', 'qws-skins-detail__title', object.label);
  title.title = object.key;
  host.appendChild(title);

  const list = h('div', 'qws-pnl-scroll qws-skins-detail__list');
  object.slots.forEach((target, index) => {
    list.appendChild(
      buildSlot(target, index, {
        entry: entries.get(target.frameKey),
        result: results.get(target.frameKey),
        onError,
        onChanged,
      }),
    );
  });
  host.appendChild(list);

  return host;
}
