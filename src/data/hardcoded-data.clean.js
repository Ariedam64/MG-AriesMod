// === Hardcoded game data (extracted from bundle) ===

// Utiles si tu veux factoriser
/** @param {string} guildId @returns {boolean} */
const endsWith1 = guildId => String(guildId).endsWith("1");
/** @param {string} guildId @returns {boolean} */
const endsWith2 = guildId => String(guildId).endsWith("2");
/** @param {string} guildId @returns {boolean} */
const isEvenGuild = guildId => {
  const d = parseInt(String(guildId).slice(-1), 10);
  return Number.isInteger(d) && d % 2 === 0;
};

export const rarity = {
  Common: 'Common',
  Uncommon: 'Uncommon',
  Rare: 'Rare',
  Legendary: 'Legendary',
  Mythic: 'Mythical',
  Divine: 'Divine',
  Celestial: 'Celestial'};

export const harvestType = { 
  Single: 'Single', 
  Multiple: 'Multiple' 
};

export const tileRefsMap = {
  Dirt1: 6,
  Dirt2: 7,
  Dirt3: 8,
  Bush1: 28,
  Bush2: 38,
  BushHomer: 48,
  Sky0: 24,
  Sky1: 25,
  Sky2: 26,
  Sky3: 27,
  Sky4: 35,
  Sky5: 36,
  Sky6: 37,
  Sky7: 45,
  Sky8: 46,
  Sky9: 47,
};

export const tileRefsPlants = {
    Aloe: "sprite/plant/Aloe",
    Apple: "sprite/plant/Apple",
    BabyBeet: "sprite/plant/BabyBeet",
    BabyCarrot: "sprite/plant/BabyCarrot",
    Banana: "sprite/plant/Banana",
    Beet: "sprite/plant/Beet",
    Blueberry: "sprite/plant/Blueberry",
    BurrosTail: "sprite/plant/BurrosTail",
    BushyTree: "sprite/plant/BushyTree",
    Cabbage: "sprite/plant/Cabbage",
    CabbagePlant: "sprite/plant/CabbagePlant",
    Cacao: "sprite/plant/Cacao",
    CacaoTree: "sprite/plant/CacaoTree",
    Camellia: "sprite/plant/Camellia",
    Carrot: "sprite/plant/Carrot",
    Chrysanthemum: "sprite/plant/Chrysanthemum",
    Coconut: "sprite/plant/Coconut",
    Corn: "sprite/plant/Corn",
    Date: "sprite/plant/Date",
    DatePalm: "sprite/plant/DatePalm",
    Daffodil: "sprite/plant/Daffodil",
    DawnCelestialCrop: "sprite/plant/DawnCelestialCrop",
    Delphinium: "sprite/plant/Delphinium",
    DirtPatch: "sprite/plant/DirtPatch",
    DragonFruit: "sprite/plant/DragonFruit",
    DragonFruitTree: "sprite/plant/DragonFruitTree",
    Echeveria: "sprite/plant/Echeveria",
    FavaBean: "sprite/plant/FavaBean",
    FlowerBush: "sprite/plant/FlowerBush",
    Gentian: "sprite/plant/Gentian",
    Grape: "sprite/plant/Grape",
    Hedge: "sprite/plant/Hedge",
    Lemon: "sprite/plant/Lemon",
    Lily: "sprite/plant/Lily",
    Lychee: "sprite/plant/Lychee",
    MoonCelestialCrop: "sprite/plant/MoonCelestialCrop",
    Mushroom: "sprite/plant/Mushroom",
    PalmTree: "sprite/plant/PalmTree",
    PassionFruit: "sprite/plant/PassionFruit",
    Peach: "sprite/plant/Peach",
    Pear: "sprite/plant/Pear",
    Pepper: "sprite/plant/Pepper",
    PineTree: "sprite/plant/PineTree",
    Poinsettia: "sprite/plant/Poinsettia",
    Pumpkin: "sprite/plant/Pumpkin",
    RoseRed: "sprite/plant/RoseRed",
    Shrub: "sprite/plant/Shrub",
    SproutFlower: "sprite/plant/SproutFlower",
    SproutFruit: "sprite/plant/SproutFruit",
    SproutVine: "sprite/plant/SproutVine",
    Squash: "sprite/plant/Squash",
    Starweaver: "sprite/plant/Starweaver",
    StemFlower: "sprite/plant/StemFlower",
    Strawberry: "sprite/plant/Strawberry",
    Sunflower: "sprite/plant/Sunflower",
    Tomato: "sprite/plant/Tomato",
    Tree: "sprite/plant/Tree",
    Trellis: "sprite/plant/Trellis",
    Tulip: "sprite/plant/Tulip",
    VioletCort: "sprite/plant/VioletCort",
    Watermelon: "sprite/plant/Watermelon",
};

export const tileRefsTallPlants = {
    Bamboo: "sprite/tall-plant/Bamboo",
    Cactus: "sprite/tall-plant/Cactus",
    DawnCelestialPlant: "sprite/tall-plant/DawnCelestialPlant",
    DawnCelestialPlantActive: "sprite/tall-plant/DawnCelestialPlantActive",
    DawnCelestialPlatform: "sprite/tall-plant/DawnCelestialPlatform",
    DawnCelestialPlatformTopmostLayer: "sprite/tall-plant/DawnCelestialPlatformTopmostLayer",
    MoonCelestialPlant: "sprite/tall-plant/MoonCelestialPlant",
    MoonCelestialPlantActive: "sprite/tall-plant/MoonCelestialPlantActive",
    MoonCelestialPlatform: "sprite/tall-plant/MoonCelestialPlatform",
    StarweaverPlant: "sprite/tall-plant/StarweaverPlant",
    StarweaverPlatform: "sprite/tall-plant/StarweaverPlatform",
};

export const tileRefsSeeds = {
    Aloe: "sprite/seed/Aloe",
    Apple: "sprite/seed/Apple",
    Bamboo: "sprite/seed/Bamboo",
    Banana: "sprite/seed/Banana",
    Beet: "sprite/seed/Beet",
    Blueberry: "sprite/seed/Blueberry",
    BurrosTail: "sprite/seed/BurrosTail",
    Cabbage: "sprite/seed/Cabbage",
    Cacao: "sprite/seed/Cacao",
    Cactus: "sprite/seed/Cactus",
    Camellia: "sprite/seed/Camellia",
    Carrot: "sprite/seed/Carrot",
    Chrysanthemum: "sprite/seed/Chrysanthemum",
    Coconut: "sprite/seed/Coconut",
    Corn: "sprite/seed/Corn",
    Date: "sprite/seed/Date",
    Daffodil: "sprite/seed/Daffodil",
    DawnCelestial: "sprite/seed/DawnCelestial",
    Delphinium: "sprite/seed/Delphinium",
    DragonFruit: "sprite/seed/DragonFruit",
    Echeveria: "sprite/seed/Echeveria",
    FavaBean: "sprite/seed/FavaBean",
    Gentian: "sprite/seed/Gentian",
    Grape: "sprite/seed/Grape",
    Lemon: "sprite/seed/Lemon",
    Lily: "sprite/seed/Lily",
    Lychee: "sprite/seed/Lychee",
    MoonCelestial: "sprite/seed/MoonCelestial",
    Mushroom: "sprite/seed/Mushroom",
    PassionFruit: "sprite/seed/PassionFruit",
    Peach: "sprite/seed/Peach",
    Pear: "sprite/seed/Pear",
    Pepper: "sprite/seed/Pepper",
    Pinecone: "sprite/seed/Pinecone",
    Poinsettia: "sprite/seed/Poinsettia",
    Pumpkin: "sprite/seed/Pumpkin",
    Rose: "sprite/seed/Rose",
    Squash: "sprite/seed/Squash",
    Starweaver: "sprite/seed/Starweaver",
    Strawberry: "sprite/seed/Strawberry",
    Sunflower: "sprite/seed/Sunflower",
    Tomato: "sprite/seed/Tomato",
    Tulip: "sprite/seed/Tulip",
    VioletCort: "sprite/seed/VioletCort",
    Watermelon: "sprite/seed/Watermelon",
};

export const tileRefsItems = {
  // UI / système (pas dans V.Item)
  Coin: 1,
  InventoryBag: 7,
  MoneyBag: 11,
  JournalStamp: 22,
  Donut: 23,
  ToolsRestocked: 24,
  SeedsRestocked: 25,
  EggsRestocked: 26,
  DecorRestocked: 27,
  Leaderboard: 28,
  Stats: 29,
  ActivityLog: 30,
  ChatBubble: 39,
  ArrowKeys: 41,
  Touchpad: 42,

  // V.Item
  AmberlitPotion: "sprite/item/AmberlitPotion",
  ChilledPotion: "sprite/item/ChilledPotion",
  CropCleanser: "sprite/item/CropCleanser",
  DawnlitPotion: "sprite/item/DawnlitPotion",
  FrozenPotion: "sprite/item/FrozenPotion",
  GoldPotion: "sprite/item/GoldPotion",
  PlanterPot: "sprite/item/PlanterPot",
  RainbowPotion: "sprite/item/RainbowPotion",
  Shovel: "sprite/item/Shovel",
  WateringCan: "sprite/item/WateringCan",
  WetPotion: "sprite/item/WetPotion",
};

export const tileRefsAnimations = {
  // Météo (pas dans V.Animation)
  Rain: 10,
  Frost: 20,
  Sunny: 30,
  AmberMoon: 40,
  Dawn: 50,

  // V.Animation
  DawnCelestialActivationTile: "sprite/animation/DawnCelestialActivationTile",
  MoonCelestialActivationTile: "sprite/animation/MoonCelestialActivationTile",
};

export const tileRefsPets = {
  Bee: "sprite/pet/Bee",
  Bunny: "sprite/pet/Bunny",
  Butterfly: "sprite/pet/Butterfly",
  Capybara: "sprite/pet/Capybara",
  Chicken: "sprite/pet/Chicken",
  CommonEgg: "sprite/pet/CommonEgg",
  Cow: "sprite/pet/Cow",
  Dragonfly: "sprite/pet/Dragonfly",
  FireHorse: "sprite/pet/FireHorse",
  FireHorseActive: "sprite/pet/FireHorseActive",
  Goat: "sprite/pet/Goat",
  Horse: "sprite/pet/Horse",
  HorseEgg: "sprite/pet/HorseEgg",
  LegendaryEgg: "sprite/pet/LegendaryEgg",
  MythicalEgg: "sprite/pet/MythicalEgg",
  Peacock: "sprite/pet/Peacock",
  Pig: "sprite/pet/Pig",
  Pony: "sprite/pet/Pony",
  RareEgg: "sprite/pet/RareEgg",
  Snail: "sprite/pet/Snail",
  SnowEgg: "sprite/pet/SnowEgg",
  SnowFox: "sprite/pet/SnowFox",
  Squirrel: "sprite/pet/Squirrel",
  Stoat: "sprite/pet/Stoat",
  Turkey: "sprite/pet/Turkey",
  Turtle: "sprite/pet/Turtle",
  UncommonEgg: "sprite/pet/UncommonEgg",
  WhiteCaribou: "sprite/pet/WhiteCaribou",
  WinterEgg: "sprite/pet/WinterEgg",
  Worm: "sprite/pet/Worm",
  // Pas dans V.Pet (garder pour compatibilité)
  DivineEgg: 16,
  CelestialEgg: 17,
}

export const tileRefsMutations = {
  Ambercharged: "sprite/mutation/Ambercharged",
  Amberlit: "sprite/mutation/Amberlit",
  Chilled: "sprite/mutation/Chilled",
  Dawncharged: "sprite/mutation/Dawncharged",
  Dawnlit: "sprite/mutation/Dawnlit",
  Frozen: "sprite/mutation/Frozen",
  Puddle: "sprite/mutation/Puddle",
  Thundercharged: "sprite/mutation/Thundercharged",
  Thunderstruck: "sprite/mutation/Thunderstruck",
  ThunderstruckGround: "sprite/mutation/ThunderstruckGround",
  Wet: "sprite/mutation/Wet",
};

export const tileRefsMutationLabels = {
  Wet: "Wet",
  Chilled: "Chilled",
  Frozen: "Frozen",
  Puddle: "Puddle",
  Dawnlit: "Dawnlit",
  Amberlit: "Amberlit",
  Dawncharged: "Dawnbound",
  Ambercharged: "Amberbound",
  Thunderstruck: "Thunderstruck",
  ThunderstruckGround: "Thunderstruck",
  Thundercharged: "Thundercharged"

};

export const tileRefsDecor = {
    Birdhouse: "sprite/decor/Birdhouse",
    Cauldron: "sprite/decor/Cauldron",
    ColoredStringLights: "sprite/decor/ColoredStringLights",
    ColoredStringLightsSideways: "sprite/decor/ColoredStringLightsSideways",
    DecorShed: "sprite/decor/DecorShed",
    FanousLantern: "sprite/decor/FanousLantern",
    FanousLanternLit: "sprite/decor/FanousLanternLit",
    FanousLanternSideways: "sprite/decor/FanousLanternSideways",
    FanousLanternSidewaysLit: "sprite/decor/FanousLanternSidewaysLit",
    HayBale: "sprite/decor/HayBale",
    FeedingTrough: "sprite/decor/FeedingTrough",
    FeedingTroughCover: "sprite/decor/FeedingTroughCover",
    HayBaleSideways: "sprite/decor/HayBaleSideways",
    LargeGravestone: "sprite/decor/LargeGravestone",
    LargeGravestoneSideways: "sprite/decor/LargeGravestoneSideways",
    LargeRock: "sprite/decor/LargeRock",
    MarbleArch: "sprite/decor/MarbleArch",
    MarbleArchSideways: "sprite/decor/MarbleArchSideways",
    MarbleBench: "sprite/decor/MarbleBench",
    MarbleBenchBackwards: "sprite/decor/MarbleBenchBackwards",
    MarbleBenchSideways: "sprite/decor/MarbleBenchSideways",
    MarbleBlobling: "sprite/decor/MarbleBlobling",
    MarbleBridge: "sprite/decor/MarbleBridge",
    MarbleBridgeSideways: "sprite/decor/MarbleBridgeSideways",
    MarbleCaribou: "sprite/decor/MarbleCaribou",
    MarbleFountain: "sprite/decor/MarbleFountain",
    MarbleLampPost: "sprite/decor/MarbleLampPost",
    MediumGravestone: "sprite/decor/MediumGravestone",
    MediumGravestoneSideways: "sprite/decor/MediumGravestoneSideways",
    MediumRock: "sprite/decor/MediumRock",
    MiniFairyCottage: "sprite/decor/MiniFairyCottage",
    MiniFairyForge: "sprite/decor/MiniFairyForge",
    MiniFairyKeep: "sprite/decor/MiniFairyKeep",
    MiniWizardTower: "sprite/decor/MiniWizardTower",
    PaperLantern: "sprite/decor/PaperLantern",
    PaperLanternSideways: "sprite/decor/PaperLanternSideways",
    PetHutch: "sprite/decor/PetHutch",
    SeedSilo: "sprite/decor/SeedSilo",
    SmallGravestone: "sprite/decor/SmallGravestone",
    SmallGravestoneSideways: "sprite/decor/SmallGravestoneSideways",
    SmallRock: "sprite/decor/SmallRock",
    StoneArch: "sprite/decor/StoneArch",
    StoneArchSideways: "sprite/decor/StoneArchSideways",
    StoneBench: "sprite/decor/StoneBench",
    StoneBenchSideways: "sprite/decor/StoneBenchSideways",
    StoneBirdBath: "sprite/decor/StoneBirdBath",
    StoneBridge: "sprite/decor/StoneBridge",
    StoneBridgeSideways: "sprite/decor/StoneBridgeSideways",
    StoneCaribou: "sprite/decor/StoneCaribou",
    StoneGnome: "sprite/decor/StoneGnome",
    StoneLampPost: "sprite/decor/StoneLampPost",
    StrawScarecrow: "sprite/decor/StrawScarecrow",
    StringLights: "sprite/decor/StringLights",
    StringLightsSideways: "sprite/decor/StringLightsSideways",
    WoodArch: "sprite/decor/WoodArch",
    WoodArchSide: "sprite/decor/WoodArchSide",
    WoodBench: "sprite/decor/WoodBench",
    WoodBenchBackwards: "sprite/decor/WoodBenchBackwards",
    WoodBenchSideways: "sprite/decor/WoodBenchSideways",
    WoodBridge: "sprite/decor/WoodBridge",
    WoodBridgeSideways: "sprite/decor/WoodBridgeSideways",
    WoodCaribou: "sprite/decor/WoodCaribou",
    WoodLampPost: "sprite/decor/WoodLampPost",
    WoodOwl: "sprite/decor/WoodOwl",
    WoodPergola: "sprite/decor/WoodPergola",
    WoodWindmill: "sprite/decor/WoodWindmill",
};

