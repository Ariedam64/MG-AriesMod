// ariesModAPI/client/http.ts
// Client HTTP unifié - détecte Discord vs Web et utilise fetch ou GM_xmlhttpRequest

import { isDiscordActivityContext } from "../discordCsp";
import { getApiKey } from "../storage";
import { API_BASE_URL } from "./config";
import { withDiscordPollPause } from "./discordPolls";

// Déclaration GM_xmlhttpRequest pour TypeScript
declare function GM_xmlhttpRequest(details: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  data?: string;
  responseType?: "arraybuffer" | "blob" | "text";
  onload?: (response: { status: number; responseText: string; response?: unknown }) => void;
  onerror?: (error: unknown) => void;
  onprogress?: (response: {
    status: number;
    readyState: number;
    responseText: string;
    loaded: number;
    total: number;
  }) => void;
}): { abort(): void };

// ========== URL Builder ==========

function buildUrl(
  path: string,
  query?: Record<string, string | number | undefined>,
): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

// ========== HTTP Response ==========

export interface HttpResponse<T> {
  status: number;
  data: T | null;
}

// ========== GM_xmlhttpRequest Wrappers ==========

function gmRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<HttpResponse<T>> {
  return new Promise((resolve) => {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {};

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    GM_xmlhttpRequest({
      method,
      url,
      headers,
      data: body !== undefined ? JSON.stringify(body) : undefined,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) {
          try {
            const parsed = res.responseText ? (JSON.parse(res.responseText) as T) : null;
            resolve({ status: res.status, data: parsed });
          } catch {
            resolve({ status: res.status, data: null });
          }
        } else {
          resolve({ status: res.status, data: null });
        }
      },
      onerror: () => {
        resolve({ status: 0, data: null });
      },
    });
  });
}

// ========== Fetch Wrapper ==========

async function fetchRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  body?: unknown,
): Promise<HttpResponse<T>> {
  try {
    const apiKey = getApiKey();
    const headers: Record<string, string> = {};

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const options: RequestInit = {
      method,
      headers,
      credentials: "omit",
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      options.body = JSON.stringify(body);
    }

    const res = await fetch(url, options);
    const text = await res.text();

    let parsed: T | null = null;
    if (text) {
      try {
        parsed = JSON.parse(text) as T;
      } catch {
        // Ignore parse errors
      }
    }

    return { status: res.status, data: parsed };
  } catch {
    return { status: 0, data: null };
  }
}

// ========== Unified HTTP Client ==========

/**
 * Unified HTTP request - automatically uses fetch (web) or GM_xmlhttpRequest (Discord)
 * Automatically pauses long polling during the request in Discord context
 */
async function request<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  options?: {
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  },
): Promise<HttpResponse<T>> {
  // Wrap the entire request with long poll pause (only active in Discord context)
  return withDiscordPollPause(async () => {
    const url = buildUrl(path, options?.query);

    // Discord Activity → use GM_xmlhttpRequest
    if (isDiscordActivityContext()) {
      return gmRequest<T>(method, url, options?.body);
    }

    // Web → try fetch, fallback to GM if needed
    try {
      return await fetchRequest<T>(method, url, options?.body);
    } catch {
      // Fallback to GM if fetch fails
      return gmRequest<T>(method, url, options?.body);
    }
  });
}

// ========== Convenience Methods ==========


export async function httpPost<T>(path: string, body: unknown): Promise<HttpResponse<T>> {
  return request<T>("POST", path, { body });
}


