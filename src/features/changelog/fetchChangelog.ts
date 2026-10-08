// Release notes listed in `changelog/changelog.json` of the mod's repo, one
// entry per notable version.

import { fetchRepoList, isNonEmptyString, stringList } from "../tools/repoJson";

export type ChangelogEntry = {
  version: string;
  date?: string;
  title?: string;
  notes: string;
  /** Optional screenshots shown under the notes. Several images become a carousel. */
  images?: string[];
};

function parseEntry(e: Record<string, unknown>): ChangelogEntry | null {
  const { version, notes } = e;
  if (!isNonEmptyString(version)) {
    console.warn("[Changelog] Skipping entry with missing/invalid version");
    return null;
  }
  if (!isNonEmptyString(notes)) {
    console.warn("[Changelog] Skipping entry with missing/invalid notes:", version);
    return null;
  }
  return {
    version,
    notes,
    date: typeof e.date === "string" ? e.date : undefined,
    title: typeof e.title === "string" ? e.title : undefined,
    // A blank image URL is dropped rather than failing the whole entry.
    images: (stringList(e.images) ?? []).filter(isNonEmptyString),
  };
}

export async function fetchChangelogEntryForVersion(version: string): Promise<ChangelogEntry | null> {
  const entries = await fetchRepoList("changelog/changelog.json", "entries", "Changelog");
  for (const raw of entries) {
    const entry = parseEntry(raw);
    if (entry?.version === version) return entry;
  }
  return null;
}
