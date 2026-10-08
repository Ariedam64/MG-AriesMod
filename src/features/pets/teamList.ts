// The left column of the Manager tab: the sync switch, the team list (drag a
// team by its handle to reorder), and the New and Delete buttons.

import { button } from "../../ui/kit/button";
import { flexRow } from "../../ui/kit/layout";
import { color } from "../../ui/kit/theme";
import { switchInput } from "../../ui/kit/toggles";
import type { InventoryPet } from "./inventoryPets";
import { petIcon } from "./petIcon";
import type { PetTeam } from "./teamStore";

const ACTIVE_DOT = "#48d170";
const INACTIVE_DOT = "#64748b";
/** Within this distance of the list's edge, a drag scrolls the list. */
const AUTOSCROLL_EDGE_PX = 28;
const AUTOSCROLL_STEP_PX = 18;
const MINI_ICON_PX = 18;

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
  onDelete(): void;
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
  const root = document.createElement("div");
  Object.assign(root.style, { display: "grid", gridTemplateRows: "auto 1fr auto", gap: "8px", minHeight: "0" });

  const syncRow = document.createElement("label");
  // The padding lines the switch up with the team rows (1px border + 6px padding).
  Object.assign(syncRow.style, { display: "flex", alignItems: "center", gap: "8px", padding: "2px 7px", cursor: "pointer" });
  const syncSwitch = switchInput(handlers.isSyncEnabled(), (on) => handlers.setSyncEnabled(on));
  syncSwitch.style.flexShrink = "0";
  const syncLabel = document.createElement("span");
  syncLabel.textContent = "Sync teams with the game";
  syncLabel.style.fontSize = "13px";
  syncRow.append(syncSwitch, syncLabel);

  const list = document.createElement("div");
  Object.assign(list.style, {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    overflow: "auto",
    padding: "6px",
    border: `1px solid ${color.border}`,
    borderRadius: "10px",
    background: color.cardBg,
    scrollBehavior: "smooth",
    minHeight: "0",
  });

  const footer = flexRow({ gap: 6 });
  const btnNew = button("➕ New", { variant: "primary", size: "sm", fullWidth: true, onClick: handlers.onCreate });
  const btnDelete = button("🗑️ Delete", { variant: "danger", size: "sm", fullWidth: true, onClick: handlers.onDelete });
  btnNew.style.flex = btnDelete.style.flex = "1 1 0";
  footer.append(btnNew, btnDelete);

  root.append(syncRow, list, footer);

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
    row.dataset.index = String(index);
    row.dataset.teamId = team.id;
    Object.assign(row.style, {
      height: "36px",
      padding: "0 10px",
      borderRadius: "8px",
      cursor: "pointer",
      fontSize: "13px",
      overflow: "hidden",
      whiteSpace: "nowrap",
      display: "flex",
      flex: "0 0 auto",
      gap: "8px",
      alignItems: "center",
      transition: "background 120ms ease, border-color 120ms ease",
      border: `1px solid ${selected ? color.accentBorderHover : color.border}`,
      background: selected ? color.accentSoft : color.cardBg,
    });

    const dot = document.createElement("span");
    Object.assign(dot.style, {
      width: "10px",
      height: "10px",
      borderRadius: "50%",
      flex: "0 0 auto",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.4) inset",
      background: active ? ACTIVE_DOT : INACTIVE_DOT,
    });
    dot.title = active ? "This team is currently active" : "Inactive team";

    const label = document.createElement("span");
    label.textContent = team.name || "(unnamed)";
    Object.assign(label.style, { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: "1 1 0" });

    const minis = document.createElement("div");
    Object.assign(minis.style, { display: "flex", gap: "4px", alignItems: "center", marginLeft: "auto" });
    for (let i = 0; i < 3; i++) {
      const id = team.slots[i];
      minis.appendChild(petIcon(id ? view.pets.get(String(id)) ?? null : null, MINI_ICON_PX));
    }

    const grab = grabHandle();
    row.append(dot, label, minis, grab);

    row.onmouseenter = () => { if (!selected) row.style.borderColor = color.accentBorder; };
    row.onmouseleave = () => { if (!selected) row.style.borderColor = color.border; };
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
      empty.textContent = "No teams yet. Create one!";
      Object.assign(empty.style, { opacity: "0.75", textAlign: "center", padding: "8px" });
      list.appendChild(empty);
      return;
    }
    teams.forEach((team, index) => list.appendChild(teamRow(team, index, view)));
  }

  return { root, render };
}
