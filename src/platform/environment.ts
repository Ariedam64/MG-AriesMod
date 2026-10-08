/** Where the game page is running. */
type Surface = "discord" | "web";

export interface EnvironmentInfo {
  surface: Surface;
  host: string;
  origin: string;
  isInIframe: boolean;
  platform: "desktop" | "mobile";
}

/**
 * True inside the Discord activity. Its pages are served from discordsays.com,
 * and Discord's CSP there blocks cross-origin fetch, images and audio, which is
 * why requests and media go through GM_xmlhttpRequest in this context.
 */
export function isDiscordActivityContext(): boolean {
  try {
    return window.location.hostname.endsWith("discordsays.com");
  } catch {
    return false;
  }
}

function isInIframe(): boolean {
  try {
    return window.top !== window.self;
  } catch {
    return true;
  }
}

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Detects whether the page runs inside Discord or standalone.
 *
 * Since build 1396 the game frame sits under a host page on discordsays.com,
 * so its referrer is that host page rather than discord.com. The hostname is
 * the reliable signal; the referrer still covers a frame embedded straight in
 * discord.com.
 */
export function detectEnvironment(): EnvironmentInfo {
  const framed = isInIframe();
  const referrerHost = hostOf(document.referrer);
  const embeddedInDiscord = framed && !!referrerHost && /(^|\.)discord(app)?\.com$/i.test(referrerHost);

  return {
    surface: isDiscordActivityContext() || embeddedInDiscord ? "discord" : "web",
    host: location.hostname,
    origin: location.origin,
    isInIframe: framed,
    platform: /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) ? "mobile" : "desktop",
  };
}

export function isDiscordSurface(): boolean {
  return detectEnvironment().surface === "discord";
}