export const plantCatalog = {
  Carrot: {
    seed: {
      tileRef: tileRefsSeeds.Carrot,
      name: "Carrot Seed",
      coinPrice: 10,
      creditPrice: 7,
      rarity: rarity.Common,
    },
    plant: {
      tileRef: tileRefsPlants.BabyCarrot,
      name: "Carrot Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.7,
    },
    crop: {
      tileRef: tileRefsPlants.Carrot,
      name: "Carrot",
      baseSellPrice: 20,
      baseWeight: 0.1,
      baseTileScale: 0.6,
      maxScale: 3,
    },
  },

  Cabbage: {
        seed: {
            tileRef: tileRefsSeeds.Cabbage,
            name: "Cabbage Seed",
            coinPrice: 30,
            creditPrice: 12,
            rarity: rarity.Common
        },
        plant: {
            tileRef: tileRefsPlants.CabbagePlant,
            name: "Cabbage Plant",
            harvestType: harvestType.Multiple,
            slotOffsets: [{
                x: 0,
                y: -.05,
                rotation: 0
            }],
            secondsToMature: 45,
            baseTileScale: 1,
            rotateSlotOffsetsRandomly: !1
        },
        crop: {
            tileRef: tileRefsPlants.Cabbage,
            name: "Cabbage",
            baseSellPrice: 42,
            baseWeight: 1,
            baseTileScale: .8,
            maxScale: 3
        }
    },

  Strawberry: {
    seed: {
      tileRef: tileRefsSeeds.Strawberry,
      name: "Strawberry Seed",
      coinPrice: 50,
      creditPrice: 21,
      rarity: rarity.Common,
    },
    plant: {
      tileRef: tileRefsPlants.SproutFruit,
      name: "Strawberry Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.2, y: -0.1, rotation: 0 },
        { x: 0.175, y: -0.2, rotation: 0 },
        { x: -0.18, y: 0.22, rotation: 0 },
        { x: 0.2, y: 0.2, rotation: 0 },
        { x: 0.01, y: 0.01, rotation: 0 },
      ],
      secondsToMature: 70,
      baseTileScale: 1,
      rotateSlotOffsetsRandomly: true,
    },
    crop: {
      tileRef: tileRefsPlants.Strawberry,
      name: "Strawberry",
      baseSellPrice: 14,
      baseWeight: 0.05,
      baseTileScale: 0.25,
      maxScale: 2,
    },
  },

  Aloe: {
    seed: {
      tileRef: tileRefsSeeds.Aloe,
      name: "Aloe Seed",
      coinPrice: 135,
      creditPrice: 18,
      rarity: rarity.Common,
    },
    plant: {
      tileRef: tileRefsPlants.AloePlant,
      name: "Aloe Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.9,
    },
    crop: {
      tileRef: tileRefsPlants.Aloe,
      name: "Aloe",
      baseSellPrice: 310,
      baseWeight: 1.5,
      baseTileScale: 0.7,
      maxScale: 2.5,
    },
  },

  Beet: {
        seed: {
            tileRef: tileRefsSeeds.Beet,
            name: "Beet Seed",
            coinPrice: 210,
            creditPrice: 25,
            rarity: rarity.Common
        },
        plant: {
            tileRef: tileRefsPlants.BabyBeet,
            name: "Beet Plant",
            harvestType: harvestType.Single,
            baseTileScale: .7
        },
        crop: {
            tileRef: tileRefsPlants.Beet,
            name: "Beet",
            baseSellPrice: 350,
            baseWeight: .3,
            baseTileScale: .2,
            maxScale: 3
        }
    },

  Rose: {
    seed: {
      tileRef: tileRefsSeeds.Rose,
      name: "Rose Seed",
      coinPrice: 229,
      creditPrice: 27,
      rarity: rarity.Uncommon,
    },
    plant: {
      tileRef: tileRefsPlants.RoseRed,
      name: "Rose Plant",
      harvestType: harvestType.Single,
      baseTileScale: 1,
    },
    crop: {
      tileRef: tileRefsPlants.RoseRed,
      name: "Rose",
      baseSellPrice: 300,
      baseWeight: 0.01,
      baseTileScale: 1,
      maxScale: 4,
    },
  },

  FavaBean: {
    seed: {
      tileRef: tileRefsSeeds.FavaBean,
      name: "Fava Bean",
      coinPrice: 250,
      creditPrice: 30,
      rarity: rarity.Uncommon,
    },
    plant: {
      tileRef: tileRefsPlants.SproutFlower,
      name: "Fava Bean Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.1, y: 0.15, rotation: 35 },
        { x: -0.23, y: 0.22, rotation: 35 },
        { x: 0.05, y: 0.3, rotation: 35 },
        { x: 0.18, y: 0.25, rotation: 35 },
        { x: 0.22, y: -0.02, rotation: 35 },
        { x: 0.1, y: -0.15, rotation: 35 },
        { x: -0.1, y: -0.17, rotation: 35 },
        { x: -0.25, y: -0.11, rotation: 35 },
      ],
      secondsToMature: 900,
      baseTileScale: 1.1,
      rotateSlotOffsetsRandomly: true,
    },
    crop: {
      tileRef: tileRefsPlants.FavaBean,
      name: "Fava Bean Pod",
      baseSellPrice: 30,
      baseWeight: 0.03,
      baseTileScale: 0.3,
      maxScale: 3,
    },
  },

  Delphinium: {
    seed: {
      tileRef: tileRefsSeeds.Delphinium,
      name: "Delphinium Seed",
      coinPrice: 300,
      creditPrice: 12,
      rarity: rarity.Uncommon,
    },
    plant: {
      tileRef: tileRefsPlants.Delphinium,
      name: "Delphinium Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.8,
      tileTransformOrigin: "bottom",
      nudgeY: -0.43,
      nudgeYMultiplier: 0.05,
    },
    crop: {
      tileRef: tileRefsPlants.Delphinium,
      name: "Delphinium",
      baseSellPrice: 530,
      baseWeight: 0.02,
      baseTileScale: 0.8,
      maxScale: 3,
    },
  },

  Blueberry: {
    seed: {
      tileRef: tileRefsSeeds.Blueberry,
      name: "Blueberry Seed",
      coinPrice: 400,
      creditPrice: 49,
      rarity: rarity.Uncommon,
    },
    plant: {
      tileRef: tileRefsPlants.SproutFruit,
      name: "Blueberry Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.2, y: -0.1, rotation: 0 },
        { x: 0.175, y: -0.2, rotation: 0 },
        { x: -0.18, y: 0.22, rotation: 0 },
        { x: 0.2, y: 0.2, rotation: 0 },
        { x: 0.01, y: 0.01, rotation: 0 },
      ],
      secondsToMature: 105,
      baseTileScale: 1,
      rotateSlotOffsetsRandomly: true,
    },
    crop: {
      tileRef: tileRefsPlants.Blueberry,
      name: "Blueberry",
      baseSellPrice: 23,
      baseWeight: 0.01,
      baseTileScale: 0.25,
      maxScale: 2,
    },
  },

  Apple: {
    seed: {
      tileRef: tileRefsSeeds.Apple,
      name: "Apple Seed",
      coinPrice: 500,
      creditPrice: 67,
      rarity: rarity.Uncommon,
      unavailableSurfaces: ["discord"],
    },
    plant: {
      tileRef: tileRefsTallPlants.Tree,
      name: "Apple Tree",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.35, y: -2.4, rotation: 0 },
        { x: -0.5, y: -2, rotation: 0 },
        { x: 0.1, y: -2.2, rotation: 0 },
        { x: -0.2, y: -1.65, rotation: 0 },
        { x: 0.55, y: -1.9, rotation: 0 },
        { x: 0.3, y: -1.7, rotation: 0 },
        { x: 0.4, y: 0.1, rotation: 0 },
      ],
      secondsToMature: 360 * 60,
      baseTileScale: 3,
      rotateSlotOffsetsRandomly: true,
      tileTransformOrigin: "bottom",
      nudgeY: -0.25,
    },
    crop: {
      tileRef: tileRefsPlants.Apple,
      name: "Apple",
      baseSellPrice: 73,
      baseWeight: 0.18,
      baseTileScale: 0.5,
      maxScale: 2,
    },
  },

  OrangeTulip: {
    seed: {
      tileRef: tileRefsSeeds.Tulip,
      name: "Tulip Seed",
      coinPrice: 600,
      creditPrice: 14,
      rarity: rarity.Uncommon,
    },
    plant: {
      tileRef: tileRefsPlants.Tulip,
      name: "Tulip Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.5,
    },
    crop: {
      tileRef: tileRefsPlants.Tulip,
      name: "Tulip",
      baseSellPrice: 767,
      baseWeight: 0.01,
      baseTileScale: 0.5,
      maxScale: 3,
    },
  },

  Tomato: {
    seed: {
      tileRef: tileRefsSeeds.Tomato,
      name: "Tomato Seed",
      coinPrice: 800,
      creditPrice: 79,
      rarity: rarity.Uncommon,
    },
    plant: {
      tileRef: tileRefsPlants.SproutVine,
      name: "Tomato Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.3, y: -0.3, rotation: 0 },
        { x: 0.3, y: 0.3, rotation: 0 },
      ],
      secondsToMature: 1100,
      baseTileScale: 1,
      rotateSlotOffsetsRandomly: false,
    },
    crop: {
      tileRef: tileRefsPlants.Tomato,
      name: "Tomato",
      baseSellPrice: 27,
      baseWeight: 0.3,
      baseTileScale: 0.33,
      maxScale: 2,
    },
  },

  Daffodil: {
    seed: {
      tileRef: tileRefsSeeds.Daffodil,
      name: "Daffodil Seed",
      coinPrice: 1000,
      creditPrice: 19,
      rarity: rarity.Rare,
    },
    plant: {
      tileRef: tileRefsPlants.Daffodil,
      name: "Daffodil Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.5,
    },
    crop: {
      tileRef: tileRefsPlants.Daffodil,
      name: "Daffodil",
      baseSellPrice: 1090,
      baseWeight: 0.01,
      baseTileScale: 0.5,
      maxScale: 3,
    },
  },

  Corn: {
    seed: {
      tileRef: tileRefsSeeds.Corn,
      name: "Corn Kernel",
      coinPrice: 1300,
      creditPrice: 135,
      rarity: rarity.Rare,
    },
    plant: {
      tileRef: tileRefsPlants.SproutVegetable,
      name: "Corn Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [{ x: 0, y: -0.1, rotation: 0 }],
      secondsToMature: 130,
      baseTileScale: 1,
      rotateSlotOffsetsRandomly: false,
    },
    crop: {
      tileRef: tileRefsPlants.Corn,
      name: "Corn",
      baseSellPrice: 36,
      baseWeight: 1.2,
      baseTileScale: 0.7,
      maxScale: 2,
    },
  },

  Watermelon: {
    seed: {
      tileRef: tileRefsSeeds.Watermelon,
      name: "Watermelon Seed",
      coinPrice: 2500,
      creditPrice: 195,
      rarity: rarity.Rare,
    },
    plant: {
      tileRef: tileRefsPlants.Watermelon,
      name: "Watermelon Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.8,
    },
    crop: {
      tileRef: tileRefsPlants.Watermelon,
      name: "Watermelon",
      baseSellPrice: 2708,
      baseWeight: 4.5,
      baseTileScale: 0.8,
      maxScale: 3,
    },
  },

  Pumpkin: {
    seed: {
      tileRef: tileRefsSeeds.Pumpkin,
      name: "Pumpkin Seed",
      coinPrice: 3000,
      creditPrice: 210,
      rarity: rarity.Rare,
    },
    plant: {
      tileRef: tileRefsPlants.Pumpkin,
      name: "Pumpkin Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.8,
    },
    crop: {
      tileRef: tileRefsPlants.Pumpkin,
      name: "Pumpkin",
      baseSellPrice: 3700,
      baseWeight: 6,
      baseTileScale: 0.8,
      maxScale: 3,
    },
  },

  Echeveria: {
    seed: {
      tileRef: tileRefsSeeds.Echeveria,
      name: "Echeveria Cutting",
      coinPrice: 4200,
      creditPrice: 113,
      rarity: rarity.Rare,
    },
    plant: {
      tileRef: tileRefsPlants.Echeveria,
      name: "Echeveria Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.8,
    },
    crop: {
      tileRef: tileRefsPlants.Echeveria,
      name: "Echeveria",
      baseSellPrice: 4600,
      baseWeight: 0.8,
      baseTileScale: 0.8,
      maxScale: 2.75,
    },
  },

  Pear: {
        seed: {
            tileRef: tileRefsSeeds.Pear,
            name: "Pear Seed",
            coinPrice: 6e3,
            creditPrice: 122,
            rarity: rarity.Rare
        },
        plant: {
            tileRef: tileRefsPlants.Tree,
            name: "Pear Tree",
            harvestType: harvestType.Multiple,
            slotOffsets: [{
                x: -.5,
                y: -1,
                rotation: 0
            }, {
                x: -.35,
                y: -.4,
                rotation: 0
            }, {
                x: .1,
                y: -.45,
                rotation: 0
            }, {
                x: 0,
                y: -.9,
                rotation: 0
            }, {
                x: .4,
                y: -.7,
                rotation: 0
            }, {
                x: .5,
                y: -1.1,
                rotation: 0
            }, {
                x: -.3,
                y: 1.2,
                rotation: 0
            }],
            secondsToMature: 360 * 60,
            baseTileScale: 3,
            rotateSlotOffsetsRandomly: !0,
            tileTransformOrigin: "bottom",
            nudgeY: -.25
        },
        crop: {
            tileRef: tileRefsPlants.Pear,
            name: "Pear",
            baseSellPrice: 250,
            baseWeight: .17,
            baseTileScale: .5,
            maxScale: 2
        }
    },

    Gentian: {
        seed: {
            tileRef: tileRefsSeeds.Gentian,
            name: "Gentian Seed",
            coinPrice: 9e3,
            creditPrice: 30,
            rarity: rarity.Rare
        },
        plant: {
            tileRef: tileRefsPlants.Gentian,
            name: "Gentian Plant",
            harvestType: harvestType.Single,
            baseTileScale: .5
        },
        crop: {
            tileRef: tileRefsPlants.Gentian,
            name: "Gentian",
            baseSellPrice: 1e4,
            baseWeight: .02,
            baseTileScale: .5,
            maxScale: 3
        }
    },

  Coconut: {
    seed: {
      tileRef: tileRefsSeeds.Coconut,
      name: "Coconut Seed",
      coinPrice: 1e4,
      creditPrice: 235,
      rarity: rarity.Legendary,
    },
    plant: {
      tileRef: tileRefsTallPlants.PalmTree,
      name: "Coconut Tree",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.2, y: -2.6, rotation: 0 },
        { x: -0.3, y: -2.4, rotation: 0 },
        { x: 0.2, y: -2.5, rotation: 0 },
        { x: -0.25, y: -2.1, rotation: 0 },
        { x: 0.0, y: -2.3, rotation: 0 },
        { x: 0.3, y: -2.2, rotation: 0 },
        { x: 0.05, y: -2.0, rotation: 0 },
      ],
      secondsToMature: 720 * 60,
      baseTileScale: 3,
      rotateSlotOffsetsRandomly: true,
      tileTransformOrigin: "bottom",
      nudgeY: -0.35,
    },
    crop: {
      tileRef: tileRefsPlants.Coconut,
      name: "Coconut",
      baseSellPrice: 302,
      baseWeight: 5,
      baseTileScale: 0.25,
      maxScale: 3,
    },
  },

    PineTree: {
        seed: {
            tileRef: tileRefsSeeds.Pinecone,
            name: "Pinecone",
            coinPrice: 12e3,
            creditPrice: 30,
            rarity: rarity.Legendary,
        },
        plant: {
            tileRef: tileRefsPlants.PineTree,
            name: "Pine Tree",
            harvestType: harvestType.Single,
            baseTileScale: 1.5
        },
        crop: {
            tileRef: tileRefsPlants.PineTree,
            name: "Pine Tree",
            baseSellPrice: 15e3,
            baseWeight: 1e3,
            baseTileScale: 1.5,
            maxScale: 3.5
        }
    },

  Banana: {
    seed: {
      tileRef: tileRefsSeeds.Banana,
      name: "Banana Seed",
      coinPrice: 15e3,
      creditPrice: 199,
      rarity: rarity.Legendary,
      getCanSpawnInGuild: guildId => {
        const last = guildId.slice(-1);
        const r = parseInt(last, 10);
        return !isNaN(r) && r % 2 === 0;
      },
      unavailableSurfaces: ["web"],
    },
    plant: {
      tileRef: tileRefsTallPlants.PalmTree,
      name: "Banana Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.3, y: -1.7, rotation: 10 },
        { x: -0.2, y: -1.7, rotation: -10 },
        { x: -0.1, y: -1.7, rotation: -30 },
        { x: 0.0, y: -1.7, rotation: -50 },
        { x: 0.1, y: -1.7, rotation: -70 },
      ],
      secondsToMature: 14400,
      baseTileScale: 2.5,
      rotateSlotOffsetsRandomly: false,
      tileTransformOrigin: "bottom",
      nudgeY: -0.4,
    },
    crop: {
      tileRef: tileRefsPlants.Banana,
      name: "Banana",
      baseSellPrice: 1750,
      baseWeight: 0.12,
      baseTileScale: 0.5,
      maxScale: 1.7,
    },
  },


  Lily: {
    seed: {
      tileRef: tileRefsSeeds.Lily,
      name: "Lily Seed",
      coinPrice: 20000,
      creditPrice: 34,
      rarity: rarity.Legendary,
    },
    plant: {
      tileRef: tileRefsPlants.Lily,
      name: "Lily Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.75,
      nudgeY: -0.1,
    },
    crop: {
      tileRef: tileRefsPlants.Lily,
      name: "Lily",
      baseSellPrice: 20123,
      baseWeight: 0.02,
      baseTileScale: 0.5,
      maxScale: 2.75,
    },
  },

  Camellia: {
    seed: {
      tileRef: tileRefsSeeds.Camellia,
      name: "Camellia Seed",
      coinPrice: 55000,
      creditPrice: 289,
      rarity: rarity.Legendary,
    },
    plant: {
      tileRef: tileRefsPlants.Hedge,
      name: "Camellia Hedge",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: 0.0, y: -0.9, rotation: 0 },
        { x: -0.28, y: -0.6, rotation: 0 },
        { x: 0.28, y: -0.6, rotation: 0 },
        { x: -0.35, y: -0.2, rotation: 0 },
        { x: 0.32, y: -0.2, rotation: 0 },
        { x: -0.3, y: 0.25, rotation: 0 },
        { x: 0.28, y: 0.25, rotation: 0 },
        { x: 0.0, y: 0.0, rotation: 0 },
      ],
      secondsToMature: 1440 * 60,
      baseTileScale: 2,
      rotateSlotOffsetsRandomly: true,
      tileTransformOrigin: "bottom",
      nudgeY: -0.4,
      nudgeYMultiplier: 0.5,
    },
    crop: {
      tileRef: tileRefsPlants.Camellia,
      name: "Camellia",
      baseSellPrice: 4875,
      baseWeight: 0.3,
      baseTileScale: 0.4,
      maxScale: 2.5,
    },
  },

  Squash: {
    seed: {
      tileRef: tileRefsSeeds.Squash,
      name: "Squash Seed",
      coinPrice: 55000,
      creditPrice: 199,
      rarity: rarity.Legendary,
    },
    plant: {
      tileRef: tileRefsPlants.SproutFlower,
      name: "Squash Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.08, y: 0.2, rotation: 35 },
        { x: 0.2, y: 0.0, rotation: 35 },
        { x: -0.2, y: -0.1, rotation: 35 },
      ],
      secondsToMature: 1500,
      baseTileScale: 1.2,
      rotateSlotOffsetsRandomly: true,
    },
    crop: {
      tileRef: tileRefsPlants.Squash,
      name: "Squash",
      baseSellPrice: 3500,
      baseWeight: 0.3,
      baseTileScale: 0.4,
      maxScale: 2.5,
    },
  },

  Peach: {
    seed: {
      tileRef: tileRefsSeeds.Peach,
      name: "Peach Seed",
      coinPrice: 85e3,
      creditPrice: 299,
      rarity: rarity.Legendary,
    },
    plant: {
      tileRef: tileRefsPlants.Tree,
      name: "Peach Tree",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -.66, y: -.34, rotation: 0 },
        { x: -.2,  y: -.1,  rotation: 0 },
        { x: .35,  y: -.25, rotation: 0 },
        { x: .76,  y: -.56, rotation: 0 },
        { x: -.08, y: -.69, rotation: 0 },
        { x: .36,  y: -1.03, rotation: 0 },
        { x: -.54, y: -.97, rotation: 0 },
      ],
      secondsToMature: 7200,
      rotateSlotOffsetsRandomly: true,
      baseTileScale: 3,
    },
    crop: {
      tileRef: tileRefsPlants.Peach,
      name: "Peach",
      baseSellPrice: 9e3,
      baseWeight: .18,
      baseTileScale: .5,
      maxScale: 3,
    },
  },

  BurrosTail: {
    seed: {
      tileRef: tileRefsSeeds.BurrosTail,
      name: "Burro's Tail Cutting",
      coinPrice: 93000,
      creditPrice: 338,
      rarity: rarity.Legendary,
    },
    plant: {
      tileRef: tileRefsPlants.Trellis,
      name: "Burro's Tail Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.13, y: -0.1, rotation: 0 },
        { x: 0.17, y: 0.13, rotation: 0 },
      ],
      secondsToMature: 1800,
      baseTileScale: 0.8,
      rotateSlotOffsetsRandomly: false,
    },
    crop: {
      tileRef: tileRefsPlants.BurrosTail,
      name: "Burro's Tail",
      baseSellPrice: 6000,
      baseWeight: 0.4,
      baseTileScale: 0.4,
      maxScale: 2.5,
    },
  },

  Mushroom: {
    seed: {
      tileRef: tileRefsSeeds.Mushroom,
      name: "Mushroom Spore",
      coinPrice: 150000,
      creditPrice: 249,
      rarity: rarity.Mythic,
    },
    plant: {
      tileRef: tileRefsPlants.MushroomPlant,
      name: "Mushroom Plant",
      harvestType: harvestType.Single,
      baseTileScale: 0.8,
    },
    crop: {
      tileRef: tileRefsPlants.Mushroom,
      name: "Mushroom",
      baseSellPrice: 160000,
      baseWeight: 25,
      baseTileScale: 0.65,
      maxScale: 3.5,
    },
  },

  Cactus: {
    seed: {
      tileRef: tileRefsSeeds.Cactus,
      name: "Cactus Seed",
      coinPrice: 250000,
      creditPrice: 250,
      rarity: rarity.Mythic,
    },
    plant: {
      tileRef: tileRefsTallPlants.Cactus,
      name: "Cactus Plant",
      harvestType: harvestType.Single,
      baseTileScale: 2.5,
      tileTransformOrigin: "bottom",
      nudgeY: -0.4,
      nudgeYMultiplier: 0.3,
    },
    crop: {
      tileRef: tileRefsTallPlants.Cactus,
      name: "Cactus",
      baseSellPrice: 261000,
      baseWeight: 1500,
      baseTileScale: 2.5,
      maxScale: 1.8,
    },
  },

  Bamboo: {
    seed: {
      tileRef: tileRefsSeeds.Bamboo,
      name: "Bamboo Seed",
      coinPrice: 400000,
      creditPrice: 300,
      rarity: rarity.Mythic,
    },
    plant: {
      tileRef: tileRefsTallPlants.Bamboo,
      name: "Bamboo Plant",
      harvestType: harvestType.Single,
      baseTileScale: 2.5,
      tileTransformOrigin: "bottom",
      nudgeY: -0.45,
      nudgeYMultiplier: 0.3,
    },
    crop: {
      tileRef: tileRefsTallPlants.Bamboo,
      name: "Bamboo Shoot",
      baseSellPrice: 500000,
      baseWeight: 1,
      baseTileScale: 2.5,
      maxScale: 2,
    },
  },
  Poinsettia: {
        seed: {
            tileRef: tileRefsSeeds.Poinsettia,
            name: "Poinsettia Seed",
            coinPrice: 5e5,
            creditPrice: 500,
            rarity: rarity.Mythic,
        },
        plant: {
            tileRef: tileRefsTallPlants.Shrub,
            name: "Poinsettia Bush",
            harvestType: harvestType.Multiple,
            slotOffsets: [{
                x: .05,
                y: -.4,
                rotation: 0
            }, {
                x: -.3,
                y: -.15,
                rotation: 0
            }, {
                x: .3,
                y: -.1,
                rotation: 0
            }, {
                x: -.02,
                y: .17,
                rotation: 0
            }],
            secondsToMature: 10800,
            baseTileScale: 1,
            rotateSlotOffsetsRandomly: !0
        },
        crop: {
            tileRef: tileRefsTallPlants.Poinsettia,
            name: "Poinsettia",
            baseSellPrice: 3e4,
            baseWeight: .02,
            baseTileScale: .3,
            maxScale: 2
        }
    },

    VioletCort: {
        seed: {
            tileRef: tileRefsSeeds.VioletCort,
            name: "Violet Cort Spore",
            coinPrice: 52e4,
            creditPrice: 530,
            rarity: rarity.Mythic
        },
        plant: {
            tileRef: tileRefsPlants.VioletCort,
            name: "Violet Cort Plant",
            harvestType: harvestType.Single,
            baseTileScale: .55
        },
        crop: {
            tileRef: tileRefsPlants.VioletCort,
            name: "Violet Cort",
            baseSellPrice: 6e5,
            baseWeight: 2,
            baseTileScale: .65,
            maxScale: 3.5
        }
    },

  Chrysanthemum: {
    seed: {
      tileRef: tileRefsSeeds.Chrysanthemum,
      name: "Chrysanthemum Seed",
      coinPrice: 670000,
      creditPrice: 567,
      rarity: rarity.Mythic,
    },
    plant: {
      tileRef: tileRefsPlants.FlowerBush,
      name: "Chrysanthemum Bush",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: 0.0, y: 0.0, rotation: 0 },
        { x: -0.28, y: 0.22, rotation: 0 },
        { x: 0.28, y: 0.22, rotation: 0 },
        { x: 0.0, y: 0.33, rotation: 0 },
        { x: -0.25, y: -0.2, rotation: 0 },
        { x: 0.25, y: -0.2, rotation: 0 },
        { x: 0.0, y: -0.28, rotation: 0 },
      ],
      secondsToMature: 1440 * 60,
      baseTileScale: 1,
      rotateSlotOffsetsRandomly: false,
      tileTransformOrigin: "bottom",
    },
    crop: {
      tileRef: tileRefsPlants.Chrysanthemum,
      name: "Chrysanthemum",
      baseSellPrice: 18000,
      baseWeight: 0.01,
      baseTileScale: 0.3,
      maxScale: 2.75,
    },
  },

  Date: {
    seed: {
      tileRef: tileRefsSeeds.Date,
      name: "Date Seed",
      coinPrice: 750000,
      creditPrice: 580,
      rarity: rarity.Mythic,
      // expiryDate: $B, // TODO: fill in actual expiry date from game source
    },
    plant: {
      tileRef: tileRefsPlants.DatePalm,
      name: "Date Palm",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.2, y: -0.55, rotation: -10 },
        { x: -0.19, y: -0.7, rotation: 10 },
        { x: 0.1, y: -0.52, rotation: -56 },
        { x: 0.15, y: -0.63, rotation: -76 },
        { x: 0.26, y: -0.64, rotation: -96 },
        { x: -0.11, y: -0.42, rotation: -21 },
        { x: -0.09, y: -0.62, rotation: -16 },
        { x: 0.24, y: -0.47, rotation: -56 },
        { x: -0.33, y: -0.54, rotation: -16 },
        { x: -0.23, y: -0.38, rotation: -16 },
        { x: 0.19, y: -0.37, rotation: -56 },
      ],
      secondsToMature: 1080 * 60,
      baseTileScale: 2.8,
      rotateSlotOffsetsRandomly: false,
      tileTransformOrigin: "bottom",
    },
    crop: {
      tileRef: tileRefsPlants.Date,
      name: "Date",
      baseSellPrice: 15000,
      baseWeight: 0.02,
      baseTileScale: 0.25,
      maxScale: 2,
    },
  },

  Grape: {
    seed: {
      tileRef: tileRefsSeeds.Grape,
      name: "Grape Seed",
      coinPrice: 850000,
      creditPrice: 599,
      rarity: rarity.Mythic,
      getCanSpawnInGuild: guildId => guildId.endsWith("1"),
      unavailableSurfaces: ["web"],
    },
    plant: {
      tileRef: tileRefsPlants.SproutVine,
      name: "Grape Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [{ x: 0, y: 0, rotation: 0 }],
      secondsToMature: 1440 * 60,
      baseTileScale: 1,
      rotateSlotOffsetsRandomly: true,
    },
    crop: {
      tileRef: tileRefsPlants.Grape,
      name: "Grape",
      baseSellPrice: 12500,
      baseWeight: 3,
      baseTileScale: 0.5,
      maxScale: 2,
    },
  },

  Pepper: {
    seed: {
      tileRef: tileRefsSeeds.Pepper,
      name: "Pepper Seed",
      coinPrice: 1000000,
      creditPrice: 629,
      rarity: rarity.Divine,
    },
    plant: {
      tileRef: tileRefsPlants.SproutVine,
      name: "Pepper Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.02, y: 0.219, rotation: 0 },
        { x: 0.172, y: 0.172, rotation: 0 },
        { x: -0.172, y: 0.137, rotation: 0 },
        { x: 0.168, y: -0.035, rotation: 0 },
        { x: -0.082, y: -0.047, rotation: 0 },
        { x: -0.207, y: -0.074, rotation: 0 },
        { x: 0.18, y: -0.176, rotation: 0 },
        { x: -0.273, y: -0.195, rotation: 0 },
        { x: -0.074, y: -0.25, rotation: 0 },
      ],
      secondsToMature: 560,
      baseTileScale: 1,
      rotateSlotOffsetsRandomly: true,
    },
    crop: {
      tileRef: tileRefsPlants.Pepper,
      name: "Pepper",
      baseSellPrice: 7220,
      baseWeight: 0.5,
      baseTileScale: 0.3,
      maxScale: 2,
    },
  },

  Lemon: {
    seed: {
      tileRef: tileRefsSeeds.Lemon,
      name: "Lemon Seed",
      coinPrice: 2000000,
      creditPrice: 500,
      rarity: rarity.Divine,
      getCanSpawnInGuild: guildId => guildId.endsWith("2"),
      unavailableSurfaces: ["web"],
    },
    plant: {
      tileRef: tileRefsTallPlants.Tree,
      name: "Lemon Tree",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.5, y: -1.5, rotation: 0 },
        { x: 0.4, y: -1.6, rotation: 0 },
        { x: -0.3, y: -1.18, rotation: 0 },
        { x: 0.2, y: -1.2, rotation: 0 },
        { x: 0.01, y: -1.5, rotation: 0 },
        { x: -0.05, y: -1.8, rotation: 0 },
      ],
      secondsToMature: 720 * 60,
      baseTileScale: 2.3,
      rotateSlotOffsetsRandomly: true,
      tileTransformOrigin: "bottom",
      nudgeY: -0.25,
    },
    crop: {
      tileRef: tileRefsPlants.Lemon,
      name: "Lemon",
      baseSellPrice: 10000,
      baseWeight: 0.5,
      baseTileScale: 0.25,
      maxScale: 3,
    },
  },

  PassionFruit: {
    seed: {
      tileRef: tileRefsSeeds.PassionFruit,
      name: "Passion Fruit Seed",
      coinPrice: 2750000,
      creditPrice: 679,
      rarity: rarity.Divine,
    },
    plant: {
      tileRef: tileRefsPlants.SproutVine,
      name: "Passion Fruit Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.3, y: -0.3, rotation: 0 },
        { x: 0.3, y: 0.3, rotation: 0 },
      ],
      secondsToMature: 1440 * 60,
      baseTileScale: 1.1,
      rotateSlotOffsetsRandomly: false,
    },
    crop: {
      tileRef: tileRefsPlants.PassionFruit,
      name: "Passion Fruit",
      baseSellPrice: 24500,
      baseWeight: 9.5,
      baseTileScale: 0.35,
      maxScale: 2,
    },
  },

  DragonFruit: {
    seed: {
      tileRef: tileRefsSeeds.DragonFruit,
      name: "Dragon Fruit Seed",
      coinPrice: 5000000,
      creditPrice: 715,
      rarity: rarity.Divine,
    },
    plant: {
      tileRef: tileRefsPlants.PalmTree,
      name: "Dragon Fruit Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.3, y: -0.4, rotation: 0 },
        { x: -0.4, y: -0.05, rotation: 0 },
        { x: 0.36, y: -0.3, rotation: 0 },
        { x: -0.25, y: 0.3, rotation: 0 },
        { x: 0.0, y: -0.1, rotation: 0 },
        { x: 0.4, y: 0.1, rotation: 0 },
        { x: 0.1, y: 0.2, rotation: 0 },
      ],
      secondsToMature: 600,
      baseTileScale: 1.6,
      rotateSlotOffsetsRandomly: true,
    },
    crop: {
      tileRef: tileRefsPlants.DragonFruit,
      name: "Dragon Fruit",
      baseSellPrice: 24500,
      baseWeight: 8.4,
      baseTileScale: 0.4,
      maxScale: 2,
    },
  },

  Cacao: {
    seed: {
      tileRef: tileRefsSeeds.Cacao,
      name: "Cacao Bean",
      coinPrice: 10000000,
      creditPrice: 750,
      rarity: rarity.Divine,
    },
    plant: {
      tileRef: tileRefsTallPlants.CacaoTree,
      name: "Cacao Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: 0.28, y: -1.17, rotation: 20 },
        { x: -0.3, y: -1.07, rotation: 20 },
        { x: -0.05, y: -1.42, rotation: 20 },
        { x: 0.45, y: -1.67, rotation: 20 },
        { x: -0.5, y: -1.57, rotation: 20 },
        { x: -0.05, y: -1.87, rotation: 20 },
      ],
      secondsToMature: 1440 * 60,
      baseTileScale: 2.8,
      rotateSlotOffsetsRandomly: true,
      tileTransformOrigin: "bottom",
      nudgeY: -0.32,
    },
    crop: {
      tileRef: tileRefsPlants.Cacao,
      name: "Cacao Fruit",
      baseSellPrice: 70000,
      baseWeight: 0.5,
      baseTileScale: 0.4,
      maxScale: 2.5,
    },
  },

  Lychee: {
    seed: {
      tileRef: tileRefsSeeds.Lychee,
      name: "Lychee Pit",
      coinPrice: 25000000,
      creditPrice: 819,
      rarity: rarity.Divine,
      getCanSpawnInGuild: guildId => guildId.endsWith("2"),
      unavailableSurfaces: ["web"],
    },
    plant: {
      tileRef: tileRefsPlants.BushyTree,
      name: "Lychee Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: -0.4, y: -0.1, rotation: 0 },
        { x: 0.3, y: -0.2, rotation: 0 },
        { x: -0.3, y: 0.22, rotation: 0 },
        { x: 0.2, y: 0.2, rotation: 0 },
        { x: 0.01, y: -0.1, rotation: 0 },
        { x: -0.2, y: -0.3, rotation: 0 },
      ],
      secondsToMature: 1440 * 60,
      baseTileScale: 1.2,
      rotateSlotOffsetsRandomly: true,
    },
    crop: {
      tileRef: tileRefsPlants.Lychee,
      name: "Lychee Fruit",
      baseSellPrice: 50000,
      baseWeight: 9,
      baseTileScale: 0.2,
      maxScale: 2,
    },
  },

  Sunflower: {
    seed: {
      tileRef: tileRefsSeeds.Sunflower,
      name: "Sunflower Seed",
      coinPrice: 100000000,
      creditPrice: 900,
      rarity: rarity.Divine,
    },
    plant: {
      tileRef: tileRefsPlants.StemFlower,
      name: "Sunflower Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [{ x: 0.01, y: -0.6, rotation: 0 }],
      secondsToMature: 1440 * 60,
      rotateSlotOffsetsRandomly: false,
      tileTransformOrigin: "bottom",
      baseTileScale: 0.8,
      nudgeY: -0.35,
    },
    crop: {
      tileRef: tileRefsPlants.Sunflower,
      name: "Sunflower",
      baseSellPrice: 750000,
      baseWeight: 10,
      baseTileScale: 0.5,
      maxScale: 2.5,
    },
  },

  Starweaver: {
    seed: {
      tileRef: tileRefsSeeds.Starweaver,
      name: "Starweaver Pod",
      coinPrice: 1000000000,
      creditPrice: 1000,
      rarity: rarity.Celestial,
    },
    plant: {
      tileRef: tileRefsTallPlants.StarweaverPlant,
      name: "Starweaver Plant",
      harvestType: harvestType.Multiple,
      slotOffsets: [{ x: 0, y: -0.918, rotation: 0 }],
      secondsToMature: 1440 * 60,
      baseTileScale: 1.5,
      rotateSlotOffsetsRandomly: false,
      tileTransformOrigin: "bottom",
      nudgeY: -0.27,
      immatureTileRef: tileRefsTallPlants.StarweaverPlatform,
      isFixedScale: true,
      growingAnimationTiles: { frames: 10, row: 8, fps: 20, nudgeY: -0.2 },
    },
    crop: {
      tileRef: tileRefsPlants.Starweaver,
      name: "Starweaver Fruit",
      baseSellPrice: 10000000,
      baseWeight: 10,
      baseTileScale: 0.6,
      maxScale: 2,
    },
  },

  DawnCelestial: {
    seed: {
      tileRef: tileRefsSeeds.DawnCelestial,
      name: "Dawnbinder Pod",
      coinPrice: 10000000000,
      creditPrice: 1129,
      rarity: rarity.Celestial,
    },
    plant: {
      tileRef: tileRefsTallPlants.DawnCelestialPlant,
      name: "Dawnbinder",
      harvestType: harvestType.Multiple,
      secondsToMature: 1440 * 60,
      slotOffsets: [{ x: -0.015, y: -0.95, rotation: 0 }],
      baseTileScale: 2.3,
      rotateSlotOffsetsRandomly: false,
      tileTransformOrigin: "bottom",
      nudgeY: -0.2,
      abilities: ["DawnKisser"],
      activeState: {
        tileRef: tileRefsTallPlants.DawnCelestialPlantActive,
        activeAnimationTiles: { frames: 10, row: 6, fps: 20, nudgeY: -0.1 },
      },
      topmostLayerTileRef: tileRefsTallPlants.DawnCelestialPlatformTopmostLayer,
      immatureTileRef: tileRefsTallPlants.DawnCelestialPlatform,
      isFixedScale: true,
      growingAnimationTiles: { frames: 10, row: 8, fps: 20, nudgeY: -0.2 },
    },
    crop: {
      tileRef: tileRefsPlants.DawnCelestialCrop,
      name: "Dawnbinder Bulb",
      baseSellPrice: 11000000,
      baseWeight: 6,
      baseTileScale: 0.4,
      maxScale: 2.5,
      transformOrigin: "top",
    },
  },

  MoonCelestial: {
    seed: {
      tileRef: tileRefsSeeds.MoonCelestial,
      name: "Moonbinder Pod",
      coinPrice: 50000000000,
      creditPrice: 1249,
      rarity: rarity.Celestial,
    },
    plant: {
      tileRef: tileRefsTallPlants.MoonCelestialPlant,
      name: "Moonbinder",
      harvestType: harvestType.Multiple,
      slotOffsets: [
        { x: 0.01, y: -1.81, rotation: 0 },
        { x: -0.26, y: -0.82, rotation: -20 },
        { x: 0.23, y: -1.0, rotation: 20 },
      ],
      secondsToMature: 1440 * 60,
      baseTileScale: 2.5,
      rotateSlotOffsetsRandomly: false,
      tileTransformOrigin: "bottom",
      nudgeY: -0.2,
      abilities: ["MoonKisser"],
      activeState: {
        tileRef: tileRefsTallPlants.MoonCelestialPlantActive,
        activeAnimationTiles: { frames: 10, row: 6, fps: 20, nudgeY: -0.1 },
      },
      immatureTileRef: tileRefsTallPlants.MoonCelestialPlatform,
      isFixedScale: true,
      growingAnimationTiles: { frames: 10, row: 8, fps: 20, nudgeY: -0.2 },
    },
    crop: {
      tileRef: tileRefsPlants.MoonCelestialCrop,
      name: "Moonbinder Bulb",
      baseSellPrice: 11000000,
      baseWeight: 2,
      baseTileScale: 0.4,
      maxScale: 2,
      transformOrigin: "bottom",
    },
  },

};

