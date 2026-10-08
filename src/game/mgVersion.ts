import { ORIGIN, sleep } from "../platform/gm";

const VERSION_PATH = "/platform/v1/version";
const VERSION_CACHE_TTL = 60 * 1000; // 1 min

let pendingPromise: Promise<string> | null = null;
let cachedVersion: string | null = null;
let cachedAt = 0;

function nowMs(): number {
  return Date.now();
}

function setCachedVersion(version: string): void {
  cachedVersion = version;
  cachedAt = nowMs();
}

function getCachedVersion(): string | null {
  if (!cachedVersion) return null;
  if (nowMs() - cachedAt < VERSION_CACHE_TTL) return cachedVersion;
  return null;
}

function readVersionFromGlobals(): string | null {
  const root: any = (globalThis as any).unsafeWindow || (globalThis as any);
  const gv = root?.gameVersion || root?.MG_gameVersion || root?.__MG_GAME_VERSION__;
  if (!gv) return null;
  try {
    if (typeof gv.getVersion === "function") {
      const v = gv.getVersion();
      return v ? String(v) : null;
    }
    if (typeof gv.get === "function") {
      const v = gv.get();
      return v ? String(v) : null;
    }
    if (typeof gv === "string") return gv;
  } catch {
    return null;
  }
  return null;
}

function readVersionFromDom(doc?: Document | null): string | null {
  const d = doc ?? (typeof document !== "undefined" ? document : null);
  if (!d) return null;

  const scripts = d.scripts;
  for (let i = 0; i < scripts.length; i++) {
    const s = scripts.item(i) as HTMLScriptElement | null;
    const src = s?.src;
    if (!src) continue;
    const m = src.match(/\/(?:r\/\d+\/)?version\/([^/]+)/);
    if (m && m[1]) return m[1];
  }

  const links = Array.from(d.querySelectorAll("link[href]"));
  for (const link of links) {
    const href = (link as HTMLLinkElement).href;
    if (!href) continue;
    const m = href.match(/\/(?:r\/\d+\/)?version\/([^/]+)/);
    if (m && m[1]) return m[1];
  }

  return null;
}

function init(doc?: Document | null): void {
  const cached = getCachedVersion();
  if (cached) return;
  const fromGlobals = readVersionFromGlobals();
  if (fromGlobals) {
    setCachedVersion(fromGlobals);
    return;
  }
  const fromDom = readVersionFromDom(doc);
  if (fromDom) {
    setCachedVersion(fromDom);
  }
}

function get(): string | null {
  init(document);
  return getCachedVersion() ?? cachedVersion ?? null;
}

async function fetchGameVersion(options?: { origin?: string }): Promise<string> {
  const cached = getCachedVersion();
  if (cached) return cached;
  if (pendingPromise) return pendingPromise;

  const origin =
    options?.origin ||
    (typeof location !== "undefined" && location.origin ? location.origin : ORIGIN);

  pendingPromise = (async () => {
    try {
      const url = new URL(VERSION_PATH, origin).toString();
      const controller = typeof AbortController !== "undefined"
        ? new AbortController()
        : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), 8000)
        : null;

      const res = await fetch(url, {
        headers: { "User-Agent": "MG-API/1.0" },
        signal: controller?.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Version fetch failed (${res.status})`);
      }

      const data = await res.json();
      const version = typeof data?.version === "string" ? data.version.trim() : "";
      if (!version) {
        throw new Error("Version not found in response");
      }

      setCachedVersion(version);
      return version;
    } finally {
      pendingPromise = null;
    }
  })();

  return pendingPromise;
}

async function wait(timeoutMs: number = 15000): Promise<string> {
  init(document);
  const cached = getCachedVersion();
  if (cached) return cached;

  const startedAt = nowMs();
  try {
    return await fetchGameVersion();
  } catch {
    // fallback to DOM/global detection for the remaining time budget
  }

  while (nowMs() - startedAt < timeoutMs) {
    init(document);
    const v = getCachedVersion() ?? cachedVersion;
    if (v) return v;
    await sleep(50);
  }

  throw new Error("MGVersion timeout (gameVersion not found)");
}

function invalidateVersionCache(): void {
  cachedVersion = null;
  cachedAt = 0;
}

function prefetch(): void {
  void fetchGameVersion().catch(() => {
    // ignore prefetch errors
  });
}

export const MGVersion = {
  init,
  get,
  wait,
  fetchGameVersion,
  invalidateVersionCache,
  prefetch,
};
