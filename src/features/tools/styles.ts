// Scoped stylesheet for the Community Tools menu, also used by the changelog
// notice for its markdown body and screenshot carousel. Every selector carries
// the `mgt-` prefix, and colours come from the kit's `--qmm-*` variables.
// Buttons are kit buttons and are styled by the kit.

const STYLE_ID = "gemini-tools-styles";

export function ensureToolsStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.mgt-card:focus-visible, .mgt-nav:focus-visible, .mgt-dot:focus-visible {
  outline: 2px solid var(--qmm-accent);
  outline-offset: 2px;
}
.mgt-nav, .mgt-dot { font-family: inherit; -webkit-appearance: none; appearance: none; margin: 0; }

/* ── shell ───────────────────────────────────────────────────────────── */
.mgt-wrap { display: flex; flex-direction: column; gap: 14px; width: 100%; }
.mgt-views { position: relative; width: 100%; }

/* ── filter bar ──────────────────────────────────────────────────────── */
.mgt-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.mgt-label {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: var(--qmm-text-soft);
}
.mgt-filters .mgt-label { margin-right: 3px; }
.mgt-filters .qmm-btn { border-radius: var(--qmm-radius-pill); }

/* ── icon tile (no frame: the artwork stands on its own) ─────────────── */
.mgt-tile {
  display: grid; place-items: center; flex-shrink: 0;
  width: 38px; height: 38px; font-size: 22px; line-height: 1;
}
.mgt-tile img { width: 100%; height: 100%; object-fit: contain; }
.mgt-tile--lg { width: 54px; height: 54px; font-size: 32px; }

/* ── tags ────────────────────────────────────────────────────────────── */
.mgt-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.mgt-tag {
  display: inline-flex; align-items: center; white-space: nowrap;
  padding: 2px 8px; border-radius: 6px;
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
  color: var(--qmm-accent);
  background: var(--qmm-accent-soft);
  border: 1px solid var(--qmm-accent-soft);
}

/* ── list view ───────────────────────────────────────────────────────── */
.mgt-list { display: flex; flex-direction: column; gap: 14px; width: 100%; }
.mgt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 12px; }
.mgt-card {
  display: flex; flex-direction: column; gap: 10px; text-align: left;
  padding: 14px; border-radius: 14px; cursor: pointer;
  border: 2px solid var(--qmm-sand-edge);
  background: var(--qmm-card);
  transition: transform 170ms ease, border-color 170ms ease, box-shadow 170ms ease;
}
.mgt-card:hover {
  transform: translateY(-2px);
  border-color: var(--qmm-accent-border);
  box-shadow: var(--qmm-shadow-raise-small);
}
.mgt-card__head { display: flex; align-items: center; gap: 11px; }
.mgt-card__title {
  font-size: 13.5px; font-weight: 700; color: var(--qmm-text); line-height: 1.25;
  overflow: hidden; text-overflow: ellipsis;
}
.mgt-card__arrow {
  margin-left: auto; flex-shrink: 0; font-size: 15px; color: var(--qmm-accent);
  opacity: 0; transform: translateX(-5px);
  transition: opacity 170ms ease, transform 170ms ease;
}
.mgt-card:hover .mgt-card__arrow, .mgt-card:focus-visible .mgt-card__arrow {
  opacity: 1; transform: translateX(0);
}
.mgt-card__desc {
  margin: 0; font-size: 12px; line-height: 1.55; color: var(--qmm-text-soft);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.mgt-card__foot { margin-top: auto; }

/* ── detail view ─────────────────────────────────────────────────────── */
.mgt-detail { display: flex; flex-direction: column; gap: 14px; width: 100%; }
.mgt-back { align-self: flex-start; }
.mgt-hero {
  display: flex; flex-direction: column; gap: 14px;
  padding: 18px; border-radius: 16px;
  border: 2px solid var(--qmm-accent-border);
  background: var(--qmm-accent-soft);
}
.mgt-hero__top { display: flex; align-items: center; flex-wrap: wrap; gap: 14px; }
/* Grows to fill the row so the creators get pushed to the far right. */
.mgt-hero__titles { display: flex; flex-direction: column; gap: 8px; min-width: 0; flex: 1 1 240px; }
.mgt-hero__title { margin: 0; font-size: 19px; font-weight: 750; line-height: 1.2; color: var(--qmm-text); }
.mgt-divider { height: 1px; background: linear-gradient(90deg, var(--qmm-border-strong), transparent); }

.mgt-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
.mgt-hero__top .mgt-meta { margin-left: auto; }
.mgt-creator {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 3px 11px 3px 3px; border-radius: 999px;
  background: var(--qmm-card-bg); border: 1px solid var(--qmm-border);
  font-size: 11.5px; font-weight: 600; color: var(--qmm-text);
}
.mgt-creator--plain { padding: 5px 11px; }
.mgt-creator img {
  width: 22px; height: 22px; border-radius: 999px; object-fit: cover;
  border: 1px solid var(--qmm-border-strong); flex-shrink: 0;
}

/* ── markdown body ───────────────────────────────────────────────────── */
.mgt-md { font-size: 12.5px; line-height: 1.65; color: var(--qmm-text-soft); }
.mgt-md > :first-child { margin-top: 0; }
.mgt-md > :last-child { margin-bottom: 0; }
.mgt-md p { margin: 0 0 10px; }
.mgt-md ul { margin: 0 0 10px; padding-left: 18px; list-style: disc; }
.mgt-md li { margin: 3px 0; }
.mgt-md strong { color: var(--qmm-text); font-weight: 700; }
.mgt-md em { font-style: italic; }
.mgt-md code {
  padding: 1px 5px; border-radius: 5px;
  font-family: var(--qmm-font-mono); font-size: 0.9em;
  color: var(--qmm-accent);
  background: var(--qmm-accent-soft);
  border: 1px solid var(--qmm-accent-soft);
}
.mgt-md a {
  color: var(--qmm-accent); text-decoration: none;
  border-bottom: 1px solid var(--qmm-accent-border);
  transition: color 140ms ease, border-color 140ms ease;
}
.mgt-md a:hover { border-bottom-color: var(--qmm-accent); }

/* ── actions ─────────────────────────────────────────────────────────── */
.mgt-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }

