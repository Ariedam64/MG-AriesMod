// Scoped stylesheet for the Community Tools menu.
// Follows the repo convention (see menus/room.ts, menus/editor.ts): one
// id-guarded <style> in document.head, all selectors under a `mgt-` prefix.
// Colors mirror the menu theme tokens declared in ui/menu.ts (teal accent).

const STYLE_ID = "gemini-tools-styles";

const ACCENT = "#5eead4";
const ACCENT_2 = "#2dd4bf";
const TEXT = "#e7eef7";
const TEXT_DIM = "rgba(231,238,247,0.62)";
const BORDER = "rgba(255,255,255,0.10)";
const SURFACE = "rgba(255,255,255,0.03)";

export function ensureToolsStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
/* ── reset for the interactive elements ─────────────────────────────── */
.mgt-chip, .mgt-back, .mgt-action, .mgt-nav, .mgt-dot {
  font-family: inherit;
  -webkit-appearance: none;
  appearance: none;
  margin: 0;
}
.mgt-card:focus-visible, .mgt-chip:focus-visible, .mgt-back:focus-visible,
.mgt-action:focus-visible, .mgt-nav:focus-visible, .mgt-dot:focus-visible {
  outline: 2px solid ${ACCENT};
  outline-offset: 2px;
}

/* ── shell ───────────────────────────────────────────────────────────── */
.mgt-wrap { display: flex; flex-direction: column; gap: 14px; width: 100%; }
.mgt-views { position: relative; width: 100%; }

/* ── intro banner ────────────────────────────────────────────────────── */
.mgt-intro {
  display: flex; flex-direction: column; gap: 7px;
  padding: 16px 18px; border-radius: 14px;
  border: 1px solid rgba(94,234,212,0.20);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(94,234,212,0.10), transparent 55%),
    linear-gradient(160deg, rgba(18,24,34,0.95), rgba(12,17,26,0.96));
}
.mgt-intro__head { display: flex; align-items: center; gap: 9px; }
.mgt-intro__title { font-size: 15px; font-weight: 700; color: ${TEXT}; letter-spacing: 0.01em; }
.mgt-intro__count {
  margin-left: auto; flex-shrink: 0;
  padding: 3px 10px; border-radius: 999px;
  font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
  color: ${ACCENT};
  background: rgba(94,234,212,0.08);
  border: 1px solid rgba(94,234,212,0.18);
}
.mgt-intro__text { margin: 0; font-size: 12.5px; line-height: 1.55; color: ${TEXT_DIM}; }

