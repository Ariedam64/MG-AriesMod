import type { PetInfo } from "../../../game/player";
import { meter } from "../../../ui/kit/badges";
import { card } from "../../../ui/kit/card";
import { h } from "../../../ui/kit/dom";
import { numberInput } from "../../../ui/kit/fields";
import { settingRow } from "../../../ui/kit/layout";
import { switchInput } from "../../../ui/kit/toggles";
import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import { PetsService } from "../../pets/pets";
import { PetAlertService } from "../petAlerts";
import { ensureMenuStyles } from "./styles";

/** The shared hunger threshold, and the active pets with their hunger. */

const ACTIVE_PET_SLOTS = 3;
const AVATAR_SIZE = 36;

/** The pet's sprite, showing the species' initial until it loads. */
function petAvatar(pet: PetInfo): HTMLDivElement {
  const avatar = h("div", "qws-al-icon");
  const species = String(pet?.slot?.petSpecies ?? "").trim();
  const glyph = h("span", undefined, species ? species.charAt(0).toUpperCase() : "🐾");
  glyph.setAttribute("aria-hidden", "true");
  avatar.appendChild(glyph);
  if (species) {
    const mutations = (pet?.slot as { mutations?: unknown } | undefined)?.mutations;
    attachSpriteIcon(avatar, ["pet"], [species], AVATAR_SIZE, "alerts-pet", {
      mutations: Array.isArray(mutations) ? mutations : undefined,
    });
  }
  return avatar;
}

/** A pet with a bar of how fed it is, warm once under the shared threshold (`null` when it is off). */
function petRow(pet: PetInfo, thresholdPct: number | null): HTMLDivElement {
  const slot = pet?.slot;
  const hunger = PetsService.getHungerPctFor(pet);
  const known = Number.isFinite(hunger);
  const low = known && thresholdPct != null && hunger < thresholdPct;

  const row = h("div", "qws-al-pet");
  const bar = meter();
  bar.set(known ? hunger / 100 : 0, low ? "warn" : "accent");
  const value = h("div", low ? "qws-al-pet__value is-low" : "qws-al-pet__value", known ? `${hunger}%` : "-");
  const body = h("div", "qws-al-pet__body");
  body.append(h("div", "qws-al-pet__name", String(slot?.name || slot?.petSpecies || "Pet")), bar.root);
  row.append(petAvatar(pet), body, value);
  return row;
}

function thresholdCard(onChange: () => void): HTMLElement {
  const alert = card("Hunger alert");

  const toggle = switchInput(PetAlertService.isGeneralEnabled(), (on) => {
    PetAlertService.setGeneralEnabled(on);
    toggle.checked = PetAlertService.isGeneralEnabled();
    onChange();
  });

  const threshold = numberInput(1, 100, 1, PetAlertService.getGeneralThresholdPct());
  threshold.setAttribute("aria-label", "Hunger threshold");
  threshold.addEventListener("change", () => {
    const typed = Number(threshold.value);
    const next = Math.max(1, Math.min(100, typed || PetAlertService.getGeneralThresholdPct()));
    threshold.value = String(PetAlertService.setGeneralThresholdPct(next));
    onChange();
  });
  const pct = h("div", "qws-al-pct");
  pct.append(threshold.wrap, "%");

  alert.body.append(
    settingRow("Shared threshold", "One threshold for every active pet.", toggle).row,
    settingRow("Alert below", "Hunger level that sounds the alert.", pct).row,
  );
  return alert.root;
}

export function renderPetsTab(view: HTMLElement): void {
  ensureMenuStyles();
  void PetAlertService.start().catch(() => {});

  const tab = h("div", "qws-al-tab");
  const scroll = h("div", "qws-al-scroll qmm-scroll");
  tab.appendChild(scroll);
  view.replaceChildren(tab);

  const petsCard = card("Active pets");
  const petList = h("div", "qws-al-list");
  petsCard.body.appendChild(petList);

  let shown: PetInfo[] = [];
  const renderPets = (pets: PetInfo[]) => {
    shown = pets;
    if (!pets.length) {
      petList.replaceChildren(h("div", "qws-al-empty", "No active pets right now."));
      return;
    }
    const thresholdPct = PetAlertService.isGeneralEnabled() ? PetAlertService.getGeneralThresholdPct() : null;
    petList.replaceChildren(...pets.map((pet) => petRow(pet, thresholdPct)));
  };

  scroll.append(thresholdCard(() => renderPets(shown)), petsCard.root);

  PetsService.onPetsChangeNow((pets) => renderPets(Array.isArray(pets) ? pets.slice(0, ACTIVE_PET_SLOTS) : [])).catch(
    () => renderPets([]),
  );
}
