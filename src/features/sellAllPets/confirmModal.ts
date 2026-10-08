// The confirmation Sell All Pets asks for when the locker protects some of
// the pets it is about to sell.

import { pill } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { openModal, type Modal } from "../../ui/kit/modal";
import { color } from "../../ui/kit/theme";
import { attachSpriteIcon } from "../../ui/kit/sprites/iconCache";
import type { FlaggedPet } from "./protection";

const ICON_PX = 48;
/** Above every HUD window: the flow can start from a keybind with any window focused. */
const ON_TOP = "2147483647";

function petRow({ pet, reasons, mutations }: FlaggedPet): HTMLElement {
  const row = document.createElement("div");
  Object.assign(row.style, {
    display: "grid",
    gridTemplateColumns: `${ICON_PX}px 1fr`,
    gap: "10px",
    alignItems: "center",
    padding: "6px 8px",
    border: `1px solid ${color.border}`,
    borderRadius: "10px",
    background: color.cardBg,
  });

  const icon = document.createElement("div");
  Object.assign(icon.style, {
    width: `${ICON_PX}px`,
    height: `${ICON_PX}px`,
    borderRadius: "10px",
    background: color.hoverBg,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    fontSize: "12px",
    fontWeight: "700",
  });
  // Initials until the sprite loads.
  icon.textContent = String(pet.petSpecies || pet.name || "Pet").slice(0, 2).toUpperCase();
  const species = String(pet.petSpecies || "").trim();
  if (species) {
    attachSpriteIcon(icon, ["pet"], [species, pet.name || ""], ICON_PX, "sell-all-pets-confirm", {
      mutations: mutations.map((m) => m.trim()).filter(Boolean),
    });
  }

  const name = document.createElement("div");
  name.textContent = pet.name ? `${pet.name} (${pet.petSpecies ?? "Pet"})` : (pet.petSpecies ?? "Pet");
  Object.assign(name.style, { fontWeight: "700", fontSize: "13px" });

  const chips = document.createElement("div");
  Object.assign(chips.style, { display: "flex", flexWrap: "wrap", gap: "6px" });
  chips.append(...reasons.map((reason) => pill(reason)));

  const info = document.createElement("div");
  Object.assign(info.style, { display: "grid", gap: "4px" });
  info.append(name, chips);

  row.append(icon, info);
  return row;
}

/** One confirmation at a time: a new one replaces, and so cancels, the last. */
let current: Modal | null = null;

/** Resolves true when the player confirms, false on Cancel, Escape or a click outside. */
export function confirmProtectedPetSale(flagged: FlaggedPet[]): Promise<boolean> {
  current?.close();
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const modal = openModal({
      host: document.body,
      title: "Confirm sell all pets",
      widthPx: 520,
      onClose: () => {
        if (current === modal) current = null;
        settle(false);
      },
    });
    current = modal;
    const scrim = modal.body.closest<HTMLElement>(".qmm-modal-scrim");
    if (scrim) scrim.style.zIndex = ON_TOP;

    const intro = document.createElement("div");
    intro.textContent = "The following pets match protected rules:";
    Object.assign(intro.style, { fontSize: "13px", lineHeight: "1.4", color: color.textSoft });
    modal.body.append(intro, ...flagged.map(petRow));

    const spacer = document.createElement("div");
    spacer.style.flex = "1";
    const sell = button("Sell", {
      variant: "primary",
      onClick: () => {
        settle(true);
        modal.close();
      },
    });
    modal.footer.append(spacer, button("Cancel", { onClick: () => modal.close() }), sell);
    sell.focus();
  });
}
