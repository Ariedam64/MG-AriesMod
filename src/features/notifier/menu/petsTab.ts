import type { PetInfo } from "../../../game/player";
import { card, plainCard } from "../../../ui/kit/card";
import { h } from "../../../ui/kit/dom";
import { numberInput } from "../../../ui/kit/fields";
import { flexRow, formRow } from "../../../ui/kit/layout";
import { color } from "../../../ui/kit/theme";
import { switchInput } from "../../../ui/kit/toggles";
import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import { PetsService } from "../../pets/pets";
import { PetAlertService } from "../petAlerts";

/** The active pets with their hunger, and the shared hunger threshold. */

const ACTIVE_PET_SLOTS = 3;
const AVATAR_SIZE = 40;

/** The pet's sprite, showing the species' initial until it loads. */
function petAvatar(pet: PetInfo): HTMLDivElement {
  const avatar = h("div");
  Object.assign(avatar.style, {
    width: `${AVATAR_SIZE}px`,
    height: `${AVATAR_SIZE}px`,
    borderRadius: "8px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: color.mutedBg,
    border: `1px solid ${color.border}`,
    overflow: "hidden",
  });
  const species = String(pet?.slot?.petSpecies ?? "").trim();
  const glyph = h("span", undefined, species ? species.charAt(0).toUpperCase() : "🐾");
  glyph.style.fontSize = "28px";
  glyph.setAttribute("aria-hidden", "true");
  avatar.appendChild(glyph);
  if (species) {
    const mutations = (pet?.slot as { mutations?: unknown } | undefined)?.mutations;
    attachSpriteIcon(avatar, ["pet"], [species], 36, "alerts-pet", {
      mutations: Array.isArray(mutations) ? mutations : undefined,
    });
  }
  return avatar;
}

function petRow(pet: PetInfo): HTMLDivElement {
  const slot = pet?.slot;
  const hunger = PetsService.getHungerPctFor(pet);

  const row = h("div");
  Object.assign(row.style, {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    padding: "6px 8px",
    borderRadius: "8px",
    border: `1px solid ${color.border}`,
    background: color.cardBg,
  });

  const left = h("div");
  Object.assign(left.style, { display: "flex", alignItems: "center", gap: "8px", minWidth: "0" });
  const name = h("div", undefined, String(slot?.name || slot?.petSpecies || "Pet"));
  Object.assign(name.style, { fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  left.append(petAvatar(pet), name);

  const hungerValue = h("div", undefined, Number.isFinite(hunger) ? `${hunger}%` : "-");
  Object.assign(hungerValue.style, { fontWeight: "700", color: color.gold });

  row.append(left, hungerValue);
  return row;
}

function generalCard(): HTMLDivElement {
  const general = card("General notifications", { tone: "muted", align: "stretch" });

  const toggle = switchInput(PetAlertService.isGeneralEnabled(), (on) => {
    PetAlertService.setGeneralEnabled(on);
    toggle.checked = PetAlertService.isGeneralEnabled();
  });
  const toggleRow = flexRow({ justify: "start", gap: 10 });
  const toggleLabel = h("div", undefined, "Use a shared threshold for all pets");
  toggleLabel.style.opacity = "0.9";
  toggleRow.append(toggle, toggleLabel);

  const threshold = numberInput(1, 100, 1, PetAlertService.getGeneralThresholdPct());
  threshold.addEventListener("change", () => {
    const typed = Number(threshold.value);
    const next = Math.max(1, Math.min(100, typed || PetAlertService.getGeneralThresholdPct()));
    threshold.value = String(PetAlertService.setGeneralThresholdPct(next));
  });

  general.body.append(
    formRow("Enable general", toggleRow, { labelWidth: "180px" }).root,
    formRow("General threshold (%)", threshold.wrap, { labelWidth: "180px" }).root,
  );
  return general.root;
}

export function renderPetsTab(view: HTMLElement): void {
  view.replaceChildren();
  void PetAlertService.start().catch(() => {});

  const layout = plainCard();
  Object.assign(layout.style, {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 260px) minmax(0, 1fr)",
    alignItems: "stretch",
    height: "54vh",
    overflow: "hidden",
  });
  view.appendChild(layout);

  const petList = h("div");
  Object.assign(petList.style, {
    display: "grid",
    gridTemplateColumns: "1fr",
    alignContent: "start",
    rowGap: "6px",
    overflow: "auto",
    padding: "6px",
    border: `1px solid ${color.border}`,
    borderRadius: "10px",
  });

  const right = h("div");
  Object.assign(right.style, { display: "flex", flexDirection: "column", gap: "10px", overflow: "auto", minHeight: "0" });
  right.appendChild(generalCard());
  layout.append(petList, right);

  const renderPets = (pets: PetInfo[]) => {
    if (!pets.length) {
      const empty = h("div", undefined, "No active pets.");
      empty.style.opacity = "0.75";
      petList.replaceChildren(empty);
      return;
    }
    petList.replaceChildren(...pets.map(petRow));
  };

  PetsService.onPetsChangeNow((pets) => renderPets(Array.isArray(pets) ? pets.slice(0, ACTIVE_PET_SLOTS) : [])).catch(
    () => renderPets([]),
  );
}
