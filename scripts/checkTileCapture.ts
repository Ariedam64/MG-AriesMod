// Mirrors how build 1206 registers the tile system, so the editor's capture is
// checked against the game's real shape rather than the one it used to have.
//
// The game's scope does, in `addSystem`:
//   systems.set(system.name, { system, enabled })
// and the tile system is `{ name: "tileObject", tileViews, getOrCreateTileView }`.
// Crucially the scope has no `start`, no `destroy` and nothing calls `.bind()`
// on it, which is exactly what the old capture waited for.
import { checkEqual, done } from "./_check";
import { tos } from "../src/game/pixi/tileObjects";

const COLS = 40;
const ROWS = 30;

type FakeTileView = { tileObject: any; onDataChanged(next: any): void; update(ctx: any): void };

function makeTileSystem() {
  const tileViews = new Map<number, FakeTileView>();
  return {
    name: "tileObject",
    tileViews,
    map: { cols: COLS, rows: ROWS },
    worldContainer: { destroyed: false, toLocal: (p: any) => p },
    getOrCreateTileView(gidx: number) {
      let view = tileViews.get(gidx);
      if (!view) {
        view = {
          tileObject: null,
          onDataChanged(next: any) { this.tileObject = next; },
          update() {},
        };
        tileViews.set(gidx, view);
      }
      return view;
    },
  };
}

/** The 1206 scope: a systems Map and addSystem, no start/destroy, no app. */
function makeScope() {
  const systems = new Map<string, { system: any; enabled: boolean }>();
  return {
    systems,
    lifetime: { signal: {} },
    addSystem(system: any) { systems.set(system.name, { system, enabled: true }); },
  };
}

const pristineMapSet = Map.prototype.set;

// --- before the world builds -------------------------------------------------
checkEqual("not ready before the world builds", tos.init().ok, false);
checkEqual("capture is armed", Map.prototype.set !== pristineMapSet, true);

// The shape the old predicate insisted on is gone: registering the system on a
// scope with no start/destroy/app has to be enough.
const scope = makeScope();
checkEqual("scope has no start", typeof (scope as any).start, "undefined");
checkEqual("scope has no destroy", typeof (scope as any).destroy, "undefined");
checkEqual("scope has no app", typeof (scope as any).app, "undefined");

// --- the world builds --------------------------------------------------------
const system = makeTileSystem();
scope.addSystem({ name: "touchInput" });      // a decoy registered first
scope.addSystem(system);
scope.addSystem({ name: "avatar" });

checkEqual("captured on registration", tos.isReady(), true);
checkEqual("captured the system itself", tos.getStatus().tos === system, true);
checkEqual("capture disarmed itself", Map.prototype.set === pristineMapSet, true);
checkEqual("no engine needed", tos.getStatus().engine, null);
checkEqual("no render context on this build", tos.getRenderContext(), null);

// --- the editor's three broken actions --------------------------------------
const gidx = (tx: number, ty: number) => ty * COLS + tx;

const placed = tos.setTileEmpty(3, 4, { forceUpdate: false });
checkEqual("place/clear resolves the right tile", placed.gidx, gidx(3, 4));
checkEqual("place/clear reports success", placed.ok, true);

system.getOrCreateTileView(gidx(5, 6)).tileObject = {
  objectType: "decor",
  species: "WindSpinner",
  rotation: 0,
};
tos.setTileDecor(5, 6, { rotation: 90 }, { forceUpdate: false });
checkEqual("decor edit lands on the tile", system.tileViews.get(gidx(5, 6))?.tileObject.rotation, 90);

system.getOrCreateTileView(gidx(7, 8)).tileObject = {
  objectType: "plant",
  species: "Aloe",
  slots: [{ slotId: 1, size: 50 }],
};
tos.setTilePlant(7, 8, { slotIdx: 0, slotPatch: { size: 97 } }, { forceUpdate: false });
checkEqual("plant edit lands on the slot", system.tileViews.get(gidx(7, 8))?.tileObject.slots[0].size, 97);

tos.setTileEmpty(7, 8, { forceUpdate: false });
checkEqual("removing a plant empties the tile", system.tileViews.get(gidx(7, 8))?.tileObject, null);

// --- travelling to another village ------------------------------------------
system.worldContainer.destroyed = true;
checkEqual("a disposed world is not ready", tos.isReady(), false);
checkEqual("capture re-arms after a rebuild", Map.prototype.set !== pristineMapSet, true);

const rebuilt = makeTileSystem();
makeScope().addSystem(rebuilt);
checkEqual("captures the rebuilt system", tos.getStatus().tos === rebuilt, true);
checkEqual("ready again", tos.isReady(), true);

// --- someone else wrapped Map.set in the meantime ----------------------------
rebuilt.worldContainer.destroyed = true;
tos.isReady();                               // re-arms
const ours = Map.prototype.set;
const theirs = function (this: any, k: any, v: any) { return ours.call(this, k, v); };
Map.prototype.set = theirs as any;
makeScope().addSystem(makeTileSystem());
checkEqual("leaves a later patch alone", Map.prototype.set === theirs, true);
Map.prototype.set = pristineMapSet;

done();
