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
  outline: 3px solid var(--qmm-accent-border);
  outline-offset: 2px;
}
.mgt-nav, .mgt-dot { font-family: inherit; -webkit-appearance: none; appearance: none; margin: 0; }

/* Shell. The window sizes to its content, so the menu sets its own width,
   capped to the screen so a narrow window never scrolls sideways. */
.mgt-wrap {
  display: flex; flex-direction: column; box-sizing: border-box;
  width: min(600px, calc((100vw - 64px) / var(--qmm-scale, 1)));
  max-width: 100%;
}
.mgt-views { position: relative; width: 100%; }
/* The window body scrolls, and its padding leaves room for focus rings that a
   scrolling panel here would clip. */
.qmm-views.mgt-host { overflow: visible; }

/* Small pieces shared by both views. */
.mgt-tile {
  display: grid; place-items: center; flex-shrink: 0;
  width: 40px; height: 40px; font-size: 24px; line-height: 1;
}
.mgt-tile img { width: 100%; height: 100%; object-fit: contain; }
.mgt-tile--lg { width: 56px; height: 56px; font-size: 34px; }

.mgt-tags { display: flex; flex-wrap: wrap; gap: var(--qmm-space-xs); }
.mgt-tag {
  display: inline-flex; align-items: center; white-space: nowrap;
  padding: 2px 8px; border-radius: var(--qmm-radius-pill);
  font-size: var(--qmm-fs-xs); font-weight: 800;
  color: var(--qmm-text-soft); background: var(--qmm-sand);
}

