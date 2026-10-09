// The left column of the Teams tab: the team list (drag a team by its handle
// to reorder), the New team button, and the sync switch.

import { button } from "../../ui/kit/button";
import { sectionLabel } from "../../ui/kit/card";
import { switchInput } from "../../ui/kit/toggles";
import type { InventoryPet } from "./inventoryPets";
import { petIcon } from "./petIcon";
import { ensurePetsStyles } from "./styles";
import type { PetTeam } from "./teamStore";

/** Within this distance of the list's edge, a drag scrolls the list. */
const AUTOSCROLL_EDGE_PX = 28;
const AUTOSCROLL_STEP_PX = 18;
const MINI_ICON_PX = 20;

type TeamListView = {
  teams: PetTeam[];
  selectedId: string | null;
  activeTeamId: string | null;
  pets: Map<string, InventoryPet>;
};

export type TeamListHandlers = {
  onSelect(teamId: string): void;
  /** Called with the full new order after a drop that moved a team. */
  onReorder(teamIds: string[]): void;
  onCreate(): void;
  isSyncEnabled(): boolean;
  setSyncEnabled(on: boolean): void;
};

export type TeamList = { root: HTMLElement; render(view: TeamListView): void };

function grabHandle(): HTMLElement {
  const grab = document.createElement("span");
  grab.className = "qmm-grab";
  grab.title = "Drag to reorder";
  grab.setAttribute("aria-label", "Drag to reorder");
  for (let i = 0; i < 6; i += 1) {
    const dot = document.createElement("span");
    dot.className = "qmm-grab-dot";
    grab.appendChild(dot);
  }
  grab.draggable = true;
  return grab;
}