export const mutationCatalog = {
  Gold:       { name: "Gold",        baseChance: 0.01,  coinMultiplier: 25 },
  Rainbow:    { name: "Rainbow",     baseChance: 0.001, coinMultiplier: 50 },

  Wet:        { name: "Wet",         baseChance: 0, coinMultiplier: 2,  tileRef: tileRefsMutations.Wet },
  Chilled:    { name: "Chilled",     baseChance: 0, coinMultiplier: 2,  tileRef: tileRefsMutations.Chilled },
  Frozen:     { name: "Frozen",      baseChance: 0, coinMultiplier: 6, tileRef: tileRefsMutations.Frozen },
  Thunderstruck: { name: "Thunderstruck", baseChance: 0, coinMultiplier: 5, tileRef: tileRefsMutations.Thunderstruck },
  Thundercharged: { name: "Thundercharged", baseChance: 0, coinMultiplier: 7, tileRef: tileRefsMutations.Thundercharged },

  Dawnlit:    { name: "Dawnlit",     baseChance: 0, coinMultiplier: 4,  tileRef: tileRefsMutations.Dawnlit },
  Amberlit: { name: "Amberlit",    baseChance: 0, coinMultiplier: 6,  tileRef: tileRefsMutations.Amberlit },

  Dawncharged:  { name: "Dawnbound",  baseChance: 0, coinMultiplier: 7, tileRef: tileRefsMutations.Dawncharged },
  Ambercharged: { name: "Amberbound", baseChance: 0, coinMultiplier: 10, tileRef: tileRefsMutations.Ambercharged },


}

