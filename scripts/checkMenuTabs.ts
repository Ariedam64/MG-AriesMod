// Every tabbed menu reopens on the tab the player last used.
//
// It never did. `restoreActive` read the saved tab from storage and then
// overwrote it with a raw localStorage read of the pre-migration key, which
// `persistActive` deletes, so the answer was always null and the first tab
// opened. Menus that mount before adding their tabs never even reached the
// restore: adding the first tab selected it and saved it over the player's
// choice.
import { checkEqual, done } from "./_check";
import { installFakeDom } from "./_fakeDom";
import { Menu } from "../src/ui/kit/menu";
import { readAriesPath } from "../src/platform/storage";

const { localStorage } = installFakeDom();
const noop = () => {};

/** Builds a menu and reports which tab it ended up showing. */
function open(id: string, tabs: string[], order: "mount-first" | "tabs-first"): { menu: Menu; active: () => string | null } {
  const menu = new Menu({ id, compact: true });
  let active: string | null = null;
  menu.on("tab:change", (tab: string | null) => {
    active = tab;
  });
  const container = document.createElement("div");
  if (order === "mount-first") menu.mount(container);
  for (const tab of tabs) menu.addTab(tab, tab.toUpperCase(), noop);
  if (order === "tabs-first") menu.mount(container);
  return { menu, active: () => active };
}

for (const order of ["mount-first", "tabs-first"] as const) {
  const id = `check-${order}`;
  const first = open(id, ["one", "two", "three"], order);
  checkEqual(`${order}: a new menu opens on its first tab`, first.active(), "one");
  first.menu.switchTo("two");

  const again = open(id, ["one", "two", "three"], order);
  checkEqual(`${order}: reopening shows the tab used last`, again.active(), "two");
  checkEqual(`${order}: the choice is saved in aries_mod`, readAriesPath(`menu.activeTabs.${id}`), "two");
}

// A tab that no longer exists falls back to the first one.
const gone = open("check-gone", ["a", "b"], "mount-first");
gone.menu.switchTo("b");
const shrunk = open("check-gone", ["a", "c"], "mount-first");
checkEqual("a saved tab that is gone falls back to the first", shrunk.active(), "a");

// Players upgrading from a build that kept the tab under a raw key keep it.
localStorage.setItem("menu:check-legacy:activeTab", "y");
const legacy = open("check-legacy", ["x", "y"], "mount-first");
checkEqual("the pre-migration key is honoured once", legacy.active(), "y");
checkEqual("and moved into aries_mod", readAriesPath("menu.activeTabs.check-legacy"), "y");
checkEqual("and removed from raw localStorage", localStorage.getItem("menu:check-legacy:activeTab"), null);

done();
