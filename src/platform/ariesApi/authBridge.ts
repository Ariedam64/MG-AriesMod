import { setApiKey } from "../storage";
import { API_ORIGIN } from "./http";

function readApiKey(data: any): string | null {
  if (!data || data.type !== "aries_discord_auth" || !data.apiKey) return null;
  return String(data.apiKey);
}

/**
 * On the API's Discord sign-in page, captures the API key it hands back and
 * stores it, then closes the tab. Returns true when this page is that sign-in
 * page, in which case the mod itself must not start.
 */
export function initAuthBridgeIfNeeded(): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.origin !== API_ORIGIN) return false;

  const capture = (data: unknown) => {
    const apiKey = readApiKey(data);
    if (!apiKey) return;
    setApiKey(apiKey);
    try {
      window.close();
    } catch {}
  };

  // The page posts the key to its opener. A tab opened with GM_openInTab has
  // none, so give it a fake one that captures the message.
  try {
    if (!window.opener) {
      const fakeOpener = { postMessage: (data: unknown) => capture(data) };
      try {
        Object.defineProperty(window, "opener", { configurable: true, get: () => fakeOpener });
      } catch {
        try {
          (window as any).opener = fakeOpener;
        } catch {}
      }
    }
  } catch {}

  // Also capture the message if the page posts it to itself.
  window.addEventListener("message", (event) => {
    if (event.origin !== API_ORIGIN) return;
    capture(event.data);
  });

  // Last resort: the key in the query string or the hash.
  try {
    for (const params of [window.location.search, window.location.hash.replace(/^#/, "")]) {
      const apiKey = new URLSearchParams(params).get("apiKey");
      if (apiKey) capture({ type: "aries_discord_auth", apiKey });
    }
  } catch {}

  return true;
}
