// Cards, rows, lists, badges, popups and icon holders.

export const containersCss = `
.qmm-card {
  display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--qmm-space-xl); width: 100%; padding: 14px; box-sizing: border-box;
  border: 3px solid var(--qmm-sand-edge); border-radius: 18px; background: var(--qmm-card);
}
.qmm-card--plain { display: flex; flex-direction: column; gap: var(--qmm-space-lg); width: auto; min-height: 0; padding: 10px; }
.qmm-card.is-center { text-align: center; align-items: center; }
.qmm-card.is-stretch { align-items: stretch; }
.qmm-card[data-tone="muted"] { background: var(--qmm-paper-deep); border-color: transparent; }
.qmm-card[data-tone="accent"] { border-color: var(--qmm-accent-border); }
.qmm-card__header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--qmm-space-lg); }
.qmm-card__header.is-compact { gap: var(--qmm-space-sm); }
.qmm-card__icon { font-size: 18px; }
.qmm-card__title { font-size: var(--qmm-fs-xl); font-weight: 900; letter-spacing: .01em; }
/* Title and actions share the first line; the subtitle takes the line below. */
.qmm-card__subtitle { order: 2; flex-basis: 100%; font-size: var(--qmm-fs-md); color: var(--qmm-text-soft); }
.qmm-card__actions { order: 1; display: flex; gap: var(--qmm-space-sm); margin-left: auto; }
.qmm-card__body { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--qmm-space-lg); }

.qmm-section-label {
  font-size: var(--qmm-fs-xs); font-weight: 900; letter-spacing: .08em; text-transform: uppercase;
  color: var(--qmm-text-dim);
}

.qmm-collapse { flex-shrink: 0; min-height: auto; }
.qmm-collapse__head {
  display: flex; align-items: center; gap: var(--qmm-space-md); padding: 0; border: none; background: none;
  color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.qmm-collapse__titles { display: flex; flex-direction: column; gap: 3px; flex: 1 1 auto; min-width: 0; }
.qmm-collapse__desc { font-size: var(--qmm-fs-sm); line-height: 1.45; color: var(--qmm-text-dim); }
.qmm-collapse__chevron {
  flex: 0 0 auto; margin-left: auto; font-size: var(--qmm-fs-xs); color: var(--qmm-text-dim);
  transition: transform 140ms ease, color 120ms ease;
}
.qmm-collapse__head:hover .qmm-collapse__chevron { color: var(--qmm-accent); }
.qmm-collapse__head[aria-expanded="true"] .qmm-collapse__chevron { transform: rotate(90deg); }
.qmm-collapse__body { display: flex; flex-direction: column; gap: var(--qmm-space-md); }
.qmm-collapse.is-collapsed > .qmm-collapse__body { display: none; }

/* In a narrow window the controls drop under the text instead of crushing it. */
.qmm-setting-row {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-lg); flex-shrink: 0; padding: 10px 12px;
  border: 0; border-radius: var(--qmm-radius-md); background: var(--qmm-paper-deep);
}
.qmm-setting-row__text { display: flex; flex-direction: column; gap: 2px; flex: 1 1 140px; min-width: 0; }
.qmm-setting-row__title { font-size: var(--qmm-fs-lg); font-weight: 800; color: var(--qmm-text); }
.qmm-setting-row__hint { font-size: var(--qmm-fs-xs); line-height: 1.4; color: var(--qmm-text-dim); }
.qmm-setting-row__controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: var(--qmm-space-md); flex: 0 1 auto; margin-left: auto; }

.qmm-label { font-weight: 700; }
.qmm-flex { display: flex; flex-wrap: wrap; align-items: center; gap: var(--qmm-space-md); }
.qmm-form-row { display: grid; align-items: center; width: 100%; }
.qmm-form-row.is-top { align-items: start; }
.qmm-form-row__label { justify-self: start; margin: 0; font-weight: 800; }
.qmm-form-row.is-top .qmm-form-row__label { align-self: start; }

.qmm-error {
  padding: 10px 12px; border: 2px solid var(--qmm-danger-border); border-radius: var(--qmm-radius-md);
  background: var(--qmm-danger-soft); color: var(--qmm-danger-ink); font-size: var(--qmm-fs-lg); font-weight: 700; line-height: 1.4;
}
.qmm-error[hidden] { display: none; }

.qmm-pill {
  display: inline-flex; align-items: center; gap: var(--qmm-space-sm); padding: 4px 9px; white-space: nowrap;
  border: 0; border-radius: var(--qmm-radius-pill);
  background: var(--qmm-sand); color: var(--qmm-text-soft); font-size: var(--qmm-fs-sm); font-weight: 800;
}
.qmm-pill.is-ok { color: var(--qmm-ok-ink); background: var(--qmm-ok-soft); }
.qmm-pill.is-warn { color: var(--qmm-warn-ink); background: var(--qmm-warn-soft); }
.qmm-pill.is-bad { color: var(--qmm-danger-ink); background: var(--qmm-danger-soft); }
.qmm-badge {
  align-self: flex-start; padding: 2px 7px; border-radius: var(--qmm-radius-pill);
  font-size: var(--qmm-fs-xs); font-weight: 800;
}
.qmm-badge.is-ok { color: var(--qmm-ok-ink); background: var(--qmm-ok-soft); }
.qmm-badge.is-warn { color: var(--qmm-warn-ink); background: var(--qmm-warn-soft); }
.qmm-meter {
  position: relative; flex: 1 1 auto; min-width: 60px; height: 10px; overflow: hidden;
  border-radius: var(--qmm-radius-pill); background: var(--qmm-sand-edge);
}
.qmm-meter__fill {
  position: absolute; inset: 0 auto 0 0; width: 0%; border-radius: var(--qmm-radius-pill);
  background: var(--qmm-accent); transition: width 200ms ease, background 200ms ease;
}
.qmm-meter__fill.is-warn { background: var(--qmm-warn); }

.qmm-vtabs { display: flex; flex-direction: column; gap: var(--qmm-space-md); min-width: 0; }
.qmm-vtabs .filter input { width: 100%; }
.qmm-vlist-wrap { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; width: 100%; }
.qmm-vlist {
  flex: 0 0 auto; min-width: 0; padding: 6px;
  border: 0; border-radius: var(--qmm-radius-lg); background: var(--qmm-paper-deep);
}
.qmm-vlist.is-scroll { flex: 1 1 auto; overflow: auto; }
.qmm-vlist__items { display: flex; flex-direction: column; gap: var(--qmm-space-xs); margin: 0; padding: 0; list-style: none; }
.qmm-vlist__empty { opacity: .75; }
.qmm-vtab {
  display: grid; grid-template-columns: 28px 1fr auto; align-items: center; gap: var(--qmm-space-lg); width: 100%;
  padding: 8px 10px; border: 2px solid transparent; border-radius: var(--qmm-radius-md);
  background: var(--qmm-card); color: inherit; font-family: var(--qmm-font); font-weight: 700; text-align: left; cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease, transform 80ms ease;
}
.qmm-vtab:hover { border-color: var(--qmm-border-hover); }
.qmm-vtab:active { transform: translateY(1px); }
.qmm-vtab.active { background: var(--qmm-sepia-soft); border-color: var(--qmm-accent-border); color: var(--qmm-sepia-ink); }
.qmm-dot { width: 10px; height: 10px; justify-self: center; border-radius: 50%; box-shadow: 0 0 0 1px var(--qmm-sand-shade) inset; }
.qmm-chip { display: flex; align-items: center; gap: var(--qmm-space-md); min-width: 0; }
.qmm-chip img { width: 20px; height: 20px; object-fit: cover; border: 1px solid var(--qmm-border); border-radius: 50%; }
.qmm-chip__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.qmm-chip .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qmm-chip__sub { font-size: var(--qmm-fs-md); opacity: .7; }
.qmm-tag {
  padding: 3px 7px; font-size: var(--qmm-fs-sm); line-height: 1;
  border: 0; border-radius: var(--qmm-radius-pill); background: var(--qmm-sand); color: var(--qmm-text-soft); font-weight: 800;
}

/* Drag handle for reorderable lists. */
.qmm-grab {
  display: grid; grid-template-columns: repeat(2, 3px); grid-template-rows: repeat(3, 3px);
  align-content: center; justify-content: center; gap: 2px; margin-left: auto; padding: 4px 3px;
  opacity: .8; cursor: grab; user-select: none;
}
.qmm-grab:active { cursor: grabbing; }
.qmm-grab-dot { width: 3px; height: 3px; border-radius: 999px; background: var(--qmm-text-soft); }
.qmm-dragging { opacity: .6; }

/* Selectable tile of the skins grid. */
.qws-pnl-cell {
  position: relative; display: flex; align-items: center; justify-content: center; aspect-ratio: 1; cursor: pointer;
  border: 3px solid var(--qmm-sand-edge); border-radius: 14px; background: var(--qmm-card);
  transition: border-color 120ms ease, transform 120ms ease;
}
.qws-pnl-cell:hover { border-color: var(--qmm-border-hover); transform: translateY(-1px); }
.qws-pnl-cell.is-active { border-color: var(--qmm-sepia); background: var(--qmm-sepia-soft); }
.qws-pnl-cell.is-skinned::after {
  content: ''; position: absolute; top: 5px; right: 5px; width: 6px; height: 6px; border-radius: 50%;
  background: var(--qmm-accent);
}

.qmm-icon-box { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.qmm-icon-box > img { max-width: 100%; max-height: 100%; image-rendering: auto; }

.qmm-modal-scrim {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: var(--qmm-scrim);
}
.qmm-modal {
  display: flex; flex-direction: column; overflow: hidden; color: var(--qmm-text);
  border: 3px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-xl);
  background: var(--qmm-paper); box-shadow: var(--qmm-shadow-modal);
}
.qmm-modal__head {
  display: flex; align-items: center; gap: var(--qmm-space-lg); flex: 0 0 auto; min-height: 52px; padding: 0 12px 0 18px;
  background: var(--qmm-sepia); color: var(--qmm-on-sepia);
}
.qmm-modal__title { flex: 1; min-width: 0; font-size: 18px; font-weight: 900; color: var(--qmm-on-sepia); }
.qmm-modal__close {
  flex: 0 0 auto; width: 32px; height: 32px; cursor: pointer;
  border: 0; border-radius: 10px; background: var(--qmm-sepia-shade);
  color: var(--qmm-on-sepia); font-size: var(--qmm-fs-md); font-weight: 900; line-height: 1;
}
.qmm-modal__close:hover { background: var(--qmm-bark); }
.qmm-modal__body {
  display: flex; flex-direction: column; gap: var(--qmm-space-lg); flex: 1 1 auto; min-height: 0;
  padding: 16px; overflow-y: auto;
}
.qmm-modal__foot {
  display: flex; align-items: center; gap: var(--qmm-space-lg); flex: 0 0 auto; padding: 12px 16px;
  border-top: 2px solid var(--qmm-sand-edge); background: var(--qmm-paper-deep);
}
.qmm-modal__foot:empty { display: none; }

.qmm-menu-card {
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 12px 14px;
  border: 3px solid var(--qmm-sand-edge); border-radius: 16px; background: var(--qmm-card);
  font: inherit; text-align: left; cursor: pointer; transition: border-color 120ms ease;
}
.qmm-menu-card:hover:not(:disabled) { border-color: var(--qmm-accent-border); }
.qmm-menu-card:disabled { opacity: .55; cursor: default; }
.qmm-menu-card__name { font-size: var(--qmm-fs-lg); font-weight: 900; color: var(--qmm-text); }
.qmm-menu-card__detail { font-size: 11.5px; line-height: 1.45; color: var(--qmm-text-dim); }
.qmm-menu-card:disabled .qmm-menu-card__name { color: var(--qmm-text-dim); }
.qmm-menu-card:disabled .qmm-menu-card__detail { color: var(--qmm-sepia-ink); }
`;
