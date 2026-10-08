// Discord CSP helpers (images/audio) + emoji data interceptor.

// If Tampermonkey types are missing, this keeps TS happy.
declare function GM_xmlhttpRequest(details: {
  method: "GET" | "POST";
  url: string;
  headers?: Record<string, string>;
  data?: string;
  responseType?: "arraybuffer" | "blob" | "text";
  onload?: (response: { status: number; responseText: string; response?: unknown }) => void;
  onerror?: (error: unknown) => void;
  onprogress?: (response: { status: number; readyState: number; responseText: string; loaded: number; total: number }) => void;
}): { abort(): void };

export function isDiscordActivityContext(): boolean {
  try {
    return window.location.hostname.endsWith("discordsays.com");
  } catch {
    return false;
  }
}

/** Hosts allowed by Discord CSP for img-src. */
const _SAFE_IMG_HOSTS = ["cdn.discordapp.com", "media.discordapp.net"];
/** Cache for blob URLs generated to bypass CSP img-src. */
const _gmImgCache = new Map<string, string>();
/** In-flight requests to dedupe GM fetches for the same URL. */
const _gmImgPending = new Map<string, HTMLImageElement[]>();
const _extMimeMap: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

function _isImgUrlSafe(url: string): boolean {
  if (!url || url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return true;
  try {
    const { hostname } = new URL(url);
    return _SAFE_IMG_HOSTS.some((h) => hostname === h || hostname.endsWith("." + h));
  } catch {
    return true;
  }
}

/**
 * Set img.src safely with Discord CSP:
 * external images are fetched via GM_xmlhttpRequest and served as blob: URLs.
 */
export function setImageSafe(img: HTMLImageElement, url: string | null | undefined): void {
  if (!url) return;
  if (!isDiscordActivityContext()) {
    img.src = url;
    return;
  }
  if (_isImgUrlSafe(url)) {
    img.src = url;
    return;
  }
  const cached = _gmImgCache.get(url);
  if (cached) {
    img.src = cached;
    return;
  }
  // Deduplicate in-flight requests for the same URL
  const pending = _gmImgPending.get(url);
  if (pending) {
    pending.push(img);
    return;
  }
  _gmImgPending.set(url, [img]);
  GM_xmlhttpRequest({
    method: "GET",
    url,
    headers: {},
    responseType: "arraybuffer",
    onload: (res) => {
      const imgs = _gmImgPending.get(url) ?? [];
      _gmImgPending.delete(url);
      if (!res.response) {
        for (const el of imgs) el.src = url;
        return;
      }
      const ext = url.split(".").pop()?.toLowerCase().split("?")[0] ?? "png";
      const mime = _extMimeMap[ext] ?? "image/png";
      const blob = new Blob([res.response as ArrayBuffer], { type: mime });
      const blobUrl = URL.createObjectURL(blob);
      _gmImgCache.set(url, blobUrl);
      for (const el of imgs) el.src = blobUrl;
    },
    onerror: () => {
      const imgs = _gmImgPending.get(url) ?? [];
      _gmImgPending.delete(url);
      for (const el of imgs) el.src = url;
    },
  });
}

/** Cache for blob URLs for external audio (Discord CSP media-src). */
const _gmAudioCache = new Map<string, string>();
/** In-flight audio requests to dedupe GM fetches for the same URL. */
const _gmAudioPending = new Map<string, Array<(url: string) => void>>();

/**
 * Returns a safe audio URL for Discord CSP (media-src 'self' blob: data:).
 * If not on Discord, returns the original URL. Otherwise, fetches via GM and returns a blob: URL.
 */
export function getAudioUrlSafe(url: string): Promise<string> {
  return new Promise((resolve) => {
    if (!url) {
      resolve(url);
      return;
    }
    // If not on Discord, no CSP bypass needed
    if (!isDiscordActivityContext()) {
      resolve(url);
      return;
    }
    // Cache hit
    const cached = _gmAudioCache.get(url);
    if (cached) {
      resolve(cached);
      return;
    }
    // In-flight request
    const pending = _gmAudioPending.get(url);
    if (pending) {
      pending.push(resolve);
      return;
    }
    _gmAudioPending.set(url, [resolve]);
    GM_xmlhttpRequest({
      method: "GET",
      url,
      headers: {},
      responseType: "arraybuffer",
      onload: (res) => {
        const callbacks = _gmAudioPending.get(url) ?? [];
        _gmAudioPending.delete(url);
        if (!res.response) {
          for (const cb of callbacks) cb(url);
          return;
        }
        const ext = url.split(".").pop()?.toLowerCase().split("?")[0] ?? "mp3";
        const audioMimeMap: Record<string, string> = {
          mp3: "audio/mpeg",
          ogg: "audio/ogg",
          wav: "audio/wav",
          m4a: "audio/mp4",
        };
        const mime = audioMimeMap[ext] ?? "audio/mpeg";
        const blob = new Blob([res.response as ArrayBuffer], { type: mime });
        const blobUrl = URL.createObjectURL(blob);
        _gmAudioCache.set(url, blobUrl);
        for (const cb of callbacks) cb(blobUrl);
      },
      onerror: () => {
        const callbacks = _gmAudioPending.get(url) ?? [];
        _gmAudioPending.delete(url);
        for (const cb of callbacks) cb(url);
      },
    });
  });
}

// ---------- Emoji data fetch interceptor (bypass CSP + blob HEAD issue) ----------

// Import from ariesModAPI to pause long polls during fetch (avoid concurrent GM requests)
import { withDiscordPollPause } from "./ariesApi/discordPolls";

const EMOJI_DATA_CDN_PREFIX =
  "https://cdn.jsdelivr.net/npm/emoji-picker-element-data";
let _emojiJson: string | null = null;
let _emojiPending: Array<(json: string | null) => void> = [];
let _emojiInterceptorInstalled = false;

function _emojiMakeResponse(json: string, method: string): Response {
  if (method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return new Response(json, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Installs a fetch interceptor to serve emoji-picker-element data
 * from GM cache (bypasses CSP + HEAD on blob:).
 * Idempotent - call as early as possible (before any emoji-picker in the DOM).
 */
export function installEmojiDataFetchInterceptor(): void {
  if (_emojiInterceptorInstalled) return;
  _emojiInterceptorInstalled = true;

  const _origFetch = window.fetch.bind(window);
  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    if (!url.startsWith(EMOJI_DATA_CDN_PREFIX)) {
      return _origFetch(input, init);
    }
    const method = (
      init?.method ??
      (input instanceof Request ? (input as Request).method : "GET")
    ).toUpperCase();
    if (_emojiJson) {
      return Promise.resolve(_emojiMakeResponse(_emojiJson, method));
    }
    // Queue until GM fetch completes
    return new Promise<Response>((resolve) => {
      _emojiPending.push((json) => {
        resolve(
          json
            ? _emojiMakeResponse(json, method)
            : new Response(null, { status: 503 }),
        );
      });
    });
  };

  // Pause long polls during emoji data fetch to avoid too many concurrent GM_xmlhttpRequest
  void withDiscordPollPause(async () => {
    return new Promise<void>((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `${EMOJI_DATA_CDN_PREFIX}@^1/en/emojibase/data.json`,
        headers: {},
        onload: (res) => {
          if (res.status >= 200 && res.status < 300 && res.responseText) {
            _emojiJson = res.responseText;
            for (const cb of _emojiPending) cb(_emojiJson);
          } else {
            console.error("[discordCsp] emoji fetch failed:", res.status);
            for (const cb of _emojiPending) cb(null);
          }
          _emojiPending = [];
          resolve();
        },
        onerror: (err) => {
          console.error("[discordCsp] emoji fetch error:", err);
          for (const cb of _emojiPending) cb(null);
          _emojiPending = [];
          resolve();
        },
      });
    });
  });
}
