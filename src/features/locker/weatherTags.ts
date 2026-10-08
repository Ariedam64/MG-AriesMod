// The weather mutations the locker's weather filter offers, and the rule that
// a recipe row holds at most one of each kind (one condition, one lighting).

import { memoOnCatalogs, tileRefsMutationLabels, tileRefsMutations } from "../../data";
import { spaceWords } from "../../lib/format";
import { NO_WEATHER_TAG } from "./settings";

export type WeatherMutationInfo = { key: string; label: string };

/** Ground decals the game files with the mutations, which no crop carries. */
const NOT_CROP_MUTATIONS = new Set(["Puddle", "ThunderstruckGround"]);

export function weatherMutationLabel(key: string): string {
  const label = (tileRefsMutationLabels as Record<string, string | undefined>)[key];
  if (label) return label;
  const spaced = spaceWords(key.replace(/_/g, " ")).replace(/\s+/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

/** "No weather effect" first, then every weather mutation, in catalog order. */
export const weatherMutations = memoOnCatalogs((): WeatherMutationInfo[] => [
  { key: NO_WEATHER_TAG, label: "No weather effect" },
  ...Object.entries(tileRefsMutations as Record<string, unknown>)
    .filter(([key, ref]) => !NOT_CROP_MUTATIONS.has(key) && (typeof ref === "number" || typeof ref === "string"))
    .map(([key]) => ({ key, label: weatherMutationLabel(key) })),
]);

const isOffered = (tag: string): boolean => weatherMutations().some((info) => info.key === tag);

type RecipeGroup = "condition" | "lighting";

const RECIPE_GROUP_MEMBERS: Record<RecipeGroup, string[]> = {
  condition: ["Wet", "Chilled", "Frozen", "Thunderstruck", "Thundercharged"],
  lighting: ["Dawnlit", "Amberlit", "Dawncharged", "Ambercharged"],
};

const recipeGroupOf = (tag: string): RecipeGroup | undefined =>
  (Object.keys(RECIPE_GROUP_MEMBERS) as RecipeGroup[]).find((group) => RECIPE_GROUP_MEMBERS[group].includes(tag));

/** The other tags of the same kind, which a recipe row drops when `tag` is picked. */
export function recipeRivals(tag: string): string[] {
  const group = recipeGroupOf(tag);
  return group ? RECIPE_GROUP_MEMBERS[group].filter((other) => other !== tag) : [];
}

/** Drops the tags the filter no longer offers. */
export function keepOfferedTags(selection: Set<string>): void {
  for (const tag of selection) if (!isOffered(tag)) selection.delete(tag);
}

/** Like `keepOfferedTags`, and keeps only the first tag of each kind, in catalog order. */
export function normalizeRecipe(selection: Set<string>): void {
  keepOfferedTags(selection);
  const seen = new Set<RecipeGroup>();
  for (const { key } of weatherMutations()) {
    if (!selection.has(key)) continue;
    const group = recipeGroupOf(key);
    if (!group) continue;
    if (seen.has(group)) selection.delete(key);
    else seen.add(group);
  }
}
