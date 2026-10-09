// The right column of the Manager tab: the selected team's name, its three
// pet slots, and what the team is worth.

import { getPetMaxStrength, getPetStrength } from "../../data/rules/petValue";
import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { textInput } from "../../ui/kit/fields";
import { flexRow } from "../../ui/kit/layout";
import { color } from "../../ui/kit/theme";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import { abilityDots } from "./abilityChips";
import type { InventoryPet } from "./inventoryPets";
import { PetsService } from "./pets";
import { petTeamName } from "./teamReconcile";
import { renderTeamStats } from "./teamStatsView";
import type { PetTeam } from "./teamStore";

const SLOT_ICON_PX = 40;
const SLOT_BUTTON_PX = 34;
const MAX_STRENGTH_COLOR = color.gold;

export type TeamEditorHandlers = {
  /** The team the editor shows, read fresh at each action. */
  selectedTeam(): PetTeam | null;
  /** The name changed: the team list should show it. */
  onRenamed(): void;
  /** "Use this team" was pressed. */
  onUseTeam(team: PetTeam): Promise<void>;
  /** Hides or shows the window while the game's inventory is open for a pick. */
  setWindowVisible(visible: boolean): void;
};

export type TeamEditor = {
  root: HTMLElement;
  /** Shows a team, or the empty state for null. */
  show(team: PetTeam | null): Promise<void>;
  /** Redraws the slots and stats from the latest pet data. */
  repaint(team: PetTeam | null): Promise<void>;
};

function framed(title: string, content: HTMLElement): HTMLElement {
  const section = card(title, { tone: "muted", align: "center" });
  section.body.append(content);
  section.root.style.maxWidth = "720px";
  return section.root;
}

const emptyPet = (id: string): InventoryPet => ({
  id, itemType: "Pet", petSpecies: "", name: null, xp: 0, hunger: 0, mutations: [], abilities: [],
});

type SlotRow = { root: HTMLElement; update(pet: InventoryPet | null): void };

