// Chip colours for a pet ability: the Pets menu, its Logs tab, the Team
// Builder and the companion's hatch chips all paint abilities the same way.

import { petAbilities } from "../../data";
import { abilityNameWithoutLevel } from "./abilityNames";

export type AbilityChipColors = { bg: string; hover: string };

const solid = (r: number, g: number, b: number): AbilityChipColors => ({
  bg: `rgba(${r},${g},${b},0.9)`,
  hover: `rgba(${r},${g},${b},1)`,
});

/** The grey the game itself uses for an ability without a colour. */
const NEUTRAL: AbilityChipColors = { bg: "rgba(100,100,100,0.9)", hover: "rgba(150,150,150,1)" };

/**
 * Colours for the moments before the live catalog has been given its colours
 * (see `data/live/abilityColors.ts`), or when the API cannot be reached. Each
 * row lists ability families: an id starting with the family, or whose name
 * without its tier matches it, takes the colour. The first match wins.
 */
const FALLBACK_COLORS: ReadonlyArray<readonly [families: string[], colors: AbilityChipColors]> = [
  [["MoonKisser"], solid(250, 166, 35)],
  [["DawnKisser"], solid(162, 92, 242)],
  [["DawnCapture"], solid(178, 90, 158)],
  [["DawnbinderBoost"], solid(180, 104, 160)],
  [["ProduceScaleBoost", "SnowyCropSizeBoost"], solid(34, 139, 34)],
  [["PlantGrowthBoost", "SnowyPlantGrowthBoost", "DawnPlantGrowthBoost", "AmberPlantGrowthBoost", "ThunderPlantGrowthBoost"], solid(0, 128, 128)],
  [["EggGrowthBoost", "SnowyEggGrowthBoost", "ThunderEggGrowthBoost"], solid(180, 90, 240)],
  [["PetAgeBoost"], solid(147, 112, 219)],
  [["PetHatchSizeBoost"], solid(128, 0, 128)],
  [["PetXpBoost", "SnowyPetXpBoost", "DawnXpBoost", "ThunderXpBoost"], solid(30, 144, 255)],
  [["HungerBoost", "SnowyHungerBoost"], solid(255, 20, 147)],
  [["HungerRestore", "SnowyHungerRestore"], solid(255, 105, 180)],
  [["SellBoost"], solid(220, 20, 60)],
  [["CoinFinder", "SnowyCoinFinder", "DawnCoinFinder", "ThunderCoinFinder"], solid(180, 150, 0)],
  [["SeedFinder"], solid(168, 102, 38)],
  [["ProduceMutationBoost", "SnowyCropMutationBoost", "DawnBoost", "AmberMoonBoost", "ThunderBoost"], solid(140, 15, 70)],
  [["PetMutationBoost"], solid(160, 50, 100)],
  [["DoubleHarvest"], solid(0, 120, 180)],
  [["DoubleHatch"], solid(60, 90, 180)],
  [["ProduceEater"], solid(255, 69, 0)],
  [["ProduceRefund"], solid(255, 99, 71)],
  [["PetRefund"], solid(0, 80, 120)],
  [["Copycat"], solid(255, 140, 0)],
  [
    ["GoldGranter"],
    {
      bg: "linear-gradient(135deg, rgba(225,200,55,0.9) 0%, rgba(225,180,10,0.9) 40%, rgba(215,185,45,0.9) 70%, rgba(210,185,45,0.9) 100%)",
      hover: "linear-gradient(135deg, rgba(220,200,70,1) 0%, rgba(210,175,5,1) 40%, rgba(210,185,55,1) 70%, rgba(200,175,30,1) 100%)",
    },
  ],
  [
    ["RainbowGranter"],
    {
      bg: "linear-gradient(45deg, rgba(200,0,0,0.9), rgba(200,120,0,0.9), rgba(160,170,30,0.9), rgba(60,170,60,0.9), rgba(50,170,170,0.9), rgba(40,150,180,0.9), rgba(20,90,180,0.9), rgba(70,30,150,0.9))",
      hover: "linear-gradient(45deg, rgba(200,0,0,1), rgba(200,120,0,1), rgba(160,170,30,1), rgba(60,170,60,1), rgba(50,170,170,1), rgba(40,150,180,1), rgba(20,90,180,1), rgba(70,30,150,1))",
    },
  ],
  [["RainDance"], solid(76, 204, 204)],
  [["SnowGranter"], solid(144, 184, 204)],
  [["FrostGranter"], solid(148, 160, 204)],
  [["DawnlitGranter"], solid(196, 124, 180)],
  [["AmberlitGranter"], solid(204, 144, 96)],
  [["ThunderstruckGranter"], solid(194, 184, 60)],
  [["Thundercharger"], solid(31, 163, 130)],
  [["Thunderbloom"], solid(112, 246, 203)],
];

export function getAbilityChipColors(id: string): AbilityChipColors {
  const key = String(id || "");

  // The live catalog carries the game's exact colours once enriched.
  const live = (petAbilities as Record<string, { color?: { bg?: unknown; hover?: unknown } } | undefined>)[key]?.color;
  if (live && typeof live.bg === "string" && live.bg) {
    return { bg: live.bg, hover: typeof live.hover === "string" && live.hover ? live.hover : live.bg };
  }

  const base = abilityNameWithoutLevel(key).replace(/[\s\-_]+/g, "").toLowerCase();
  const matches = (family: string) => key.startsWith(family) || base === family.toLowerCase();
  for (const [families, colors] of FALLBACK_COLORS) {
    if (families.some(matches)) return colors;
  }
  return NEUTRAL;
}