export const eggCatalog = {
  CommonEgg: { tileRef: tileRefsPets.CommonEgg, name: "Common Egg", coinPrice: 1e5, creditPrice: 19, rarity: rarity.Common, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 600, faunaSpawnWeights: { Worm: 60, Snail: 35, Bee: 5 } },
  UncommonEgg: { tileRef: tileRefsPets.UncommonEgg, name: "Uncommon Egg", coinPrice: 1e6, creditPrice: 48, rarity: rarity.Uncommon, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 3600, faunaSpawnWeights: { Chicken: 65, Bunny: 25, Dragonfly: 10 } },
  RareEgg: { tileRef: tileRefsPets.RareEgg, name: "Rare Egg", coinPrice: 1e7, creditPrice: 99, rarity: rarity.Rare, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 21600, faunaSpawnWeights: { Pig: 80, Cow: 15, Turkey: 5 } },
  LegendaryEgg: { tileRef: tileRefsPets.LegendaryEgg, name: "Legendary Egg", coinPrice: 1e8, creditPrice: 249, rarity: rarity.Legendary, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 43200, faunaSpawnWeights: { Squirrel: 60, Turtle: 30, Goat: 10 } },
  MythicalEgg: { tileRef: tileRefsPets.MythicalEgg, name: "Mythical Egg", coinPrice: 1e9, creditPrice: 599, rarity: rarity.Mythic, initialTileScale: 0.3, baseTileScale: 0.8, secondsToHatch: 86400, faunaSpawnWeights: { Butterfly: 75, Capybara: 5, Peacock: 20 } },
  WinterEgg: {
    tileRef: tileRefsPets.WinterEgg,
    name: "Winter Egg",
    coinPrice: 8e8,
    creditPrice: 199,
    rarity: rarity.Legendary,
    initialTileScale: 0.3,
    baseTileScale: 0.8,
    secondsToHatch: 43200,
    faunaSpawnWeights: { SnowFox: 75, Stoat: 20, WhiteCaribou: 5 },
    expiryDate: new Date("2026-01-12T01:00:00.000Z"),
  },
  SnowEgg: {
        tileRef: tileRefsPets.SnowEgg,
        name: "Snow Egg",
        coinPrice: 2e8,
        creditPrice: 269,
        rarity: rarity.Legendary,
        secondsToHatch: 43200,
        faunaSpawnWeights: {
            SnowFox: 75,
            Stoat: 20,
            WhiteCaribou: 5
        },
        requiredWeather: "Frost"
    },
  HorseEgg: {
        tileRef: tileRefsPets.HorseEgg,
        name: "Horse Egg",
        coinPrice: 2e8,
        creditPrice: 379,
        rarity: rarity.Legendary,
        initialTileScale: 0.3,
        baseTileScale: 0.8,
        secondsToHatch: 43200,
        faunaSpawnWeights: {
            Pony: 60,
            Horse: 35,
            FireHorse: 5
        },
        // expiryDate: A6, // TODO: fill in actual expiry date from game source
    },
};

export const petCatalog = {
  Worm: {
    tileRef: tileRefsPets.Worm, name: "Worm", description: "",
    coinsToFullyReplenishHunger: 500,
    innateAbilityWeights: { SeedFinderI: 50, ProduceEater: 50 },
    baseTileScale: 0.6, maxScale: 2, maturitySellPrice: 5e3, matureWeight: 0.1,
    moveProbability: 0.1, hoursToMature: 12, rarity: rarity.Common,
    tileTransformOrigin: "bottom", nudgeY: -0.25,
    diet: ["Carrot","Strawberry","Aloe","Tomato","Apple"]
  },

  Snail: {
    tileRef: tileRefsPets.Snail, name: "Snail", description: "",
    coinsToFullyReplenishHunger: 1000,
    innateAbilityWeights: { CoinFinderI: 100 },
    baseTileScale: 0.6, maxScale: 2, maturitySellPrice: 1e4, matureWeight: 0.15,
    moveProbability: 0.01, hoursToMature: 12, rarity: rarity.Common,
    tileTransformOrigin: "bottom", nudgeY: -0.25,
    diet: ["Blueberry", "Tomato", "Corn", "Daffodil", "Chrysanthemum"]
  },

  Bee: {
    tileRef: tileRefsPets.Bee, name: "Bee",
    coinsToFullyReplenishHunger: 1500,
    innateAbilityWeights: { ProduceScaleBoost: 50, ProduceMutationBoost: 50 },
    baseTileScale: 0.6, maxScale: 2.5, maturitySellPrice: 3e4, matureWeight: 0.2,
    moveProbability: 0.5, hoursToMature: 12, rarity: rarity.Common,
    diet: ["Strawberry", "Blueberry", "Daffodil", "Lily", "Chrysanthemum"]
  },

  Chicken: {
    tileRef: tileRefsPets.Chicken, name: "Chicken",
    coinsToFullyReplenishHunger: 3000,
    innateAbilityWeights: { EggGrowthBoost: 80, PetRefund: 20 },
    baseTileScale: 0.8, maxScale: 2, maturitySellPrice: 5e4, matureWeight: 3,
    moveProbability: 0.2, hoursToMature: 24, rarity: rarity.Uncommon,
    tileTransformOrigin: "bottom", nudgeY: -0.2,
    diet: ["Aloe","Corn","Watermelon","Pumpkin"]
  },

  Bunny: {
    tileRef: tileRefsPets.Bunny, name: "Bunny",
    coinsToFullyReplenishHunger: 750,
    innateAbilityWeights: { CoinFinderII: 60, SellBoostI: 40 },
    baseTileScale: 0.7, maxScale: 2, maturitySellPrice: 75e3, matureWeight: 2,
    moveProbability: 0.3, hoursToMature: 24, rarity: rarity.Uncommon,
    tileTransformOrigin: "bottom", nudgeY: -0.2,
    diet: ["Carrot", "Strawberry", "Blueberry", "OrangeTulip", "Apple"]
  },

  Dragonfly: {
    tileRef: tileRefsPets.Dragonfly, name: "Dragonfly",
    coinsToFullyReplenishHunger: 250,
    innateAbilityWeights: { HungerRestore: 70, PetMutationBoost: 30 },
    baseTileScale: 0.6, maxScale: 2.5, maturitySellPrice: 150000, matureWeight: 0.2,
    moveProbability: 0.7, hoursToMature: 24, rarity: rarity.Uncommon,
    tileTransformOrigin: "center",
    diet: ["Apple","OrangeTulip","Echeveria"]
  },

  Pig: {
    tileRef: tileRefsPets.Pig, name: "Pig",
    coinsToFullyReplenishHunger: 50000,
    innateAbilityWeights: { SellBoostII: 30, PetAgeBoost: 30, PetHatchSizeBoost: 30 },
    baseTileScale: 1, maxScale: 2.5, maturitySellPrice: 5e5, matureWeight: 200,
    moveProbability: 0.2, hoursToMature: 72, rarity: rarity.Rare,
    tileTransformOrigin: "bottom", nudgeY: -0.15,
    diet: ["Watermelon","Pumpkin","Mushroom","Bamboo"]
  },

  Cow: {
    tileRef: tileRefsPets.Cow, name: "Cow",
    coinsToFullyReplenishHunger: 25000,
    innateAbilityWeights: { SeedFinderII: 30, HungerBoost: 30, PlantGrowthBoost: 30 },
    baseTileScale: 1.1, maxScale: 2.5, maturitySellPrice: 1e6, matureWeight: 600,
    moveProbability: 0.1, hoursToMature: 72, rarity: rarity.Rare,
    tileTransformOrigin: "bottom", nudgeY: -0.15,
    diet: ["Coconut","Banana","BurrosTail","Mushroom"]
  },

  Turkey: {
    tileRef: tileRefsPets.Turkey, name: "Turkey",
    coinsToFullyReplenishHunger: 500,
    innateAbilityWeights: { RainDance: 60, EggGrowthBoostII_NEW: 35, DoubleHatch: 5 },
    baseTileScale: 1, maxScale: 2.5, maturitySellPrice: 3e6, matureWeight: 10,
    moveProbability: 0.25, hoursToMature: 72, rarity: rarity.Rare,
    tileTransformOrigin: "bottom", nudgeY: -0.15,
    diet: ["FavaBean", "Corn", "Squash"]
  },

  Squirrel: {
    tileRef: tileRefsPets.Squirrel, name: "Squirrel",
    coinsToFullyReplenishHunger: 15000,
    innateAbilityWeights: { CoinFinderIII: 70, SellBoostIII: 20, PetMutationBoostII: 10 },
    baseTileScale: 0.6, maxScale: 2, maturitySellPrice: 5e6, matureWeight: 0.5,
    moveProbability: 0.4, hoursToMature: 100, rarity: rarity.Legendary,
    tileTransformOrigin: "bottom", nudgeY: -0.1,
    diet: ["Pumpkin","Banana","Grape"]
  },

  Turtle: {
    tileRef: tileRefsPets.Turtle, name: "Turtle",
    coinsToFullyReplenishHunger: 100000,
    innateAbilityWeights: { HungerRestoreII: 25, HungerBoostII: 25, PlantGrowthBoostII: 25, EggGrowthBoostII: 25 },
    baseTileScale: 1, maxScale: 2.5, maturitySellPrice: 1e7, matureWeight: 150,
    moveProbability: 0.05, hoursToMature: 100, rarity: rarity.Legendary,
    tileTransformOrigin: "bottom", nudgeY: -0.15,
    diet: ["Watermelon","BurrosTail","Bamboo","Pepper"]
  },

  Goat: {
    tileRef: tileRefsPets.Goat, name: "Goat",
    coinsToFullyReplenishHunger: 20000,
    innateAbilityWeights: { PetHatchSizeBoostII: 10, PetAgeBoostII: 40, PetXpBoost: 40 },
    baseTileScale: 1, maxScale: 2, maturitySellPrice: 2e7, matureWeight: 100,
    moveProbability: 0.2, hoursToMature: 100, rarity: rarity.Legendary,
    tileTransformOrigin: "bottom", nudgeY: -0.1,
    diet: ["Pumpkin", "Coconut", "Pepper", "Camellia", "PassionFruit"]
  },
  SnowFox: {
        tileRef: tileRefsPets.SnowFox,
        name: "Snow Fox",
        coinsToFullyReplenishHunger: 14e3,
        innateAbilityWeights: {
            SnowGranter: 30,
            SnowyCoinFinder: 30,
            SnowyPetXpBoost: 30
        },
        maxScale: 2,
        maturitySellPrice: 7e6,
        matureWeight: 7.5,
        moveProbability: .35,
        moveTweenDurationMs: 400,
        hoursToMature: 100,
        rarity: rarity.Legendary,
        diet: ["Echeveria", "Squash", "Grape"]
    },
    Stoat: {
        tileRef: tileRefsPets.Stoat,
        name: "Stoat",
        coinsToFullyReplenishHunger: 1e4,
        innateAbilityWeights: {
            SnowGranter: 40,
            SnowyHungerBoost: 40,
            SnowyCropMutationBoost: 20
        },
        maxScale: 2,
        maturitySellPrice: 1e7,
        matureWeight: .4,
        moveProbability: .3,
        moveTweenDurationMs: 600,
        hoursToMature: 100,
        rarity: rarity.Legendary,
        diet: ["Banana", "Pepper", "Cactus"]
    },
    WhiteCaribou: {
        tileRef: tileRefsPets.WhiteCaribou,
        name: "Caribou",
        coinsToFullyReplenishHunger: 3e4,
        innateAbilityWeights: {
            FrostGranter: 50,
            SnowyPlantGrowthBoost: 40,
            SnowyCropSizeBoost: 10
        },
        maxScale: 2.5,
        maturitySellPrice: 15e6,
        matureWeight: 300,
        moveProbability: .2,
        moveTweenDurationMs: 1e3,
        hoursToMature: 100,
        rarity: rarity.Legendary,
        diet: ["Camellia", "BurrosTail", "Mushroom"]
    },

    Pony: {
        tileRef: tileRefsPets.Pony,
        name: "Pony",
        coinsToFullyReplenishHunger: 4e3,
        innateAbilityWeights: {
            SellBoostIII: 25,
            CoinFinderIII: 25,
            HungerRestoreII: 25,
            SeedFinderII: 25
        },
        maxScale: 2,
        maturitySellPrice: 1e7,
        matureWeight: 200,
        moveProbability: .3,
        moveTweenDurationMs: 600,
        hoursToMature: 72,
        rarity: rarity.Legendary,
        tileTransformOrigin: "bottom",
        diet: ["Beet", "Pear", "Coconut"]
    },
    Horse: {
        tileRef: tileRefsPets.Horse,
        name: "Horse",
        coinsToFullyReplenishHunger: 25e3,
        innateAbilityWeights: {
            DawnBoost: 30,
            DawnlitGranter: 40,
            DawnPlantGrowthBoost: 10,
            PetAgeBoostII: 20
        },
        maxScale: 2.5,
        maturitySellPrice: 5e7,
        matureWeight: 80,
        moveProbability: .4,
        moveTweenDurationMs: 500,
        hoursToMature: 100,
        rarity: rarity.Legendary,
        tileTransformOrigin: "bottom",
        diet: ["Squash", "Echeveria", "Gentian"]
    },
    FireHorse: {
        tileRef: tileRefsPets.FireHorse,
        name: "Fire Horse",
        coinsToFullyReplenishHunger: 2e5,
        innateAbilityWeights: {
            AmberMoonBoost: 30,
            PetHatchSizeBoostII: 20,
            AmberlitGranter: 40,
            AmberPlantGrowthBoost: 10
        },
        maxScale: 2.5,
        maturitySellPrice: 15e7,
        matureWeight: 700,
        moveProbability: .4,
        moveTweenDurationMs: 800,
        hoursToMature: 144,
        rarity: rarity.Mythic,
        tileTransformOrigin: "bottom",
        diet: ["DragonFruit", "Poinsettia", "Cacao"]
    },

  Butterfly: {
    tileRef: tileRefsPets.Butterfly, name: "Butterfly",
    coinsToFullyReplenishHunger: 25000,
    innateAbilityWeights: { ProduceScaleBoostII: 40, ProduceMutationBoostII: 40, SeedFinderIII: 20 },
    baseTileScale: 0.6, maxScale: 2.5, maturitySellPrice: 5e7, matureWeight: 0.2,
    moveProbability: 0.6, hoursToMature: 144, rarity: rarity.Mythic,
    tileTransformOrigin: "center",
    diet: ["Daffodil","Lily","Grape","Lemon","Sunflower"]
  },

  Capybara: {
    tileRef: tileRefsPets.Capybara, name: "Capybara",
    coinsToFullyReplenishHunger: 150000,
    innateAbilityWeights: { DoubleHarvest: 50, ProduceRefund: 50 },
    baseTileScale: 1, maxScale: 2.5, maturitySellPrice: 2e8, matureWeight: 50,
    moveProbability: 0.2, hoursToMature: 144, rarity: rarity.Mythic,
    tileTransformOrigin: "bottom", nudgeY: -0.1,
    diet: ["Lemon","PassionFruit","DragonFruit","Lychee"]
  },

  Peacock: {
    tileRef: tileRefsPets.Peacock, name: "Peacock",
    coinsToFullyReplenishHunger: 100000,
    innateAbilityWeights: { SellBoostIV: 40, PetXpBoostII: 50, PetRefundII: 10 },
    baseTileScale: 1.2, maxScale: 2.5, maturitySellPrice: 1e8, matureWeight: 5,
    moveProbability: 0.2, hoursToMature: 144, rarity: rarity.Mythic,
    tileTransformOrigin: "bottom", nudgeY: -0.1,
    diet: ["Cactus","Sunflower","Lychee"]
  }
};

