import { getJSON, getText } from "./http";

const REPO_OWNER = "Ariedam64";
const REPO_NAME = "MG-AriesMod";
const REPO_BRANCH = "main";
const SCRIPT_FILE_PATH = "quinoa-ws.min.user.js";

const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;
const COMMITS_API_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits/${REPO_BRANCH}`;

type RemoteVersion = {
  version?: string;
  download?: string;
};

type UserscriptMetadata = Map<string, string[]>;

// Injected by esbuild from the @version line of meta.userscript.js.
declare const __ARIES_MOD_VERSION__: string | undefined;

export function getLocalVersion(): string | undefined {
  // Build-time version first: GM_info reports the loader's version when the
  // script is loaded through a dev @require file:// userscript.
  if (typeof __ARIES_MOD_VERSION__ === "string" && __ARIES_MOD_VERSION__ !== "0.0.0") {
    return __ARIES_MOD_VERSION__;
  }
  if (typeof GM_info !== "undefined" && GM_info?.script?.version) {
    return GM_info.script.version;
  }
  return undefined;
}

/** Version and download link of the latest build on the main branch, or null when unreachable. */
export async function fetchRemoteVersion(): Promise<RemoteVersion | null> {
  try {
    const meta = extractUserscriptMetadata(await fetchScriptSource());
    if (!meta) throw new Error("Metadata block not found in remote script");
    return {
      version: meta.get("version")?.[0],
      download: meta.get("downloadurl")?.[0] ?? meta.get("updateurl")?.[0],
    };
  } catch (error) {
    console.error("Unable to retrieve remote version:", error);
    return null;
  }
}

/**
 * The built script at the latest commit. Pinning the commit sidesteps the raw
 * CDN's branch cache, which can serve a stale build for minutes after a push.
 */
async function fetchScriptSource(): Promise<string> {
  const commitSha = await fetchLatestCommitSha();
  const scriptUrl = commitSha
    ? `${RAW_BASE_URL}/${commitSha}/dist/${SCRIPT_FILE_PATH}`
    : `${RAW_BASE_URL}/refs/heads/${REPO_BRANCH}/dist/${SCRIPT_FILE_PATH}?t=${Date.now()}`;
  return getText(scriptUrl, { noCache: true });
}

async function fetchLatestCommitSha(): Promise<string | null> {
  try {
    const data = await getJSON<{ sha?: string } | null>(COMMITS_API_URL, {
      noCache: true,
      headers: { Accept: "application/vnd.github+json" },
    });
    const sha = typeof data?.sha === "string" ? data.sha.trim() : "";
    if (sha) return sha;
  } catch (error) {
    console.warn("[MagicGarden] Failed to resolve latest commit SHA:", error);
  }
  return null;
}

function extractUserscriptMetadata(source: string): UserscriptMetadata | null {
  const header = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!header) return null;

  const meta: UserscriptMetadata = new Map();
  for (const [, rawKey, rawValue] of header[1].matchAll(/^\/\/\s*@([^\s]+)\s+(.+)$/gm)) {
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    const values = meta.get(key) ?? [];
    values.push(rawValue.trim());
    meta.set(key, values);
  }
  return meta;
}
