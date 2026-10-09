// The Restrictions tab card for the Sell All Pets protections: which pets make
// Sell All Pets ask for a confirmation first.

import { h } from "../../ui/kit/dom";
import { numberInput } from "../../ui/kit/fields";
import { settingRow } from "../../ui/kit/layout";
import { rarityBadge } from "../../ui/kit/rarityBadge";
import { switchInput } from "../../ui/kit/toggles";
import { lockerCard } from "./lockerCard";
import { PET_RARITIES, lockerRestrictionsService } from "./restrictions";

export type SellPetsRulesCard = { root: HTMLElement; refresh(): void };

export function sellPetsRulesCard(): SellPetsRulesCard {
  const rules = () => lockerRestrictionsService.getSellAllPetsRules();
  const save = (patch: Parameters<typeof lockerRestrictionsService.setSellAllPetsRules>[0]) => {
    lockerRestrictionsService.setSellAllPetsRules(patch);
    refresh();
  };

  const enabled = switchInput(rules().enabled, (on) => save({ enabled: on }));
  enabled.setAttribute("aria-label", "Sell all pets protections");
  const { root, body } = lockerCard("Sell all pets", {
    subtitle: "Asks first when a protected pet would be sold.",
    control: enabled,
  });

  const gold = switchInput(rules().protectGold, (on) => save({ protectGold: on }));
  const rainbow = switchInput(rules().protectRainbow, (on) => save({ protectRainbow: on }));
  const maxStr = switchInput(rules().protectMaxStr, (on) => save({ protectMaxStr: on }));
  const maxStrValue = numberInput(0, 100, 1, rules().maxStrThreshold);
  maxStrValue.setAttribute("aria-label", "Max STR threshold");
  maxStrValue.addEventListener("change", () => {
    const n = Number(maxStrValue.value);
    const next = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
    maxStrValue.value = String(next);
    save({ maxStrThreshold: next });
  });
  const maxStrControls = h("div", "qmm-flex");
  maxStrControls.append(maxStrValue.wrap, maxStr);

  const goldRow = settingRow("Gold pets", null, gold).row;
  const rainbowRow = settingRow("Rainbow pets", null, rainbow).row;
  const maxStrRow = settingRow("Strong pets", "Max STR at or above this number.", maxStrControls).row;

  // Protected rarities: every rarity as a chip that toggles.
  const rarities = h("div", "lk-rarities");
  const chips = h("div", "lk-rarities__chips");
  const rarityText = h("div", "qmm-setting-row__text");
  rarityText.append(
    h("div", "qmm-setting-row__title", "Rarities"),
    h("div", "qmm-setting-row__hint", "Tap a rarity to protect it."),
  );
  rarities.append(rarityText, chips);

  const toggleRarity = (rarity: string) => {
    const current = rules().protectedRarities;
    save({
      protectedRarities: current.includes(rarity) ? current.filter((r) => r !== rarity) : [...current, rarity],
    });
  };
  const chipButtons = PET_RARITIES.map((rarity) => {
    const chip = h("button", "lk-rarity");
    chip.type = "button";
    chip.dataset.rarity = rarity;
    chip.appendChild(rarityBadge(rarity));
    chip.addEventListener("click", () => toggleRarity(rarity));
    chips.appendChild(chip);
    return chip;
  });

  const showRarities = () => {
    const selected = rules().protectedRarities;
    for (const chip of chipButtons) {
      const on = selected.includes(chip.dataset.rarity ?? "");
      chip.classList.toggle("is-on", on);
      chip.setAttribute("aria-pressed", on ? "true" : "false");
      chip.title = on ? "Protected. Tap to stop protecting." : "Tap to protect.";
    }
  };

  body.append(goldRow, rainbowRow, maxStrRow, rarities);

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
    rarities.inert = !current.enabled;
    showRarities();
  }

  refresh();
  return { root, refresh };
}