export const petAbilities = {
  ProduceScaleBoost: {
    name: "Crop Size Boost I",
    description: "Increases the scale of garden crops",
    trigger: "continuous",
    baseProbability: 0.3,
    baseParameters: { scaleIncreasePercentage: 6 }
  },
  ProduceScaleBoostII: {
    name: "Crop Size Boost II",
    description: "Increases the scale of garden crops",
    trigger: "continuous",
    baseProbability: 0.4,
    baseParameters: { scaleIncreasePercentage: 10 }
  },
  ProduceScaleBoostIII: {
    name: "Crop Size Boost III",
    trigger: "continuous",
    baseProbability: .5,
    baseParameters: { scaleIncreasePercentage: 14 }
  },
  SnowyCropSizeBoost: {
    name: "Snowy Crop Size Boost",
    trigger: "continuous",
    baseProbability: 0.8,
    baseParameters: {
      scaleIncreasePercentage: 12,
      requiredWeather: "Frost"
    }
  },

  DoubleHarvest: {
    name: "Double Harvest",
    description: "Chance to duplicate harvested crops",
    trigger: "harvest",
    baseProbability: 5,
    baseParameters: {}
  },
  DoubleHatch: {
    name: "Double Hatch",
    description: "Chance to hatch an extra pet from eggs",
    trigger: "hatchEgg",
    baseProbability: 3,
    baseParameters: {}
  },

  ProduceEater: {
    name: "Crop Eater",
    description: "Harvests non-mutated crops and sells them",
    trigger: "continuous",
    baseProbability: 60,
    baseParameters: { cropSellPriceIncreasePercentage: 150 }
  },

  SellBoostI: {
    name: "Sell Boost I",
    description: "Receive bonus coins when selling crops",
    trigger: "sellAllCrops",
    baseProbability: 10,
    baseParameters: { cropSellPriceIncreasePercentage: 20 }
  },
  SellBoostII: {
    name: "Sell Boost II",
    description: "Receive bonus coins when selling crops",
    trigger: "sellAllCrops",
    baseProbability: 12,
    baseParameters: { cropSellPriceIncreasePercentage: 30 }
  },
  SellBoostIII: {
    name: "Sell Boost III",
    description: "Receive bonus coins when selling crops",
    trigger: "sellAllCrops",
    baseProbability: 14,
    baseParameters: { cropSellPriceIncreasePercentage: 40 }
  },
  SellBoostIV: {
    name: "Sell Boost IV",
    description: "Receive bonus coins when selling crops",
    trigger: "sellAllCrops",
    baseProbability: 16,
    baseParameters: { cropSellPriceIncreasePercentage: 50 }
  },

  ProduceRefund: {
    name: "Crop Refund",
    description: "Chance to get crops back when selling",
    trigger: "sellAllCrops",
    baseProbability: 20,
    baseParameters: {}
  },

  PlantGrowthBoost: {
    name: "Plant Growth Boost I",
    description: "Reduces the time for plants to grow",
    trigger: "continuous",
    baseProbability: 24,
    baseParameters: { plantGrowthReductionMinutes: 3 }
  },
  PlantGrowthBoostII: {
    name: "Plant Growth Boost II",
    description: "Reduces the time for plants to grow",
    trigger: "continuous",
    baseProbability: 27,
    baseParameters: { plantGrowthReductionMinutes: 5 }
  },
  PlantGrowthBoostIII: {
    name: "Plant Growth Boost III",
    trigger: "continuous",
    baseProbability: 30,
    baseParameters: { plantGrowthReductionMinutes: 7 }
  },
  SnowyPlantGrowthBoost: {
    name: "Snow Plant Growth Boost",
    trigger: "continuous",
    baseProbability: 40,
    baseParameters: {
      plantGrowthReductionMinutes: 6,
      requiredWeather: "Frost"
    }
  },
  DawnPlantGrowthBoost: {
    name: "Dawn Plant Growth Boost",
    trigger: "continuous",
    baseProbability: 60,
    baseParameters: { plantGrowthReductionMinutes: 6, requiredWeather: "Dawn" }
  },
  AmberPlantGrowthBoost: {
    name: "Amber Plant Growth Boost",
    trigger: "continuous",
    baseProbability: 80,
    baseParameters: { plantGrowthReductionMinutes: 6, requiredWeather: "AmberMoon" }
  },

  ProduceMutationBoost: {
    name: "Weather Mutation Boost I",
    trigger: "continuous",
    baseParameters: { mutationChanceIncreasePercentage: 15 }
  },
  ProduceMutationBoostII: {
    name: "Weather Mutation Boost II",
    trigger: "continuous",
    baseParameters: { mutationChanceIncreasePercentage: 20 }
  },
  ProduceMutationBoostIII: {
    name: "Weather Mutation Boost III",
    trigger: "continuous",
    baseParameters: { mutationChanceIncreasePercentage: 25 }
  },
  SnowyCropMutationBoost: {
    name: "Snow Boost",
    trigger: "continuous",
    baseParameters: { mutationChanceIncreasePercentage: 32, requiredWeather: "Frost" }
  },
  DawnBoost: {
    name: "Dawn Boost",
    trigger: "continuous",
    baseParameters: { mutationChanceIncreasePercentage: 36, requiredWeather: "Dawn" }
  },
  AmberMoonBoost: {
    name: "Amber Moon Boost",
    trigger: "continuous",
    baseParameters: { mutationChanceIncreasePercentage: 40, requiredWeather: "AmberMoon" }
  },

  PetMutationBoost: {
    name: "Pet Mutation Boost I",
    description: "Increases the chance of hatched pets gaining mutations",
    trigger: "hatchEgg",
    baseParameters: { mutationChanceIncreasePercentage: 7 }
  },
  PetMutationBoostII: {
    name: "Pet Mutation Boost II",
    description: "Increases the chance of hatched pets gaining mutations",
    trigger: "hatchEgg",
    baseParameters: { mutationChanceIncreasePercentage: 10 }
  },
  PetMutationBoostIII: {
    name: "Pet Mutation Boost III",
    trigger: "hatchEgg",
    baseParameters: { mutationChanceIncreasePercentage: 13 }
  },

  GoldGranter: {
    name: "Gold Granter",
    description: "Grants the Gold mutation to a garden crop",
    trigger: "continuous",
    baseProbability: 0.72,
    baseParameters: { grantedMutations: ["Gold"] }
  },
  RainbowGranter: {
    name: "Rainbow Granter",
    description: "Grants the Rainbow mutation to a garden crop",
    trigger: "continuous",
    baseProbability: 0.72,
    baseParameters: { grantedMutations: ["Rainbow"] }
  },
  RainDance: {
    name: "Rain Dance",
    description: "Grants the Wet mutation to a garden crop",
    trigger: "continuous",
    baseProbability: 10,
    baseParameters: { grantedMutations: ["Wet"] }
  },

  EggGrowthBoost: {
    name: "Egg Growth Boost I",
    description: "Reduces the time for eggs to hatch",
    trigger: "continuous",
    baseProbability: 21,
    baseParameters: { eggGrowthTimeReductionMinutes: 7 }
  },
  // utilisé par la dinde: EggGrowthBoostII_NEW
  EggGrowthBoostII_NEW: {
    name: "Egg Growth Boost II",
    description: "Reduces the time for eggs to hatch",
    trigger: "continuous",
    baseProbability: 24,
    baseParameters: { eggGrowthTimeReductionMinutes: 9 }
  },
  // ancien EggGrowthBoostIII remplacé par ce bloc
  EggGrowthBoostII: {
    name: "Egg Growth Boost III",
    description: "Reduces the time for eggs to hatch",
    trigger: "continuous",
    baseProbability: 27,
    baseParameters: { eggGrowthTimeReductionMinutes: 11 }
  },
  SnowyEggGrowthBoost: {
    name: "Snowy Egg Growth Boost",
    trigger: "continuous",
    baseProbability: 35,
    baseParameters: {
      eggGrowthTimeReductionMinutes: 10,
      requiredWeather: "Frost"
    }
  },

  PetAgeBoost: {
    name: "Hatch XP Boost I",
    description: "Hatched pets start with bonus XP",
    trigger: "hatchEgg",
    baseProbability: 50,
    baseParameters: { bonusXp: 8000 }
  },
  PetAgeBoostII: {
    name: "Hatch XP Boost II",
    description: "Hatched pets start with bonus XP",
    trigger: "hatchEgg",
    baseProbability: 60,
    baseParameters: { bonusXp: 12000 }
  },
  PetAgeBoostIII: {
    name: "Hatch XP Boost III",
    trigger: "hatchEgg",
    baseProbability: 70,
    baseParameters: { bonusXp: 16000 }
  },

  PetHatchSizeBoost: {
    name: "Max Strength Boost I",
    description: "Increases the maximum strength of hatched pets",
    trigger: "hatchEgg",
    baseProbability: 12,
    baseParameters: { maxStrengthIncreasePercentage: 2.4 }
  },
  PetHatchSizeBoostII: {
    name: "Max Strength Boost II",
    description: "Increases the maximum strength of hatched pets",
    trigger: "hatchEgg",
    baseProbability: 14,
    baseParameters: { maxStrengthIncreasePercentage: 3.5 }
  },
  PetHatchSizeBoostIII: {
    name: "Max Strength Boost III",
    trigger: "hatchEgg",
    baseProbability: 16,
    baseParameters: { maxStrengthIncreasePercentage: 4.6 }
  },

  PetXpBoost: {
    name: "XP Boost I",
    description: "Gives bonus XP to active pets",
    trigger: "continuous",
    baseProbability: 30,
    baseParameters: { bonusXp: 300 }
  },
  PetXpBoostII: {
    name: "XP Boost II",
    description: "Gives bonus XP to active pets",
    trigger: "continuous",
    baseProbability: 35,
    baseParameters: { bonusXp: 400 }
  },
  PetXpBoostIII: {
    name: "XP Boost III",
    trigger: "continuous",
    baseProbability: 40,
    baseParameters: { bonusXp: 500 }
  },
  SnowyPetXpBoost: {
    name: "Snow XP Boost",
    trigger: "continuous",
    baseProbability: 50,
    baseParameters: {
      bonusXp: 450,
      requiredWeather: "Frost"
    }
  },

  HungerRestore: {
    name: "Hunger Restore I",
    description: "Restores the hunger of a random active pet",
    trigger: "continuous",
    baseProbability: 12,
    baseParameters: { hungerRestorePercentage: 30 }
  },
  HungerRestoreII: {
    name: "Hunger Restore II",
    description: "Restores the hunger of a random active pet",
    trigger: "continuous",
    baseProbability: 14,
    baseParameters: { hungerRestorePercentage: 35 }
  },
  HungerRestoreIII: {
    name: "Hunger Restore III",
    trigger: "continuous",
    baseProbability: 16,
    baseParameters: { hungerRestorePercentage: 40 }
  },
  SnowyHungerRestore: {
    name: "Snowy Hunger Restore",
    trigger: "continuous",
    baseProbability: 20,
    baseParameters: {
      hungerRestorePercentage: 38,
      requiredWeather: "Frost"
    }
  },

  HungerBoost: {
    name: "Hunger Boost I",
    description: "Reduces the hunger depletion rate of active pets",
    trigger: "continuous",
    baseParameters: { hungerDepletionRateDecreasePercentage: 12 }
  },
  HungerBoostII: {
    name: "Hunger Boost II",
    description: "Reduces the hunger depletion rate of active pets",
    trigger: "continuous",
    baseParameters: { hungerDepletionRateDecreasePercentage: 16 }
  },
  HungerBoostIII: {
    name: "Hunger Boost III",
    trigger: "continuous",
    baseParameters: { hungerDepletionRateDecreasePercentage: 20 }
  },
  SnowyHungerBoost: {
    name: "Snowy Hunger Boost",
    trigger: "continuous",
    baseParameters: {
      hungerDepletionRateDecreasePercentage: 30,
      requiredWeather: "Frost"
    }
  },

  PetRefund: {
    name: "Pet Refund I",
    description: "Chance to receive the pet back as an egg when sold",
    trigger: "sellPet",
    baseProbability: 5,
    baseParameters: {}
  },
  PetRefundII: {
    name: "Pet Refund II",
    description: "Chance to receive the pet back as an egg when sold",
    trigger: "sellPet",
    baseProbability: 7,
    baseParameters: {}
  },

  Copycat: {
    name: "Copycat",
    description: "Chance to copy the ability of another active pet",
    trigger: "continuous",
    baseProbability: 1,
    baseParameters: {}
  },

  CoinFinderI: {
    name: "Coin Finder I",
    description: "Finds coins in your garden",
    trigger: "continuous",
    baseProbability: 35,
    baseParameters: { baseMaxCoinsFindable: 120_000 }
  },
  CoinFinderII: {
    name: "Coin Finder II",
    description: "Finds coins in your garden",
    trigger: "continuous",
    baseProbability: 13,
    baseParameters: { baseMaxCoinsFindable: 1_200_000 }
  },
  CoinFinderIII: {
    name: "Coin Finder III",
    description: "Finds coins in your garden",
    trigger: "continuous",
    baseProbability: 6,
    baseParameters: { baseMaxCoinsFindable: 10_000_000 }
  },
  SnowyCoinFinder: {
    name: "Snowy Coin Finder",
    trigger: "continuous",
    baseProbability: 15,
    baseParameters: {
      baseMaxCoinsFindable: 5_000_000,
      requiredWeather: "Frost"
    }
  },

  SeedFinderI: {
    name: "Seed Finder I",
    description: "Finds common and uncommon seeds in your garden",
    trigger: "continuous",
    baseProbability: 40,
    baseParameters: {}
  },
  SeedFinderII: {
    name: "Seed Finder II",
    description: "Finds rare and legendary seeds in your garden",
    trigger: "continuous",
    baseProbability: 20,
    baseParameters: {}
  },
  SeedFinderIII: {
    name: "Seed Finder III",
    description: "Finds mythical seeds in your garden",
    trigger: "continuous",
    baseProbability: 10,
    baseParameters: {}
  },
  SeedFinderIV: {
    name: "Seed Finder IV",
    description: "Finds divine and celestial seeds in your garden",
    trigger: "continuous",
    baseProbability: 0.01,
    baseParameters: {}
  },

  MoonKisser: {
    name: "Moon Kisser",
    description: "Empowers amber moon crops with special mutations",
    trigger: "continuous",
    baseParameters: {}
  },
  DawnKisser: {
    name: "Dawn Kisser",
    description: "Empowers dawn crops with special mutations",
    trigger: "continuous",
    baseParameters: {}
  },
  SnowGranter: {
      name: "Snow Granter",
      description: "Number of times Snow Granter triggered",
      trigger: "continuous",
      baseProbability: 8,
      baseParameters: {
          grantedMutations: ["Chilled"]
      }
  },
  FrostGranter: {
      name: "Frost Granter",
      description: "Number of times Frost Granter triggered",
      trigger: "continuous",
      baseProbability: 6,
      baseParameters: {
          grantedMutations: ["Frozen"]
      }
  },
  DawnlitGranter: {
    name: "Dawnlit Granter",
    trigger: "continuous",
    baseProbability: 4,
    baseParameters: { grantedMutations: ["Dawnlit"] }
  },
  AmberlitGranter: {
    name: "Amberlit Granter",
    trigger: "continuous",
    baseProbability: 2,
    baseParameters: { grantedMutations: ["Ambershine"] }
  },
};

export const toolCatalog = {
  WateringCan: {
    tileRef: tileRefsItems.WateringCan,
    name: "Watering Can",
    coinPrice: 5e3,
    creditPrice: 2,
    rarity: rarity.Common,
    description: "Speeds up growth of plant by 5 minutes. SINGLE USE.",
    isOneTimePurchase: false,
    baseTileScale: 0.6,
    maxInventoryQuantity: 99
  },
  PlanterPot: {
    tileRef: tileRefsItems.PlanterPot,
    name: "Planter Pot",
    coinPrice: 25e3,
    creditPrice: 5,
    rarity: rarity.Common,
    description: "Extract a plant to your inventory (can be replanted). SINGLE USE.",
    isOneTimePurchase: false,
    baseTileScale: 0.8
  },
  Shovel: {
    tileRef: tileRefsItems.Shovel,
    name: "Garden Shovel",
    coinPrice: 1e6,
    creditPrice: 100,
    rarity: rarity.Uncommon,
    description: "Remove plants from your garden. UNLIMITED USES.",
    isOneTimePurchase: true,
    baseTileScale: 0.7
  },
  RainbowPotion: {
    tileRef: tileRefsItems.RainbowPotion,
    name: "Rainbow Potion",
    coinPrice: 1 / 0,
    creditPrice: 1 / 0,
    rarity: rarity.Celestial,
    description: "Adds the Rainbow mutation to a crop in your garden. SINGLE USE.",
    isOneTimePurchase: true,
    baseTileScale: 1
  },
  CropCleanser: {
        tileRef: tileRefsItems.CropCleanser,
        name: "Crop Cleanser",
        coinPrice: 8e4,
        creditPrice: 7,
        rarity: rarity.Common,
        isOneTimePurchase: !1,
        baseTileScale: 1,
        maxInventoryQuantity: 99
    },
};

