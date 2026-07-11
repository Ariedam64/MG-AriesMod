// mgApi/client/http.ts
// Minimal dual-transport GET client for mg-api.ariedam.fr (public, unauthenticated).
// Mirrors ariesModAPI/client/http.ts: fetch on the web, GM_xmlhttpRequest in Discord
// Activities (their CSP blocks direct cross-origin fetch/img/audio to arbitrary hosts).

import { isDiscordActivityContext } from "../../utils/discordCsp";
import { API_BASE_URL } from "../config";

declare function GM_xmlhttpRequest(details: {
  method: "GET";
  url: string;
  responseType?: "arraybuffer" | "text";
  onload?: (response: { status: number; responseText: string; response?: unknown }) => void;
  onerror?: (error: unknown) => void;
}): { abort(): void };

export function buildMgApiUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function gmGetJson<T>(url: string): Promise<T | null> {
  return new Promise((resolve) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      onload: (res) => {
        if (res.status < 200 || res.status >= 300 || !res.responseText) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(res.responseText) as T);
        } catch {
          resolve(null);
        }
      },
      onerror: () => resolve(null),
    });
  });
}

async function fetchGetJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** GET a JSON endpoint from mg-api.ariedam.fr, Discord-CSP aware. */
export async function mgApiGetJson<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T | null> {
  const url = buildMgApiUrl(path, query);
  if (isDiscordActivityContext()) {
    return gmGetJson<T>(url);
  }
  try {
    return await fetchGetJson<T>(url);
  } catch {
    return gmGetJson<T>(url);
  }
}

function gmGetBinary(url: string): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      responseType: "arraybuffer",
      onload: (res) => {
        if (res.status < 200 || res.status >= 300 || !res.response) {
          resolve(null);
          return;
        }
        resolve(res.response as ArrayBuffer);
      },
      onerror: () => resolve(null),
    });
  });
}

/** GET binary bytes (image/audio) from any URL, Discord-CSP aware. Used for downloads/zips. */
export async function mgApiGetBinary(url: string): Promise<ArrayBuffer | null> {
  if (isDiscordActivityContext()) {
    return gmGetBinary(url);
  }
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return gmGetBinary(url);
  }
}
