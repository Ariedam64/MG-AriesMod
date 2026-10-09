// The right column of the Teams tab: the selected team's name, its three pet
// slots, what the team is worth, and its delete button.

import { getPetMaxStrength, getPetStrength } from "../../data/rules/petValue";
import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { textInput } from "../../ui/kit/fields";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import { abilityDots } from "./abilityChips";
import type { InventoryPet } from "./inventoryPets";
import { PetsService } from "./pets";
import { ensurePetsStyles } from "./styles";
import { petTeamName } from "./teamReconcile";
import { renderTeamStats } from "./teamStatsView";
import type { PetTeam } from "./teamStore";

const SLOT_ICON_PX = 40;

export type TeamEditorHandlers = {
  /** The team the editor shows, read fresh at each action. */
  selectedTeam(): PetTeam | null;
  /** The name changed: the team list should show it. */
  onRenamed(): void;
  /** "Use this team" was pressed. */
  onUseTeam(team: PetTeam): Promise<void>;
  /** "Delete team" was pressed. */
  onDelete(): void;
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

const emptyPet = (id: string): InventoryPet => ({
  id, itemType: "Pet", petSpecies: "", name: null, xp: 0, hunger: 0, mutations: [], abilities: [],
});

type SlotRow = { root: HTMLElement; update(pet: InventoryPet | null): void };

function slotRow(onChoose: () => Promise<void>, onClear: () => Promise<void>): SlotRow {
  const root = document.createElement("div");
  root.className = "pt-slot";

  const iconWrap = document.createElement("div");
  iconWrap.className = "pt-slot__icon";

  const pawFallback = () => {
    const paw = document.createElement("span");
    paw.textContent = "🐾";
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
  text.className = "pt-slot__text";
  const titleRow = document.createElement("div");
  titleRow.className = "pt-slot__title";
  const nameEl = document.createElement("div");
  nameEl.className = "pt-slot__name";
  const strengthBadge = document.createElement("span");
  strengthBadge.className = "pt-str";
  titleRow.append(nameEl, strengthBadge);
  text.append(titleRow, abilityDots([], { emptyText: "No ability" }));

  const btnChoose = button("Choose", { size: "sm", tooltip: "Pick a pet from your inventory" });
  const btnClear = button("", { icon: "✕", variant: "ghost", size: "sm", tooltip: "Remove this pet", ariaLabel: "Remove this pet" });

  let empty = true;
  const setBusy = (busy: boolean) => {
    btnChoose.disabled = busy;
    btnClear.disabled = busy || empty;
  };
  btnChoose.onclick = async () => {
    setBusy(true);
    try { await onChoose(); } finally { setBusy(false); }
  };
  btnClear.onclick = () => void onClear();

  root.append(iconWrap, text, btnChoose, btnClear);

  function update(pet: InventoryPet | null): void {
    empty = !pet;
    root.classList.toggle("is-empty", empty);
    btnClear.disabled = empty;
    const chooseLabel = btnChoose.querySelector(".label");
    if (chooseLabel) chooseLabel.textContent = empty ? "Choose" : "Change";

    const species = String(pet?.petSpecies || "").trim();
    setIcon(species, pet?.mutations ?? []);

    const maxStrength = pet ? getPetMaxStrength(pet) : 0;
    if (pet && maxStrength > 0) {
      const strength = getPetStrength(pet);
      const maxed = strength >= maxStrength;
      strengthBadge.textContent = maxed ? `${maxStrength}` : `${strength}/${maxStrength}`;
      strengthBadge.title = maxed ? "Strength, at its max" : "Strength (current/max)";
      strengthBadge.classList.toggle("is-max", maxed);
      strengthBadge.hidden = false;
    } else {
      strengthBadge.hidden = true;
    }

    const speciesLabel = species ? species.charAt(0).toUpperCase() + species.slice(1) : "";
    nameEl.textContent = pet ? pet.name?.trim() || speciesLabel || "Pet" : "Empty slot";
    text.lastElementChild!.replaceWith(abilityDots(pet?.abilities ?? [], { emptyText: pet ? "No ability" : "Pick a pet to fill it." }));
  }

  update(null);
  return { root, update };
}

export function createTeamEditor(handlers: TeamEditorHandlers): TeamEditor {
  ensurePetsStyles();
  const root = document.createElement("div");
  root.className = "pt-editor";

  /* ------------------------------ name and use ------------------------------ */

  const head = document.createElement("div");
  head.className = "pt-editor__head";
  const nameInput = textInput("Team name", "");
  nameInput.classList.add("pt-editor__name");
  nameInput.setAttribute("aria-label", "Team name");
  const btnUseTeam = button("Use this team", {
    variant: "primary",
    disabled: true,
    onClick: async () => {
      const team = handlers.selectedTeam();
      if (team) await handlers.onUseTeam(team);
    },
  });
  head.append(nameInput, btnUseTeam);
  root.appendChild(head);

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

  const btnUseCurrent = button("Use equipped", {
    size: "sm",
    tooltip: "Fill the slots with the pets you have out now",
    onClick: async () => {
      try {
        const ids = await PetsService.getActivePetIds();
        await saveSlots([ids[0] || null, ids[1] || null, ids[2] || null]);
      } catch {}
    },
  });
  const btnClearSlots = button("Clear", { size: "sm", variant: "ghost", tooltip: "Empty all three slots", onClick: () => saveSlots([null, null, null]) });

  const petsCard = card("Pets", { actions: [btnUseCurrent, btnClearSlots] });
  const slotList = document.createElement("div");
  slotList.className = "pt-slots";
  slotList.append(...rows.map((r) => r.root));
  petsCard.body.appendChild(slotList);
  root.appendChild(petsCard.root);

  /* ---------------------------------- stats --------------------------------- */

  // Follows the selected team as it is edited, before it is ever equipped.
  const statsCard = card("Stats", { subtitle: "Hover a number to see how it is worked out." });
  const statsHost = statsCard.body;
  root.appendChild(statsCard.root);

  const statsMessage = (message: string) => {
    const empty = document.createElement("div");
    empty.className = "pt-empty";
    empty.textContent = message;
    statsHost.replaceChildren(empty);
  };

  /* --------------------------------- delete --------------------------------- */

  const foot = document.createElement("div");
  foot.className = "pt-editor__foot";
  const btnDelete = button("Delete team", { variant: "danger", size: "sm", disabled: true, onClick: handlers.onDelete });
  foot.appendChild(btnDelete);
  root.appendChild(foot);

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
    else statsMessage("Add a pet to see what this team does.");
  }

  async function show(team: PetTeam | null): Promise<void> {
    const has = !!team;
    nameInput.disabled = !has;
    btnClearSlots.setEnabled(has);
    btnUseCurrent.setEnabled(has);
    btnUseTeam.setEnabled(has);
    btnDelete.setEnabled(has);

    if (!team) {
      rows.forEach((r, i) => {
        r.update(null);
        drawnSlotIds[i] = null;
      });
      nameInput.value = "";
      statsMessage("No team selected. Pick one on the left, or make a new one.");
      return;
    }
    nameInput.value = String(team.name || "");
    await repaint(team);
  }

  return { root, show, repaint };
}