export const decorCatalog = {
  // Rochers
  SmallRock: {
    tileRef: tileRefsDecor.SmallRock,
    name: "Small Garden Rock",
    coinPrice: 1000, creditPrice: 2, rarity: rarity.Common,
    baseTileScale: 1, isOneTimePurchase: false
  },
  MediumRock: {
    tileRef: tileRefsDecor.MediumRock,
    name: "Medium Garden Rock",
    coinPrice: 2500, creditPrice: 5, rarity: rarity.Common,
    baseTileScale: 1, isOneTimePurchase: false
  },
  LargeRock: {
    tileRef: tileRefsDecor.LargeRock,
    name: "Large Garden Rock",
    coinPrice: 5000, creditPrice: 10, rarity: rarity.Common,
    baseTileScale: 1, isOneTimePurchase: false
  },
  WoodCaribou: {
        tileRef: tileRefsDecor.WoodCaribou,
        name: "Wood Caribou",
        coinPrice: 9e3,
        creditPrice: 14,
        rarity: rarity.Common,
        baseTileScale: 1,
        isOneTimePurchase: !1,
    },

  // Bois
  WoodBench: {
    tileRef: tileRefsDecor.WoodBench,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.WoodBenchSideways, flipH: true,  baseTileScale: 1.46, nudgeY: -0.30 },
      180: { tileRef: tileRefsDecor.WoodBenchBackwards,               },
      270: { tileRef: tileRefsDecor.WoodBenchSideways,                baseTileScale: 1.46, nudgeY: -0.30 }
    },
    name: "Wood Bench",
    coinPrice: 10000, creditPrice: 15, rarity: rarity.Common,
    baseTileScale: 1, isOneTimePurchase: false, nudgeY: -0.30, avatarNudgeY: -0.18
  },

  WoodArch: {
    tileRef: tileRefsDecor.WoodArch,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.WoodArchSide, flipH: true,  baseTileScale: 2.10, nudgeY: -0.48 },
      180: { tileRef: tileRefsDecor.WoodArch,     flipH: true },
      270: { tileRef: tileRefsDecor.WoodArchSide,               baseTileScale: 2.10, nudgeY: -0.48 }
    },
    name: "Wood Arch",
    coinPrice: 20000, creditPrice: 25, rarity: rarity.Common,
    baseTileScale: 1.53, isOneTimePurchase: false, nudgeY: -0.50
  },

  WoodBridge: {
    tileRef: tileRefsDecor.WoodBridge,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.WoodBridgeSideways, flipH: true,  baseTileScale: 1.70, nudgeY: -0.28 },
      180: { tileRef: tileRefsDecor.WoodBridge,         flipH: true },
      270: { tileRef: tileRefsDecor.WoodBridgeSideways,               baseTileScale: 1.70, nudgeY: -0.28 }
    },
    name: "Wood Bridge",
    coinPrice: 40000, creditPrice: 35, rarity: rarity.Common,
    baseTileScale: 1.22, isOneTimePurchase: false, nudgeY: -0.35, avatarNudgeY: -0.44
  },

  WoodLampPost: {
    tileRef: tileRefsDecor.WoodLampPost,
    name: "Wood Lamp Post",
    coinPrice: 80000, creditPrice: 49, rarity: rarity.Common,
    baseTileScale: 1.5, isOneTimePurchase: false, nudgeY: -0.60
  },
  WoodOwl: {
    tileRef: tileRefsDecor.WoodOwl,
    name: "Wood Owl",
    coinPrice: 90000, creditPrice: 59, rarity: rarity.Common,
    baseTileScale: 1.3, isOneTimePurchase: false, nudgeY: -0.40
  },
  WoodBirdhouse: {
    tileRef: tileRefsDecor.Birdhouse,
    name: "Wood Birdhouse",
    coinPrice: 100000, creditPrice: 69, rarity: rarity.Common,
    baseTileScale: 1.5, isOneTimePurchase: false, nudgeY: -0.60
  },

  WoodWindmill: {
        tileRef: tileRefsDecor.WoodWindmill,
        name: "Wood Windmill",
        coinPrice: 500000, creditPrice: 74, rarity: rarity.Common,
        baseTileScale: 1.5,isOneTimePurchase: false, nudgeY: -0.47
    },

    WoodPergola: {
        tileRef: tileRefsDecor.WoodPergola,
        name: "Wood Pergola",
        coinPrice: 3e4,
        creditPrice: 30,
        rarity: rarity.Common,
        baseTileScale: 1,
        isOneTimePurchase: !1
    },

    StoneCaribou: {
        tileRef: tileRefsDecor.StoneCaribou,
        name: "Stone Caribou",
        coinPrice: 75e4,
        creditPrice: 72,
        rarity: rarity.Uncommon,
        baseTileScale: 1.2,
        isOneTimePurchase: !1,
    },

  // Pierre
  StoneBench: {
    tileRef: tileRefsDecor.StoneBench,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.StoneBenchSideways, flipH: true,  baseTileScale: 1.47, nudgeY: -0.30 },
      180: { tileRef: tileRefsDecor.StoneBench,         flipH: true },
      270: { tileRef: tileRefsDecor.StoneBenchSideways,               baseTileScale: 1.47, nudgeY: -0.30 }
    },
    name: "Stone Bench",
    coinPrice: 1000000, creditPrice: 75, rarity: rarity.Uncommon,
    baseTileScale: 1, isOneTimePurchase: false, nudgeY: -0.30, avatarNudgeY: -0.18
  },

  StoneArch: {
    tileRef: tileRefsDecor.StoneArch,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.StoneArchSideways, flipH: true,  baseTileScale: 2.10, nudgeY: -0.44 },
      180: { tileRef: tileRefsDecor.StoneArch,         flipH: true },
      270: { tileRef: tileRefsDecor.StoneArchSideways,               baseTileScale: 2.10, nudgeY: -0.44 }
    },
    name: "Stone Arch",
    coinPrice: 4000000, creditPrice: 124, rarity: rarity.Uncommon,
    baseTileScale: 1.53, isOneTimePurchase: false, nudgeY: -0.50
  },

  StoneBridge: {
    tileRef: tileRefsDecor.StoneBridge,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.StoneBridgeSideways, flipH: true,  baseTileScale: 1.70, nudgeY: -0.28 },
      180: { tileRef: tileRefsDecor.StoneBridge,         flipH: true },
      270: { tileRef: tileRefsDecor.StoneBridgeSideways,               baseTileScale: 1.70, nudgeY: -0.28 }
    },
    name: "Stone Bridge",
    coinPrice: 5000000, creditPrice: 179, rarity: rarity.Uncommon,
    baseTileScale: 1.22, isOneTimePurchase: false, nudgeY: -0.35, avatarNudgeY: -0.44
  },

  StoneLampPost: {
    tileRef: tileRefsDecor.StoneLampPost,
    name: "Stone Lamp Post",
    coinPrice: 8000000, creditPrice: 199, rarity: rarity.Uncommon,
    baseTileScale: 1.5, isOneTimePurchase: false, nudgeY: -0.60
  },
  StoneGnome: {
    tileRef: tileRefsDecor.StoneGnome,
    name: "Stone Gnome",
    coinPrice: 9000000, creditPrice: 219, rarity: rarity.Uncommon,
    baseTileScale: 1.3, isOneTimePurchase: false, nudgeY: -0.40
  },
  StoneBirdbath: {
    tileRef: tileRefsDecor.StoneBirdBath,
    name: "Stone Birdbath",
    coinPrice: 10000000, creditPrice: 249, rarity: rarity.Uncommon,
    baseTileScale: 1.2, isOneTimePurchase: false, nudgeY: -0.46
  },

      MarbleCaribou: {
        tileRef: tileRefsDecor.MarbleCaribou,
        name: "Marble Caribou",
        coinPrice: 5e7,
        creditPrice: 299,
        rarity: rarity.Rare,
        baseTileScale: 1.4,
        isOneTimePurchase: !1,
    },

  // Marbre
  MarbleBench: {
    tileRef: tileRefsDecor.MarbleBench,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.MarbleBenchSideways, flipH: true,  baseTileScale: 1.55, nudgeY: -0.35 },
      180: { tileRef: tileRefsDecor.MarbleBenchBackwards },
      270: { tileRef: tileRefsDecor.MarbleBenchSideways,               baseTileScale: 1.55, nudgeY: -0.35 }
    },
    name: "Marble Bench",
    coinPrice: 75000000, creditPrice: 349, rarity: rarity.Rare,
    baseTileScale: 1, isOneTimePurchase: false, nudgeY: -0.30, avatarNudgeY: -0.18
  },

  MarbleArch: {
    tileRef: tileRefsDecor.MarbleArch,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.MarbleArchSideways, flipH: true,  baseTileScale: 2.38, nudgeY: -0.57 },
      180: { tileRef: tileRefsDecor.MarbleArch,         flipH: true },
      270: { tileRef: tileRefsDecor.MarbleArchSideways,               baseTileScale: 2.38, nudgeY: -0.57 }
    },
    name: "Marble Arch",
    coinPrice: 100000000, creditPrice: 399, rarity: rarity.Rare,
    baseTileScale: 1.53, isOneTimePurchase: false, nudgeY: -0.50
  },

  MarbleBridge: {
    tileRef: tileRefsDecor.MarbleBridge,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.MarbleBridgeSideways, flipH: true,  baseTileScale: 1.70, nudgeY: -0.28 },
      180: { tileRef: tileRefsDecor.MarbleBridge,         flipH: true },
      270: { tileRef: tileRefsDecor.MarbleBridgeSideways,               baseTileScale: 1.70, nudgeY: -0.28 }
    },
    name: "Marble Bridge",
    coinPrice: 150000000, creditPrice: 429, rarity: rarity.Rare,
    baseTileScale: 1.22, isOneTimePurchase: false, nudgeY: -0.35, avatarNudgeY: -0.44
  },

  MarbleLampPost: {
    tileRef: tileRefsDecor.MarbleLampPost,
    name: "Marble Lamp Post",
    coinPrice: 200000000, creditPrice: 449, rarity: rarity.Rare,
    baseTileScale: 1.5, isOneTimePurchase: false, nudgeY: -0.60
  },
  MarbleBlobling: {
    tileRef: tileRefsDecor.MarbleBlobling,
    name: "Marble Blobling",
    coinPrice: 300000000, creditPrice: 499, rarity: rarity.Rare,
    baseTileScale: 1.5, isOneTimePurchase: false, nudgeY: -0.56
  },

  MarbleFountain: {
    tileRef: tileRefsDecor.MarbleFountain,
    name: "Marble Fountain",
    coinPrice: 450000000, creditPrice: 449, rarity: rarity.Rare,
    baseTileScale: 1.5, isOneTimePurchase: false, nudgeY: -0.30
  },

  // Spéciaux
  MiniFairyCottage: {
    tileRef: tileRefsDecor.MiniFairyCottage,
    name: "Mini Fairy Cottage",
    coinPrice: 500000000, creditPrice: 549, rarity: rarity.Rare,
    baseTileScale: 1.1, isOneTimePurchase: false, nudgeY: -0.37
  },
  Cauldron: {
    tileRef: tileRefsDecor.Cauldron,
    name: "Cauldron",
    coinPrice: 666000000, creditPrice: 666, rarity: rarity.Legendary,
    baseTileScale: 1.5, isOneTimePurchase: false, nudgeY: -0.25,
    expiryDate: new Date("2025-11-07T01:00:00.000Z")
  },
  StrawScarecrow: {
    tileRef: tileRefsDecor.StrawScarecrow,
    name: "Straw Scarecrow",
    coinPrice: 1000000000, creditPrice: 599, rarity: rarity.Legendary,
    baseTileScale: 1.8, isOneTimePurchase: false, nudgeY: -0.65
  },
  MiniFairyForge: {
    tileRef: tileRefsDecor.MiniFairyForge,
    name: "Mini Fairy Forge",
    coinPrice: 5000000000, creditPrice: 979, rarity: rarity.Legendary,
    baseTileScale: 1, isOneTimePurchase: false, nudgeY: -0.30
  },
  MiniFairyKeep: {
    tileRef: tileRefsDecor.MiniFairyKeep,
    name: "Mini Fairy Keep",
    coinPrice: 25000000000, creditPrice: 1249, rarity: rarity.Mythic,
    baseTileScale: 1.05, isOneTimePurchase: false, nudgeY: -0.33
  },

  PetHutch: {
    tileRef: tileRefsDecor.PetHutch,
    name: "Pet Hutch",
    coinPrice: 80000000000, creditPrice: 499, rarity: rarity.Divine,
    baseTileScale: 2.1, isOneTimePurchase: true, nudgeY: -0.45
  },
  FeedingTrough: {
        tileRef: tileRefsDecor.FeedingTrough,
        name: "Feeding Trough",
        coinPrice: 1e7,creditPrice: 199,rarity: rarity.Rare,
        baseTileScale: 1.05,nudgeY: -.45,isOneTimePurchase: true,avatarNudgeY: -.25
    },
  DecorShed: {
    tileRef: tileRefsDecor.DecorShed,
    name: "Decor Shed",
    coinPrice: 60000000000, creditPrice: 399, rarity: rarity.Divine,
    baseTileScale: 1, isOneTimePurchase: true
  },

  SeedSilo: {
        tileRef: tileRefsDecor.SeedSilo,
        name: "Seed Silo",
        coinPrice: 1e11,
        creditPrice: 699,
        rarity: rarity.Divine,
        baseTileScale: 1,
        isOneTimePurchase: !0
    },

  MiniWizardTower: {
    tileRef: tileRefsDecor.MiniWizardTower,
    name: "Mini Wizard Tower",
    coinPrice: 75000000000, creditPrice: 1379, rarity: rarity.Mythic,
    baseTileScale: 1.8, isOneTimePurchase: false, nudgeY: -0.59
  },

  // Saisonniers (Halloween)
  HayBale: {
    tileRef: tileRefsDecor.HayBale,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.HayBaleSideways, flipH: true },
      180: { tileRef: tileRefsDecor.HayBale,         flipH: true },
      270: { tileRef: tileRefsDecor.HayBaleSideways }
    },
    name: "Hay Bale",
    coinPrice: 7000, creditPrice: 12, rarity: rarity.Common,
    baseTileScale: 1.8, isOneTimePurchase: false, nudgeY: -0.42,
    expiryDate: new Date("2025-11-07T01:00:00.000Z")
  },

  StringLights: {
        tileRef: tileRefsDecor.StringLights,
        rotationVariants: {
            90: {
                tileRef: tileRefsDecor.StringLightsSideways,
                flipH: !0
            },
            180: {
                tileRef: tileRefsDecor.StringLights,
                flipH: !0
            },
            270: {
                tileRef: tileRefsDecor.StringLightsSideways
            }
        },
        name: "String Lights",
        coinPrice: 7e3,
        creditPrice: 12,
        rarity: rarity.Common,
        baseTileScale: 1,
        isOneTimePurchase: !1
    },
    ColoredStringLights: {
        tileRef: tileRefsDecor.ColoredStringLights,
        rotationVariants: {
            90: {
                tileRef: tileRefsDecor.ColoredStringLightsSideways,
                flipH: !0
            },
            180: {
                tileRef: tileRefsDecor.ColoredStringLights,
                flipH: !0
            },
            270: {
                tileRef: tileRefsDecor.ColoredStringLightsSideways
            }
        },
        name: "Colored String Lights",
        coinPrice: 8e3,
        creditPrice: 13,
        rarity: rarity.Common,
        baseTileScale: 1,
        isOneTimePurchase: !1,
    },
    PaperLantern: {
        tileRef: tileRefsDecor.PaperLantern,
        rotationVariants: {
            90: {
                tileRef: tileRefsDecor.PaperLanternSideways,
                flipH: true,
            },
            180: {
                tileRef: tileRefsDecor.PaperLantern,
                flipH: true,
            },
            270: {
                tileRef: tileRefsDecor.PaperLanternSideways,
            }
        },
        name: "Paper Lantern",
        coinPrice: 9e3,
        creditPrice: 13,
        rarity: rarity.Common,
        baseTileScale: 1,
        isOneTimePurchase: false,
        // expiryDate: A6, // TODO: fill in actual expiry date from game source
    },
    FanousLantern: {
        tileRef: tileRefsDecor.FanousLantern,
        rotationVariants: {
            90: {
                tileRef: tileRefsDecor.FanousLanternSideways,
                flipH: true,
            },
            180: {
                tileRef: tileRefsDecor.FanousLantern,
                flipH: true,
            },
            270: {
                tileRef: tileRefsDecor.FanousLanternSideways,
            }
        },
        name: "Fanous Lantern",
        coinPrice: 9000,
        creditPrice: 13,
        rarity: rarity.Common,
        baseTileScale: 1,
        isOneTimePurchase: false,
        // expiryDate: $B, // TODO: fill in actual expiry date from game source
    },
  SmallGravestone: {
    tileRef: tileRefsDecor.SmallGravestone,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.SmallGravestoneSideways, flipH: true,  baseTileScale: 1.12, nudgeY: -0.32 },
      180: { tileRef: tileRefsDecor.SmallGravestone,         flipH: true },
      270: { tileRef: tileRefsDecor.SmallGravestoneSideways,               baseTileScale: 1.12, nudgeY: -0.32 }
    },
    name: "Small Gravestone",
    coinPrice: 8000, creditPrice: 12, rarity: rarity.Common,
    baseTileScale: 1, isOneTimePurchase: false, nudgeY: -0.38,
    expiryDate: new Date("2025-11-07T01:00:00.000Z")
  },
  MediumGravestone: {
    tileRef: tileRefsDecor.MediumGravestone,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.MediumGravestoneSideways, flipH: true,  baseTileScale: 1.32, nudgeY: -0.33 },
      180: { tileRef: tileRefsDecor.MediumGravestone,         flipH: true },
      270: { tileRef: tileRefsDecor.MediumGravestoneSideways,               baseTileScale: 1.32, nudgeY: -0.33 }
    },
    name: "Medium Gravestone",
    coinPrice: 500000, creditPrice: 72, rarity: rarity.Uncommon,
    baseTileScale: 1.2, isOneTimePurchase: false, nudgeY: -0.45,
    expiryDate: new Date("2025-11-07T01:00:00.000Z")
  },
  LargeGravestone: {
    tileRef: tileRefsDecor.LargeGravestone,
    rotationVariants: {
      90:  { tileRef: tileRefsDecor.LargeGravestoneSideways, flipH: true,  baseTileScale: 1.50, nudgeY: -0.39 },
      180: { tileRef: tileRefsDecor.LargeGravestone,         flipH: true },
      270: { tileRef: tileRefsDecor.LargeGravestoneSideways,               baseTileScale: 1.50, nudgeY: -0.39 }
    },
    name: "Large Gravestone",
    coinPrice: 50000000, creditPrice: 299, rarity: rarity.Rare,
    baseTileScale: 1.4, isOneTimePurchase: false, nudgeY: -0.51,
    expiryDate: new Date("2025-11-07T01:00:00.000Z")
  }
};

