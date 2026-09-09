// src/ui/menus/companion/plant-modal.ts
// Dessiner un plan de plantation, ouvert depuis le menu des actions.
//
// On choisit une graine ou un œuf dans la palette, on peint les cases où on le
// veut, et on demande. Les cases occupées sont rouges et refusent le clic : le
// jeu n'y accepterait rien, autant le dire tout de suite plutôt que d'envoyer
// une commande vouée à être ignorée.
//
// La palette compte à rebours : on ne peut pas poser plus de cases qu'on n'a
// d'exemplaires. Un plan de quarante carottes quand on en a douze ne veut rien
// dire, et se solderait par un rapport d'échec évitable.
//
// La popup ne plante rien. Elle produit une *demande*, que le chat transforme
// en question à confirmer : l'automatisation n'est pas autorisée sur le mod
// (cf. `chat/proposals.ts`). Le plan n'est pas conservé d'une ouverture à
// l'autre — c'est une demande ponctuelle, pas un réglage.

import type { HarvestRequest } from "../../../services/companion/chat";
import { readPlantScope } from "../../../services/companion/chat/plantRead";
import {
  EMPTY_SCOPE,
  describePlan,
  itemKey,
  stockLeft,
  viablePlan,
  type PlantAssignment,
  type PlantItem,
  type PlantScope,
} from "../../../services/companion/chat/plant";
import { BORDER, TEAL, TEXT_DIM, button, css, sectionLabel } from "../panel-ui";
import { plantItemIcon, plantTile, type PlantTile } from "./plant-chips";
import { plantGrid } from "./plant-grid";
import { openModal } from "./modal";

/** Le jardin bouge tout seul : une case peut se remplir pendant qu'on dessine. */
const REFRESH_MS = 4000;
const STRIP_ICON_PX = 24;

