// The decor deleter against decor hung on a tile edge (BR-4).
//
// Colored String Lights, Paper Lantern and the other decor whose catalog entry
// has `edgePlacement` are not placed on a tile. The game sends
// `PlaceEdgeDecor` for them, and the server refuses a `PlaceDecor`. The
// deleter sent `PlaceDecor` for every decor anyway, then counted each send as
// a deletion: the bar went to 76/120 and the inventory stayed at 120.
//
// This runs the real decor deleter on a fake store, behind a socket that
// plays the server: `PlaceDecor` of a tile decor takes it out of the
// inventory onto the tile, `RemoveGardenObject` clears the tile, and anything
// the server would refuse changes nothing.

import { check, checkEqual, run } from "./_check";
import { createFakeStore, installFakeGame, primitive } from "./_fakeJotai";

type Sent = { type: string; [key: string]: unknown };
type DecorStack = { decorId: string; quantity: number; itemType: "Decor" };

const store = createFakeStore();
const decorInventory = primitive<DecorStack[]>([], "myDecorInventoryAtom");
const decorShed = primitive<DecorStack[]>([], "myDecorShedItemsAtom");
const inventory = primitive<any>({ items: [], storages: [] }, "myInventoryAtom");
const myData = primitive<any>({ garden: { tileObjects: {}, boardwalkTileObjects: {} } }, "myDataAtom");
const toastsAtom = primitive<any[]>([]);
const currentRoomAtom = primitive({ toasts: toastsAtom, npcLines: primitive({}) }, "currentRoomAtom");
installFakeGame(store, {
  "/atoms/myAtoms.ts/myDecorInventoryAtom": decorInventory,
  "/atoms/myAtoms.ts/myDecorShedItemsAtom": decorShed,
  "/atoms/myAtoms.ts/myInventoryAtom": inventory,
  "/atoms/myAtoms.ts/myDataAtom": myData,
  "/client/src/games/Quinoa/engine/scopes/currentRoom.ts/currentRoomAtom": currentRoomAtom,
});

/** Decor the fake server refuses on a tile: the edge decor, plus one it rejects for its own reasons. */
const EDGE_DECOR = new Set(["ColoredStringLights", "PaperLantern"]);
const REJECTED_DECOR = "HayBale";

const sent: Sent[] = [];

const stacks = () => store.get(decorInventory) as DecorStack[];
const quantityOf = (decorId: string) => stacks().find((s) => s.decorId === decorId)?.quantity ?? 0;
const setStock = (entries: Record<string, number>) => {
  store.set(decorInventory, Object.entries(entries).map(([decorId, quantity]) => ({ decorId, quantity, itemType: "Decor" })));
};

function serverApplies(message: Sent): void {
  const garden = (store.get(myData) as any).garden;
  const objects = { ...garden.tileObjects };
  if (message.type === "PlaceDecor") {
    const decorId = String(message.decorId);
    if (EDGE_DECOR.has(decorId) || decorId === REJECTED_DECOR) return;
    if (message.tileType !== "Dirt" || objects[String(message.localTileIndex)] != null) return;
    if (quantityOf(decorId) <= 0) return;
    objects[String(message.localTileIndex)] = { objectType: "decor", decorId, rotation: 0 };
    store.set(decorInventory, stacks().map((s) => (s.decorId === decorId ? { ...s, quantity: s.quantity - 1 } : s)));
  } else if (message.type === "RemoveGardenObject") {
    if (message.slotType !== "Dirt") return;
    delete objects[String(message.slot)];
  } else {
    return;
  }
  store.set(myData, { garden: { ...garden, tileObjects: objects } });
}

class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  url: string;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(): void {}
  send(raw: string): void {
    const wire = JSON.parse(raw);
    const message: Sent = wire?.command && typeof wire.command === "object" ? wire.command : wire;
    sent.push(message);
    serverApplies(message);
  }
}

const g = globalThis as any;
g.WebSocket = FakeSocket;

