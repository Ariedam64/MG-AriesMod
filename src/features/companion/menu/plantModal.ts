// Drawing a planting plan, opened from the actions menu.
//
// Pick a seed or an egg from the palette, paint the tiles where it should go,
// and ask. Taken tiles are red and refuse the click: the game would accept
// nothing there, so it is said at once rather than sending a command bound to
// be ignored.
//
// The palette counts down: no more tiles than copies in stock. A plan of forty
// carrots with twelve in the bag means nothing and would end in an avoidable
// failure report.
//
// The popup plants nothing. It makes a *request*, which the chat turns into a
// question to confirm (see `chat/proposals.ts`). The plan is not kept from one
// opening to the next: it is a one-off request, not a setting.

import { button } from "../../../ui/kit/button";
import { plainCard, sectionLabel } from "../../../ui/kit/card";
import type { ChatRequest } from "../chat";
import { plantRequest } from "../chat/commands/plant";
import {
  EMPTY_SCOPE,
  countByItem,
  describePlan,
  itemKey,
  stockLeft,
  viablePlan,
  type PlantAssignment,
  type PlantItem,
  type PlantScope,
} from "../chat/plant";
import { readPlantScope } from "../chat/plantRead";
import { openCompanionModal, part } from "./dom";
import { tileRow } from "./harvestChips";
import { countedIcon, resultBox } from "./harvestFields";
import { plantItemIcon, plantTile, type PlantTile } from "./plantChips";
import { plantGrid } from "./plantGrid";

/** The garden moves on its own: a tile can fill up while the plan is drawn. */
const REFRESH_MS = 4000;
const STRIP_ICON_PX = 24;

/**
 * Two stocks, two sections.
 *
 * A seed and an egg go on the same tile, but they are not the same objects and
 * are not looked for in the same frame of mind. Mixed in one row, the few eggs
 * got lost among thirty seeds. An empty section hides: "Eggs" over nothing
 * says nothing.
 */
function paletteGroup(title: string): { root: HTMLElement; row: HTMLElement } {
  const root = part("div", "qws-cmp-palette");
  const row = tileRow();
  root.append(sectionLabel(title), row);
  return { root, row };
}

