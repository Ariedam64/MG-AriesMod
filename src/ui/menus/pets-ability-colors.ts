// src/ui/menus/pets-ability-colors.ts
// Chip colours for a pet ability. Lives on its own so both the Pets menu and
// its Logs tab can use it without importing each other.

import { PetsService } from "../../services/pets";
import { petAbilities } from "../../data";

  // Ability → { bg, hover } — couleurs servies par l'API en priorité
export function getAbilityChipColors(id: string): { bg: string; hover: string } {
  const key = String(id || "");

  // The abilities catalog is enriched at runtime with the exact chip colors
  // parsed from the game bundle (data/dynamic/logic/abilityColors.ts). The
  // hardcoded mapping below is only a fallback until enrichment completes.
  const apiColor = (petAbilities as Record<string, any>)?.[key]?.color;
  if (apiColor && typeof apiColor.bg === "string" && apiColor.bg) {
    const hover = typeof apiColor.hover === "string" && apiColor.hover ? apiColor.hover : apiColor.bg;
    return { bg: apiColor.bg, hover };
  }

  const base = (PetsService.getAbilityNameWithoutLevel?.(key) || "")
    .replace(/[\s\-_]+/g, "")
    .toLowerCase();

  const is = (prefix: string) =>
    key.startsWith(prefix) || base === prefix.toLowerCase();

  // Celestials / événements spéciauxa
  if (is("MoonKisser")) {
    return {
      bg: "rgba(250,166,35,0.9)",
      hover: "rgba(250,166,35,1)",
    };
  }

  if (is("DawnKisser")) {
    return {
      bg: "rgba(162,92,242,0.9)",
      hover: "rgba(162,92,242,1)",
    };
  }

  if (is("DawnCapture")) {
    return {
      bg: "rgba(178,90,158,0.9)",
      hover: "rgba(178,90,158,1)",
    };
  }

  if (is("DawnbinderBoost")) {
    return {
      bg: "rgba(180,104,160,0.9)",
      hover: "rgba(180,104,160,1)",
    };
  }

  // Boosts de production / croissance / œufs / âge / taille / XP
  if (is("ProduceScaleBoost") || is("SnowyCropSizeBoost")) {
    // I & II (+ Snowy)
    return { bg: "rgba(34,139,34,0.9)", hover: "rgba(34,139,34,1)" };
  }

  if (is("PlantGrowthBoost") || is("SnowyPlantGrowthBoost") || is("DawnPlantGrowthBoost") || is("AmberPlantGrowthBoost") || is("ThunderPlantGrowthBoost")) {
    return { bg: "rgba(0,128,128,0.9)", hover: "rgba(0,128,128,1)" };
  }

  if (is("EggGrowthBoost") || is("SnowyEggGrowthBoost") || is("ThunderEggGrowthBoost")) {
    // I, II_NEW, II (III en jeu) + Snowy
    return { bg: "rgba(180,90,240,0.9)", hover: "rgba(180,90,240,1)" };
  }

  if (is("PetAgeBoost")) {
    // I & II
    return { bg: "rgba(147,112,219,0.9)", hover: "rgba(147,112,219,1)" };
  }

  if (is("PetHatchSizeBoost")) {
    // I & II
    return { bg: "rgba(128,0,128,0.9)", hover: "rgba(128,0,128,1)" };
  }

  if (is("PetXpBoost") || is("SnowyPetXpBoost") || is("DawnXpBoost") || is("ThunderXpBoost")) {
    // I & II (+ Snowy / Dawn / Thunder)
    return { bg: "rgba(30,144,255,0.9)", hover: "rgba(30,144,255,1)" };
  }

  // Faim / regen faim
  if (is("HungerBoost") || is("SnowyHungerBoost")) {
    // I & II (+ Snowy)
    return { bg: "rgba(255,20,147,0.9)", hover: "rgba(255,20,147,1)" };
  }

  if (is("HungerRestore") || is("SnowyHungerRestore")) {
    // I & II (+ Snowy)
    return { bg: "rgba(255,105,180,0.9)", hover: "rgba(255,105,180,1)" };
  }

  // Sell Boost (toutes les versions)
  if (is("SellBoost")) {
    // I, II, III, IV
    return { bg: "rgba(220,20,60,0.9)", hover: "rgba(220,20,60,1)" };
  }

  // Coin Finder (I, II, III + Snowy / Dawn / Thunder)
  if (is("CoinFinder") || is("SnowyCoinFinder") || is("DawnCoinFinder") || is("ThunderCoinFinder")) {
    return { bg: "rgba(180,150,0,0.9)", hover: "rgba(180,150,0,1)" };
  }

  // Seed Finder (I à IV) → même couleur pour toutes les versions
  if (is("SeedFinder")) {
    return {
      bg: "rgba(168,102,38,0.9)",
      hover: "rgba(168,102,38,1)",
    };
  }

  // Mutation / mutation pets
  if (is("ProduceMutationBoost") || is("SnowyCropMutationBoost") || is("DawnBoost") || is("AmberMoonBoost") || is("ThunderBoost")) {
    return { bg: "rgba(140,15,70,0.9)", hover: "rgba(140,15,70,1)" };
  }

  if (is("PetMutationBoost")) {
    // I & II
    return { bg: "rgba(160,50,100,0.9)", hover: "rgba(160,50,100,1)" };
  }

  // Double récolte / double hatch
  if (is("DoubleHarvest")) {
    return { bg: "rgba(0,120,180,0.9)", hover: "rgba(0,120,180,1)" };
  }

  if (is("DoubleHatch")) {
    return { bg: "rgba(60,90,180,0.9)", hover: "rgba(60,90,180,1)" };
  }

  // Abilities liées aux crops / ventes / refund
  if (is("ProduceEater")) {
    return { bg: "rgba(255,69,0,0.9)", hover: "rgba(255,69,0,1)" };
  }

  if (is("ProduceRefund")) {
    return { bg: "rgba(255,99,71,0.9)", hover: "rgba(255,99,71,1)" };
  }

  // Pet refund
  if (is("PetRefund")) {
    // I & II
    return { bg: "rgba(0,80,120,0.9)", hover: "rgba(0,80,120,1)" };
  }

  // Copycat
  if (is("Copycat")) {
    return { bg: "rgba(255,140,0,0.9)", hover: "rgba(255,140,0,1)" };
  }

  // Gold granter (gradient)
  if (is("GoldGranter")) {
    return {
      bg: "linear-gradient(135deg, rgba(225,200,55,0.9) 0%, rgba(225,180,10,0.9) 40%, rgba(215,185,45,0.9) 70%, rgba(210,185,45,0.9) 100%)",
      hover:
        "linear-gradient(135deg, rgba(220,200,70,1) 0%, rgba(210,175,5,1) 40%, rgba(210,185,55,1) 70%, rgba(200,175,30,1) 100%)",
    };
  }

  // Rainbow granter (gradient)
  if (is("RainbowGranter")) {
    return {
      bg: "linear-gradient(45deg, rgba(200,0,0,0.9), rgba(200,120,0,0.9), rgba(160,170,30,0.9), rgba(60,170,60,0.9), rgba(50,170,170,0.9), rgba(40,150,180,0.9), rgba(20,90,180,0.9), rgba(70,30,150,0.9))",
      hover:
        "linear-gradient(45deg, rgba(200,0,0,1), rgba(200,120,0,1), rgba(160,170,30,1), rgba(60,170,60,1), rgba(50,170,170,1), rgba(40,150,180,1), rgba(20,90,180,1), rgba(70,30,150,1))",
    };
  }

  // Rain Dance
  if (is("RainDance")) {
    return { bg: "rgba(76,204,204,0.9)", hover: "rgba(76,204,204,1)" };
  }

  // Cold mutations granters
  if (is("SnowGranter")) {
    return { bg: "rgba(144,184,204,0.9)", hover: "rgba(144,184,204,1)" };
  }

  if (is("FrostGranter")) {
    return { bg: "rgba(148,160,204,0.9)", hover: "rgba(148,160,204,1)" };
  }

  if (is("DawnlitGranter")) {
    return { bg: "rgba(196,124,180,0.9)", hover: "rgba(196,124,180,1)" };
  }

  if (is("AmberlitGranter")) {
    return { bg: "rgba(204,144,96,0.9)", hover: "rgba(204,144,96,1)" };
  }

  if (is("ThunderstruckGranter")) {
    return { bg: "rgba(194,184,60,0.9)", hover: "rgba(194,184,60,1)" };
  }

  if (is("Thundercharger")) {
    return { bg: "rgba(31,163,130,0.9)", hover: "rgba(31,163,130,1)" };
  }

  if (is("Thunderbloom")) {
    return { bg: "rgba(112,246,203,0.9)", hover: "rgba(112,246,203,1)" };
  }

  // Couleur neutre par défaut (même que le jeu)
  return {
    bg: "rgba(100,100,100,0.9)",
    hover: "rgba(150,150,150,1)",
  };
}
