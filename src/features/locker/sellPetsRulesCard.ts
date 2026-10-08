// The Restrictions tab card for the Sell All Pets protections: which pets make
// Sell All Pets ask for a confirmation first.

import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { numberInput } from "../../ui/kit/fields";
import { settingRow } from "../../ui/kit/layout";
import { switchInput } from "../../ui/kit/toggles";
import { rarityBadge } from "../notifier/menu";
import { PET_RARITIES, lockerRestrictionsService } from "./restrictions";

export type SellPetsRulesCard = { root: HTMLElement; refresh(): void };

export function sellPetsRulesCard(): SellPetsRulesCard {
  const { root, body } = card("Sell all pets protections", {
    align: "stretch",
    subtitle: "Show a confirmation modal when protected pets are detected.",
  });
  const rules = () => lockerRestrictionsService.getSellAllPetsRules();
  const save = (patch: Parameters<typeof lockerRestrictionsService.setSellAllPetsRules>[0]) => {
    lockerRestrictionsService.setSellAllPetsRules(patch);
    refresh();
  };

  const enabled = switchInput(rules().enabled, (on) => save({ enabled: on }));
  const gold = switchInput(rules().protectGold, (on) => save({ protectGold: on }));
  const rainbow = switchInput(rules().protectRainbow, (on) => save({ protectRainbow: on }));
  const maxStr = switchInput(rules().protectMaxStr, (on) => save({ protectMaxStr: on }));
  const maxStrValue = numberInput(0, 100, 1, rules().maxStrThreshold);
  maxStrValue.addEventListener("change", () => {
    const n = Number(maxStrValue.value);
    const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    maxStrValue.value = String(next);
    save({ maxStrThreshold: next });
  });
  const maxStrControls = document.createElement("div");
  maxStrControls.className = "qmm-flex";
  maxStrControls.append(maxStr, maxStrValue.wrap);

  const enabledRow = settingRow("Enable protection rules", null, enabled).row;
  const goldRow = settingRow("Protect Gold mutation", null, gold).row;
  const rainbowRow = settingRow("Protect Rainbow mutation", null, rainbow).row;
  const maxStrRow = settingRow("Protect pets with Max STR", null, maxStrControls).row;

  // Protected rarities: chips with a remove cross, and a picker of the others.
  const rarities = document.createElement("div");
  rarities.className = "lk-rarities";
  const chips = document.createElement("div");
  chips.className = "lk-rarities__chips";
  const picker = document.createElement("div");
  picker.className = "lk-rarities__chips lk-rarities__picker";
  let pickerOpen = false;
  const setProtected = (next: string[]) => save({ protectedRarities: next });

  const closeOnOutsideClick = (ev: MouseEvent) => {
    if (rarities.contains(ev.target as Node)) return;
    setPickerOpen(false);
  };
  const setPickerOpen = (open: boolean) => {
    pickerOpen = open;
    if (open) document.addEventListener("click", closeOnOutsideClick, true);
    else document.removeEventListener("click", closeOnOutsideClick, true);
    refresh();
  };
  const addButton = button("+", { size: "xs", onClick: () => setPickerOpen(!pickerOpen) });

  const head = document.createElement("div");
  head.className = "lk-rarities__head";
  const title = document.createElement("div");
  title.className = "qmm-setting-row__title";
  title.textContent = "Protect by rarity";
  head.append(title, addButton);
  rarities.append(head, chips, picker);

  const showRarities = () => {
    const selected = rules().protectedRarities;
    chips.replaceChildren();
    if (!selected.length) {
      const none = document.createElement("span");
      none.className = "lk-empty";
      none.textContent = "No rarities protected";
      chips.appendChild(none);
    }
    for (const rarity of selected) {
      const chip = document.createElement("div");
      chip.className = "lk-rarity";
      chip.append(
        rarityBadge(rarity),
        button("×", {
          size: "xs",
          variant: "ghost",
          ariaLabel: `Unprotect ${rarity}`,
          onClick: () => setProtected(rules().protectedRarities.filter((r) => r !== rarity)),
        }),
      );
      chips.appendChild(chip);
    }

    const remaining = PET_RARITIES.filter((rarity) => !selected.includes(rarity));
    if (!remaining.length && pickerOpen) {
      pickerOpen = false;
      document.removeEventListener("click", closeOnOutsideClick, true);
    }
    picker.replaceChildren(
      ...remaining.map((rarity) => {
        const badge = rarityBadge(rarity);
        badge.addEventListener("click", () => setProtected([...rules().protectedRarities, rarity]));
        return badge;
      }),
    );
    picker.hidden = !pickerOpen;
    addButton.querySelector(".label")!.textContent = pickerOpen ? "×" : "+";
  };

  body.append(enabledRow, goldRow, rainbowRow, maxStrRow, rarities);

  function refresh() {
    const current = rules();
    enabled.setChecked(current.enabled);
    gold.setChecked(current.protectGold);
    rainbow.setChecked(current.protectRainbow);
    maxStr.setChecked(current.protectMaxStr);
    maxStrValue.value = String(current.maxStrThreshold);
    // The rules below the switch only apply while it is on.
    for (const row of [goldRow, rainbowRow, maxStrRow]) row.classList.toggle("lk-dim", !current.enabled);
    gold.disabled = rainbow.disabled = maxStr.disabled = !current.enabled;
    const maxStrOff = !current.enabled || !current.protectMaxStr;
    maxStrValue.disabled = maxStrOff;
    maxStrValue.wrap.classList.toggle("lk-dim", maxStrOff);
    maxStrValue.wrap.inert = maxStrOff;
    rarities.classList.toggle("is-disabled", !current.enabled);
    showRarities();
  }

  refresh();
  return { root, refresh };
}