/* List view. */
.mgt-list { display: flex; flex-direction: column; gap: var(--qmm-space-lg); width: 100%; }
.mgt-intro { display: flex; align-items: flex-start; gap: var(--qmm-space-lg); }
.mgt-intro__text { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.mgt-intro__title { font-size: var(--qmm-fs-xl); font-weight: 900; color: var(--qmm-text); }
.mgt-intro__sub { font-size: var(--qmm-fs-sm); line-height: 1.4; color: var(--qmm-text-dim); }

.mgt-filters { display: flex; flex-wrap: wrap; gap: var(--qmm-space-sm); }
.mgt-filters .qmm-btn { border-radius: var(--qmm-radius-pill); padding: 5px 12px; }

.mgt-grid {
  display: grid; gap: var(--qmm-space-lg);
  grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
}
.mgt-card {
  display: flex; flex-direction: column; gap: var(--qmm-space-md); min-width: 0; text-align: left;
  padding: var(--qmm-space-lg) 14px 14px; border-radius: var(--qmm-radius-lg); cursor: pointer;
  border: 3px solid var(--qmm-sand-edge); background: var(--qmm-card);
  transition: border-color 120ms ease;
}
.mgt-card:hover { border-color: var(--qmm-accent-border); }
.mgt-card__head { display: flex; align-items: center; gap: var(--qmm-space-lg); min-width: 0; }
.mgt-card__title {
  flex: 1 1 auto; min-width: 0;
  font-size: var(--qmm-fs-lg); font-weight: 900; line-height: 1.25; color: var(--qmm-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.mgt-card__arrow {
  flex-shrink: 0; font-size: 18px; font-weight: 900; line-height: 1; color: var(--qmm-text-dim);
  transition: color 120ms ease, transform 120ms ease;
}
.mgt-card:hover .mgt-card__arrow, .mgt-card:focus-visible .mgt-card__arrow {
  color: var(--qmm-sepia-ink); transform: translateX(2px);
}
.mgt-card__desc {
  margin: 0; font-size: var(--qmm-fs-sm); line-height: 1.5; color: var(--qmm-text-soft);
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.mgt-card__foot { margin-top: auto; }

/* Detail view. */
.mgt-detail { display: flex; flex-direction: column; gap: var(--qmm-space-xl); width: 100%; }
.mgt-back { align-self: flex-start; margin-left: -6px; }
.mgt-hero { display: flex; align-items: center; gap: var(--qmm-space-xl); min-width: 0; }
.mgt-hero__titles { display: flex; flex-direction: column; gap: var(--qmm-space-sm); flex: 1 1 auto; min-width: 0; }
.mgt-hero__title {
  margin: 0; font-size: 18px; font-weight: 900; line-height: 1.2; color: var(--qmm-text);
  overflow-wrap: anywhere;
}

/* Creators are plain names (with their avatar when there is one), so they
   never read as one more row of tags. */
.mgt-creators {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--qmm-space-xs) var(--qmm-space-md);
  font-size: var(--qmm-fs-sm);
}
.mgt-creators__label { color: var(--qmm-text-dim); }
.mgt-creator { display: inline-flex; align-items: center; gap: var(--qmm-space-xs); font-weight: 800; color: var(--qmm-text); }
.mgt-creator img {
  width: 20px; height: 20px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--qmm-sand-edge);
}

.mgt-actions { display: flex; flex-wrap: wrap; gap: var(--qmm-space-md); }
.mgt-actions .qmm-btn { flex: 1 1 140px; }

/* Markdown body, in a tool's About card and in the changelog notice. */
.mgt-md { font-size: var(--qmm-fs-md); line-height: 1.6; color: var(--qmm-text-soft); }
.mgt-md > :first-child { margin-top: 0; }
.mgt-md > :last-child { margin-bottom: 0; }
.mgt-md p { margin: 0 0 10px; }
.mgt-md ul { margin: 0 0 10px; padding-left: 18px; list-style: disc; }
.mgt-md li { margin: 3px 0; }
.mgt-md strong { color: var(--qmm-text); font-weight: 800; }
.mgt-md em { font-style: italic; }
.mgt-md code {
  padding: 1px 5px; border-radius: 5px;
  font-family: var(--qmm-font-mono); font-size: 0.9em;
  color: var(--qmm-sepia-ink); background: var(--qmm-sepia-soft);
}
.mgt-md a {
  color: var(--qmm-sepia-ink); font-weight: 700; text-decoration: none;
  border-bottom: 2px solid var(--qmm-accent-border);
  transition: border-color 120ms ease;
}
.mgt-md a:hover { border-bottom-color: var(--qmm-sepia-ink); }

/* Carousel. */
.mgt-carousel { display: flex; flex-direction: column; gap: var(--qmm-space-md); width: 100%; }
.mgt-carousel__stage {
  position: relative; width: 100%; aspect-ratio: 16 / 10; overflow: hidden;
  border-radius: var(--qmm-radius-lg); background: var(--qmm-paper-deep);
  cursor: zoom-in;
}
.mgt-carousel__stage:focus-visible { outline: 3px solid var(--qmm-accent-border); outline-offset: 2px; }
/* The slides stack on top of each other, so they must never take the clicks
   meant for the stage. Only the nav buttons opt back in. */
.mgt-carousel__slide {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  pointer-events: none;
}
.mgt-carousel__slide img { max-width: 100%; max-height: 100%; object-fit: contain; }
.mgt-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  display: grid; place-items: center; width: 34px; height: 34px;
  border-radius: 50%; cursor: pointer; z-index: 1;
  border: 0; background: var(--qmm-paper); color: var(--qmm-text);
  box-shadow: inset 0 -3px 0 var(--qmm-sand-shade);
  font-size: 20px; font-weight: 900; line-height: 1; padding: 0 0 3px;
  transition: background 120ms ease, color 120ms ease;
}
.mgt-nav:hover { background: var(--qmm-card); color: var(--qmm-sepia-ink); }
.mgt-nav--prev { left: 10px; }
.mgt-nav--next { right: 10px; }
.mgt-dots { display: flex; justify-content: center; gap: var(--qmm-space-sm); }
.mgt-dot {
  width: 8px; height: 8px; padding: 0; border-radius: 50%; cursor: pointer;
  border: none; background: var(--qmm-sand-edge);
  transition: background 160ms ease, width 160ms ease;
}
.mgt-dot:hover { background: var(--qmm-border-hover); }
.mgt-dot.is-active { width: 20px; border-radius: var(--qmm-radius-pill); background: var(--qmm-sepia); }

/* Full-screen image zoom. */
.mgt-zoom {
  position: fixed; inset: 0; z-index: 2147483647; display: grid; place-items: center; padding: 20px;
  background: var(--qmm-scrim); backdrop-filter: blur(4px);
}
.mgt-zoom__box {
  position: relative; max-width: 90vw; max-height: 90vh; overflow: hidden;
  background: var(--qmm-paper-deep); border: 3px solid var(--qmm-sand-edge); border-radius: var(--qmm-radius-lg);
  box-shadow: var(--qmm-shadow-modal);
}
.mgt-zoom__close {
  top: 10px; right: 10px; left: auto; transform: none; z-index: 2; padding: 0; font-size: var(--qmm-fs-lg);
}
.mgt-zoom__status { padding: 18px 22px; }
.mgt-zoom__status.is-error { color: var(--qmm-danger-ink); }
.mgt-zoom__img {
  display: none; max-width: 100%; max-height: 90vh; object-fit: contain; cursor: zoom-in;
  transition: transform 200ms ease;
}
.mgt-zoom__img.is-loaded { display: block; }
.mgt-zoom__img.is-zoomed { cursor: zoom-out; }

/* Loading, error and empty states. */
.mgt-state {
  display: flex; flex-direction: column; align-items: center; gap: var(--qmm-space-md);
  padding: 32px 20px; border-radius: var(--qmm-radius-lg); text-align: center;
  background: var(--qmm-paper-deep);
}
.mgt-state .qmm-btn { margin-top: var(--qmm-space-xs); }
.mgt-state__text { margin: 0; font-size: var(--qmm-fs-md); line-height: 1.5; color: var(--qmm-text-soft); }
.mgt-state__title { font-size: var(--qmm-fs-lg); font-weight: 900; color: var(--qmm-text); }
.mgt-grid > .mgt-state { grid-column: 1 / -1; }
.mgt-spinner {
  width: 24px; height: 24px; border-radius: 50%;
  border: 3px solid var(--qmm-sand-edge); border-top-color: var(--qmm-sepia);
  animation: mgt-spin 700ms linear infinite;
}
@keyframes mgt-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .mgt-card, .mgt-card__arrow, .mgt-dot { transition: none; }
  .mgt-card:hover .mgt-card__arrow { transform: none; }
  .mgt-spinner { animation-duration: 2s; }
}
`;

  document.head.appendChild(style);
}
