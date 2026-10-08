
type Surface = "discord" | "web";

export interface EnvironmentInfo {
  surface: Surface;
  host: string;
  origin: string;
  isInIframe: boolean;
  platform: "desktop" | "mobile";
}

/** Detect whether the current page is embedded inside Discord or running standalone. */
export function detectEnvironment(): EnvironmentInfo {
  const isInIframe = (() => {
    try {
      return window.top !== window.self;
    } catch {
      return true;
    }
  })();

  const refHost = safeHost(document.referrer);
  const parentLooksDiscord =
    isInIframe && !!refHost && /(^|\.)discord(app)?\.com$/i.test(refHost);

  const host = location.hostname;
  const surface: Surface = parentLooksDiscord ? "discord" : "web";

  const platform: EnvironmentInfo["platform"] =
    /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "mobile" : "desktop";

  return {
    surface,
    host,
    origin: location.origin,
    isInIframe,
    platform,
  };
}

/** Convenience shortcut. */
export function isDiscordSurface(): boolean {
  return detectEnvironment().surface === "discord";
}












function safeHost(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}







/* ------------------------------------------------------------------ */
/* ---------------------------- Usage example ----------------------- */
/* ------------------------------------------------------------------ */
/*
(async () => {
  const env = detectEnvironment();
  console.log("[env]", env, "isDiscord?", isDiscordSurface());

  const room = "2";

  const response = await requestRoomEndpoint(room);
  logRoomResult("GET /info", room, response);

  const joinResult = joinRoom(room, { siteFallbackOnDiscord: true, openInNewTab: true });
  console.log("[joinRoom] result:", joinResult);
})();
*/