export function openPlantModal(host: HTMLElement, onAsk: (request: HarvestRequest) => void): void {
  let scope: PlantScope = EMPTY_SCOPE;
  /**
   * Le plan, indexé par tuile. L'ordre d'insertion est celui du dessin, et il
   * compte : c'est lui qui départage les cases quand la réserve ne suffit plus.
   */
  let plan = new Map<number, PlantAssignment>();
  let held: PlantItem | null = null;
  /** `scope.tiles` en Set : la grille l'interroge deux cents fois par passe. */
  let owned = new Set<number>();

  /** Palette montée, reconstruite seulement quand la réserve change de composition. */
  let tiles = new Map<string, PlantTile>();
  let paletteSignature = "";
  /** Vignettes du bandeau, réutilisées d'une passe à l'autre pour ne pas clignoter. */
  const stripIcons = new Map<string, HTMLElement>();

  const modal = openModal({
    host,
    title: "What should I plant?",
    widthPx: 700,
    onClose: () => {
      clearInterval(timer);
      grid.destroy();
    },
  });

  /* -------------------------------- Palette ------------------------------- */

  /**
   * Deux réserves, deux rubriques.
   *
   * Une graine et un œuf se posent sur la même case, mais ce ne sont pas les
   * mêmes objets et on ne les cherche pas dans le même état d'esprit. Mêlés
   * dans une seule rangée, les rares œufs se perdaient parmi trente graines.
   * Une rubrique vide disparaît : titrer « Eggs » sous rien n'apprend rien.
   */
  function paletteGroup(title: string): { root: HTMLElement; row: HTMLElement } {
    const root = document.createElement("div");
    css(root, { display: "flex", flexDirection: "column", gap: "6px", flex: "0 0 auto" });
    const row = document.createElement("div");
    css(row, { display: "flex", flexWrap: "wrap", gap: "5px" });
    root.append(sectionLabel(title), row);
    return { root, row };
  }

  const seedGroup = paletteGroup("Seeds");
  const eggGroup = paletteGroup("Eggs");

  const paletteEmpty = document.createElement("div");
  css(paletteEmpty, { fontSize: "12px", color: TEXT_DIM, lineHeight: "1.5" });
  paletteEmpty.textContent = "Nothing to plant. No seeds, no eggs.";

  const hint = document.createElement("div");
  css(hint, { fontSize: "11px", color: TEXT_DIM, lineHeight: "1.5" });
  hint.textContent = "Pick one and draw. Right click erases, red is taken.";

  /* --------------------------------- Grille -------------------------------- */

  const grid = plantGrid({
    owned: () => owned,
    occupied: () => scope.occupied,
    assignmentAt: (tileIndex) => plan.get(tileIndex) ?? null,
    iconFor: (assignment, sizePx) => plantItemIcon(assignment, sizePx),
    onPaint: (tileIndex, mode) => paint(tileIndex, mode),
  });

  /* -------------------------------- Bandeau -------------------------------- */

  const strip = document.createElement("div");
  css(strip, {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    padding: "11px 12px",
    borderRadius: "12px",
    background: "rgba(94,234,212,0.07)",
    border: `1px solid ${BORDER}`,
    flex: "0 0 auto",
  });

  const stripCount = document.createElement("div");
  css(stripCount, { fontSize: "13px", fontWeight: "600", color: TEAL });

  const stripIconRow = document.createElement("div");
  css(stripIconRow, { display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" });

  strip.append(stripCount, stripIconRow);

  /* --------------------------------- Pied ---------------------------------- */

  const clearButton = button("Clear", "neutral", () => {
    plan = new Map();
    render();
  });

  const askButton = button("Ask to plant these", "accent", () => {
    const drawn = [...plan.values()];
    onAsk({
      kind: "plant",
      label: describePlan(drawn),
      // Rappelé à la confirmation : c'est ce qui détecte qu'une case s'est
      // remplie ou qu'une graine est partie ailleurs entre-temps. Le plan
      // dessiné ne bouge pas ; c'est le jardin qu'on relit.
      provider: async () => viablePlan(drawn, await readPlantScope()),
    });
    modal.close();
  });
  css(askButton, { marginLeft: "auto" });

  modal.body.append(seedGroup.root, eggGroup.root, paletteEmpty, hint, grid.root, strip);
  modal.footer.append(clearButton, askButton);

  /* -------------------------------- Dessin --------------------------------- */

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
    // Repeindre par-dessus une autre sorte rend son exemplaire à la réserve :
    // on compte donc après retrait, pas avant.
    if (current) plan.delete(tileIndex);
    if (remainingFor(held) <= 0) {
      if (current) plan.set(tileIndex, current);
      return;
    }

    plan.set(tileIndex, { tileIndex, kind: held.kind, id: held.id, name: held.name });
    render();
  }

  /* --------------------------------- Rendu --------------------------------- */

  /** Reconstruit la palette quand la réserve change de composition, pas de compte. */
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

    // La sorte tenue en main a pu disparaître de la réserve entre deux lectures.
    if (held && !tiles.has(itemKey(held))) held = null;
    if (!held) held = scope.items[0] ?? null;
  }

  function renderStrip(): void {
    const drawn = [...plan.values()];
    stripCount.textContent =
      drawn.length === 0 ? "Nothing to plant yet" : `${drawn.length} tile${drawn.length === 1 ? "" : "s"}`;

    stripIconRow.replaceChildren();
    stripIconRow.style.display = drawn.length === 0 ? "none" : "flex";

    const counts = new Map<string, { item: PlantAssignment; count: number }>();
    for (const assignment of drawn) {
      const key = itemKey(assignment);
      const known = counts.get(key);
      if (known) known.count++;
      else counts.set(key, { item: assignment, count: 1 });
    }

    for (const [key, entry] of [...counts.entries()].sort((a, b) => b[1].count - a[1].count)) {
      let icon = stripIcons.get(key);
      if (!icon) {
        icon = plantItemIcon(entry.item, STRIP_ICON_PX);
        stripIcons.set(key, icon);
      }
      const pair = document.createElement("div");
      pair.title = entry.item.name;
      css(pair, { display: "flex", alignItems: "center", gap: "3px" });
      const tally = document.createElement("span");
      css(tally, { fontSize: "11px", color: TEXT_DIM });
      tally.textContent = String(entry.count);
      pair.append(icon, tally);
      stripIconRow.append(pair);
    }
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
    for (const group of [seedGroup, eggGroup]) {
      group.root.style.display = group.row.childElementCount > 0 ? "flex" : "none";
    }
    paletteEmpty.style.display = hasItems ? "none" : "";
    hint.style.display = hasItems ? "" : "none";
    grid.root.style.display = hasItems ? "grid" : "none";

    grid.update();
    renderStrip();
    askButton.disabled = plan.size === 0;
  }

  async function refresh(): Promise<void> {
    if (!modal.isOpen()) return;
    scope = await readPlantScope().catch(() => EMPTY_SCOPE);
    if (!modal.isOpen()) return;
    owned = new Set(scope.tiles);

    // Une case peinte qui vient d'être occupée, ou une graine partie ailleurs :
    // le dessin perd la case plutôt que de promettre ce qui n'est plus possible.
    plan = new Map(viablePlan([...plan.values()], scope).map((entry) => [entry.tileIndex, entry]));
    render();
  }

  const timer = window.setInterval(() => void refresh(), REFRESH_MS);
  render();
  void refresh();
}