run(async () => {
  const ws = await import("../src/game/ws/sockets");
  const { captureState } = await import("../src/data/live/state");
  const { decorDeleter } = await import("../src/features/deleters/deleters");

  ws.sockets.push(new FakeSocket("wss://magicgarden.gg/room") as unknown as WebSocket);

  // The decor catalog as the 1753 client defines these entries.
  (captureState.data as Record<string, unknown>).decor = {
    ColoredStringLights: {
      name: "Colored String Lights", coinPrice: 8000, creditPrice: 13, rarity: "Common", baseTileScale: 1,
      isOneTimePurchase: false, edgePlacement: { part: "line", sidewaysArt: "ColoredStringLightsSideways" },
    },
    PaperLantern: {
      name: "Paper Lantern", coinPrice: 9000, creditPrice: 13, rarity: "Common", baseTileScale: 1,
      isOneTimePurchase: false, edgePlacement: { part: "hanging", sidewaysArt: "PaperLanternSideways" },
    },
  };

  const toasts = () => store.get(toastsAtom) as Array<{ title?: unknown; description?: unknown; variant?: unknown }>;
  let progress: number[] = [];
  decorDeleter.events.on((event) => {
    if (event.type === "progress") progress.push(event.done);
  });

  async function deleteDecor(decorId: string, label: string, qty: number) {
    sent.length = 0;
    progress = [];
    store.set(toastsAtom, []);
    decorDeleter.setSelection([{ id: decorId, label, qty, fromStorage: 0 }]);
    await decorDeleter.run(0);
    // The deleter does not wait for its toasts to land.
    await new Promise((resolve) => setTimeout(resolve, 20));
    const variants = toasts().map((t) => String(t.variant));
    return {
      sent: sent.slice(),
      success: variants.includes("success"),
      error: variants.includes("error"),
      mostCounted: progress.length ? Math.max(...progress) : 0,
    };
  }

  console.log("--- a tile decor the server accepts ---");
  setStock({ Birdhouse: 10 });
  const tile = await deleteDecor("Birdhouse", "Birdhouse", 3);
  checkEqual("it goes through PlaceDecor on a free dirt tile",
    tile.sent.filter((m) => m.type === "PlaceDecor").map((m) => [m.tileType, m.localTileIndex, m.decorId]),
    [["Dirt", 0, "Birdhouse"], ["Dirt", 0, "Birdhouse"], ["Dirt", 0, "Birdhouse"]]);
  checkEqual("three are really gone from the inventory", quantityOf("Birdhouse"), 7);
  check("the run reports success", tile.success && !tile.error);
  checkEqual("the bar counts all three", tile.mostCounted, 3);

  console.log("\n--- Colored String Lights, an edge decor ---");
  setStock({ ColoredStringLights: 120 });
  const lights = await deleteDecor("ColoredStringLights", "Colored String Lights", 3);
  checkEqual("no PlaceDecor is sent for a decor that goes on an edge",
    lights.sent.filter((m) => m.type === "PlaceDecor" && m.decorId === "ColoredStringLights").length, 0);
  checkEqual("the inventory did not move", quantityOf("ColoredStringLights"), 120);
  check("the run does not claim to have deleted it", !lights.success,
    `toasts ${JSON.stringify(toasts().map((t) => [t.variant, t.description]))}`);
  check("the bar does not count deletions that did not happen", lights.mostCounted < 3,
    `progress went up to ${lights.mostCounted}/3`);
  check("the player is told it failed", lights.error);

  console.log("\n--- Paper Lantern, hung on an edge ---");
  setStock({ PaperLantern: 5 });
  const lantern = await deleteDecor("PaperLantern", "Paper Lantern", 2);
  checkEqual("no PlaceDecor is sent for it either",
    lantern.sent.filter((m) => m.type === "PlaceDecor" && m.decorId === "PaperLantern").length, 0);
  check("the run does not claim to have deleted it", !lantern.success);

  console.log("\n--- a tile decor the server refuses ---");
  setStock({ [REJECTED_DECOR]: 4 });
  const refused = await deleteDecor(REJECTED_DECOR, "Hay Bale", 3);
  checkEqual("the inventory did not move", quantityOf(REJECTED_DECOR), 4);
  check("the run does not claim to have deleted it", !refused.success,
    `toasts ${JSON.stringify(toasts().map((t) => [t.variant, t.description]))}`);
  check("the bar does not count deletions that did not happen", refused.mostCounted < 3,
    `progress went up to ${refused.mostCounted}/3`);
  check("the player is told it failed", refused.error);
});
