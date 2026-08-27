// scripts/checkSpriteResolver.ts
//
// Verifies that every sprite the mod shows can be resolved from the MGData
// catalogs alone, without the `/assets/sprite-data` index.
//
// The bug this guards against: the index is rebuilt from the game bundle on
// every release, and on game v1029 it collapsed from the full catalogue to 36
// entries (pets plus a handful of decor). Seeds, crops, tools and most decor
// resolved *only* through that index, so every one of their icons silently
// vanished from the alerts, the notification overlay, the locker and the
// calculator — while the PNGs themselves were still served fine.
//
// The fixture below is the real shape of both sources as of game v1029.
//
// Run with: npm run check:sprites

import {
  findSprite,
  resetSpriteResolver,
  setCatalogReader,
  setSpriteIndex,
  type SpriteCatalogKey,
} from "../src/ui/spriteResolver";

const API = "https://mg-api.ariedam.fr";
const sprite = (path: string) => `${API}/assets/sprites/${path}?v=1029`;

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  if (actual === expected) {
    console.log(`ok   ${label}`);
    return;
  }
  failures += 1;
  console.error(`FAIL ${label}\n  expected ${String(expected)}\n  actual   ${String(actual)}`);
}

function urlFor(categories: string[], candidate: string): string | null {
  return findSprite(categories, candidate)?.url ?? null;
}

/* --------------------------------- Fixture -------------------------------- */

const CATALOGS: Partial<Record<SpriteCatalogKey, Record<string, unknown>>> = {
  plants: {
    Carrot: {
      seed: { name: "Carrot Seed", sprite: sprite("seeds/Carrot.png") },
      plant: { name: "Carrot Plant", sprite: sprite("plants/BabyCarrot.png") },
      crop: { name: "Carrot", sprite: sprite("plants/Carrot.png") },
    },
    Bamboo: {
      seed: { name: "Bamboo Seed", sprite: sprite("seeds/Bamboo.png") },
      plant: { name: "Bamboo Plant", sprite: sprite("plants/Bamboo.png") },
      crop: { name: "Bamboo Shoot", sprite: sprite("plants/Bamboo.png") },
    },
  },
  items: { WateringCan: { name: "Watering Can", sprite: sprite("items/WateringCan.png") } },
  decor: { SmallRock: { name: "Small Garden Rock", sprite: sprite("decor/SmallRock.png") } },
  eggs: { CommonEgg: { name: "Common Egg", sprite: sprite("pets/CommonEgg.png") } },
  pets: { Bat: { name: "Bat", sprite: sprite("pets/Bat.png") } },
  mutations: {
    Gold: { name: "Gold", sprite: sprite("ui/MutationGold.png") },
    Wet: { name: "Wet", sprite: sprite("mutations/Wet.png") },
  },
  weather: { Rain: { name: "Rain", sprite: sprite("ui/RainIcon.png") } },
};

/** What the index actually serves on v1029: pets and a few decor, nothing else. */
const BROKEN_INDEX = [
  { id: "sprite/pet/Bat", name: "Bat" },
  { id: "sprite/decor/Cauldron", name: "Cauldron" },
];

resetSpriteResolver();
setSpriteIndex(BROKEN_INDEX, API);
setCatalogReader(key => (CATALOGS[key] as Record<string, unknown>) ?? null);

/* ------------------- what the alerts and the overlay ask for -------------- */

check("Seed alert icon", urlFor(["seed"], "Carrot"), sprite("seeds/Carrot.png"));
check("Seed alert icon, by display name", urlFor(["seed"], "Carrot Seed"), sprite("seeds/Carrot.png"));
check("Tool alert icon", urlFor(["item"], "WateringCan"), sprite("items/WateringCan.png"));
check("Tool alert icon, by display name", urlFor(["item"], "Watering Can"), sprite("items/WateringCan.png"));
check("Decor alert icon", urlFor(["decor"], "SmallRock"), sprite("decor/SmallRock.png"));
check("Egg alert icon (eggs live in the pet sheet)", urlFor(["pet"], "CommonEgg"), sprite("pets/CommonEgg.png"));
check("Pet avatar", urlFor(["pet"], "Bat"), sprite("pets/Bat.png"));
check("Weather alert icon", urlFor(["ui", "mutation", "weather"], "Rain"), sprite("ui/RainIcon.png"));

/* ---------------------------- the other consumers ------------------------- */

check("Locker crop icon is the harvested crop, not the seedling",
  urlFor(["plant", "tallplant", "crop"], "Carrot"), sprite("plants/Carrot.png"));
check("the seedling is still reachable by its own name",
  urlFor(["plant"], "BabyCarrot"), sprite("plants/BabyCarrot.png"));
check("crop by display name", urlFor(["crop"], "Bamboo Shoot"), sprite("plants/Bamboo.png"));
check("tall plant falls back to the plants sheet",
  urlFor(["tallplant", "plant"], "Bamboo"), sprite("plants/Bamboo.png"));
check("mutation icon that lives in the ui sheet",
  urlFor(["mutation"], "Gold"), sprite("ui/MutationGold.png"));
check("mutation icon that lives in the mutations sheet",
  urlFor(["mutation"], "Wet"), sprite("mutations/Wet.png"));

/* ------------------------------- Guard rails ------------------------------ */

check("an unknown name still resolves to nothing", urlFor(["seed"], "NotARealSeed"), null);
check("an empty candidate resolves to nothing", urlFor(["seed"], ""), null);

// The catalog must win over the index, so a stale index entry can never shadow
// the versioned URL the catalog serves.
resetSpriteResolver();
setSpriteIndex([{ id: "sprite/pet/Bat", name: "Bat" }], API);
setCatalogReader(key => (CATALOGS[key] as Record<string, unknown>) ?? null);
check("catalog wins over the unversioned index URL",
  urlFor(["pet"], "Bat"), sprite("pets/Bat.png"));

// With no catalog at all the index is still used, so the mod degrades instead
// of going blank if MGData has not landed yet.
resetSpriteResolver();
setSpriteIndex([{ id: "sprite/pet/Bat", name: "Bat" }], API);
check("index still answers when the catalog is empty",
  urlFor(["pet"], "Bat"), `${API}/assets/sprites/pets/Bat.png`);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
