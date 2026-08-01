// src/services/tools.ts
// External community tools fetched from remote JSON on GitHub

import { fetchText } from "../utils/version";

export type ExternalToolCreator = {
  name: string;
  avatar?: string;
};

export type ExternalToolAction = {
  label: string;
  url: string;
};

export type ExternalTool = {
  id: string;
  title: string;
  description: string;
  tags?: string[];
  images?: string[];
  icon?: string;
  actions?: ExternalToolAction[];
  creators?: ExternalToolCreator[];
};

const REPO_OWNER = "Ariedam64";
const REPO_NAME = "MG-AriesMod";
const REPO_BRANCH = "main";
const TOOLS_FILE_PATH = "tools/tools.json";
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;

function parseToolsPayload(raw: unknown): ExternalTool[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid tools payload: not an object");
  }

  const payload = raw as Record<string, unknown>;
  if (!Array.isArray(payload.tools)) {
    throw new Error("Invalid tools payload: 'tools' is not an array");
  }

  const tools: ExternalTool[] = [];
  for (const entry of payload.tools) {
    if (!entry || typeof entry !== "object") {
      console.warn("[Tools] Skipping invalid entry:", entry);
      continue;
    }

    const e = entry as Record<string, unknown>;
    const id = e.id as string | undefined;
    const title = e.title as string | undefined;
    const description = e.description as string | undefined;

    if (!id || typeof id !== "string" || !id.trim()) {
      console.warn("[Tools] Skipping entry with missing/invalid id");
      continue;
    }

    if (!title || typeof title !== "string" || !title.trim()) {
      console.warn("[Tools] Skipping entry with missing/invalid title:", id);
      continue;
    }

    if (!description || typeof description !== "string" || !description.trim()) {
      console.warn("[Tools] Skipping entry with missing/invalid description:", id);
      continue;
    }

    const tags = Array.isArray(e.tags)
      ? (e.tags as unknown[]).filter((t) => typeof t === "string").map((t) => t as string)
      : undefined;

    const images = Array.isArray(e.images)
      ? (e.images as unknown[]).filter((img) => typeof img === "string").map((img) => img as string)
      : undefined;

    const icon = typeof e.icon === "string" ? e.icon : undefined;

    const actions = Array.isArray(e.actions)
      ? (e.actions as unknown[])
          .filter((a) => a && typeof a === "object")
          .map((a) => {
            const action = a as Record<string, unknown>;
            return {
              label: typeof action.label === "string" ? action.label : "Open",
              url: typeof action.url === "string" ? action.url : "",
            };
          })
          .filter((a) => a.url)
      : undefined;

    const creators = Array.isArray(e.creators)
      ? (e.creators as unknown[])
          .filter((c) => c && typeof c === "object")
          .map((c) => {
            const creator = c as Record<string, unknown>;
            return {
              name: typeof creator.name === "string" ? creator.name : "Unknown",
              avatar: typeof creator.avatar === "string" ? creator.avatar : undefined,
            };
          })
      : undefined;

    tools.push({
      id,
      title,
      description,
      tags,
      images,
      icon,
      actions,
      creators,
    });
  }

  return tools;
}

export async function fetchTools(): Promise<ExternalTool[]> {
  const url = `${RAW_BASE_URL}/refs/heads/${REPO_BRANCH}/${TOOLS_FILE_PATH}?t=${Date.now()}`;

  try {
    const text = await fetchText(url);
    const raw = JSON.parse(text) as unknown;
    return parseToolsPayload(raw);
  } catch (error) {
    console.error("[Tools] Failed to fetch tools:", error);
    throw error;
  }
}

declare const GM_openInTab:
  | ((url: string, opts?: { active?: boolean; insert?: boolean; setParent?: boolean }) => void)
  | undefined;

function openUrl(url: string): boolean {
  if (typeof GM_openInTab === "function") {
    GM_openInTab(url, { active: true, insert: true });
    return true;
  }

  if (typeof window === "undefined") return false;

  try {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}

export function openLink(url: string): boolean {
  return openUrl(url);
}