/* ── carousel ────────────────────────────────────────────────────────── */
.mgt-carousel { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.mgt-carousel__stage {
  position: relative; width: 100%; aspect-ratio: 16 / 10; overflow: hidden;
  border-radius: 14px; border: 1px solid var(--qmm-border); background: var(--qmm-field-bg);
  cursor: zoom-in;
}
.mgt-carousel__stage:focus-visible { outline: 2px solid var(--qmm-accent); outline-offset: 2px; }
/* The slides stack on top of each other, so they must never take the clicks
   meant for the stage. Only the nav buttons opt back in. */
.mgt-carousel__slide {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.mgt-carousel__slide img { max-width: 100%; max-height: 100%; object-fit: contain; }
.mgt-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  display: grid; place-items: center; width: 36px; height: 36px;
  border-radius: 50%; cursor: pointer; z-index: 1;
  border: 2px solid var(--qmm-sand-edge);
  background: var(--qmm-paper); color: var(--qmm-text);
  font-size: 20px; line-height: 1; padding: 0 0 2px;
  backdrop-filter: blur(6px);
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}
.mgt-nav:hover { background: var(--qmm-card); border-color: var(--qmm-accent-border-hover); color: var(--qmm-accent); }
.mgt-nav--prev { left: 10px; }
.mgt-nav--next { right: 10px; }
.mgt-dots { display: flex; justify-content: center; gap: 6px; }
.mgt-dot {
  width: 7px; height: 7px; padding: 0; border-radius: 50%; cursor: pointer;
  border: none; background: var(--qmm-sand-edge);
  transition: background 160ms ease, width 160ms ease;
}
.mgt-dot:hover { background: var(--qmm-sand-shade); }
.mgt-dot.is-active { width: 18px; border-radius: 999px; background: var(--qmm-accent); }

/* ── full-screen image zoom ──────────────────────────────────────────── */
.mgt-zoom {
  position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 20px;
  background: var(--qmm-scrim); backdrop-filter: blur(4px);
}
.mgt-zoom__box {
  position: relative; max-width: 90vw; max-height: 90vh; overflow: hidden;
  background: var(--qmm-sunken); border: 1px solid var(--qmm-accent-border); border-radius: 14px;
  box-shadow: var(--qmm-shadow-modal);
}
.mgt-zoom__close {
  top: 10px; right: 10px; left: auto; transform: none; z-index: 2; padding: 0; font-size: 14px;
}
.mgt-zoom__status { padding: 18px 22px; }
.mgt-zoom__status.is-error { color: var(--qmm-danger); }
.mgt-zoom__img {
  display: none; max-width: 100%; max-height: 90vh; object-fit: contain; cursor: zoom-in;
  transition: transform 200ms ease;
}
.mgt-zoom__img.is-loaded { display: block; }
.mgt-zoom__img.is-zoomed { cursor: zoom-out; }

/* ── loading / error / empty states ──────────────────────────────────── */
.mgt-state {
  display: flex; flex-direction: column; align-items: center; gap: 11px;
  padding: 30px 20px; border-radius: 14px; text-align: center;
  border: 1px dashed var(--qmm-border); background: var(--qmm-card-bg);
}
.mgt-state__text { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--qmm-text-soft); }
.mgt-state__title { font-size: 13.5px; font-weight: 700; color: var(--qmm-text); }
.mgt-spinner {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid var(--qmm-accent-soft); border-top-color: var(--qmm-accent);
  animation: mgt-spin 700ms linear infinite;
}
@keyframes mgt-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .mgt-card, .mgt-card__arrow, .mgt-dot { transition: none; }
  .mgt-card:hover { transform: none; }
  .mgt-spinner { animation-duration: 2s; }
}
`;

  document.head.appendChild(style);
}
