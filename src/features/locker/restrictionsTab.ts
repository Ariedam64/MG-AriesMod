// The locker menu's Restrictions tab: the friend bonus needed to sell crops,
// the decor pickup lock, the per-egg hatch locks and the Sell All Pets
// protections.

import { Atoms } from "../../game/store/atoms";
import { Subscriptions } from "../../lib/emitter";
import { pill, setTone } from "../../ui/kit/badges";
import { card } from "../../ui/kit/card";
import { settingRow } from "../../ui/kit/layout";
import { slider } from "../../ui/kit/sliders";
import { switchInput, type SwitchInput } from "../../ui/kit/toggles";
import { lockableEggs, catalogEggs, type EggOption } from "./eggOptions";
import { currentFriendBonus, onFriendBonusChange } from "./friendBonus";
import { eggIcon } from "./menuIcons";
import {
  FRIEND_BONUS_MAX,
  FRIEND_BONUS_STEP,
  friendBonusPercentFromPlayers,
  lockerRestrictionsService,
  percentToRequiredFriendCount,
} from "./restrictions";
import { sellPetsRulesCard } from "./sellPetsRulesCard";

export type LockerTab = { render(view: HTMLElement): void; destroy(): void };

const toBonusStep = (value: number) =>
  Math.max(0, Math.min(FRIEND_BONUS_MAX, Math.round(value / FRIEND_BONUS_STEP) * FRIEND_BONUS_STEP));

function friendBonusCard() {
  let requiredPlayers = lockerRestrictionsService.getState().minRequiredPlayers;
  const status = pill("");
  const { root, body } = card("Friend bonus locker", { align: "stretch", actions: [status] });

  const value = pill("", "warn");
  const head = document.createElement("div");
  head.className = "qmm-flex";
  head.style.justifyContent = "space-between";
  const title = document.createElement("div");
  title.className = "qmm-setting-row__title";
  title.textContent = "Minimum friend bonus required";
  head.append(title, value);

  const bonusSlider = slider(0, FRIEND_BONUS_MAX, FRIEND_BONUS_STEP, friendBonusPercentFromPlayers(requiredPlayers) ?? 0, { fill: true });
  const statusText = document.createElement("div");
  statusText.className = "qmm-setting-row__hint";
  statusText.style.fontSize = "12.5px";
  body.append(head, bonusSlider, statusText);

  const showStatus = () => {
    const requiredPct = toBonusStep(friendBonusPercentFromPlayers(requiredPlayers) ?? 0);
    const currentPct = currentFriendBonus() ?? 0;
    const currentPlayers = percentToRequiredFriendCount(currentPct);
    if (requiredPct <= 0) {
      status.textContent = "Unlocked";
      setTone(status);
      statusText.textContent = `Current friend bonus: ${currentPct}% (${currentPlayers} players).`;
      return;
    }
    const allowed = currentPct + 0.0001 >= requiredPct;
    status.textContent = allowed ? "Sale allowed" : "Sale locked";
    setTone(status, allowed ? "ok" : "bad");
    statusText.textContent = allowed
      ? `Current bonus ${currentPct}% (${currentPlayers} players) meets the requirement (${requiredPct}%).`
      : `Requires ${requiredPct}% (${requiredPlayers} players) or more`;
  };

  const showSlider = (pct: number) => {
    bonusSlider.value = String(pct);
    value.textContent = `+${pct}%`;
  };

  const readSlider = (commit: boolean) => {
    const raw = Number(bonusSlider.value);
    const pct = toBonusStep(Number.isFinite(raw) ? raw : 0);
    showSlider(pct);
    requiredPlayers = percentToRequiredFriendCount(pct);
    showStatus();
    if (commit) lockerRestrictionsService.setMinRequiredPlayers(requiredPlayers);
  };
  bonusSlider.addEventListener("input", () => readSlider(false));
  bonusSlider.addEventListener("change", () => readSlider(true));

  return {
    root,
    showStatus,
    sync(players: number) {
      requiredPlayers = players;
      showSlider(friendBonusPercentFromPlayers(players) ?? 0);
      showStatus();
    },
  };
}

function eggLocksCard() {
  const { root, body } = card("Egg hatch locker", { align: "stretch" });
  const rows = new Map<string, { row: HTMLElement; title: HTMLElement; toggle: SwitchInput }>();
  let eggs: EggOption[] = catalogEggs();

  const rowFor = (egg: EggOption) => {
    let entry = rows.get(egg.id);
    if (!entry) {
      const toggle = switchInput(false, (locked) => lockerRestrictionsService.setEggLock(egg.id, locked));
      toggle.title = "Lock hatching";
      const { row } = settingRow(egg.name, null, toggle);
      row.prepend(eggIcon(egg.id, egg.name, 32));
      entry = { row, title: row.querySelector<HTMLElement>(".qmm-setting-row__title")!, toggle };
      rows.set(egg.id, entry);
    }
    return entry;
  };

  const render = () => {
    if (!eggs.length) {
      const empty = document.createElement("div");
      empty.className = "lk-empty";
      empty.textContent = "No eggs available.";
      body.replaceChildren(empty);
      return;
    }
    body.replaceChildren(
      ...eggs.map((egg) => {
        const entry = rowFor(egg);
        entry.title.textContent = egg.name || egg.id;
        entry.toggle.setChecked(lockerRestrictionsService.isEggLocked(egg.id));
        return entry.row;
      }),
    );
  };

  return {
    root,
    render,
    setEggs(next: EggOption[]) {
      eggs = next;
      render();
    },
  };
}

export function restrictionsTab(): LockerTab {
  const layout = document.createElement("div");
  layout.className = "lk-restrictions";

  const friendBonus = friendBonusCard();
  const decorToggle = switchInput(lockerRestrictionsService.isDecorPickupLocked(), (locked) =>
    lockerRestrictionsService.setDecorPickupLocked(locked),
  );
  const decor = card("Decor pick locker", {
    align: "stretch",
    subtitle: "Prevents placed decors from being picked up",
    actions: [decorToggle],
  });
  const eggLocks = eggLocksCard();
  const sellPets = sellPetsRulesCard();
  layout.append(friendBonus.root, decor.root, eggLocks.root, sellPets.root);

  const syncFromService = () => {
    const state = lockerRestrictionsService.getState();
    decorToggle.setChecked(state.decorPickupLocked);
    friendBonus.sync(state.minRequiredPlayers);
    eggLocks.render();
    sellPets.refresh();
  };

  // Followed from the first time the tab is shown.
  const subs = new Subscriptions();
  let following = false;
  const follow = () => {
    if (following) return;
    following = true;
    subs.add(onFriendBonusChange(friendBonus.showStatus));
    subs.add(lockerRestrictionsService.subscribe(syncFromService));
    void Atoms.shop.eggShop
      .get()
      .then((shop) => eggLocks.setEggs(lockableEggs(shop)))
      .catch(() => eggLocks.render());
    subs.add(Atoms.shop.eggShop.onChange((shop) => eggLocks.setEggs(lockableEggs(shop))));
  };

  return {
    render(view) {
      view.classList.add("lk-view");
      view.replaceChildren(layout);
      syncFromService();
      follow();
    },
    destroy: () => subs.dispose(),
  };
}
