// The Keybinds menu: one collapsible card per section, one row per shortcut.

import { hotkeyToString, type Hotkey } from "../../lib/hotkey";
import { getAriesStorage, updateAriesStorage } from "../../platform/storage";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { hotkeyButton } from "../../ui/kit/hotkey";
import { collapsibleCard, settingRow } from "../../ui/kit/layout";
import { Menu } from "../../ui/kit/menu";
import { switchInput } from "../../ui/kit/toggles";
import { PET_SECTION_ID, SECTION_CONFIG, type KeybindSection } from "./catalog";
import {
  getDefaultKeybind,
  getKeybind,
  getKeybindHoldDetection,
  getKeybindSections,
  onKeybindChange,
  onKeybindHoldDetectionChange,
  resetKeybind,
  setKeybind,
  setKeybindHoldDetection,
  type KeybindAction,
} from "./keybinds";
import { ensureKeybindsStyles } from "./styles";

/** Collapsed sections persist so the menu reopens the way it was left. */
function isSectionCollapsed(sectionId: string): boolean {
  return getAriesStorage().keybinds?.collapsed?.[sectionId] === true;
}

function setSectionCollapsed(sectionId: string, collapsed: boolean): void {
  updateAriesStorage((current) => {
    const keybinds = (current.keybinds ??= {});
    const map = (keybinds.collapsed ??= {});
    if (collapsed) map[sectionId] = true;
    else delete map[sectionId];
  });
}

/**
 * Subscribes for as long as `owner` is on the page. The menu has no unmount
 * event, so a listener drops itself the first time it fires for a row that has
 * been removed.
 */
function whileConnected<T>(owner: HTMLElement, subscribe: (cb: (value: T) => void) => () => void, cb: (value: T) => void): void {
  const stop = subscribe((value) => {
    if (owner.isConnected) cb(value);
    else stop();
  });
}

/** The Rapid fire style toggle, a small switch under the action's name. */
function holdControl(action: KeybindAction): HTMLElement {
  const hold = action.holdDetection!;
  const wrap = h("label", "qws-kb-hold");
  if (hold.description) wrap.title = hold.description;

  const toggle = switchInput(getKeybindHoldDetection(action.id), (on) => setKeybindHoldDetection(action.id, on));
  whileConnected<boolean>(wrap, (cb) => onKeybindHoldDetectionChange(action.id, cb), (on) => toggle.setChecked(on));

  wrap.append(toggle, h("span", undefined, hold.label));
  return wrap;
}

function keybindRow(action: KeybindAction): HTMLElement {
  const keyButton = hotkeyButton(getKeybind(action.id), (hk) => setKeybind(action.id, hk), {
    emptyLabel: "Not set",
    listeningLabel: "Press a key",
    clearable: true,
    allowModifierOnly: action.allowModifierOnly,
  });

  const { row, controls } = settingRow(action.label, action.hint ?? null, keyButton, {
    icon: action.icon,
    iconTag: "keybinds",
  });
  row.classList.add("qws-kb-row");
  if (action.holdDetection) row.querySelector(".qmm-setting-row__text")?.appendChild(holdControl(action));

  const defaultString = hotkeyToString(getDefaultKeybind(action.id));

  const resetButton = defaultString
    ? button("", {
        icon: "↺",
        variant: "ghost",
        size: "sm",
        title: "Restore the default key",
        ariaLabel: "Restore the default key",
        onClick: () => resetKeybind(action.id),
      })
    : null;

  // The Game section's core bindings must always keep a key, so they get no
  // remove button unless the action opts in.
  const clearButton =
    action.sectionId === "game" && !action.allowClear
      ? null
      : button("", {
          icon: "✕",
          variant: "ghost",
          size: "sm",
          title: "Remove this shortcut",
          ariaLabel: "Remove this shortcut",
          onClick: () => setKeybind(action.id, null),
        });

  // Both slots always exist, so the keys of every row line up.
  const acts = h("div", "qws-kb-acts");
  if (resetButton) {
    resetButton.classList.add("qws-kb-act", "qws-kb-act--reset");
    acts.appendChild(resetButton);
  }
  if (clearButton) {
    clearButton.classList.add("qws-kb-act", "qws-kb-act--clear");
    acts.appendChild(clearButton);
  }
  controls.appendChild(acts);

  const refresh = (hk: Hotkey | null) => {
    keyButton.refreshHotkey(hk);
    clearButton?.setEnabled(hotkeyToString(hk).length > 0);
    resetButton?.setEnabled(hotkeyToString(hk) !== defaultString);
  };
  refresh(getKeybind(action.id));
  whileConnected<Hotkey | null>(row, (cb) => onKeybindChange(action.id, cb), refresh);
  return row;
}

/** Sub-headings for the long Game section, by action id. */
function gameGroupOf(action: KeybindAction): string {
  if (action.id.startsWith("game.move-")) return "Movement";
  if (action.allowClear) return "Open directly";
  return "Actions";
}

function sectionBody(section: KeybindSection, body: HTMLElement): void {
  let group: string | null = null;
  for (const action of section.actions) {
    if (section.id === "game") {
      const next = gameGroupOf(action);
      if (next !== group) body.appendChild(h("div", "qws-kb-group", next));
      group = next;
    }
    body.appendChild(keybindRow(action));
  }

  // Team rows come after the catalog's own, so only those mean no team yet.
  const fixedCount = SECTION_CONFIG.find((s) => s.id === section.id)?.actions.length ?? 0;
  if (section.id === PET_SECTION_ID && section.actions.length <= fixedCount) {
    body.appendChild(h("div", "qws-kb-empty", "No pet teams yet. Each team you make in the Pets menu gets its own row here."));
  }
}

export function renderKeybindsMenu(container: HTMLElement): void {
  ensureKeybindsStyles();
  const ui = new Menu({ id: "keybinds", compact: true });
  ui.mount(container);

  // `.qmm-views` already is the panel, with its own scroller: nesting a second
  // one inside would stack two scroll containers, so fill it directly.
  const root = ui.root.querySelector<HTMLElement>(".qmm-views") ?? ui.root;
  root.replaceChildren();
  root.classList.add("qws-kb");

  root.appendChild(
    h("p", "qws-kb-intro", "Click a key, then press the new one. Esc cancels, Backspace or a right click removes it."),
  );

  for (const section of getKeybindSections()) {
    const card = collapsibleCard({
      title: section.title,
      description: section.description,
      collapsed: isSectionCollapsed(section.id),
      onToggle: (collapsed) => setSectionCollapsed(section.id, collapsed),
    });
    card.root.dataset.section = section.id;
    sectionBody(section, card.body);
    root.appendChild(card.root);
  }
}