export const weatherCatalog = {
  Rain: {
    atomValue:'Rain',
    description:'Gives the Wet mutation to mature garden crops',
    type: 'weather',
    cycle: { kind: 'weather', startWindowMin: 20, startWindowMax: 35, durationMinutes: 5 },
    weightInCycle: 0.75,                           // 75% des events météo
    appliesRandomCropPercent: 30,                  // ~30% des cultures applicables
    conditions: { requiresMature: true, requiresNoExistingModifier: true },
    mutations: [
      { name: 'Wet',    multiplier: 2 },
      { name: 'Frozen', multiplier: 6, conditional: 'applies if crop already has Chilled' },
    ],
    stacking: {
      compatible: ['Golden', 'Rainbow', 'Giant'],
      incompatible: ['Wet', 'Chilled', 'Frozen']},
    screenEffect: 'Rain on screen',
    notes: ['Primary vs Snow (75%)', 'Affecte une culture applicable au hasard']},
  Frost: {
    atomValue:'Frost',
    description:'Gives the Frozen mutation to mature garden crops',
    type: 'weather',
    displayName: 'Snow',
    cycle: { kind: 'weather', startWindowMin: 20, startWindowMax: 35, durationMinutes: 5 },
    weightInCycle: 0.25,                           // 25% des events météo
    appliesRandomCropPercent: 30,
    conditions: { requiresMature: true, requiresNoExistingModifier: true },
    mutations: [
      { name: 'Chilled', multiplier: 2 },
      { name: 'Frozen',  multiplier: 6, conditional: 'applies if crop already has Wet' },
    ],
    stacking: {
      compatible: ['Golden', 'Rainbow', 'Giant'],
      incompatible: ['Wet', 'Chilled', 'Frozen']},
    screenEffect: 'Snow on screen',
    notes: ['Secondary vs Rain (25%)', 'Frozen recommandé pour champignon/cactus/bambou']},
  Sunny: {
    atomValue:null,
    description:'No special effects',
    type: 'base',
    cycle: { kind: 'base' },
    appliesRandomCropPercent: 0,
    conditions: { requiresMature: false, requiresNoExistingModifier: false },
    mutations: [],
    stacking: {
      compatible: ['Golden', 'Rainbow', 'Giant'],
      incompatible: []},
    screenEffect: 'Blue skies',
    notes: ['État par défaut, aucun effet']},
  AmberMoon:{
    atomValue:'Amber Moon',
    description:'Gives the Amberglow mutation to mature garden crops',
    type: 'lunar',
    displayName: 'Harvest Moon',
    cycle: { kind: 'lunar', periodMinutes: 240, durationMinutes: 10 },
    weightInCycle: 0.33,                           // 33% des events lunaires
    appliesRandomCropPercent: 30,
    conditions: { requiresMature: true, requiresNoExistingModifier: true },
    mutations: [
      { name: 'Amberlit', multiplier: 6 },
      { name: 'Amberbound',   multiplier: 10 },
    ],
    stacking: { compatible: ['Gold','Rainbow'], incompatible: ['Dawnlit','Amberlit'] },
    screenEffect: 'Nightfall glow (orange)',
    notes: ['1 fois / 4h', 'Ne se cumule pas avec Dawnlit']},
  Dawn:{
    atomValue:'Dawn',
    description:'Gives the Dawnlit mutation to mature garden crops',
    type: 'lunar',
    cycle: { kind: 'lunar', periodMinutes: 240, durationMinutes: 10 },
    weightInCycle: 0.67,                           // 67% des events lunaires
    appliesRandomCropPercent: 30,
    conditions: { requiresMature: true, requiresNoExistingModifier: true },
    mutations: [
      { name: 'Dawnlit', multiplier: 4 },
      { name: 'Dawnbound',   multiplier: 7 },
    ],
    stacking: { compatible: ['Gold','Rainbow'], incompatible: ['Amberlit','Dawnlit'] },
    screenEffect: 'Sunrise glow (purple)',
    notes: ['1 fois / 4h', 'Ne se cumule pas avec Amberglow']},
  Thunderstorm:{
      atomValue:'Thunderstorm',
      mutations: [
      { name: 'Thunderstruck', multiplier: 5 }
    ]
  }

}

