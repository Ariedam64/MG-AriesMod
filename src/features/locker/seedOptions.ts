// Every species the locker can hold a per-crop override for, with the emoji
// that stands in for it until its sprite loads. The crop calculator reads the
// same list.

import { memoOnCatalogs, plantCatalog } from "../../data";

export type LockerSeedOption = {
  key: string;
  seedName: string;
  cropName: string;
  /** Raw sprite path from game data, e.g. "sprite/plant/CloverFourLeaf". */
  spriteKey?: string;
};

const SEED_EMOJIS = [
  "🥕", "🍓", "🍃", "🔵", "🍎", "🌷", "🍅", "🌼", "🌽", "🍉", "🎃", "🌿", "🥥", "🍌", "🌸",
  "🟢", "🍄", "🌵", "🎍", "🍇", "🌶️", "🍋", "🥭", "🐉", "🍒", "🌻", "✨", "🔆", "🔮",
];

const seedCache = memoOnCatalogs(() => {
  const options: LockerSeedOption[] = Object.entries(plantCatalog as Record<string, any>).map(([key, def]) => ({
    key,
    seedName: def?.seed?.name ?? "",
    cropName: def?.crop?.name ?? "",
    spriteKey: def?.crop?.sprite ?? def?.plant?.sprite ?? undefined,
  }));
  const byKey = new Map<string, string>();
  const bySeedName = new Map<string, string>();
  options.forEach((option, index) => {
    const emoji = SEED_EMOJIS[index % SEED_EMOJIS.length];
    byKey.set(option.key, emoji);
    if (option.seedName) bySeedName.set(option.seedName, emoji);
  });
  return { options, byKey, bySeedName };
});

export const getLockerSeedOptions = (): LockerSeedOption[] => seedCache().options;

export const getLockerSeedEmojiForKey = (key: string | undefined): string | undefined =>
  key ? (seedCache().byKey.get(key) ?? "•") : undefined;

export const getLockerSeedEmojiForSeedName = (name: string | undefined): string | undefined =>
  name ? (seedCache().bySeedName.get(name) ?? "•") : undefined;
