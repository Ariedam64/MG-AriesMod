// The version pill in Settings, Infos: this build against the latest release,
// linking to the download when a newer one is out.

import { isDiscordSurface } from "../../platform/environment";
import { checkModVersion } from "../../platform/modVersion";
import { pill, setTone } from "../../ui/kit/badges";

/** Opens a link in a new tab; inside Discord the userscript manager has to do it. */
function openDownloadLink(url: string): void {
  const gmObject = (globalThis as typeof globalThis & { GM?: { openInTab?: typeof GM_openInTab } }).GM;
  const gmOpen = typeof GM_openInTab === "function"
    ? GM_openInTab
    : typeof gmObject?.openInTab === "function"
      ? gmObject.openInTab.bind(gmObject)
      : null;
  if (isDiscordSurface() && gmOpen) {
    try {
      gmOpen(url, { active: true, setParent: true });
      return;
    } catch (error) {
      console.warn("[MagicGarden] GM_openInTab failed, falling back to window.open", error);
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export function versionPill(): HTMLElement {
  const badge = pill("checking…", "warn");
  badge.addEventListener("click", () => {
    const url = badge.dataset.download;
    if (url) openDownloadLink(url);
  });

  void checkModVersion().then(({ local, remote, download, behind }) => {
    badge.textContent = behind && local ? `${local} → ${remote}` : local || remote || "Unknown";
    setTone(badge, remote && !behind ? "ok" : "warn");
    badge.classList.toggle("is-link", !!download);
    if (download) {
      badge.dataset.download = download;
      badge.title = "Download the new version";
    }
  });
  return badge;
}
