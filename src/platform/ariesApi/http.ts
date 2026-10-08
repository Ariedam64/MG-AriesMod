import { getApiKey } from "../storage";
import { request } from "../http";

/** The mod's own backend, which receives the player-state heartbeat. */
const API_BASE_URL = "https://ariesmod-api.ariedam.fr/";
export const API_ORIGIN = API_BASE_URL.replace(/\/$/, "");

/**
 * POSTs a JSON body to the mod's API, signed with the player's API key when
 * there is one. Resolves with the HTTP status, or 0 when nothing answered.
 */
export async function postToAriesApi(path: string, body: unknown): Promise<number> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = getApiKey();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    const res = await request(
      { url: new URL(path, API_BASE_URL).toString(), method: "POST", headers, body: JSON.stringify(body) },
      "text",
    );
    return res.status;
  } catch {
    return 0;
  }
}
