import { isDiscordActivityContext } from "./environment";
import { gmRequest } from "./http";

/**
 * Discord's CSP only lets the activity load images from Discord's own CDN and
 * audio from blob: or data: URLs. Anything else is fetched through
 * GM_xmlhttpRequest and handed to the element as a blob: URL.
 */

/** Hosts Discord's CSP allows for img-src. */
const SAFE_IMG_HOSTS = ["cdn.discordapp.com", "media.discordapp.net"];

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
};

/** One blob: URL per remote URL, shared by every caller asking for it, in flight or done. */
const blobUrls = new Map<string, Promise<string>>();

function isImgUrlSafe(url: string): boolean {
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("/")) return true;
  try {
    const { hostname } = new URL(url);
    return SAFE_IMG_HOSTS.some((host) => hostname === host || hostname.endsWith("." + host));
  } catch {
    return true;
  }
}

/** A blob: URL with the bytes of `url`, or `url` itself when GM cannot get them. */
function toBlobUrl(url: string, defaultMime: string): Promise<string> {
  let pending = blobUrls.get(url);
  if (!pending) {
    pending = gmRequest({ url }, "arraybuffer").then(
      (res) => {
        if (!res.body) {
          blobUrls.delete(url);
          return url;
        }
        const extension = url.split(".").pop()?.toLowerCase().split("?")[0] ?? "";
        const blob = new Blob([res.body], { type: MIME_BY_EXTENSION[extension] ?? defaultMime });
        return URL.createObjectURL(blob);
      },
      () => {
        blobUrls.delete(url);
        return url;
      },
    );
    blobUrls.set(url, pending);
  }
  return pending;
}

/** Sets `img.src`, going through a blob: URL when Discord's CSP would block the host. */
export function setImageSafe(img: HTMLImageElement, url: string | null | undefined): void {
  if (!url) return;
  if (!isDiscordActivityContext() || isImgUrlSafe(url)) {
    img.src = url;
    return;
  }
  void toBlobUrl(url, "image/png").then((src) => {
    img.src = src;
  });
}

/** An audio URL Discord's CSP lets through: the URL itself on the web, a blob: URL in Discord. */
export function getAudioUrlSafe(url: string): Promise<string> {
  if (!url || !isDiscordActivityContext()) return Promise.resolve(url);
  return toBlobUrl(url, "audio/mpeg");
}
