// Right-hand panel of the Skins menu: the selected object's slots and state.

import { importSkin, removeSkin } from '../../skins/index';
import { mountThumb } from './skins-thumb';
import { BORDER, CARD_BG, TEXT, TEXT_DIM, WARN, button, chip, css, sectionLabel } from './skins-ui';
import type { SkinApplyResult, SkinEntry, SkinTarget, SkinnableObject } from '../../skins/types';

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
  const el = document.createElement('div');
  css(el, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '54px',
    height: '54px',
    flex: '0 0 auto',
    borderRadius: '9px',
    background: 'rgba(0,0,0,0.22)',
    border: `1px solid ${BORDER}`,
  });
  if (empty) {
    const plus = document.createElement('span');
    css(plus, { color: TEXT_DIM, fontSize: '18px' });
    plus.textContent = '+';
    el.appendChild(plus);
  }
  return el;
}

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
  const row = document.createElement('div');
  css(row, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '8px',
    borderRadius: '10px',
    background: CARD_BG,
    border: `1px solid ${BORDER}`,
  });

  const before = thumbBox();
  mountThumb(before, target, null, SLOT_THUMB_PX);

  const arrow = document.createElement('span');
  css(arrow, { color: TEXT_DIM, fontSize: '12px' });
  arrow.textContent = '→';

  const after = thumbBox(!entry);
  if (entry) mountThumb(after, target, entry.blob, SLOT_THUMB_PX);

  // Top line: name on the left, status pill on the right.
  const head = document.createElement('div');
  css(head, { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' });

  const name = document.createElement('div');
  css(name, {
    fontSize: '11px',
    color: TEXT,
    flex: '1 1 auto',
    minWidth: '0',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  name.textContent = target.frameKey.split('/').pop() || `Stage ${index + 1}`;
  name.title = target.frameKey;
  head.appendChild(name);

  if (entry) {
    const applied = result?.applied !== false;
    const pill = chip(applied ? 'Active' : 'Waiting', applied ? 'ok' : 'warn');
    css(pill, { alignSelf: 'center', flex: '0 0 auto' });
    if (result?.error) pill.title = result.error;
    head.appendChild(pill);
  }

  // Bottom line: before → after, then the actions pushed to the right.
  const body = document.createElement('div');
  css(body, { display: 'flex', alignItems: 'center', gap: '8px' });

  // The exact box an import is fitted into. Shown because it is the one thing
  // worth knowing before exporting an image: match it and nothing is scaled or
  // letterboxed.
  const dims = document.createElement('div');
  css(dims, { fontSize: '10px', color: TEXT_DIM, whiteSpace: 'nowrap' });
  dims.textContent = `${target.logicalSize.w}×${target.logicalSize.h}`;
  dims.title = 'Ideal image size for this slot';

  const spacer = document.createElement('div');
  css(spacer, { flex: '1 1 auto' });

  const actions = document.createElement('div');
  css(actions, { display: 'flex', gap: '5px', flex: '0 0 auto' });

  if (!target.skinnable) {
    actions.appendChild(chip(target.blockedReason || 'Unavailable', 'warn'));
  } else {
    actions.appendChild(
      button(entry ? 'Replace' : 'Set', entry ? 'neutral' : 'accent', async () => {
        const file = await pickImageFile();
        if (!file) return;
        try {
          await importSkin(target.frameKey, file);
          onChanged();
        } catch (error) {
          onError(error instanceof Error ? error.message : String(error));
        }
      }),
    );
    if (entry) {
      const remove = button('✕', 'danger', async () => {
        try {
          await removeSkin(target.frameKey);
          onChanged();
        } catch (error) {
          onError(error instanceof Error ? error.message : String(error));
        }
      });
      remove.title = 'Remove this skin';
      actions.appendChild(remove);
    }
  }

  body.append(before, arrow, after, dims, spacer, actions);
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

  const host = document.createElement('div');
  css(host, { display: 'flex', flexDirection: 'column', gap: '10px', minHeight: '0' });

  if (!object) {
    const empty = document.createElement('div');
    css(empty, { fontSize: '12px', color: TEXT_DIM, textAlign: 'center', padding: '28px 0' });
    empty.textContent = 'Pick a sprite';
    host.appendChild(empty);
    return host;
  }

  host.appendChild(sectionLabel(object.category));

  // Ground tiles go through @pixi/tilemap: `tilemap.tile(texture, …)` copies
  // the UVs and texture binding into its geometry buffer once, and never reads
  // the Texture object again. Retargeting succeeds but changes nothing on
  // screen, so say so rather than let the slot report a false "Active".
  if (object.category === 'tile') {
    const notice = document.createElement('div');
    css(notice, {
      fontSize: '11px',
      color: WARN,
      lineHeight: '1.45',
      padding: '8px',
      borderRadius: '9px',
      background: 'rgba(251,191,36,0.10)',
      border: '1px solid rgba(251,191,36,0.25)',
    });
    notice.textContent = 'Ground tiles are baked into the map and cannot be skinned.';
    host.appendChild(notice);
  }

  const title = document.createElement('div');
  css(title, {
    fontSize: '14px',
    fontWeight: '600',
    color: TEXT,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  });
  title.textContent = object.label;
  title.title = object.key;
  host.appendChild(title);

  const list = document.createElement('div');
  list.className = 'qws-sk-scroll';
  css(list, { display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', minHeight: '0' });
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
