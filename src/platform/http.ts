import { isDiscordActivityContext } from "./environment";

/**
 * The mod's one HTTP client. Two transports:
 *
 * - `fetch`, from the page. Cheap, but Discord's CSP blocks it cross-origin.
 * - `GM_xmlhttpRequest`, from the extension. Crosses any origin listed in
 *   `@connect`, but goes through the extension bridge, which can be slow to
 *   attach at document-start.
 *
 * `request` picks between them: GM in the Discord activity, fetch on the web
 * with GM as a fallback when fetch throws.
 */

export type BodyKind = "text" | "blob" | "arraybuffer";

type BodyOf<K extends BodyKind> = K extends "blob" ? Blob : K extends "arraybuffer" ? ArrayBuffer : string;

export interface HttpRequest {
  url: string;
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  /** Skip the HTTP cache. */
  noCache?: boolean;
  /**
   * Bounds the GM request. Without it GM never fires `ontimeout`, so a bridge
   * that never attaches hangs the call forever. A page-side deadline a little
   * later covers the case where the bridge is too dead to enforce it.
   */
  timeoutMs?: number;
  /**
   * Try GM first and fall back to fetch when GM is missing, fails, or answers
   * outside 2xx. For game assets and catalogs, which have always gone through
   * the extension.
   */
  preferGm?: boolean;
}

export interface HttpResponse<T> {
  status: number;
  ok: boolean;
  body: T | null;
}

const HARD_DEADLINE_GRACE_MS = 2_000;

const isOk = (status: number) => status >= 200 && status < 300;

function hasGm(): boolean {
  return typeof GM_xmlhttpRequest === "function";
}

/** GM_xmlhttpRequest as a promise. Resolves on any HTTP status, rejects on network error or timeout. */
export function gmRequest<K extends BodyKind>(req: HttpRequest, kind: K): Promise<HttpResponse<BodyOf<K>>> {
  return new Promise((resolve, reject) => {
    if (!hasGm()) {
      reject(new Error("GM_xmlhttpRequest not available"));
      return;
    }

    let deadline: ReturnType<typeof setTimeout> | undefined;
    if (req.timeoutMs) {
      deadline = setTimeout(
        () => reject(new Error(`Hard timeout for ${req.url}`)),
        req.timeoutMs + HARD_DEADLINE_GRACE_MS,
      );
    }
    const settle = () => clearTimeout(deadline);

    const details: Tampermonkey.Request = {
      method: req.method ?? "GET",
      url: req.url,
      onload: (res) => {
        settle();
        const body = kind === "text" ? res.responseText : res.response;
        resolve({ status: res.status, ok: isOk(res.status), body: body ?? null });
      },
      onerror: () => {
        settle();
        reject(new Error(`Network error for ${req.url}`));
      },
      ontimeout: () => {
        settle();
        reject(new Error(`Timeout for ${req.url}`));
      },
    };
    if (kind !== "text") details.responseType = kind as "blob" | "arraybuffer";
    if (req.headers) details.headers = req.headers;
    if (req.body !== undefined) details.data = req.body;
    if (req.noCache) details.nocache = true;
    if (req.timeoutMs) details.timeout = req.timeoutMs;

    GM_xmlhttpRequest(details);
  });
}

/** fetch with the same contract as `gmRequest`. */
async function fetchRequest<K extends BodyKind>(req: HttpRequest, kind: K): Promise<HttpResponse<BodyOf<K>>> {
  const res = await fetch(req.url, {
    method: req.method ?? "GET",
    headers: req.headers,
    body: req.body,
    cache: req.noCache ? "no-store" : undefined,
  });
  const body = kind === "blob" ? await res.blob() : kind === "arraybuffer" ? await res.arrayBuffer() : await res.text();
  return { status: res.status, ok: res.ok, body: body as BodyOf<K> };
}

/** Sends a request over whichever transport this context allows. Rejects only when no transport got an answer. */
export async function request<K extends BodyKind>(req: HttpRequest, kind: K): Promise<HttpResponse<BodyOf<K>>> {
  if (req.preferGm) {
    if (hasGm()) {
      try {
        const res = await gmRequest(req, kind);
        if (res.ok) return res;
      } catch {}
    }
    return fetchRequest(req, kind);
  }

  if (isDiscordActivityContext()) return gmRequest(req, kind);

  try {
    return await fetchRequest(req, kind);
  } catch (error) {
    if (!hasGm()) throw error;
    return gmRequest(req, kind);
  }
}

type GetOptions = Omit<HttpRequest, "url" | "method" | "body">;

async function getOk<K extends BodyKind>(url: string, kind: K, options?: GetOptions): Promise<BodyOf<K>> {
  const res = await request({ ...options, url }, kind);
  if (!res.ok || res.body == null) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.body;
}

/** GET the body as text. Rejects on a network error or a status outside 2xx. */
export const getText = (url: string, options?: GetOptions) => getOk(url, "text", options);

/** GET the body as a Blob. Rejects on a network error or a status outside 2xx. */
export const getBlob = (url: string, options?: GetOptions) => getOk(url, "blob", options);

/** GET and parse JSON. Rejects on a network error, a status outside 2xx, or a body that is not JSON. */
export async function getJSON<T = any>(url: string, options?: GetOptions): Promise<T> {
  return JSON.parse(await getText(url, options)) as T;
}