export const coin = {
  img64:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAIGNIUk0AAHomAACAhAAA+gAAAIDoAAB1MAAA6mAAADqYAAAXcJy6UTwAAAAGYktHRAD/AP8A/6C9p5MAAAAHdElNRQfpCR4CFRRuokQwAAAr0ElEQVR42u29eZRlV3Xm+dvn3HvfHENGRE5KSSkJISGExCAJlQFDmRmDmAzGVcY2dIMBYSiXMXZjTA1tL1tgMxZVBparbJahbKAAA2JqxCAJAZKQUGpINKZSyiEyY3zzu8M5u/8490WE2pRRpjIlcOdeK9bKjOHFu/s7Z4/f3gEn5ISckBNyQk7ICTkhJ+SEnJATckJOyAk5ISfkfyPySL+Bo5HXv/7l3H3Pfl78vF/iKRddyGPOOYeoWkF0hBePxFWWl7rccO2NfOfKa7jsvR/lwgvP47rrdj3Sb/1fhrz7fe/i37z6Em697Tsc3P9DDh28AdUFVJU/+N2/sCuHlpLhMK8Mu8uV/mChMvSDys037Y4BUXV0+zdy3/3f4sD+6/nIh/4cVeXfvuz5j/Rj/UT5mbwhl/3n13Ldrd/kta/8Pc7YeTZnnr0DqZ/Nj3ZdNd2q2s3VevWxszOt7Z3F+Vnj3emTE5NbTWwjKFTxaJRIVtDv9YZ76s3mvYV3C/Pzh3Y3qlv3/cE7Ll/85N9cXLTnlauvuoHDyx3mZqd40av+/SP92MDPGCDvf9/bSLOMFz3/+TzmjNP50Ef/Z/S8X/zFUydmaxfUpipPN9Y8oZrEp6DDmcgOK34wT9G+H1O0UT8E70BBo5hoZhYak6jEeK169a0VzarzWbf4UZFxlZfq96+9fvmO57+0Obxn1yG+9oUb2bJtkpf/n+96RHXwMwHI/J4r+dJXvs0zf+lCdp71PG784eUnnTQ79a/rVX1+HPELkc13SDWNJO7hWQaWMTrE9ZYZ3X831VEfozlePMYLXgxs24LZth0vCcZXgAgpHOnhDqQNNfHJi7nZdP3IVj5/eNF/7TGPn9q7fE+fd7/7f/Hc55/HL73k7f//A+SvP/zHDAYZL37xszj5zGdx561fOmtmeuIV1Ur1lRXJHyP5fOTSO8hGd2DrGZW5OdREiMlAPVLkjPbtx66uEnmHN4rxgBryiSbxztMgqiMIKinic4pDh9BDSwgViso0mpzi1W77cS5znx4Us5/YdtYP79xz41ZOe8Jv8/tvfC5/8Vdf/5cPyAff+05+49d/hR/ffhdPfurL+fFNXzx98+zMbzVr0atjWd3pR/dSdG7BD/ciro3RFK3WSE45HanVQTwqiqgnX1qiOLifiivwKKIgClkcE+84FTs1g2LxCCoe0+tQ3LuHOBuFz2FRU0OTk3DJ6Xeksum/zHebnzx7tr10xU1tpuo5Fzz7Tx423diHG4wD917D5OQUJ22Z4sDhzqa6WXrd3OzE+xrVwctltHsqX7wKXbkak95D5PtE3hGpQT1ovYJpVAGDigEMBoPvdLFFgaggIiCCqoCNMc0WWAE83gjGGHQwQEYjDB6MYrzD5Avg7p0R7T6nFfkL2/3o3nOf8Ud7i8PP4rK3v4Bd993H7bcv/csB5A2veglf++YnyLOCsx/3LA7cv/sZp5w898GJqrzR5rvn3NLX8MvXYNN9GBlg8RgsXhSkADyFjYiaE2AtECHE4WOYIsMMowZBEBWsGrwKMjkBcYSoARQjoN5R9HpY9SgSwBWDkGGLtomLxdMj235Be/5ZdIfbbnZuf/a63/tXPOMxp/G3n7nhuOopejjA+PZX/56nP/dXmd9zDYcWVlqV6vWv27q58fbYHdhSrNxI1rmBpDhE4hVUcAogoGAkKNMCvjfErw7wLibtZ2TdlLwzRJdXkE4XfAQWbOSpJAbT8Gi8THTSLFKJAo6imHqNPKnih4pRD7jy91lUADoY19vS0NGf2Vp27p5V3jHxw70HDjb+LfPX7mTrRe88bro67j5kee+P+NJnv8XLXv109ty5f+fO07b9SaXqX2VGt1m38E3M6G5QjxGPqBLMkQ+OgAhxFt/zpCuOfkfpDwyml5OPBqjLsfjyA0TAGUUFrAoeg6/XkU0TVE/aRP3UOarbGkRVT3HwXlhaxAYEEBQAL4ITwahDiCi0xSCf+kZ3OP22fHTnTTcvvYBTJ67iCS/9x58/QD76gXcyN7ONZ73gYlZWhhdNN2sfaMTDi133u7iVq4myZawWKBFeBDUFogWGBM2EUSejO58xmi+g5xHnkMgjFSWJPUlUYK1DbPAFiENFUQS8QdRQOHAF5EVEahvI9CYmzthMY7PFZ4tYV2A0uHfRAKYXg6hHsIiPQQ09P3XjwX719a24ff0737uL5zw54VV/tOfnB5D/+oF3ko4y/t3bL6M7f9MzkkT/W2wOnV0sXwGr1xG5UXkLXFAgwUmTWQYLjv59I7LFEUVeEBlLpeZI6gNsZYhGikGDU6ZUIoLo2CVqeeI9wXMoqAUXURQRI2fwSZXqzCSN7U2iGqg42HBLRT3eaHn3ALX0sqkf7Tucv2br1pkfzV38SX73khrv/+LomOrtuDj1A3u+x/z8Eq+79I/Ze8e3Xzg9HX8k0v2Pyhe+gmlfS+SDzXamCOErBusiskVlefeQ1Ts7+LYnMY7mxID6dJ+4NcRWMowpiNRhANSEkFYFRfDiAY8oqBicmHDaseH7bQFxRpx4Ii0ouj1Gq32MWOJaBWwAV8bgShFuLRaDI7J+a2Lt2bvu7HyndvDLq7/yrk+w7/KPceMBf8x0d8xvyPXfvZw779rHS178ZAbD/F83a/o3ke49JTv0DUznVmLN8RLjRRHJEI1gYGnvGdG+L0WHGdUoJ5nIsI2UyI4QcYhG5YfiUXIjuDhG4hiTRMRJeE0zHBF5JVeHcx4tPHiP8R7FYFTCrREfHHiWMDJKNNOkddIcWosQr1gffJngEQ05jOIppMFqr/qFu64r3nTqjsb+VsUy+fLP/WwC8s7f/23+5D0foXPoB3R6+UUz0/W/Tdh3dnb4cmz3NmJNUaAwQbHWK+mKsHR7m/SQwwhUmhmN1ggTD1FxiAogeAEwEFuo1zBb54i3b8U2W1CpYeIYshF67z7MaICaHHWgmafIMnyek2cO1+4RpTkGRU0wbR6L94JpNameshVTjzE+nHoVDe5JFRXFG493LZb3T3z2+u/Nv6Fel4VsVPC8y67/2QNkYf/3KFJlablz+s4dm/++Hh2+MFu8HOneRKIjVKs441BJsUXM4IBn8ccDXGdEtZJRn8qJajmIw/pwIr0RfGSQeo1kokncqEO1ip+ZId5xMhonIWJVj/EF+f37kaUljLj1qE0NWqki27aQ9YeM9u6H/Qcw/S6G0mdgQjLZqFM5dQumlgCKlxAvGAXw+NIMar/C/bv1b793XfutExNROy2EV37o2oesw2PmQ+687ZuoKsur3Ykzdm55Xy0aPDdf/jKmey2xL0AUZwTEY/OI3n0Zi7f1kL7SbGS0pofE1RQxOUiBE8VFlmiiSW3LHNW5TUStOiQxIlCoYJqTSJygCEYVNcGBF90u1juEEMYKinpFJyZJtm2nctJ24rkZClXy/gDjHK68MTbNcWlGXK8hsQ1HVkL8IYQqgMERxSMiy/lulEzffSC+sh677FfOn+MzN8w/8oD894+8myi2fPQfrjS//PTzfr9Vc5cW3W+La3+H2BUIcQDDZJg8on33iNUf94lSpTHVpTaVIUkWnCiKNwbfrFPdupna5hlso4pGBm8EUER8SB6TJJRSBChvgzEG3+tisxwRRUUQ8agUeCJsYyqUVFotku1bMa06WacHoxQjIXpzeU6e5yT1GiaKUNZwAZEQNJgC27Bih+6Jtp8Vb/jAwpUXn5PoS5+wjX+86dAjC8jnv/h5Tt1e48JzT3vOpsnoPWZ4a71Y+hqx64ZISELiZV1E996UlR/3iHKlMTWiMtlDI1eWMDwuNsSzc9S3bSFu1dHI4oXwGmUSNzYhDo+daCI2ZPOCRSxoPoJ+HxlHTIRipPOCaTaQShJKJWKJpieJWy3c8ipmGEJxb4Qiy/GFI6nVMNYEzAGV0qdh8FZoRCJ+OT//WedP3Pmyxzd3v++K+9m1v/fIAfK5v/8g9VrEcnu0dWaq9uHYHzgrP/xl4vQgkQ9mQI0n8obefsfS7h5RCo2pEfFUHyOCojhxSFKltnUb8dw0xDacxPL3hFB0rOCgIK8OaTaQSg0hBoLZEhTX7YIW4fu9IGJQr5DE2EYNlfDKaiJMPUbU4bp9XJZjFCIVijRDBZJGPZQBkJB4GkU0xqgSJRF+qNW0456w64C76sLTpuZ/82mn87ffve+o9GkeChivveQSilw45YyLadX0txIZPsWtXIukd5VZsysz4ITREiz9uI8ZQW2qQzLVxuAxqjg8vlmldso2kplJxIS3FW7W+CPU1UPCpzijiHNopwveoRpyEFSQSgtfbwQYNZhAEKwWuG4bzV3ISUUR7yGKMDObsNtPwsdNIm8xCtY7sqVlsnYv5DlGEUKwYDS8Lx/lTJyUMFlLz5ypuv+8p51NLrTb/PmLtz38gLzmLS/hqU87l3tv//r5rUb0RhneStG+Ees9qKWwBi8W34elH7fxvYxaY0R1wqFGcMaTWY9p1Zncvo2oVceVd8L8MwFgabmwHly/j+bBX1Bae4kibLNVluj/Pw+bpvjBsLx9Y5AtptkimqhTn5smJUI11F2Nc2QLi2iaw9rhCOV8RfHiiCci6pti6pF7wemT5v945e+9iAMrw4cfkHQofOYzt9iZyYk3VmT5FL/8PSK/gBEQDB4BZ+ncPSRbcNSSnMbEALEZiuDE45oVGtu3YOtV/PiJ1wzV/x4Mo2BQZJTh+wOUMtGTkC9EjSY+rqCUURYg3mALj+92QAu8hMwcjTC1BlKLSDY18M0JchehWIwq0huSL6+GW6XlURFAQulGIkdza42GyeyUHb3lE3/5+fOedu7JfPhXzz5inR61D/ncp97HBU98DGedNXfBVKvyp9q7ua6rP0DIoKwziViy+YLV3UMMSmvTAFsdhWhKFFOt0jhpG7bZWHPcyD+fHAWoQpgrKKrgjcFONEHKxxEQY/DDFB0Ny1xDygQvBAOm1YQ4KfGPQhPLjfDDAZGpMVjqYo1iRYm8J3OOqNnExBEipeEsTaggWBMxms+xuZvCRLz768tfO3nS+CeebLnmnsGD1utR3xBVZcvOZ0ijZv+N8UuzxcouREeEwoQNZYeB0L1riKQZtYkUU8vwodEKsaW6eTNRo4GqrgFh9J//veUlAMBLiHfoDWA0WgNSRcFaTGsCby1aNmtVyoQiG+L7fUKReFwlBmlO4pIq8USCaTXIUwPehpA9zShWe2uRXjB1Uv5fsQ3BbqoSqTBjePmlT51+4nnb65yzKTsivR4VIF/5woc57/zHs/uWb5xZrdZfooN7sOk9iOQYD6IelYTeoZzhUkZSLag2+kjZ5/DGEm2aI9rULE2QIB5M+bAq/5zRYu17XOlZbZbhugPwsgaKF4NtNKAaMm7YELGVHUPyEAR44xD1mKSBqTXQKKM+O0WRR6hacitYD361hy+Ktd8vKhi1wadEnsoMYBxNI5unav517/razXZ//8h6gEcFSJYOOOOsC5idajw3YnSq79wKdFEpCKVviw6F3n0DxCvRZIbEKUZ98CvNOpW5aZwtHeuawkqV6U+p6ZRXRMYtWzzSWYUiBxTjS7JDkmAarUALCj8RSiEo2u+jWYaKQTQQJjAGmZzEGaE6EeErVfI8RjREWEWW4gY9dPwWNOQlHvDiiSfBRmDEMB3nL3zzBdOPO2NCef2TjjMgp57+aHbd9INaox5dQnafMNobohyxZahqGS4OyZZHJBVPVM+D08WjcURtbhqJTSAlBD09AIEHV2CTtRuFKDIaoKMB40gLFVQE22rhbRzCYV37KjbPKXrdAL6atTdhG3Wo1DGxEE81GaWGyJeKV4fv9kB1w00MH6gS1yOohHyoGcVbJ1rTL3/VRWdwxxEk7kcHyPZtTNbix1mTPbEY3Ir6dnjYMnHQ3NM+mKLqqTZHRBQYFQojRFNNomYDLSk7x0rUeVynhyrB5pf2Xao1qNcDUOLXIiPrPb7XgaIogwkbfiaKsY0W3ljqrQTnLHiD8SGQyIcpOL92cjaeJWsN0oxQHLFJmEzcL/3fX71x+qUXNI8fILfv/hZTm1vUYvvMyHc2af9ORFJELRI622S9gmzJE8dCXBthNFB0fBKRTE+iNpxI8yDvwoMRQaHbhTwtS/Xl56ME25oszVboIq5FXMMBftgvs4r1H5LWBEUcETcsXiNcEZX1AfBpjktzynAC0fVAxFpBaqX5QpmI/fmzE5subFZrXPa8ieMDyC233sH7/+vllXqjcoGm85hsqTQdpnxzMcMlhwwLKjWPRHkoBhqwzTpRrbqWS+gxvCEAJh2i/QG2LJUjHjUm+JGkslYuGT+2KTJ8ZxW8Xw/fBKRWR+sVpCKYuEKRJes3wXk0zdGy/77RnyCKrQESqgL1KGlMxebi33jyyXQGDy7aOmJALrrgbH752Y/fHCV6vg7vx7q0pGo6hAJfCKNFR6wFca3ASXCkag3VyRZEprTbsgbMMRPNKLptTBHCXG9CNm0qNbTZwCMYNbDmMxR6XchKZZXhN0mEbdUhNpg4Jits2TEsfVMWIq01kzWORUSJY4Mpk9TEJrSs+YVL/+GOSiVOjj0gr/+tl5MN2uTDztn47hYd7QvRiQZAMOBGjqxThL51nEOoWCGVCrZew5WFh+PCrhDF9wf40WiNfSIKGIttTeCNKRUoZU4CZCP8oIdRR4jzgnZts4lUYiQCX1jK/iGioTxf/royQRz//mC2DMEwWmMx1p413ayePLLVYw/IFVdcxc6TT+HUHaeeEWu/6fPDZTIXTpzD4no5OsqRqsNIHpwnEbZehzjecCuUY+rVAS+WOM3QbjucXh+tJXK23kKrNVTLUkrp3I1XXKcLrgggqS1D5gbabGCsg6I8VOKC3r1DBKwPeXoIIsrSvFEUGwqQRokqsu2k6er2k2dqxx6QP3zHWzDN8+n1Bqdq0UHdiEDDCcwRVCkGOXhHlIRStYiCEaJaNfBuN2BwjF1IWQbxuF4XimKtMoyAxBGm0cCVlWQpzaYAbjDAp+kaWS4gGG6VSrQhSAihuqp/oAMc/1PDPfIlPVWAuvGRjvo7tlTyYw/Is575VL7x7S/F1Wr8WM2XEJeWX/GggdExGhSIeGxcJnuqEFlsrbJmqsbX/FibrbGCdTQKhGr8mJEKxmBbE7goKksu65Vbk+ehf+JLsyXhtEutiZrqGqueMhFV1fBcbHydMtJz4zqXRYAq3rYSzp31bR7XOsaAXHf9DyHvxbVatIliFaN5mYOVVDcPfgTGgJScK/BIbJEkClCMMzOOucVae22T5/hOF7xfP7yA1BtorR4I3GVREMA6j3a7ZaZfOm80MCqdZexutGxQiTGoeeBxEg3P5gtZP3QIiQj1xMw8bVsf544xIHv33s89d91dK9JBTYt+SVQuM1UUHGghWKOIKRgXQ0wcIdaslUQ2RInHXBSw6qHXQ4v1HgaA2ISo2QpRH77kPXqs+pCTjEalckMw4DJP0S8wAqbs1Kh6xIwR2vgAAmpwWRhvWAfWMizyCbmsEk3O/nR1HxEg1biGxdaLPK8bl2744TGzQ/BFuCEYt3Y6JbKoHZOaj5/o2m1VSFPcYFD6FV0bO4jqDSSO1g6FBiIJ4hxFr/uAQ1L0RvhBRmxC/Wucp9g4Ck8i8k/egMu05AU7VARnDKlS275FokrlpxcajwgQg8NoYdSn1vuipG7KevcNAqXfeDB5qX6DMVKSmMvXGd+UY47Ohg68K9DOKupcGe6WiqrV0PpkiITEhVoUBusd2uvgc8/Y6KSHh/i8T5RkBD6KosZAHGF0XPGl/Hc4kG5oylKMR9Tiy76NFGW7+FgCIlraJJysRTDA2MhK2W8YH5xAcjbh8z9JfccYkHGzKFB/FN/vo1n+AKw0irATE2FWUSnbBeGGSzrC9wYhWnIwPLAK6jBxgRLY9CKCSZK19y/jFxdwuScfFqiasp0A3uWIel+oPKio8ogAKYoC770TEbfOMA8fHsAIJtbStNp187SBFLBBN8fNh2j5Dy1yXL+LKUlzWlYNTL0OlQpSRoahfxPMFu1V8AVFN2ewb5XYCBIHb2y8xcYGkyTr/HrRMkgAN3S4tMBgELUYdXifYY0fHlqWInsQXv2IAHHqsXG1H0VxXzf86DiiUANSCc4yhIhlvOL9+gmVB9eAOloZeyoRxXqH67TX+iRrtf4khmYDH7ryqBmzKoFBG9Kc0b4ubqlLJfGIDaZNVJBaBYnHvkDXngc15N0CMi0rxyFfz3xBFEV9/cCwGOU//amPqJ310pddQqW1c1CpHeq51Wjtzq5FTgbimpArqLdlpCVo4cB5JDJstKKix9Zsbcxx8IoF3KCPH44wEwkgwUQZi5lo4VbaiMsCMaJ8EC1S3FKf3u2L2Dyj0spDkRLwxhM3GsGPEG69L8EQZ0lXCqQwa0A5lzMqHKm3q1++9p/GAD9JjuiGdLp9vvzV7xft7mBJbaW0qxsOH0qlHuPH6JRqKooiJFI/rRP4UEVDJLpW0/WKLQpcv7f2dVEJfN96Fa1VymDEY8ueh4iS7TnM8K5FksiTVDIoWZUkim02Az9r3GUMWScuh9FKgfUh3/KiFOpIHX44crvzeBM/3HeMAfnmN7/La1/764Xzsou4ihKVii+zcoGoGSOxRYsyGBbweYEWRbj2PjjSjVHXMcNjLQPXUomCRdFeF81TfHnSxQtEFUxrgnFvJESLMVLE9O5ZxHT7VGseseNxN2BqAuq1EEZL6eQBEU+26nG98ZwjiDhGRUHqoyKpTexdco0H9QxHBMjTnnIW3UNXkiTNu72tezW2VISusy/qFqlHuCJMIamA5A43TNeIAevMjWMLyJjCZspet5Y2QoZDfD/0/MNMSDlV1ZwIVKByIMcbKBYLhvtH2KSgUvc4E4Z2vI2JzjgDaTZDxZcQLoeBHs9wIUdTE0jdZaI8ylKyXNpLqV060H1wXvOIAPnIx6+lvTpg4fDqbjFTK74cL1g3WIpJoDpVJSsSVAN1X7yn6A3CzTBjJ3h8oqyfKN7huj2sC2ZmnDOZagXqzbKSWyCpo39XG4Ye01KiJMyqqBd0ZhPJKTswzUlQwYgrY2aPH0QMFoch9wBiB16F4agH4u7sDPO7O+32sQfkox/9KMY0qda37lXZtE/jMY1nvYKqpqA2VyMjQdWUIa/iBgNI8xAmmhCjPVyAGBTt9WCYhpqTKY2sFcxkC2cDS7F334jevMdWCmqNESojRB3exlROPw3bbCHNCTSulJVdxahhuOgoOg4kzE5aFfLcMchzUu+vf/dX7+rNNB4cJ/GIO4ZfuvxbnHzmqxc8je8Rby2nX9fLIiqOymSEbVTICln7FTpMwy0Zf69uSCyPswiKyTJ8r896kB6+IvU6WqmTHoblu4c4IqqTKUncw5siPN/sDNWTd4RoqlZBm40Q0AA+i+nuHyJZWPMxLt8M0wEDhxuZxnV//Wun8YdfWj0+gMSRRVc/QFpEV0q0o1BixrUsU0YcUnG0NlfJsjDqHJy5Uqx2oXDrFBqjDw8kJZNduz3Uu7KCUBY+K1XIWqze2qcY5FQn+lRrgQ7rEdJKleScMzHNBnjFx4q0JlCpIBgGy0q6mIetK86iCKl19IYdMrUH2pm5tptb3vLU49DCBXjt7/wRBw52yYrou0Qzd2vZmtRyFEDV4MXRmKtiajVyFyqeAhS9AXmnt8bSeCCf8AH6e+gIbPiQsuDoRgNcOlpvIosh7zqWb1oiW1Aa1ZzG5ApYB76CqqWyYzvRqdtD08mETqNpNiCp4TOhfX8fRqY0weGV+3lKLx3ivHzvQLd2b7fv+eDVx4nkAHDw0DLbznjmfXk08XVNNpfkABP6H1KOBNSVxo4muY+wPilbqp7R4iqaFuWsnoRcWcsMUc0aifmo7k5ZNhdVhALBbfiSoi7FdbuIEyDGrzqWvnEngzsXiZOCxnSKJiM8DtQTVRMqs5MYK6jxqAHjYiSqYJoNeocLigMZVmPA422BeBj2enRVXQf7pQu3L2Wbph9cyHvUgDzp6a9hOP9ZUlf7jEvOWIUKxpfUGh3nH0p9dgI70aRwimhYn+EHfdJDi5AHWqkXWa+OEjYpGH90EbGUHY7gNWI8wVkX4fxSyRU6bdSNyBaHHPrqbvq7DhBFXWpzbUwywvgEoxafWKpbZ4Of6A2w42fzgLWobdHd00MLyCOPl+Avh5rT7nfJNL695+0VC3249JMPfgXHUY0jbJ7qsXX2VFaGj5qfqnfOs9n+xxrfRoxsoMQIYgxJtcqw10OcxxgNu01GKRInmHp9fahGQjgajElolR4pKuvNL1u+bqDAhUFNU4bgSrqsHLrybordS9SMozE7JG50sN5jfQVnDfHWKezsVCBFRHEwU5hQr3OGxR8dIrt5OexTMR6rwV8uDZdZ6nfpFrW/vvRXVz//2as3cc2eBz9zeFQ35NLf/UtqNctpMzelGk99zFd3dJ2RtT7zuNzqxWGbMfWT5shig/FK7EG9o7ewQL64isnHIzWhLerL3snR1biCUrTcoSJSYCTHUIAB72MG9zgOf/le3J3LVGopjbkhcTXHeov1MU4Uu7lFZW4KZ8NWIHpdfJHiLCARg70dutfdhxTBMiQl0S4tMla6q6Rq9q3m0d99+B9meNb500f8BEcl286+hKVexL7+6VeOkpO+kEdb1zNjxq5EUXFUpxvUt81SWEuBDbcnzxkemKe3/xA6cBiXrG3e8XK00dfYWZeO3IPxMaaIKFYci7t6LN7Ug46n0chpznYx9Q4qjkITBlGEzE1Q3RLorlLygTUd4kdDjBrckmPhqjtIlnPCqJgQ+VA+Wumt0s0cQ2c//farq7tvOez4wBduO6IneEgLzGan6mT5zVkv3fLeSXvK07RYPkUlH3c6Sx15MEJtdhIjMJpfJM5zrHd4yXGLq6y2U6qzc9RmJjGJx0tGoJod2XnRtfTfB7Pnq+R96B7o0r9vSNER4jijOtel2shD9dWHpTVpxVDdeTLJRAN8XnYCAyDioGj3sdEsy9fcjr+7jcXgpcAJxF4YpgOW+ytkGt+7VLQ+9hdPd35/R/jKXUem04c0Fv3Lz7kALSbYefJlB7udX7CRdp4p2jchuolKYDYUHmtVTBKRDsL2BAsY8dhcyVaGjFZT1EfYqIbEZo3FvMZ01AdSbkJhj3JGJISxqEVyQ7astO8dsHRnl/7+ISbz1Bue5qY+SaMNpkA1CTeyElN97Jk0zjs3rAUcDh7QUMMYJBN6t7fpXXsQyS3eKpF6IKIg59DqIZazXAda+8s3vWjxs5/8TsL7v71yxDp9yOW9A7d8HNTRGTUmtkRX/4+a2/2ySLshBAUoN/mMaZpGIV1dZXhwAZMWhBzFYxQKJwyyGLUtqpNNqtMVkkYFm4AkYd79ARTRsbMpwOXg+hmjlYLBUkG2UqBpTiyepO5JGg5bzVA7BCkwPjDbi6kpGuc9muiMUyCqwEobv/duoiIHMcGnaET/fsfCLR3MwJStJ1nb2Xiw3+Pw8v2sUP3WPb3Wq+q2ONzpFvzJFasPPyAA2YEv0lu5hYXl/rlz9T3/s8nd50ZOy4qrR/yGqjBgvCfv9ukfWkT6KeujnMGxaiakI0tWGFxksNUKUk0wlQQTWYyWddZc8alSDB3ZMMcPQQuPkYIkcSS1nKRaYBKHmrBIU8XjBFRiktnNJE96AmbrJlQM1gvkI7K9d2P73RCd+YjsgGdxV5uiH4qplXJCNbeGbtph78ICvVyWFlP51WYkV1Bt8Ft/d3Q7T47Jao2TpjPe/bGYS5695/BAW3cmZM+saDZRTlCUlNINPRABW0lIGjXE5bgsB2cCR1hyiFJs1RNXIDIeshztpriVEflSn2ypR7rYJ1/p4zojSDNir8TVgkoroz45ojoxwNaGaJLibI6Kx5ZLlk2tRrJ1lsqpW7E7diAmLvdjaVgXmGWhy6iG9IBn8ZYu9Mp6g67PivRdxsHleYZ5rsuu8Z43ffa0v3nUXI8v37zAvUd+OY7dDQG455r/yFU/+jG/8caXsvfbl79ma3X5Q7FdbHgpG0Ciaw2ptWUuClJA0WmTLi4E+qcatBykHDeazIYmvPcG9UnZMi5NmPGI8RgZhTDAx6EXQyh2hvl3iyQxyWSLZNMk1COKyBLtOA0zOR3WQIkLowSdIe7efaT39Fi5rYP2xhNZBqsWZ5RMPfNLB1jut+mY5v+az+uvq+BXVlZG/IdvHCUaHMP1TB/462/zoudsRZcGRI3n3WL8gdRTPDWWNJaSwPRAHmxwy2oFU6uQNBtIpYL34J1HfKinSlk9deIDoNZjTIGJHGIcxriwmU5yDDbMnKuUiwQUrMHUayQzm6hunSHa1MRXbDBHTvGxRSabgC1buBbJY/q7Fli+aQE/NGWaWvJ6jcPhmV89zEK/S0+aN8yntTdtqkf7t05GvOFTR78JCI5Dz27fd9/BameZ79w2jJ5z1vzvb50a/XGtOgxcfB+H0Wjc2gkes+dVJICQe4r+CNftUQwGuKKAPDS5xlHVWo6ipty9WNJwjMEZQSJBKpaoXiepNzCNGpLEZW1rTPGMUDW4WoXotJ2YpA5E5L2C1avvZnTt/ZA5nA1jDbacgcmBpfYiS6sLrEpjz6Kf/PVWlF7zm3/3HF746E9w+Z0PTX/HhXPwg8+8gqw/4AffX4ie/fTWG0/dXryrWS1mA0U/DfE9Zi2RHFef1t+ShPJ44fBphg5T/ChHsxx1DjcerlFFxIRhS2vROMFWK9hqgqnESBQWkHlYW9VnSvC8hL2mhTHYHduJpjYzvG/A4lV3kN+1jHVhOYj1ptwi53F4FlfbHOos0CfZt5xW3nD29ujyz9+sbJuO+b8+f+Ah6+64kUC++VfPZHGhyyv/+Fpu+PCzX7Hz1OT9k7Pt7UYyFIu34aRaJ2sktkDVVBRX5hTjZlb5or4EQXXtVihgTGAUrk1FbXxADX7EGV8O49iSHFfuWxRDUd1EZzli9bp9xIeHiAncTOMjYh8c3cA4DrcP02mv0qG+72AxcelbXz77hde+dw+TCbz/6u4x0dtxZeW877dPww0ifu/jX+Wbf/bqF55xevTBLVvdaZVGQWEUVUusRWnz7QaytAs7rsotJWwk1+lP3hS0XrZfF0Noe4+NnDfjGdwQJUkhDBc8q/f2SA8pJq2EZJUwluCJcEZI3YjDq4dZHPQZkdy9nCdvftOv7/zqb//5HYg6PvL9o9v887ADAvCel+1kuZ3ytrdexPdvWHza9un8o6eexNmTm6tINUNNXo4kl6PSKv+0176RhirrDdh/+jBjc7RenJTyE1rW1QwGyWPSFUdnX598f4FLATVlxTZwqsJfWnB08h7zK0v0hhkdJq7tSvOt2xuD73/h5pSKZPy37/8cLFLeKP/P7lVe8OQpfrRrxKO2Ve47tL92fbrsz3Gd/skWJY4bWFMpVzqNz2/Yv+7NWt9qnYIqY4oPa9uD1rYIPaC0sgEQU3Yts4j0sKNzZ5/27X3cYYvNKoAJ61/Hq8qN4PAcHvQ5uHKYflr4Hq1Pz49al05VRrt+cKBCwxR88OqjX+X3iAECcMUtHX7nknP40g2bedrZvf33Ha59xWWulS5m52SLw9hlijWWyErYmVjybNcVrOv+Qca7ssZ1LF37QChBFIyEeUAKKNqO4f05q3cM6N6TUSwKprAgShY5BF8u5bd4I2RpysLqIZY6y/RcvLjqGn96KK+/a6YRHXzN3z2OXZ9f5j995eBx0dVxN1kb5T0v+Ve87XOP5x/ffCt3HDaVJ+zIXzFb6f5BNeLceqTUJoR4LiLeFBM3E2wMxhblVtH1ARkJzOdydpyydWtQ1fB3wVIl73qyZUe6kpN1cnToUR8R/u4IgAfjyr9bFdjqhfcs91dY7C7Tc84PqXy7l9k/e8Nn2t/40Cu2sXUq4ePf3MuX7jl+OnpYARnLR37tPGwc8eInncb39hx41GxifnfaDF+ZaDprxGMiIa4oUUOgFWPrCVHFYGNFIh8iMEz4sx+FwaeefOTJh0o+zCkGOZoqkgnGRWVCF3Yy6lqdIHT0DTDSnPZoldXeKqtpQarRXSMXfeS+YeV/nNFMl+5ZrTBTVd78uYXjrptHBBCAP3/BHFdeu8C/f83F/NW1K/YNF80+ecLkb2xI8fyG5jOiWs5eFIhYDLaMuXwZIpd/1ghKRXvwWs7M25BZi5azhCEkNj5EV4jiREldRn8wYKXfoZcNSVXuHzr7qWXf+tjFO/zt373XUU+ESz91/P/U0SMOCMB/+uVH8aiTJ2gPPOdsa3LF/VHy1M3pkxpV+c2mFM+tUeyMyIi8X1tOoJTb38o9vWFoxq8tzh+bL9ZIa2EYJySFDucKhvmI1XTA6mhENy+K3MW7cxd/uuMrn33rzRfd9qEnXqt33HWIR+9o8Tuf7zysOnlEAdkon7r0KfRSx5mbLE/77GPl68+75Ywojl5YldELWjZ7YhWdsSaYHkGx43E0wjrxMKdRJn2E8oyX8q8kFEqeZfSzNu1sQDfXfOTi/ZmPrumrubyb8a1Xbl06+NWlLewbVWjE8M7PHd3e3X8xgAC84wVn86eXvYgPvvcqzm0Jj56r8OkfHWpsaZpzJmv2KVX6T6nFeoZI5fSKoR6TxRaPiGHMh/SuwLmMzOcMc8/ISTHKtMjzYj4Xs7ejXDc01euGQ66/5R53/3Of4PNDqwVLgxabJzxv++z+R1QHP1OAbJRXzMGnvvjv+O8f/DpTNcMvnLWdX/svX49+8eyZqa3TU6dFpDMu7509UbOn1WJJvHeoqqiqepTM4zv9fB7i26i3Dh/sFweV+v4//dSe4Ydfs4VRKiwsjZieqvKH//jQFugfS/mZBWSjvOWiiMFIufDMKQ71LTMTLTbVPJvjLpP0iHxOPVEadc9qFw63oRDI4ohRNMPhPGFfJyXKCtRYXnPx6fyHy3fx8WuPXcnjWMnPBSA/Td4MfAvYAiTAWcAB4NOP9Bs7ISfkhJyQE3JCTsgJOSEn5ISckJ8D+X8B7L1HlK7Vi1oAAAAldEVYdGRhdGU6Y3JlYXRlADIwMjUtMDktMzBUMDI6MjE6MDgrMDA6MDAu0X64AAAAJXRFWHRkYXRlOm1vZGlmeQAyMDI1LTA5LTMwVDAyOjIxOjA4KzAwOjAwX4zGBAAAACh0RVh0ZGF0ZTp0aW1lc3RhbXAAMjAyNS0wOS0zMFQwMjoyMToyMCswMDowMHlTrsEAAAAASUVORK5CYII="
}
