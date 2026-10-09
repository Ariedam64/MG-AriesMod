// What the preview page renders: the kit's real components in the theme, over
// a stand-in for the garden. Built by scripts/kitPreview.mjs; never shipped.
import { button } from "../src/ui/kit/button";
import { card, plainCard, sectionLabel } from "../src/ui/kit/card";
import { badge, pill } from "../src/ui/kit/badges";
import { h } from "../src/ui/kit/dom";
import { numberInput, select, textInput } from "../src/ui/kit/fields";
import { settingRow } from "../src/ui/kit/layout";
import { Menu } from "../src/ui/kit/menu";
import { segmented } from "../src/ui/kit/segmented";
import { rangeDual, slider } from "../src/ui/kit/sliders";
import { switchInput } from "../src/ui/kit/toggles";
import { VTabs } from "../src/ui/kit/vtabs";

function windowFrame(title: string, left: number, top: number, width: number): HTMLElement {
  const win = h("div", "qws-win");
  win.style.left = `${left}px`;
  win.style.top = `${top}px`;
  win.style.width = `${width}px`;
  const head = h("div", "w-head");
  const close = button("✕", { size: "xs" });
  close.classList.add("w-btn");
  head.append(h("div", "w-title", title), h("div", "qmm-spacer"), close);
  const body = h("div", "w-body");
  win.append(head, body);
  document.body.appendChild(win);
  return body;
}

function petsMenu(body: HTMLElement): void {
  const menu = new Menu({ id: "preview-pets" });
  menu.addTab("manager", "Manager", (root) => {
    const list = plainCard();
    list.append(sectionLabel("Teams"));
    for (const [name, sub, active] of [["Harvest crew", "Equipped · Alt+1", true], ["Gold hunters", "Alt+2", false]] as const) {
      const c = card(name, { tone: active ? "accent" : "default" });
      c.body.append(h("div", undefined, sub), active ? pill("In use", "ok") : button("Use team", { variant: "primary", size: "sm" }));
      list.append(c.root);
    }
    root.append(
      list,
      settingRow("Sync teams with the game", "Teams follow the ones you equip in game.", switchInput(true)).row,
      settingRow("Feed below hunger", null, slider(0, 100, 1, 40, { fill: true })).row,
    );
  });
  menu.addTab("builder", "Team Builder", (root) => root.append(h("div", undefined, "Team Builder")));
  menu.addTab("feeding", "Feeding", (root) => root.append(h("div", undefined, "Feeding")));
  menu.addTab("hatch", "Hatch", (root) => root.append(h("div", undefined, "Hatch")));
  menu.mount(body);
}

function controlsMenu(body: HTMLElement): void {
  const row = (...els: HTMLElement[]) => {
    const r = h("div", "qmm-flex");
    r.append(...els);
    return r;
  };
  const kinds = select();
  for (const label of ["Seeds", "Eggs", "Tools"]) kinds.append(new Option(label, label));
  const tabs = new VTabs({ emptyText: "No items." });
  tabs.setItems([
    { id: "carrot", title: "Carrot", subtitle: "Common" },
    { id: "bamboo", title: "Bamboo", subtitle: "Rare", badge: "3" },
    { id: "lily", title: "Lily", subtitle: "Mythic" },
  ]);
  tabs.select("bamboo");
  body.append(
    sectionLabel("Buttons"),
    row(button("Primary", { variant: "primary" }), button("Secondary"), button("Danger", { variant: "danger" }), button("Ghost", { variant: "ghost" })),
    sectionLabel("Fields"),
    row(textInput("Search…"), numberInput(0, 100, 1, 12).wrap, kinds),
    sectionLabel("Toggles and ranges"),
    row(switchInput(false), switchInput(true), slider(0, 100, 1, 65), rangeDual(50, 100, 1, 60, 90).root),
    sectionLabel("Segmented, pills"),
    row(segmented([{ value: "one", label: "One-shot" }, { value: "loop", label: "Loop" }], "loop"), pill("Ready", "ok"), pill("Soon", "warn"), pill("Error", "bad"), badge("New", "ok")),
    sectionLabel("List"),
    tabs.root,
  );
}

petsMenu(windowFrame("Pets", 110, 40, 560));
controlsMenu(windowFrame("Kit", 700, 40, 520));
