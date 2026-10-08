// Community tools listed in `tools/tools.json` of the mod's repo.

import { fetchRepoList, isNonEmptyString, stringList } from "./repoJson";

export type ExternalToolCreator = {
  name: string;
  avatar?: string;
};

type ExternalToolAction = {
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

const objectList = (value: unknown): Array<Record<string, unknown>> | undefined =>
  Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    : undefined;

function parseTool(e: Record<string, unknown>): ExternalTool | null {
  const { id, title, description } = e;
  if (!isNonEmptyString(id)) {
    console.warn("[Tools] Skipping entry with missing/invalid id");
    return null;
  }
  if (!isNonEmptyString(title)) {
    console.warn("[Tools] Skipping entry with missing/invalid title:", id);
    return null;
  }
  if (!isNonEmptyString(description)) {
    console.warn("[Tools] Skipping entry with missing/invalid description:", id);
    return null;
  }

  return {
    id,
    title,
    description,
    tags: stringList(e.tags),
    images: stringList(e.images),
    icon: typeof e.icon === "string" ? e.icon : undefined,
    actions: objectList(e.actions)
      ?.map((action) => ({
        label: typeof action.label === "string" ? action.label : "Open",
        url: typeof action.url === "string" ? action.url : "",
      }))
      .filter((action) => action.url),
    creators: objectList(e.creators)?.map((creator) => ({
      name: typeof creator.name === "string" ? creator.name : "Unknown",
      avatar: typeof creator.avatar === "string" ? creator.avatar : undefined,
    })),
  };
}

export async function fetchTools(): Promise<ExternalTool[]> {
  try {
    const entries = await fetchRepoList("tools/tools.json", "tools", "Tools");
    return entries.map(parseTool).filter((tool): tool is ExternalTool => tool !== null);
  } catch (error) {
    console.error("[Tools] Failed to fetch tools:", error);
    throw error;
  }
}
