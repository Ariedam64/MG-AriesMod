import { pageWindow } from "../platform/pageContext";

/**
 * The game build the page runs (the `NNNN` of `/version/NNNN/` in its asset
 * URLs), null until found. A live binding: importers see it once it is set.
 */
export let gameVersion: string | null = null;

/** Matches `/version/<v>/...` and `/r/12345/version/<v>/...`. */
const VERSION_IN_URL = /\/(?:r\/\d+\/)?version\/([^/]+)/;

function fromUrls(urls: Iterable<string>): string | null {
  for (const url of urls) {
    const match = url && url.match(VERSION_IN_URL);
    if (match?.[1]) return match[1];
  }
  return null;
}

/** A version some page script published as a global, in any of the shapes seen. */
function fromGlobals(): string | null {
  const root = pageWindow as any;
  const gv = root.gameVersion || root.MG_gameVersion || root.__MG_GAME_VERSION__;
  if (!gv) return null;
  try {
    if (typeof gv.getVersion === "function") return gv.getVersion() ? String(gv.getVersion()) : null;
    if (typeof gv.get === "function") return gv.get() ? String(gv.get()) : null;
    if (typeof gv === "string") return gv;
  } catch {}
  return null;
}

/**
 * Finds the game version (the page's scripts, then globals, then stylesheet
 * links) and remembers it in `gameVersion`. Null while the page has not loaded
 * the game yet; call again later.
 */
export function detectGameVersion(doc?: Document): string | null {
  if (gameVersion) return gameVersion;
  const d = doc ?? (typeof document !== "undefined" ? document : null);
  const scripts = d ? Array.from(d.scripts, (s) => s.src) : [];
  const links = d ? Array.from(d.querySelectorAll("link[href]"), (l) => (l as HTMLLinkElement).href) : [];
  const found = fromUrls(scripts) ?? fromGlobals() ?? fromUrls(links);
  if (found) gameVersion = found;
  return found;
}