export function openPlantModal(host: HTMLElement, onAsk: (request: ChatRequest) => void): void {
  let scope: PlantScope = EMPTY_SCOPE;
  /**
   * The plan, by tile. Insertion order is drawing order, and it matters: it
   * breaks ties when the stock runs short.
   */
  let plan = new Map<number, PlantAssignment>();
  let held: PlantItem | null = null;
  /** `scope.tiles` as a Set: the grid asks it two hundred times per pass. */
  let owned = new Set<number>();

  /** The palette, rebuilt only when the stock changes make-up. */
  let tiles = new Map<string, PlantTile>();
  let paletteSignature = "";
  /** The strip's thumbnails, reused from one pass to the next so they do not flicker. */
  const stripIcons = new Map<string, HTMLElement>();

  const modal = openCompanionModal({
    host,
    title: "What should I plant?",
    widthPx: 700,
    onClose: () => {
      clearInterval(timer);
      grid.destroy();
    },
  });

  const seedGroup = paletteGroup("Seeds");
  const eggGroup = paletteGroup("Eggs");

  const paletteEmpty = part("div", "qws-cmp-empty", "Nothing to plant. No seeds, no eggs.");
  const hint = part("div", "qws-cmp-hint", "Pick one and draw. Right click erases, red is taken.");
  // Seeds and eggs are one choice, so they share one card.
  const palette = plainCard();
  palette.append(seedGroup.root, eggGroup.root, hint);

  const grid = plantGrid({
    owned: () => owned,
    occupied: () => scope.occupied,
    assignmentAt: (tileIndex) => plan.get(tileIndex) ?? null,
    iconFor: (assignment, sizePx) => plantItemIcon(assignment, sizePx),
    onPaint: (tileIndex, mode) => paint(tileIndex, mode),
  });

  const strip = resultBox();
  const stripIconRow = part("div", "qws-cmp-result__icons");
  strip.root.append(stripIconRow);

  const clearButton = button("Clear", {
    size: "sm",
    onClick: () => {
      plan = new Map();
      render();
    },
  });

  const askButton = button("Ask to plant these", {
    size: "sm",
    variant: "primary",
    onClick: () => {
      const drawn = [...plan.values()];
      // The drawn plan stays put; the garden is read again at confirmation to
      // notice a tile that filled up or a seed spent elsewhere.
      onAsk(plantRequest(describePlan(drawn), async () => viablePlan(drawn, await readPlantScope())));
      modal.close();
    },
  });
  askButton.classList.add("qws-cmp-foot-end");

  modal.body.append(palette, paletteEmpty, grid.root, strip.root);
  modal.footer.append(clearButton, askButton);

  /* --------------------------------- drawing -------------------------------- */

  function remainingFor(item: { kind: PlantItem["kind"]; id: string }): number {
    return stockLeft([...plan.values()], scope.items).get(itemKey(item)) ?? 0;
  }

  function paint(tileIndex: number, mode: "assign" | "erase"): void {
    if (mode === "erase") {
      if (plan.delete(tileIndex)) render();
      return;
    }
    if (!held) return;
    if (!owned.has(tileIndex) || scope.occupied.has(tileIndex)) return;

    const current = plan.get(tileIndex);
    if (current && itemKey(current) === itemKey(held)) return;
    // Painting over another kind gives its copy back to the stock: count
    // after removing it, not before.
    if (current) plan.delete(tileIndex);
    if (remainingFor(held) <= 0) {
      if (current) plan.set(tileIndex, current);
      return;
    }

    plan.set(tileIndex, { tileIndex, kind: held.kind, id: held.id, name: held.name });
    render();
  }

  /* --------------------------------- render --------------------------------- */

  /** Rebuilds the palette when the stock changes make-up, not count. */
  function syncPalette(): void {
    const signature = scope.items.map(itemKey).join("|");
    if (signature === paletteSignature) return;
    paletteSignature = signature;

    tiles = new Map();
    seedGroup.row.replaceChildren();
    eggGroup.row.replaceChildren();
    for (const item of scope.items) {
      const tile = plantTile(item, () => {
        held = item;
        render();
      });
      tiles.set(itemKey(item), tile);
      (item.kind === "egg" ? eggGroup : seedGroup).row.append(tile.el);
    }

    // The kind in hand may have left the stock between two reads.
    if (held && !tiles.has(itemKey(held))) held = null;
    if (!held) held = scope.items[0] ?? null;
  }

  function renderStrip(): void {
    const drawn = [...plan.values()];
    strip.headline.textContent = drawn.length === 0 ? "Nothing to plant yet" : `${drawn.length} tile${drawn.length === 1 ? "" : "s"}`;
    stripIconRow.hidden = drawn.length === 0;

    stripIconRow.replaceChildren(
      ...countByItem(drawn).map((entry) => {
        const key = itemKey(entry);
        let icon = stripIcons.get(key);
        if (!icon) {
          icon = plantItemIcon(entry, STRIP_ICON_PX);
          stripIcons.set(key, icon);
        }
        return countedIcon(icon, entry.name, entry.count);
      }),
    );
  }

  function render(): void {
    if (!modal.isOpen()) return;

    syncPalette();
    const left = stockLeft([...plan.values()], scope.items);
    for (const item of scope.items) {
      const key = itemKey(item);
      tiles.get(key)?.update(left.get(key) ?? 0, held !== null && itemKey(held) === key);
    }

    const hasItems = scope.items.length > 0;
    for (const group of [seedGroup, eggGroup]) group.root.hidden = group.row.childElementCount === 0;
    palette.hidden = !hasItems;
    paletteEmpty.hidden = hasItems;
    grid.root.hidden = !hasItems;

    grid.update();
    renderStrip();
    askButton.setEnabled(plan.size > 0);
  }

  async function refresh(): Promise<void> {
    if (!modal.isOpen()) return;
    scope = await readPlantScope().catch(() => EMPTY_SCOPE);
    if (!modal.isOpen()) return;
    owned = new Set(scope.tiles);

    // A painted tile just taken, or a seed gone elsewhere: the drawing loses
    // the tile rather than promise what is no longer possible.
    plan = new Map(viablePlan([...plan.values()], scope).map((entry) => [entry.tileIndex, entry]));
    render();
  }

  const timer = window.setInterval(() => void refresh(), REFRESH_MS);
  render();
  void refresh();
}
