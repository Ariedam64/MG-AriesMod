import { request } from "../http";

/**
 * The public Magic Garden API (game data, sprites, audio), unrelated to the
 * mod's own backend in platform/ariesApi.
 */
const MG_API_BASE_URL = "https://mg-api.ariedam.fr";

export function buildMgApiUrl(path: string, query?: Record<string, string | number | undefined>): string {
  const url = new URL(path, MG_API_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** GET a JSON endpoint of the API. Null on any failure. */
export async function mgApiGetJson<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T | null> {
  try {
    const res = await request({ url: buildMgApiUrl(path, query) }, "text");
    return res.ok && res.body ? (JSON.parse(res.body) as T) : null;
  } catch {
    return null;
  }
}

/** GET raw bytes (an image, a sound) from any URL, for downloads. Null on any failure. */
export async function mgApiGetBinary(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await request({ url }, "arraybuffer");
    return res.ok ? res.body : null;
  } catch {
    return null;
  }
}