function slotRow(onChoose: () => Promise<void>, onClear: () => Promise<void>): SlotRow {
  const root = document.createElement("div");
  Object.assign(root.style, {
    display: "grid",
    gridTemplateColumns: `${SLOT_ICON_PX}px minmax(0,1fr) ${SLOT_BUTTON_PX}px ${SLOT_BUTTON_PX}px`,
    alignItems: "center",
    gap: "8px",
    width: "min(560px, 100%)",
    border: `1px solid ${color.border}`,
    borderRadius: "10px",
    padding: "8px 10px",
    background: color.cardBg,
  });

  // The sprite, with the strength badge under it.
  const iconColumn = document.createElement("div");
  Object.assign(iconColumn.style, { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flexShrink: "0" });
  const iconWrap = document.createElement("div");
  Object.assign(iconWrap.style, {
    width: `${SLOT_ICON_PX}px`,
    height: `${SLOT_ICON_PX}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  const strengthBadge = document.createElement("div");
  Object.assign(strengthBadge.style, {
    fontSize: "9px",
    fontWeight: "700",
    lineHeight: "1",
    padding: "1px 4px",
    borderRadius: "4px",
    background: color.bark,
    color: color.paper,
    whiteSpace: "nowrap",
    display: "none",
    pointerEvents: "none",
  });
  iconColumn.append(iconWrap, strengthBadge);

  const pawFallback = () => {
    const paw = document.createElement("span");
    paw.textContent = "🐾";
    paw.style.fontSize = `${SLOT_ICON_PX - 6}px`;
    paw.setAttribute("aria-hidden", "true");
    iconWrap.replaceChildren(paw);
  };

  const setIcon = (species: string, mutations: string[]) => {
    if (!species) {
      iconWrap.dataset.iconKey = "";
      pawFallback();
      return;
    }
    const key = `${species}|${mutations.join(",")}`;
    if (iconWrap.dataset.iconKey === key && iconWrap.querySelector("img")) return;
    iconWrap.dataset.iconKey = key;
    attachSpriteIcon(iconWrap, ["pet"], species, SLOT_ICON_PX, "pet-slot", { mutations, onNoSpriteFound: pawFallback });
  };

  const text = document.createElement("div");
  Object.assign(text.style, { display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" });
  const nameEl = document.createElement("div");
  Object.assign(nameEl.style, { fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  text.append(nameEl, abilityDots([], { emptyText: "No ability" }));

  const btnChoose = button("", { icon: "+", tooltip: "Choose a pet", ariaLabel: "Choose a pet" });
  const btnClear = button("", { icon: "−", variant: "danger", tooltip: "Remove this pet", ariaLabel: "Remove this pet" });
  const setBusy = (busy: boolean) => {
    btnChoose.disabled = busy;
    btnClear.disabled = busy;
  };
  btnChoose.onclick = async () => {
    setBusy(true);
    try { await onChoose(); } finally { setBusy(false); }
  };
  btnClear.onclick = () => void onClear();

  root.append(iconColumn, text, btnChoose, btnClear);

  function update(pet: InventoryPet | null): void {
    const species = String(pet?.petSpecies || "").trim();
    setIcon(species, pet?.mutations ?? []);

    const maxStrength = pet ? getPetMaxStrength(pet) : 0;
    if (pet && maxStrength > 0) {
      const strength = getPetStrength(pet);
      const maxed = strength >= maxStrength;
      strengthBadge.textContent = maxed ? `${maxStrength}` : `${strength}/${maxStrength}`;
      strengthBadge.style.color = maxed ? MAX_STRENGTH_COLOR : color.paper;
      strengthBadge.style.display = "block";
    } else {
      strengthBadge.style.display = "none";
    }

    const speciesLabel = species ? species.charAt(0).toUpperCase() + species.slice(1) : "";
    nameEl.textContent = pet ? pet.name?.trim() || speciesLabel || "Pet" : "None";
    text.lastElementChild!.replaceWith(abilityDots(pet?.abilities ?? [], { emptyText: "No ability" }));
  }

  update(null);
  return { root, update };
}

export function createTeamEditor(handlers: TeamEditorHandlers): TeamEditor {
  const root = document.createElement("div");
  Object.assign(root.style, { display: "grid", gridTemplateRows: "auto 1fr", gap: "10px", minHeight: "0" });

  const header = document.createElement("div");
  Object.assign(header.style, { display: "flex", alignItems: "center", gap: "8px" });
  const title = document.createElement("div");
  title.textContent = "Team editor";
  Object.assign(title.style, {
    fontWeight: "700",
    fontSize: "14px",
    flex: "1 1 0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
  const btnUseTeam = button("Use this team", {
    variant: "primary",
    size: "sm",
    disabled: true,
    onClick: async () => {
      const team = handlers.selectedTeam();
      if (team) await handlers.onUseTeam(team);
    },
  });
  header.append(title, btnUseTeam);

  const body = document.createElement("div");
  Object.assign(body.style, { display: "flex", flexDirection: "column", gap: "12px", overflow: "auto", minHeight: "0" });
  root.append(header, body);

  /* ---------------------------------- name ---------------------------------- */

  const nameRow = flexRow({ justify: "center", fullWidth: true });
  const nameInput = textInput("Team name", "");
  Object.assign(nameInput.style, { flex: "1", minWidth: "0" });
  nameRow.append(nameInput);
  body.appendChild(framed("🏷️ Team name", nameRow));

  const saveName = () => {
    const team = handlers.selectedTeam();
    if (!team) return;
    // The game keeps 16 characters of a team name: show the name it will keep.
    const name = petTeamName(nameInput.value);
    if (nameInput.value.trim().length > name.length) nameInput.value = name;
    if (name === team.name) return;
    PetsService.saveTeam({ id: team.id, name });
    handlers.onRenamed();
  };
  nameInput.addEventListener("input", saveName);
  nameInput.addEventListener("blur", saveName);
  nameInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") nameInput.blur();
  });

  /* ---------------------------------- slots --------------------------------- */

  const saveSlots = async (slots: (string | null)[]) => {
    const team = handlers.selectedTeam();
    if (!team) return;
    const saved = PetsService.saveTeam({ id: team.id, slots });
    await repaint(saved ?? handlers.selectedTeam());
  };

  const rows = [0, 1, 2].map((index) =>
    slotRow(
      async () => {
        const team = handlers.selectedTeam();
        if (!team) return;
        handlers.setWindowVisible(false);
        try {
          await PetsService.chooseSlotPet(team.id, index);
          await repaint(handlers.selectedTeam());
        } finally {
          handlers.setWindowVisible(true);
        }
      },
      async () => {
        const team = handlers.selectedTeam();
        if (!team) return;
        const slots = team.slots.slice(0, 3);
        slots[index] = null;
        await saveSlots(slots);
      },
    ),
  );

  const slotGrid = document.createElement("div");
  Object.assign(slotGrid.style, { display: "grid", gridTemplateColumns: "1fr", rowGap: "10px", justifyItems: "center" });
  slotGrid.append(...rows.map((r) => r.root));

  const btnUseCurrent = button("Current active", {
    variant: "primary",
    onClick: async () => {
      try {
        const ids = await PetsService.getActivePetIds();
        await saveSlots([ids[0] || null, ids[1] || null, ids[2] || null]);
      } catch {}
    },
  });
  const btnClearSlots = button("Clear slots", { onClick: () => saveSlots([null, null, null]) });
  btnUseCurrent.style.minWidth = btnClearSlots.style.minWidth = "140px";
  const slotActions = flexRow({ gap: 6, justify: "center" });
  slotActions.append(btnUseCurrent, btnClearSlots);

  const slotsColumn = document.createElement("div");
  Object.assign(slotsColumn.style, { display: "flex", flexDirection: "column", gap: "8px" });
  slotsColumn.append(slotGrid, slotActions);
  body.appendChild(framed("⚡ Active pets (3 slots)", slotsColumn));

  /* ---------------------------------- stats --------------------------------- */

  // Follows the selected team as it is edited, before it is ever equipped.
  const statsHost = document.createElement("div");
  statsHost.style.width = "100%";
  body.appendChild(framed("📊 Team stats", statsHost));

  const statsMessage = (message: string) => {
    const empty = document.createElement("div");
    empty.textContent = message;
    Object.assign(empty.style, { opacity: "0.7", fontSize: "11px" });
    statsHost.replaceChildren(empty);
  };

  /* --------------------------------- painting -------------------------------- */

  /** Slot ids last drawn, so a repaint leaves unchanged slots (and their sprites) alone. */
  const drawnSlotIds: (string | null)[] = [null, null, null];

  async function repaint(team: PetTeam | null): Promise<void> {
    if (!team) return;
    const pets = await PetsService.getPetLookup();
    team.slots.slice(0, 3).forEach((id, i) => {
      const slotId = id || null;
      if (drawnSlotIds[i] === slotId) return;
      drawnSlotIds[i] = slotId;
      rows[i].update(slotId ? pets.get(slotId) ?? emptyPet(slotId) : null);
    });

    const teamPets = team.slots
      .map((id) => (id ? pets.get(String(id)) : undefined))
      .filter((pet): pet is InventoryPet => Boolean(pet));
    if (teamPets.length) statsHost.replaceChildren(renderTeamStats(teamPets, { showAllGroups: true }));
    else statsMessage("No pets in this team.");
  }

  async function show(team: PetTeam | null): Promise<void> {
    const has = !!team;
    nameInput.disabled = !has;
    btnClearSlots.setEnabled(has);
    btnUseCurrent.setEnabled(has);
    btnUseTeam.setEnabled(has);

    if (!team) {
      rows.forEach((r, i) => {
        r.update(null);
        drawnSlotIds[i] = null;
      });
      nameInput.value = "";
      statsMessage("No team selected.");
      return;
    }
    nameInput.value = String(team.name || "");
    await repaint(team);
  }

  return { root, show, repaint };
}
