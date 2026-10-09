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
// calculator, while the PNGs themselves were still served fine.
//
// The fixture below is the real shape of both sources as of game v1029.
//
// Run with: npm run check:sprites

import { checkEqual, done } from "./_check";
import {
  findSprite,
  resetSpriteResolver,
  setCatalogReader,
  setSpriteIndex,
  type SpriteCatalogKey,
} from "../src/ui/kit/sprites/resolver";

const API = "https://mg-api.ariedam.fr";
const sprite = (path: string) => `${API}/assets/sprites/${path}?v=1029`;

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

checkEqual("Seed alert icon", urlFor(["seed"], "Carrot"), sprite("seeds/Carrot.png"));
checkEqual("Seed alert icon, by display name", urlFor(["seed"], "Carrot Seed"), sprite("seeds/Carrot.png"));
checkEqual("Tool alert icon", urlFor(["item"], "WateringCan"), sprite("items/WateringCan.png"));
checkEqual("Tool alert icon, by display name", urlFor(["item"], "Watering Can"), sprite("items/WateringCan.png"));
checkEqual("Decor alert icon", urlFor(["decor"], "SmallRock"), sprite("decor/SmallRock.png"));
checkEqual("Egg alert icon (eggs live in the pet sheet)", urlFor(["pet"], "CommonEgg"), sprite("pets/CommonEgg.png"));
checkEqual("Pet avatar", urlFor(["pet"], "Bat"), sprite("pets/Bat.png"));
checkEqual("Weather alert icon", urlFor(["ui", "mutation", "weather"], "Rain"), sprite("ui/RainIcon.png"));

/* ---------------------------- the other consumers ------------------------- */

checkEqual("Locker crop icon is the harvested crop, not the seedling",
  urlFor(["plant", "tallplant", "crop"], "Carrot"), sprite("plants/Carrot.png"));
checkEqual("the seedling is still reachable by its own name",
  urlFor(["plant"], "BabyCarrot"), sprite("plants/BabyCarrot.png"));
checkEqual("crop by display name", urlFor(["crop"], "Bamboo Shoot"), sprite("plants/Bamboo.png"));
checkEqual("tall plant falls back to the plants sheet",
  urlFor(["tallplant", "plant"], "Bamboo"), sprite("plants/Bamboo.png"));
checkEqual("mutation icon that lives in the ui sheet",
  urlFor(["mutation"], "Gold"), sprite("ui/MutationGold.png"));
checkEqual("mutation icon that lives in the mutations sheet",
  urlFor(["mutation"], "Wet"), sprite("mutations/Wet.png"));

/* ------------------------------- Guard rails ------------------------------ */

checkEqual("an unknown name still resolves to nothing", urlFor(["seed"], "NotARealSeed"), null);
checkEqual("an empty candidate resolves to nothing", urlFor(["seed"], ""), null);

// The catalog must win over the index, so a stale index entry can never shadow
// the versioned URL the catalog serves.
resetSpriteResolver();
setSpriteIndex([{ id: "sprite/pet/Bat", name: "Bat" }], API);
setCatalogReader(key => (CATALOGS[key] as Record<string, unknown>) ?? null);
checkEqual("catalog wins over the unversioned index URL",
  urlFor(["pet"], "Bat"), sprite("pets/Bat.png"));

// With no catalog at all the index is still used, so the mod degrades instead
// of going blank if MGData has not landed yet.
resetSpriteResolver();
setSpriteIndex([{ id: "sprite/pet/Bat", name: "Bat" }], API);
checkEqual("index still answers when the catalog is empty",
  urlFor(["pet"], "Bat"), `${API}/assets/sprites/pets/Bat.png`);

done();
