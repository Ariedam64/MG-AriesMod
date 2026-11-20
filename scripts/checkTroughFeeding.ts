// Hunger alerts and the Feeding Trough (BR-59).
//
// The game feeds a hungry pet from the Feeding Trough by itself, and hides its
// own "Low hunger" toast for every pet the trough will feed
// (`myAuthoritativeTroughFedPetIdsAtom`). The companion still asked "feed?"
// for those pets, because `reviewFeeding` never looked at the trough.
//
// The game's rule: the garden has a FeedingTrough decor placed, the pet is
// active and not ridden, and the trough storage (`inventory.storages` with
// `decorId === "FeedingTrough"`) holds a Produce item that is not a favourite
// and whose species is in the pet's catalog diet.
//
// What this guards, through the companion's own `reviewFeeding`:
//   - a hungry pet the trough will feed is not proposed;
//   - it is still proposed when the trough is empty, when no trough decor is
//     placed, when the only fitting crop is a favourite (the game's "locked"
//     case), when the pet is the ridden one, and when nothing in the trough
//     is in its diet.
//
// Run with: npm run check:troughfeeding

import { check, run } from "./_check";
import { createFakeStore, installFakeGame, primitive } from "./_fakeJotai";
import { reviewFeeding } from "../src/features/companion/chat/feedRead";
import { PetsService } from "../src/features/pets/pets";
import { PlayerService } from "../src/game/player";

// A Worm eats Carrot (bundled catalog diet) and is full at 500, so 10 is 2 %.
const PET_ID = "pet-worm";
const petSlot = { id: PET_ID, petSpecies: "Worm", name: "Wiggles", xp: 0, hunger: 10, mutations: [], abilities: [], targetScale: 1 };

const BAG_CARROT = { id: "bag-carrot", itemType: "Produce", species: "Carrot", size: 60, mutations: [] };
const TROUGH_CARROT = { id: "trough-carrot", itemType: "Produce", species: "Carrot", size: 60, mutations: [] };
const TROUGH_BAMBOO = { id: "trough-bamboo", itemType: "Produce", species: "Bamboo", size: 60, mutations: [] };

const TROUGH_DECOR = { objectType: "decor", decorId: "FeedingTrough", rotation: 0 };

type Scenario = {
  troughItems: any[];
  troughPlaced?: boolean;
  favourites?: string[];
  riddenPetId?: string | null;
};

function myDataFor(s: Scenario): any {
  return {
    garden: {
      tileObjects: s.troughPlaced === false ? {} : { "42": TROUGH_DECOR },
      boardwalkTileObjects: {},
    },
    inventory: {
      items: [BAG_CARROT],
      storages: [{ decorId: "FeedingTrough", items: s.troughItems }],
      favoritedItemIds: s.favourites ?? [],
    },
    petSlots: [petSlot],
    riddenPetId: s.riddenPetId ?? null,
  };
}

const store = createFakeStore();
const myDataAtom = primitive<any>(myDataFor({ troughItems: [] }), "myDataAtom");
const myInventoryAtom = primitive<any>(myDataFor({ troughItems: [] }).inventory, "myInventoryAtom");
installFakeGame(store, {
  "/atoms/myAtoms.ts/myDataAtom": myDataAtom,
  "/atoms/myAtoms.ts/myInventoryAtom": myInventoryAtom,
});

let favourites: string[] = [];
(PetsService as any).getPets = async () => [{ slot: petSlot, position: { x: 0, y: 0 } }];
(PlayerService as any).getCropInventoryState = async () => [BAG_CARROT];
(PlayerService as any).getFavoriteIds = async () => favourites.slice();

const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

async function proposedWith(s: Scenario): Promise<boolean> {
  const myData = myDataFor(s);
  favourites = myData.inventory.favoritedItemIds.slice();
  store.set(myDataAtom, myData);
  store.set(myInventoryAtom, myData.inventory);
  await settle();
  const review = await reviewFeeding({ thresholdPct: 50, allowGarden: false });
  return review.candidates.some((c) => c.petId === PET_ID);
}

run(async () => {
  check(
    "a hungry pet is proposed when the trough is empty",
    await proposedWith({ troughItems: [] }),
    "the pet should be proposed: the trough holds nothing"
  );

  check(
    "a hungry pet is not proposed when the trough holds a crop in its diet",
    !(await proposedWith({ troughItems: [TROUGH_CARROT] })),
    "the trough holds a Carrot, which a Worm eats: the game feeds it and hides its own warning"
  );

  check(
    "a hungry pet is proposed when no FeedingTrough decor is placed",
    await proposedWith({ troughItems: [TROUGH_CARROT], troughPlaced: false }),
    "without the decor in the garden the game feeds nothing from the storage"
  );

  check(
    "a hungry pet is proposed when the only fitting trough crop is a favourite",
    await proposedWith({ troughItems: [TROUGH_CARROT], favourites: [TROUGH_CARROT.id] }),
    "a favourite is locked: the pet cannot eat it from the trough"
  );

  check(
    "a hungry pet is proposed when it is the ridden pet",
    await proposedWith({ troughItems: [TROUGH_CARROT], riddenPetId: PET_ID }),
    "the ridden pet does not eat from the trough"
  );

  check(
    "a hungry pet is proposed when nothing in the trough is in its diet",
    await proposedWith({ troughItems: [TROUGH_BAMBOO] }),
    "a Worm does not eat Bamboo"
  );
});