/* ── filter bar ──────────────────────────────────────────────────────── */
.mgt-filters { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; }
.mgt-label {
  font-size: 9.5px; font-weight: 700; letter-spacing: 0.09em;
  text-transform: uppercase; color: ${TEXT_DIM};
}
.mgt-filters .mgt-label { margin-right: 3px; }
.mgt-chip {
  padding: 5px 11px; border-radius: 999px; cursor: pointer;
  border: 1px solid ${BORDER}; background: ${SURFACE}; color: ${TEXT_DIM};
  font-size: 11px; font-weight: 600; letter-spacing: 0.01em; white-space: nowrap;
  transition: color 140ms ease, background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
.mgt-chip:hover {
  color: ${TEXT};
  border-color: rgba(94,234,212,0.30);
  background: rgba(94,234,212,0.07);
}
.mgt-chip.is-active {
  color: #06181c;
  background: linear-gradient(135deg, ${ACCENT}, ${ACCENT_2});
  border-color: transparent;
  box-shadow: 0 2px 12px rgba(94,234,212,0.22);
}

/* ── icon tile ───────────────────────────────────────────────────────── */
.mgt-tile {
  display: grid; place-items: center; flex-shrink: 0; overflow: hidden;
  width: 38px; height: 38px; border-radius: 11px; font-size: 19px; line-height: 1;
  background: rgba(94,234,212,0.07);
  border: 1px solid rgba(94,234,212,0.16);
}
.mgt-tile img { width: 24px; height: 24px; object-fit: contain; mix-blend-mode: screen; }
.mgt-tile--lg { width: 54px; height: 54px; border-radius: 15px; font-size: 27px; }
.mgt-tile--lg img { width: 34px; height: 34px; }

/* ── tags ────────────────────────────────────────────────────────────── */
.mgt-tags { display: flex; flex-wrap: wrap; gap: 5px; }
.mgt-tag {
  display: inline-flex; align-items: center; white-space: nowrap;
  padding: 2px 8px; border-radius: 6px;
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;
  color: rgba(94,234,212,0.88);
  background: rgba(94,234,212,0.07);
  border: 1px solid rgba(94,234,212,0.16);
}

/* ── list view ───────────────────────────────────────────────────────── */
.mgt-list { display: flex; flex-direction: column; gap: 14px; width: 100%; }
.mgt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(310px, 1fr)); gap: 12px; }
.mgt-card {
  display: flex; flex-direction: column; gap: 10px; text-align: left;
  padding: 14px; border-radius: 14px; cursor: pointer;
  border: 1px solid ${BORDER};
  background: linear-gradient(160deg, rgba(18,24,34,0.70), rgba(12,17,26,0.86));
  transition: transform 170ms ease, border-color 170ms ease, box-shadow 170ms ease;
}
.mgt-card:hover {
  transform: translateY(-2px);
  border-color: rgba(94,234,212,0.32);
  box-shadow: 0 12px 28px rgba(0,0,0,0.38);
}
.mgt-card__head { display: flex; align-items: center; gap: 11px; }
.mgt-card__title {
  font-size: 13.5px; font-weight: 700; color: ${TEXT}; line-height: 1.25;
  overflow: hidden; text-overflow: ellipsis;
}
.mgt-card__arrow {
  margin-left: auto; flex-shrink: 0; font-size: 15px; color: ${ACCENT};
  opacity: 0; transform: translateX(-5px);
  transition: opacity 170ms ease, transform 170ms ease;
}
.mgt-card:hover .mgt-card__arrow, .mgt-card:focus-visible .mgt-card__arrow {
  opacity: 1; transform: translateX(0);
}
.mgt-card__desc {
  margin: 0; font-size: 12px; line-height: 1.55; color: ${TEXT_DIM};
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.mgt-card__foot { margin-top: auto; }

/* ── detail view ─────────────────────────────────────────────────────── */
.mgt-detail { display: flex; flex-direction: column; gap: 14px; width: 100%; }
.mgt-back {
  align-self: flex-start; display: inline-flex; align-items: center; gap: 7px;
  padding: 6px 13px 6px 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid ${BORDER}; background: ${SURFACE}; color: ${TEXT_DIM};
  font-size: 11.5px; font-weight: 600;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease;
}
.mgt-back:hover {
  color: ${TEXT}; border-color: rgba(94,234,212,0.30); background: rgba(94,234,212,0.07);
}
.mgt-back__arrow { font-size: 13px; transition: transform 150ms ease; }
.mgt-back:hover .mgt-back__arrow { transform: translateX(-2px); }

.mgt-hero {
  display: flex; flex-direction: column; gap: 14px;
  padding: 18px; border-radius: 16px;
  border: 1px solid rgba(94,234,212,0.20);
  background:
    radial-gradient(130% 150% at 0% 0%, rgba(94,234,212,0.10), transparent 55%),
    linear-gradient(160deg, rgba(18,24,34,0.95), rgba(12,17,26,0.96));
}
.mgt-hero__top { display: flex; align-items: center; gap: 14px; }
.mgt-hero__titles { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.mgt-hero__title { margin: 0; font-size: 19px; font-weight: 750; line-height: 1.2; color: ${TEXT}; }
.mgt-divider { height: 1px; background: linear-gradient(90deg, rgba(255,255,255,0.10), transparent); }

.mgt-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 9px; }
.mgt-creator {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 3px 11px 3px 3px; border-radius: 999px;
  background: rgba(255,255,255,0.04); border: 1px solid ${BORDER};
  font-size: 11.5px; font-weight: 600; color: ${TEXT};
}
.mgt-creator--plain { padding: 5px 11px; }
.mgt-creator img {
  width: 22px; height: 22px; border-radius: 999px; object-fit: cover;
  border: 1px solid rgba(255,255,255,0.14); flex-shrink: 0;
}

.mgt-panel {
  padding: 16px; border-radius: 14px;
  border: 1px solid ${BORDER}; background: rgba(255,255,255,0.02);
}

/* ── markdown body ───────────────────────────────────────────────────── */
.mgt-md { font-size: 12.5px; line-height: 1.65; color: rgba(231,238,247,0.85); }
.mgt-md > :first-child { margin-top: 0; }
.mgt-md > :last-child { margin-bottom: 0; }
.mgt-md p { margin: 0 0 10px; }
.mgt-md ul { margin: 0 0 10px; padding-left: 18px; list-style: disc; }
.mgt-md li { margin: 3px 0; }
.mgt-md strong { color: ${TEXT}; font-weight: 700; }
.mgt-md em { font-style: italic; }
.mgt-md code {
  padding: 1px 5px; border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.9em;
  color: ${ACCENT};
  background: rgba(94,234,212,0.08);
  border: 1px solid rgba(94,234,212,0.16);
}
.mgt-md a {
  color: ${ACCENT}; text-decoration: none;
  border-bottom: 1px solid rgba(94,234,212,0.35);
  transition: color 140ms ease, border-color 140ms ease;
}
.mgt-md a:hover { color: ${ACCENT_2}; border-bottom-color: ${ACCENT_2}; }

/* ── actions ─────────────────────────────────────────────────────────── */
.mgt-actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
.mgt-action {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 14px; border-radius: 10px; cursor: pointer;
  border: 1px solid ${BORDER}; background: rgba(255,255,255,0.04); color: ${TEXT};
  font-size: 12px; font-weight: 650; letter-spacing: 0.01em;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease, filter 150ms ease;
}
.mgt-action:hover {
  color: ${ACCENT}; border-color: rgba(94,234,212,0.32); background: rgba(94,234,212,0.08);
}
.mgt-action.is-primary {
  color: #06181c; border-color: transparent;
  background: linear-gradient(135deg, ${ACCENT}, ${ACCENT_2});
  box-shadow: 0 4px 16px rgba(94,234,212,0.20);
}
.mgt-action.is-primary:hover { color: #06181c; filter: brightness(1.08); }

/* ── carousel ────────────────────────────────────────────────────────── */
.mgt-carousel { display: flex; flex-direction: column; gap: 10px; width: 100%; }
.mgt-carousel__stage {
  position: relative; width: 100%; aspect-ratio: 16 / 10; overflow: hidden;
  border-radius: 14px; border: 1px solid ${BORDER}; background: rgba(0,0,0,0.28);
}
.mgt-carousel__slide {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
}
.mgt-carousel__slide img { max-width: 100%; max-height: 100%; object-fit: contain; cursor: zoom-in; }
.mgt-nav {
  position: absolute; top: 50%; transform: translateY(-50%);
  display: grid; place-items: center; width: 36px; height: 36px;
  border-radius: 50%; cursor: pointer; z-index: 1;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(6,10,16,0.72); color: ${TEXT};
  font-size: 20px; line-height: 1; padding: 0 0 2px;
  backdrop-filter: blur(6px);
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}
.mgt-nav:hover { background: rgba(6,10,16,0.92); border-color: rgba(94,234,212,0.40); color: ${ACCENT}; }
.mgt-nav--prev { left: 10px; }
.mgt-nav--next { right: 10px; }
.mgt-dots { display: flex; justify-content: center; gap: 6px; }
.mgt-dot {
  width: 7px; height: 7px; padding: 0; border-radius: 50%; cursor: pointer;
  border: none; background: rgba(255,255,255,0.28);
  transition: background 160ms ease, width 160ms ease;
}
.mgt-dot:hover { background: rgba(255,255,255,0.5); }
.mgt-dot.is-active { width: 18px; border-radius: 999px; background: ${ACCENT}; }

/* ── loading / error / empty states ──────────────────────────────────── */
.mgt-state {
  display: flex; flex-direction: column; align-items: center; gap: 11px;
  padding: 30px 20px; border-radius: 14px; text-align: center;
  border: 1px dashed ${BORDER}; background: rgba(255,255,255,0.02);
}
.mgt-state__text { margin: 0; font-size: 12.5px; line-height: 1.55; color: ${TEXT_DIM}; }
.mgt-state__title { font-size: 13.5px; font-weight: 700; color: ${TEXT}; }
.mgt-spinner {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid rgba(94,234,212,0.16); border-top-color: ${ACCENT};
  animation: mgt-spin 700ms linear infinite;
}
@keyframes mgt-spin { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .mgt-card, .mgt-card__arrow, .mgt-back__arrow, .mgt-dot { transition: none; }
  .mgt-card:hover { transform: none; }
  .mgt-spinner { animation-duration: 2s; }
}
`;

  document.head.appendChild(style);
}
