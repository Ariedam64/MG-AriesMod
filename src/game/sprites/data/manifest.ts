import { HttpError } from '../../../platform/http';
import { joinPath } from '../utils/path';

/**
 * The game's asset manifest. Since build 1973 the game no longer serves
 * `assets/manifest.json`: it publishes one manifest per texture format,
 * `manifest.<format>.json`, and loads the one it picked for the device.
 * These are file names the game owns, not catalog data.
 */
export const MANIFEST_FORMATS = ['bc7', 'astc', 'etc2', 'bc3', 'rgba8'] as const;

/** Decodable everywhere, so the first fallback when the game's own pick is unknown. */
const DEFAULT_MANIFEST = 'manifest.rgba8.json';
/** The pre-1973 name, kept as the last fallback only. */
const LEGACY_MANIFEST = 'manifest.json';

const LOADED_MANIFEST_RE = new RegExp(`/assets/(manifest\\.(?:${MANIFEST_FORMATS.join('|')})\\.json)(?:[?#]|$)`);
const MANIFEST_PATH_RE = /(^|\/)manifest(\.[^/.]+)?\.json$/;

/** The manifest has 404'd under every name the mod knows: retrying cannot help until the page reloads. */
export class ManifestMissingError extends Error {
  constructor(base: string) {
    super(`No asset manifest found under ${base}`);
    this.name = 'ManifestMissingError';
  }
}

/** True for `manifest.json` and `manifest.<format>.json`, which are never atlases. */
export function isManifestPath(path: string): boolean {
  return MANIFEST_PATH_RE.test(path);
}

/**
 * Manifest names to try, in order. One the page has already loaded comes
 * first: the game picked it, its KTX2 textures carry that format, and the
 * HTTP cache likely holds it. Then rgba8, then the legacy name.
 */
export function manifestCandidates(resourceUrls: string[]): string[] {
  const names: string[] = [];
  for (const url of resourceUrls) {
    const match = typeof url === 'string' ? LOADED_MANIFEST_RE.exec(url) : null;
    if (match) {
      names.push(match[1]);
      break;
    }
  }
  for (const name of [DEFAULT_MANIFEST, LEGACY_MANIFEST]) {
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export interface LoadedManifest<T> {
  name: string;
  manifest: T;
}

/**
 * Fetches the first candidate that exists. Moves on to the next one only on a
 * 404; any other error is thrown as is. Throws `ManifestMissingError` when
 * every candidate is a 404.
 */
export async function loadManifest<T = any>(
  base: string,
  getJSON: (url: string) => Promise<T>,
  resourceUrls: string[],
): Promise<LoadedManifest<T>> {
  for (const name of manifestCandidates(resourceUrls)) {
    try {
      return { name, manifest: await getJSON(joinPath(base, name)) };
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) continue;
      throw error;
    }
  }
  throw new ManifestMissingError(base);
}
