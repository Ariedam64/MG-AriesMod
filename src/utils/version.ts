import { isDiscordSurface } from "./api";

const REPO_OWNER = "Ariedam64";
const REPO_NAME = "MG-AriesMod";
const REPO_BRANCH = "main";
const SCRIPT_FILE_PATH = "quinoa-ws.min.user.js";

const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;
const COMMITS_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}`;

type RemoteVersionResponse = {
  version?: string;
  download?: string;
  forced?: boolean;
};

type FetchOptions = RequestInit & { cache?: RequestCache };

async function fetchTextWithFetch(url: string, options?: FetchOptions): Promise<string> {
  const response = await fetch(url, { cache: "no-store", ...options });

  if (!response.ok) {
    throw new Error(`Failed to load remote resource: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

async function fetchTextWithGM(url: string, options?: FetchOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr =
      typeof GM_xmlhttpRequest === 'function'
        ? GM_xmlhttpRequest
        : (typeof GM !== 'undefined' && typeof GM.xmlHttpRequest === 'function'
            ? GM.xmlHttpRequest
            : null);

    if (!xhr) return reject(new Error('GM_xmlhttpRequest not available'));

    xhr({
      method: 'GET',
      url,
      headers: options?.headers as Record<string, string> | undefined,
      onload: (res) => {
        if (res.status >= 200 && res.status < 300) resolve(res.responseText);
        else reject(new Error(`GM_xhr failed: ${res.status}`));
      },
      onerror: (e) => reject(e as any),
    } as Tampermonkey.Request); // cast ok, on ne passe que des champs valides
  });
}

async function fetchText(url: string, options?: FetchOptions): Promise<string> {
  const preferGM = isDiscordSurface();
  const hasGM =
    typeof GM_xmlhttpRequest === "function" ||
    (typeof GM !== "undefined" && typeof GM.xmlHttpRequest === "function");

  if (preferGM && hasGM) {
    return await fetchTextWithGM(url, options);
  }

  try {
    return await fetchTextWithFetch(url, options);
  } catch (error) {
    if (hasGM) {
      return await fetchTextWithGM(url, options);
    }

    throw error;
  }
}

async function fetchLatestCommitSha(): Promise<string | null> {
  try {
    const responseText = await fetchText(COMMITS_API_URL, {
      headers: { Accept: "application/vnd.github+json" },
    });

    const data = JSON.parse(responseText) as { sha?: string } | null;
    if (data && typeof data.sha === "string" && data.sha.trim().length > 0) {
      return data.sha.trim();
    }
  } catch (error) {
    console.warn("[MagicGarden] Failed to resolve latest commit SHA:", error);
  }

  return null;
}

async function fetchScriptSource(): Promise<string> {
  const commitSha = await fetchLatestCommitSha();

  const scriptUrl = commitSha
    ? `${RAW_BASE_URL}/${commitSha}/dist/${SCRIPT_FILE_PATH}`
    : `${RAW_BASE_URL}/refs/heads/${REPO_BRANCH}/dist/${SCRIPT_FILE_PATH}?t=${Date.now()}`;

  return await fetchText(scriptUrl);
}

export async function fetchRemoteVersion(): Promise<RemoteVersionResponse | null> {
  try {
    const scriptSource = await fetchScriptSource();
    const meta = extractUserscriptMetadata(scriptSource);

    if (!meta) {
      throw new Error("Metadata block not found in remote script");
    }

    const version = meta.get("version")?.[0];
    const download = meta.get("downloadurl")?.[0] ?? meta.get("updateurl")?.[0];

    return {
      version,
      download,
    };
  } catch (error) {
    console.error("Unable to retrieve remote version:", error);
    return null;
  }
}

type UserscriptMetadata = Map<string, string[]>;

function extractUserscriptMetadata(source: string): UserscriptMetadata | null {
  const headerMatch = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!headerMatch) {
    return null;
  }

  const metaBlock = headerMatch[1];
  const entries = metaBlock.matchAll(/^\/\/\s*@([^\s]+)\s+(.+)$/gm);
  const meta: UserscriptMetadata = new Map();

  for (const [, rawKey, rawValue] of entries) {
    const key = rawKey.trim().toLowerCase();
    const value = rawValue.trim();
    if (!key) continue;

    const current = meta.get(key);
    if (current) {
      current.push(value);
    } else {
      meta.set(key, [value]);
    }
  }

  return meta;
}

// Injected by esbuild from the @version line of meta.userscript.js.
declare const __ARIES_MOD_VERSION__: string | undefined;

export function getLocalVersion(): string | undefined {
  // Build-time version first: GM_info reports the LOADER's version when the
  // script is loaded through a dev @require file:// userscript.
  if (typeof __ARIES_MOD_VERSION__ === "string" && __ARIES_MOD_VERSION__ !== "0.0.0") {
    return __ARIES_MOD_VERSION__;
  }
  if (typeof GM_info !== "undefined" && GM_info?.script?.version) {
    return GM_info.script.version;
  }

  return undefined;
}

export async function logRemoteVersion(): Promise<void> {
  const remoteData = await fetchRemoteVersion();

  const localVersion = getLocalVersion();

  if (localVersion) {
    console.log(`[MagicGarden] Local version: ${localVersion}`);
  } else {
    console.log("[MagicGarden] Local version: unknown");
  }

  if (remoteData?.version) {
    console.log(`[MagicGarden] Remote version: ${remoteData.version}`);
  } else {
    console.log("[MagicGarden] Remote version: unavailable");
  }
}
