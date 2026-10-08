declare const GM_openInTab:
  | ((url: string, opts?: { active?: boolean; insert?: boolean; setParent?: boolean }) => void)
  | undefined;

/**
 * Opens `url` in a new tab: through the userscript manager when it can, since
 * that also works inside the Discord Activity, otherwise through a link click.
 */
export function openLink(url: string): boolean {
  if (typeof GM_openInTab === "function") {
    GM_openInTab(url, { active: true, insert: true });
    return true;
  }

  if (typeof window === "undefined") return false;

  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}
