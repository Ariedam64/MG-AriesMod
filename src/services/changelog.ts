// src/services/changelog.ts
// Release notes fetched from remote JSON on GitHub, one entry per notable
// version. Mirrors services/tools.ts: same repo, same fetch/parse shape.

import { fetchText } from "../utils/version";

export type ChangelogEntry = {
  version: string;
  date?: string;
  title?: string;
  notes: string;
  /** Optional screenshots shown under the notes. Several images become a carousel. */
  images?: string[];
};

const REPO_OWNER = "Ariedam64";
const REPO_NAME = "MG-AriesMod";
const REPO_BRANCH = "main";
const CHANGELOG_FILE_PATH = "changelog/changelog.json";
const RAW_BASE_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}`;

function parseChangelogPayload(raw: unknown): ChangelogEntry[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid changelog payload: not an object");
  }

  const payload = raw as Record<string, unknown>;
  if (!Array.isArray(payload.entries)) {
    throw new Error("Invalid changelog payload: 'entries' is not an array");
  }

  const entries: ChangelogEntry[] = [];
  for (const entry of payload.entries) {
    if (!entry || typeof entry !== "object") {
      console.warn("[Changelog] Skipping invalid entry:", entry);
      continue;
    }

    const e = entry as Record<string, unknown>;
    const version = e.version as string | undefined;
    const notes = e.notes as string | undefined;

    if (!version || typeof version !== "string" || !version.trim()) {
      console.warn("[Changelog] Skipping entry with missing/invalid version");
      continue;
    }

    if (!notes || typeof notes !== "string" || !notes.trim()) {
      console.warn("[Changelog] Skipping entry with missing/invalid notes:", version);
      continue;
    }

    // Same shape as services/tools.ts: unusable values are dropped rather than
    // failing the whole entry, so a typo in one URL can't hide the release notes.
    const images = Array.isArray(e.images)
      ? (e.images as unknown[]).filter(
          (img): img is string => typeof img === "string" && img.trim().length > 0
        )
      : [];

    entries.push({
      version,
      notes,
      date: typeof e.date === "string" ? e.date : undefined,
      title: typeof e.title === "string" ? e.title : undefined,
      images,
    });
  }

  return entries;
}

export async function fetchChangelog(): Promise<ChangelogEntry[]> {
  const url = `${RAW_BASE_URL}/refs/heads/${REPO_BRANCH}/${CHANGELOG_FILE_PATH}?t=${Date.now()}`;

  const text = await fetchText(url);
  const raw = JSON.parse(text) as unknown;
  return parseChangelogPayload(raw);
}

export async function fetchChangelogEntryForVersion(version: string): Promise<ChangelogEntry | null> {
  const entries = await fetchChangelog();
  return entries.find((entry) => entry.version === version) ?? null;
}
