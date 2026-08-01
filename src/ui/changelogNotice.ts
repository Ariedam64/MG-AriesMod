// src/ui/changelogNotice.ts
// One-time modal shown after a mod update: the release notes for the version
// the user is now running, once per version. Content is fetched live from a
// remote JSON file (services/changelog.ts), so publishing new notes never
// needs a rebuild. A version bump with nothing worth telling users about
// simply has no entry in that file, so no modal appears for it.

import { getLocalVersion } from "../utils/version";
import { getSeenChangelogVersion, markChangelogVersionSeen } from "../utils/localStorage";
import { fetchChangelogEntryForVersion, type ChangelogEntry } from "../services/changelog";
import { renderMarkdown } from "../utils/markdown";

const OVERLAY_ID = "mgChangelogNotice";
const STYLE_ID = "mgChangelogNoticeStyle";
// Same top-layer value used by the other full-screen overlays (sellAllPets,
// roomPrivacyNotice, the tools carousel zoom).
const OVERLAY_Z_INDEX = "2147483647";

const ACCENT = "#5eead4";
const ACCENT_2 = "#2dd4bf";
const TEXT = "#e7eef7";
const TEXT_DIM = "rgba(231,238,247,0.68)";

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${OVERLAY_ID} {
  position: fixed; inset: 0; z-index: ${OVERLAY_Z_INDEX};
  display: grid; place-items: center; padding: 20px;
  background: rgba(0,0,0,0.72); backdrop-filter: blur(4px);
  font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}
#${OVERLAY_ID} .mgcl-box {
  width: 440px; max-width: 92vw; max-height: 85vh; overflow-y: auto;
  padding: 22px 24px; border-radius: 16px;
  border: 1px solid rgba(94,234,212,0.20);
  background:
    radial-gradient(130% 150% at 0% 0%, rgba(94,234,212,0.10), transparent 55%),
    linear-gradient(160deg, rgba(18,24,34,0.97), rgba(10,14,20,0.98));
  box-shadow: 0 24px 60px rgba(0,0,0,0.55);
  color: ${TEXT};
}
#${OVERLAY_ID} .mgcl-eyebrow {
  font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
  color: ${ACCENT}; margin: 0 0 6px;
}
#${OVERLAY_ID} .mgcl-title { font-size: 18px; font-weight: 750; margin: 0 0 4px; }
#${OVERLAY_ID} .mgcl-version { font-size: 11.5px; color: ${TEXT_DIM}; margin: 0 0 16px; }
#${OVERLAY_ID} .mgcl-body { font-size: 12.5px; line-height: 1.65; color: rgba(231,238,247,0.85); }
#${OVERLAY_ID} .mgcl-body > :first-child { margin-top: 0; }
#${OVERLAY_ID} .mgcl-body > :last-child { margin-bottom: 0; }
#${OVERLAY_ID} .mgcl-body p { margin: 0 0 10px; }
#${OVERLAY_ID} .mgcl-body ul { margin: 0 0 10px; padding-left: 18px; list-style: disc; }
#${OVERLAY_ID} .mgcl-body li { margin: 3px 0; }
#${OVERLAY_ID} .mgcl-body strong { color: ${TEXT}; font-weight: 700; }
#${OVERLAY_ID} .mgcl-body code {
  padding: 1px 5px; border-radius: 5px; font-size: 0.9em;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  color: ${ACCENT}; background: rgba(94,234,212,0.08); border: 1px solid rgba(94,234,212,0.16);
}
#${OVERLAY_ID} .mgcl-body a {
  color: ${ACCENT}; text-decoration: none; border-bottom: 1px solid rgba(94,234,212,0.35);
}
#${OVERLAY_ID} .mgcl-body a:hover { color: ${ACCENT_2}; border-bottom-color: ${ACCENT_2}; }
#${OVERLAY_ID} .mgcl-close {
  margin-top: 18px; width: 100%; padding: 10px 16px; border-radius: 10px; cursor: pointer;
  border: none; color: #06181c; font-size: 13px; font-weight: 700;
  background: linear-gradient(135deg, ${ACCENT}, ${ACCENT_2});
  box-shadow: 0 4px 16px rgba(94,234,212,0.20);
}
#${OVERLAY_ID} .mgcl-close:hover { filter: brightness(1.08); }
#${OVERLAY_ID} .mgcl-close:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
  `;
  document.head.appendChild(style);
}

function dismiss(overlay: HTMLElement, version: string): void {
  markChangelogVersionSeen(version);
  overlay.remove();
}

function buildOverlay(entry: ChangelogEntry): HTMLElement {
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;

  const box = document.createElement("div");
  box.className = "mgcl-box";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", "What's new");

  const eyebrow = document.createElement("p");
  eyebrow.className = "mgcl-eyebrow";
  eyebrow.textContent = "What's new";

  const title = document.createElement("h2");
  title.className = "mgcl-title";
  title.textContent = entry.title?.trim() || "This update brings:";

  const versionLine = document.createElement("p");
  versionLine.className = "mgcl-version";
  versionLine.textContent = entry.date ? `v${entry.version} · ${entry.date}` : `v${entry.version}`;

  const body = document.createElement("div");
  body.className = "mgcl-body";
  body.innerHTML = renderMarkdown(entry.notes);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "mgcl-close";
  close.textContent = "Got it";
  close.onclick = () => dismiss(overlay, entry.version);

  box.append(eyebrow, title, versionLine, body, close);
  overlay.appendChild(box);
  overlay.onclick = (event) => {
    if (event.target === overlay) dismiss(overlay, entry.version);
  };

  return overlay;
}

/**
 * Shows the changelog for the version currently running, once per version.
 * No-op if that version has no changelog entry, if it was already seen, or
 * if there is no DOM available.
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

  ensureStyle();
  document.body.appendChild(buildOverlay(entry));
}