export function createTeamList(handlers: TeamListHandlers): TeamList {
  ensurePetsStyles();
  const root = document.createElement("div");
  root.className = "pt-teams";

  const head = document.createElement("div");
  head.className = "pt-teams__head";
  const btnNew = button("New team", { icon: "+", size: "sm", onClick: handlers.onCreate });
  head.append(sectionLabel("Your teams"), btnNew);

  const list = document.createElement("div");
  list.className = "pt-teams__rows";

  const syncRow = document.createElement("label");
  syncRow.className = "pt-sync";
  syncRow.title = "Keeps these teams and the game's own pet teams the same.";
  const syncSwitch = switchInput(handlers.isSyncEnabled(), (on) => handlers.setSyncEnabled(on));
  syncRow.append(syncSwitch, document.createTextNode("Sync with the game"));

  root.append(head, list, syncRow);

  /* ------------------------------ drag and drop ----------------------------- */

  let teams: PetTeam[] = [];
  let draggingIndex: number | null = null;
  let insertIndex: number | null = null;
  let draggingHeight = 0;

  const rows = () => Array.from(list.children) as HTMLElement[];

  /** Where a drop at this height would land, between rows. */
  function insertIndexAt(clientY: number): number {
    const children = rows();
    for (let i = 0; i < children.length; i++) {
      const rect = children[i].getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return i;
    }
    return children.length;
  }

  /** Slides the rows between the dragged one and the drop point to show where it will land. */
  function showDropPreview(): void {
    const children = rows();
    children.forEach((el) => (el.style.transform = ""));
    if (draggingIndex === null || insertIndex === null) return;
    const from = draggingIndex;
    const to = insertIndex;
    children.forEach((el, i) => {
      el.style.transition = "transform 120ms ease";
      if (i === from) return;
      if (to > from && i > from && i < to) el.style.transform = `translateY(${-draggingHeight}px)`;
      if (to < from && i >= to && i < from) el.style.transform = `translateY(${draggingHeight}px)`;
    });
  }

  function resetDrag(): void {
    for (const el of rows()) {
      el.style.transform = "";
      el.style.transition = "";
    }
    draggingIndex = null;
    insertIndex = null;
    draggingHeight = 0;
  }

  function trackDrag(ev: DragEvent, nextInsertIndex: number): void {
    ev.preventDefault();
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
    if (draggingIndex === null) return;
    const clamped = Math.max(0, Math.min(teams.length, nextInsertIndex));
    if (insertIndex !== clamped) {
      insertIndex = clamped;
      showDropPreview();
    }
    const bounds = list.getBoundingClientRect();
    if (ev.clientY < bounds.top + AUTOSCROLL_EDGE_PX) list.scrollTop -= AUTOSCROLL_STEP_PX;
    else if (ev.clientY > bounds.bottom - AUTOSCROLL_EDGE_PX) list.scrollTop += AUTOSCROLL_STEP_PX;
  }

  function drop(ev: DragEvent): void {
    ev.preventDefault();
    if (draggingIndex === null) return;
    let target = insertIndex ?? insertIndexAt(ev.clientY);
    if (target > draggingIndex) target -= 1;
    target = Math.max(0, Math.min(teams.length - 1, target));
    const from = draggingIndex;
    resetDrag();
    if (target === from) return;
    const order = teams.map((t) => t.id);
    const [moved] = order.splice(from, 1);
    order.splice(target, 0, moved);
    handlers.onReorder(order);
  }

  // Dropping in the gaps between rows works too.
  list.addEventListener("dragover", (ev) => trackDrag(ev, insertIndexAt(ev.clientY)));
  list.addEventListener("drop", drop);

  /* --------------------------------- rows --------------------------------- */

  function teamRow(team: PetTeam, index: number, view: TeamListView): HTMLElement {
    const selected = team.id === view.selectedId;
    const active = team.id === view.activeTeamId;

    const row = document.createElement("div");
    row.className = selected ? "pt-team is-selected" : "pt-team";
    row.dataset.index = String(index);
    row.dataset.teamId = team.id;

    const dot = document.createElement("span");
    dot.className = active ? "pt-team__dot is-active" : "pt-team__dot";
    dot.title = active ? "This team is currently active" : "Inactive team";

    const label = document.createElement("span");
    label.className = "pt-team__name";
    label.textContent = team.name || "(unnamed)";

    const minis = document.createElement("div");
    minis.className = "pt-team__pets";
    for (let i = 0; i < 3; i++) {
      const id = team.slots[i];
      minis.appendChild(petIcon(id ? view.pets.get(String(id)) ?? null : null, MINI_ICON_PX));
    }

    const grab = grabHandle();
    row.append(dot, label, minis, grab);
    row.onclick = () => handlers.onSelect(team.id);

    grab.addEventListener("dragstart", (ev) => {
      draggingIndex = index;
      draggingHeight = row.getBoundingClientRect().height;
      row.classList.add("qmm-dragging");
      ev.dataTransfer?.setData("text/plain", String(index));
      if (ev.dataTransfer) ev.dataTransfer.effectAllowed = "move";
      try {
        // The whole row as the drag image, not just the handle.
        const ghost = row.cloneNode(true) as HTMLElement;
        Object.assign(ghost.style, { width: `${row.getBoundingClientRect().width}px`, position: "absolute", top: "-9999px" });
        document.body.appendChild(ghost);
        ev.dataTransfer!.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
        setTimeout(() => ghost.remove(), 0);
      } catch {}
    });
    grab.addEventListener("dragend", () => {
      row.classList.remove("qmm-dragging");
      resetDrag();
    });

    row.addEventListener("dragover", (ev) => {
      const bounds = row.getBoundingClientRect();
      trackDrag(ev, ev.clientY < bounds.top + bounds.height / 2 ? index : index + 1);
    });
    row.addEventListener("drop", (ev) => {
      ev.stopPropagation();
      drop(ev);
    });
    return row;
  }

  function render(view: TeamListView): void {
    teams = view.teams;
    resetDrag();
    list.replaceChildren();
    if (!teams.length) {
      const empty = document.createElement("div");
      empty.className = "pt-empty";
      empty.textContent = "No teams yet. Make one with New team above.";
      list.appendChild(empty);
      return;
    }
    teams.forEach((team, index) => list.appendChild(teamRow(team, index, view)));
  }

  return { root, render };
}
