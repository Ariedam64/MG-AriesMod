// The Tools list and the changelog both live as JSON files in the mod's GitHub
// repo, so publishing either never needs a rebuild. Both are fetched and
// unwrapped the same way here.

import { getJSON } from "../../platform/http";

const RAW_BASE_URL = "https://raw.githubusercontent.com/Ariedam64/MG-AriesMod/refs/heads/main";

/**
 * Fetches `path` from the repo, past every cache, and returns the objects
 * listed under `listKey`. A payload of the wrong shape throws; a single bad
 * entry is skipped with a warning, so one typo cannot hide the rest.
 */
export async function fetchRepoList(
  path: string,
  listKey: string,
  label: string,
): Promise<Array<Record<string, unknown>>> {
  const raw = await getJSON<unknown>(`${RAW_BASE_URL}/${path}?t=${Date.now()}`, { noCache: true });
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid ${label.toLowerCase()} payload: not an object`);
  }
  const list = (raw as Record<string, unknown>)[listKey];
  if (!Array.isArray(list)) {
    throw new Error(`Invalid ${label.toLowerCase()} payload: '${listKey}' is not an array`);
  }

  const entries: Array<Record<string, unknown>> = [];
  for (const entry of list) {
    if (entry && typeof entry === "object") entries.push(entry as Record<string, unknown>);
    else console.warn(`[${label}] Skipping invalid entry:`, entry);
  }
  return entries;
}

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/** The strings of an array field, or undefined when the field is not an array. */
export const stringList = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
