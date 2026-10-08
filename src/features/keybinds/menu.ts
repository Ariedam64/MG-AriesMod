// The Keybinds menu: one collapsible card per section, one row per shortcut.

import { hotkeyToString, type Hotkey } from "../../lib/hotkey";
import { getAriesStorage, updateAriesStorage } from "../../platform/storage";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { hotkeyButton } from "../../ui/kit/hotkey";
import { collapsibleCard, settingRow } from "../../ui/kit/layout";
import { Menu } from "../../ui/kit/menu";
import { switchInput } from "../../ui/kit/toggles";
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

/** The Rapid fire style toggle shown next to the key, with its label. */
function holdControl(action: KeybindAction): HTMLElement {
  const hold = action.holdDetection!;
  const wrap = h("div", "qmm-flex");
  wrap.style.flexWrap = "nowrap";

  const label = h("span", "qmm-setting-row__hint", hold.label);
  label.style.whiteSpace = "nowrap";
  if (hold.description) label.title = hold.description;

  const toggle = switchInput(getKeybindHoldDetection(action.id), (on) => setKeybindHoldDetection(action.id, on));
  toggle.title = hold.description || hold.label;
  whileConnected<boolean>(wrap, (cb) => onKeybindHoldDetectionChange(action.id, cb), (on) => toggle.setChecked(on));

  wrap.append(label, toggle);
  return wrap;
}

function keybindRow(action: KeybindAction): HTMLElement {
  const keyButton = hotkeyButton(getKeybind(action.id), (hk) => setKeybind(action.id, hk), {
    emptyLabel: "Unassigned",
    listeningLabel: "Press a key",
    clearable: true,
    allowModifierOnly: action.allowModifierOnly,
  });
  keyButton.style.flexShrink = "0";

  const { row, controls } = settingRow(action.label, action.hint ?? null, keyButton, {
    icon: action.icon,
    iconTag: "keybinds",
  });
  if (action.holdDetection) controls.insertBefore(holdControl(action), keyButton);

  const defaultString = hotkeyToString(getDefaultKeybind(action.id));
  const refresh = (hk: Hotkey | null) => {
    keyButton.refreshHotkey(hk);
    clearButton?.setEnabled(hotkeyToString(hk).length > 0);
    resetButton?.setEnabled(hotkeyToString(hk) !== defaultString);
  };

  // The Game section's core bindings must always keep a key, so they get no
  // clear button unless the action opts in.
  const clearButton =
    action.sectionId === "game" && !action.allowClear
      ? null
      : button("✕", {
          variant: "danger",
          size: "sm",
          title: "Remove this shortcut",
          onClick: () => setKeybind(action.id, null),
        });
  if (clearButton) controls.appendChild(clearButton);

  const resetButton = defaultString
    ? button("⟲", { size: "sm", title: "Restore default shortcut", onClick: () => resetKeybind(action.id) })
    : null;
  if (resetButton) controls.appendChild(resetButton);

  refresh(getKeybind(action.id));
  whileConnected<Hotkey | null>(row, (cb) => onKeybindChange(action.id, cb), refresh);
  return row;
}

export function renderKeybindsMenu(container: HTMLElement): void {
  const ui = new Menu({ id: "keybinds", compact: true });
  ui.mount(container);

  // `.qmm-views` already is the panel, with its own scroller: nesting a second
  // one inside would stack two scroll containers, so fill it directly.
  const root = ui.root.querySelector<HTMLElement>(".qmm-views") ?? ui.root;
  root.replaceChildren();
  Object.assign(root.style, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "620px",
    maxWidth: "100%",
    // A definite height, not 100%: the HUD window scrolls itself and has no
    // fixed height, so 100% would collapse onto the content.
    height: "min(70vh, 600px)",
    overflowY: "auto",
    boxSizing: "border-box",
  });

  for (const section of getKeybindSections()) {
    const card = collapsibleCard({
      icon: section.icon,
      title: section.title,
      description: section.description,
      collapsed: isSectionCollapsed(section.id),
      onToggle: (collapsed) => setSectionCollapsed(section.id, collapsed),
    });
    card.root.dataset.section = section.id;
    for (const action of section.actions) card.body.appendChild(keybindRow(action));
    root.appendChild(card.root);
  }
}
