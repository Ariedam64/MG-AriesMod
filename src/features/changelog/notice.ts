// One-time popup after a mod update: the release notes for the version now
// running, once per version. The notes are fetched live from the repo
// (fetchChangelog.ts), so publishing them never needs a rebuild, and a version
// with nothing worth telling has no entry and shows no popup.

import { addStyle } from "../../lib/dom";
import { renderMarkdown } from "../../lib/markdown";
import { getLocalVersion } from "../../platform/modVersion";
import { getSeenChangelogVersion, markChangelogVersionSeen } from "../../platform/storage";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
// The Tools menu's markdown styles and carousel, whose GM-first image loading
// keeps remote screenshots working inside the Discord Activity CSP sandbox.
import { renderCarousel } from "../tools/carousel";
import { ensureToolsStyles } from "../tools/styles";
import { fetchChangelogEntryForVersion, type ChangelogEntry } from "./fetchChangelog";

const OVERLAY_ID = "mgChangelogNotice";

const NOTICE_CSS = `
#${OVERLAY_ID} {
  position: fixed; inset: 0; z-index: 2147483647;
  display: grid; place-items: center; padding: 20px;
  background: rgba(0,0,0,0.72); backdrop-filter: blur(4px);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}
#${OVERLAY_ID} .mgcl-box {
  width: 440px; max-width: 92vw; max-height: 85vh; overflow-y: auto;
  padding: 22px 24px; border-radius: 16px;
  border: 1px solid var(--qmm-accent-border);
  background:
    radial-gradient(130% 150% at 0% 0%, var(--qmm-accent-soft), transparent 55%),
    linear-gradient(160deg, rgba(18,24,34,0.97), rgba(10,14,20,0.98));
  box-shadow: var(--qmm-shadow-modal);
  color: var(--qmm-text);
}
#${OVERLAY_ID} .mgcl-eyebrow {
  margin: 0 0 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: var(--qmm-accent);
}
#${OVERLAY_ID} .mgcl-title { margin: 0 0 4px; font-size: 18px; font-weight: 750; }
#${OVERLAY_ID} .mgcl-version { margin: 0 0 16px; font-size: 11.5px; color: var(--qmm-text-soft); }
#${OVERLAY_ID} .mgcl-media { margin-top: 14px; }
#${OVERLAY_ID} .mgcl-close { margin-top: 18px; }
`;

let stylesInjected = false;
function ensureStyles(): void {
  ensureToolsStyles();
  if (stylesInjected) return;
  stylesInjected = true;
  addStyle(NOTICE_CSS);
}

function buildOverlay(entry: ChangelogEntry): HTMLElement {
  const overlay = h("div");
  overlay.id = OVERLAY_ID;
  const dismiss = () => {
    markChangelogVersionSeen(entry.version);
    overlay.remove();
  };

  const box = h("div", "mgcl-box");
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "What's new");

  const body = h("div", "mgt-md");
  body.innerHTML = renderMarkdown(entry.notes);

  box.append(
    h("p", "mgcl-eyebrow", "What's new"),
    h("h2", "mgcl-title", entry.title?.trim() || "This update brings:"),
    h("p", "mgcl-version", entry.date ? `v${entry.version} · ${entry.date}` : `v${entry.version}`),
    body,
  );

  const images = entry.images ?? [];
  if (images.length) {
    const carousel = renderCarousel(images);
    carousel.root.classList.add("mgcl-media");
    box.appendChild(carousel.root);
  }

  const close = button("Got it", { variant: "primary", fullWidth: true, onClick: dismiss });
  close.classList.add("mgcl-close");
  box.appendChild(close);

  overlay.appendChild(box);
  overlay.onclick = (event) => {
    if (event.target === overlay) dismiss();
  };
  return overlay;
}

/**
 * Shows the changelog for the version currently running, once per version.
 * Does nothing if that version has no entry, if it was already seen, or if
 * there is no page yet.
 */
export async function showChangelogNoticeOnce(): Promise<void> {
  if (typeof document === "undefined" || !document.body) return;

  const version = getLocalVersion();
  if (!version) return;
  if (getSeenChangelogVersion() === version) return;
  if (document.getElementById(OVERLAY_ID)) return;

  let entry: ChangelogEntry | null;
  try {
    entry = await fetchChangelogEntryForVersion(version);
  } catch (error) {
    console.warn("[Changelog] Failed to load changelog:", error);
    return;
  }
  if (!entry) return;

  ensureStyles();
  document.body.appendChild(buildOverlay(entry));
}
