// src/data/dynamic/logic/bundleParser.ts

import { pageWindow } from "../../../utils/page-context";
import { MAIN_BUNDLE_PATTERN, QUINOA_VIEW_PATTERN } from "./constants";

const pageContext = pageWindow as Window & typeof globalThis;

function findBundleUrl(pattern: RegExp): string | null {
  // Try multiple document references (sandbox vs page context)
  const docs = [
    pageContext.document,
    typeof document !== "undefined" ? document : null,
  ].filter(Boolean) as Document[];

  for (const doc of docs) {
    // 1) <script> tags (including type="module")
    try {
      const scripts = doc.querySelectorAll("script[src]");
      for (const script of scripts) {
        const src = (script as HTMLScriptElement).src || "";
        if (pattern.test(src)) return src;
      }
    } catch { }

    // 2) <link rel="modulepreload"> (Vite/esbuild apps preload the main bundle)
    try {
      const links = doc.querySelectorAll('link[rel="modulepreload"]');
      for (const link of links) {
        const href = (link as HTMLLinkElement).href || "";
        if (pattern.test(href)) return href;
      }
    } catch { }
  }

  // 3) Performance entries (works cross-context; catches dynamically imported chunks too)
  const perfs = [
    pageContext.performance,
    typeof performance !== "undefined" ? performance : null,
  ].filter(Boolean) as Performance[];

  for (const perf of perfs) {
    try {
      for (const entry of perf.getEntriesByType?.("resource") || []) {
        const name = entry?.name ? String(entry.name) : "";
        if (pattern.test(name)) return name;
      }
    } catch { }
  }

  return null;
}

export function findMainBundleUrl(): string | null {
  return findBundleUrl(MAIN_BUNDLE_PATTERN);
}

export function findQuinoaViewUrl(): string | null {
  return findBundleUrl(QUINOA_VIEW_PATTERN);
}

export function findAllIndices(haystack: string, needle: string): number[] {
  const out: number[] = [];
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    out.push(idx);
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return out;
}

export function extractBalancedBlock(text: string, openBraceIndex: number): string | null {
  let depth = 0;
  let quote = "";
  let escaped = false;

  for (let i = openBraceIndex; i < text.length; i++) {
    const ch = text[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = "";
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return text.slice(openBraceIndex, i + 1);
  }

  return null;
}

export function extractBalancedObjectLiteral(text: string, anchorIndex: number): string | null {
  const declStart = Math.max(
    text.lastIndexOf("const ", anchorIndex),
    text.lastIndexOf("let ", anchorIndex),
    text.lastIndexOf("var ", anchorIndex)
  );
  if (declStart < 0) return null;

  const eq = text.indexOf("=", declStart);
  if (eq < 0 || eq > anchorIndex) return null;

  const braceStart = text.indexOf("{", eq);
  if (braceStart < 0 || braceStart > anchorIndex) return null;

  return extractBalancedBlock(text, braceStart);
}

async function fetchBundleByFinder(
  findUrl: () => string | null,
  cache: { value: string | null; inFlight: Promise<string | null> | null },
  label: string,
): Promise<string | null> {
  if (cache.value) return cache.value;
  if (cache.inFlight) return cache.inFlight;

  cache.inFlight = (async () => {
    // Retry finding the URL for up to 15s (script may load late / lazy-loaded chunk)
    const MAX_RETRIES = 30;
    const RETRY_INTERVAL = 500;
    let url: string | null = null;

    for (let i = 0; i < MAX_RETRIES; i++) {
      url = findUrl();
      if (url) break;
      await new Promise((r) => setTimeout(r, RETRY_INTERVAL));
    }

    if (!url) {
      console.warn(`[MGData] Could not find ${label} URL after retries`);
      return null;
    }

    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return null;
      const text = await res.text();
      cache.value = text;
      return text;
    } catch {
      return null;
    } finally {
      cache.inFlight = null;
    }
  })();

  return cache.inFlight;
}

const mainBundleCache = { value: null as string | null, inFlight: null as Promise<string | null> | null };
const quinoaViewCache = { value: null as string | null, inFlight: null as Promise<string | null> | null };

export function fetchMainBundle(): Promise<string | null> {
  return fetchBundleByFinder(findMainBundleUrl, mainBundleCache, "main bundle");
}

/**
 * Fetch QuinoaView chunk text (cached).
 * This chunk is lazily loaded by the game — it appears in performance resource
 * entries once the game view has rendered. Retries for up to 15 s.
 */
export function fetchQuinoaViewBundle(): Promise<string | null> {
  return fetchBundleByFinder(findQuinoaViewUrl, quinoaViewCache, "QuinoaView bundle");
}
