// scripts/checkModalState.ts
//
// Since v1342 `activeModalStateAtom` holds `{ modal, openId }` instead of the
// modal name. Every shortcut that opens a game panel (shops, pet hutch, decor
// shed, seed silo, feeding trough, journal, weather station) wrote a bare name
// into it and stopped working, and every read compared an object to a name.
//
// Run with: npm run check:modalstate

import { checkEqual, done } from "./_check";
import { modalNameOf, nextModalState } from "../src/game/modalState";

// v1342 shape
checkEqual("opening a shop bumps openId", nextModalState({ modal: null, openId: 4 }, "seedShop"), { modal: "seedShop", openId: 5 });
checkEqual("switching modal bumps openId", nextModalState({ modal: "inventory", openId: 5 }, "petHutch"), { modal: "petHutch", openId: 6 });
checkEqual("closing keeps the object shape", nextModalState({ modal: "journal", openId: 9 }, null), { modal: null, openId: 10 });
checkEqual("opening the modal already open writes nothing", nextModalState({ modal: "seedShop", openId: 5 }, "seedShop"), undefined);
checkEqual("the name is read from the object", modalNameOf({ modal: "toolShop", openId: 2 }), "toolShop");
checkEqual("no modal open reads as null", modalNameOf({ modal: null, openId: 2 }), null);

// pre-1342 shape, still handled
checkEqual("old shape: opening writes the name", nextModalState(null, "seedShop"), "seedShop");
checkEqual("old shape: closing writes null", nextModalState("journal", null), null);
checkEqual("old shape: the name reads as is", modalNameOf("inventory"), "inventory");

done();
