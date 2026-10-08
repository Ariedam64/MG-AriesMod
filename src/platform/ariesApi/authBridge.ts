// ariesModAPI/auth/bridge.ts
// Bridge pour capturer l'API key dans la fenêtre d'auth Discord

import { setApiKey, setDeclinedApiAuth } from "../storage";
import { API_ORIGIN } from "./config";

function normalizeAuthPayload(data: any): { apiKey: string; discordId?: string; discordUsername?: string } | null {
  if (!data || data.type !== "aries_discord_auth" || !data.apiKey) return null;
  return {
    apiKey: String(data.apiKey),
    discordId: data.discordId ? String(data.discordId) : undefined,
    discordUsername: data.discordUsername ? String(data.discordUsername) : undefined,
  };
}

/**
 * Initialise le bridge d'authentification si on est sur la page d'auth
 * @returns true si le bridge a été initialisé, false sinon
 */
export function initAuthBridgeIfNeeded(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.origin !== API_ORIGIN) return false;

  const capture = (data: any) => {
    const payload = normalizeAuthPayload(data);
    if (!payload) return;
    setApiKey(payload.apiKey);
    setDeclinedApiAuth(false);
    try {
      window.close();
    } catch {}
  };

  // If the auth page tries to postMessage to a missing opener (GM_openInTab),
  // fake an opener to capture the payload and store it in GM storage.
  try {
    if (!window.opener) {
      const fakeOpener = { postMessage: (data: any) => capture(data) };
      try {
        Object.defineProperty(window, "opener", {
          configurable: true,
          get: () => fakeOpener,
        });
      } catch {
        try {
          (window as any).opener = fakeOpener;
        } catch {}
      }
    }
  } catch {}

  // Also capture if the auth page emits a message locally for any reason.
  window.addEventListener("message", (event) => {
    if (event.origin !== API_ORIGIN) return;
    capture(event.data);
  });

  // Fallback: parse apiKey from URL query/hash if present.
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("apiKey");
    const fromHash = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("apiKey");
    if (fromQuery) capture({ type: "aries_discord_auth", apiKey: fromQuery });
    if (fromHash) capture({ type: "aries_discord_auth", apiKey: fromHash });
  } catch {}

  return true;
}
