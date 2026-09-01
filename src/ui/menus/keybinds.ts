// src/ui/menus/keybinds.ts
//
// The Menu instance stays: `hotkeyButton` owns the key-capture behaviour and
// `ui.on('unmounted')` owns listener cleanup. Only the presentation is ours.

import { Menu, hotkeyToString, type HotkeyButtonElement } from "../menu";
import { getAriesStorage, updateAriesStorage } from "../../utils/localStorage";

const ICON_BOX_PX = 26;

/** Collapsed sections persist so the menu reopens the way it was left. */
function isSectionCollapsed(sectionId: string): boolean {
  return getAriesStorage().keybinds?.collapsed?.[sectionId] === true;
}

function setSectionCollapsed(sectionId: string, collapsed: boolean): void {
  updateAriesStorage(current => {
    const keybinds = (current.keybinds ??= {});
    const map = (keybinds.collapsed ??= {});
    if (collapsed) map[sectionId] = true;
    else delete map[sectionId];
  });
}
import {
  BORDER,
  CARD_BG,
  TEXT,
  TEXT_DIM,
  button,
  card,
  css,
  ensurePanelStyles,
  iconBox,
  sectionLabel,
  setButtonEnabled,
  toggle,
} from "./panel-ui";
import {
  getKeybind,
  getKeybindSections,
  getDefaultKeybind,
  onKeybindChange,
  resetKeybind,
  setKeybind,
  getKeybindHoldDetection,
  setKeybindHoldDetection,
  onKeybindHoldDetectionChange,
  type KeybindAction,
} from "../../services/keybinds";

/** Hold-detection control: a toggle plus its label, with its own listener. */
function createHoldControl(action: KeybindAction): { root: HTMLElement; detach: () => void } {
  const holdDetection = action.holdDetection!;
  const wrap = document.createElement("div");
  css(wrap, { display: "flex", alignItems: "center", gap: "7px", flex: "0 0 auto" });

  const label = document.createElement("span");
  css(label, { fontSize: "11px", color: TEXT_DIM, whiteSpace: "nowrap" });
  label.textContent = holdDetection.label;
  if (holdDetection.description) label.title = holdDetection.description;

  const control = toggle(getKeybindHoldDetection(action.id), on =>
    setKeybindHoldDetection(action.id, on),
  );
  control.title = holdDetection.description || holdDetection.label;

  const detach = onKeybindHoldDetectionChange(action.id, enabled => {
    (control as any).setChecked?.(enabled);
  });

  wrap.append(label, control);
  return { root: wrap, detach };
}

function createKeybindRow(ui: Menu, action: KeybindAction): HTMLElement {
  const row = document.createElement("div");
  css(row, {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 10px",
    borderRadius: "10px",
    background: CARD_BG,
    border: `1px solid ${BORDER}`,
    flexShrink: "0",
  });

  // Real game art where the action has one, so a shortcut is recognisable at a
  // glance rather than by an approximate emoji.
  if (action.icon) {
    row.appendChild(iconBox(action.icon, ICON_BOX_PX, "keybinds"));
  }

  // Label column, with the optional hint underneath it.
  const labelCol = document.createElement("div");
  css(labelCol, { display: "flex", flexDirection: "column", gap: "2px", flex: "1 1 auto", minWidth: "0" });

  const name = document.createElement("div");
  css(name, { fontSize: "12px", color: TEXT, overflow: "hidden", textOverflow: "ellipsis" });
  name.textContent = action.label;
  labelCol.appendChild(name);

  if (action.hint) {
    const hint = document.createElement("div");
    css(hint, { fontSize: "10px", color: TEXT_DIM, lineHeight: "1.4" });
    hint.textContent = action.hint;
    labelCol.appendChild(hint);
  }

  const controls = document.createElement("div");
  css(controls, { display: "flex", alignItems: "center", gap: "8px", flex: "0 0 auto" });

  const hotkeyButton = ui.hotkeyButton(
    getKeybind(action.id),
    hk => setKeybind(action.id, hk),
    {
      emptyLabel: "Unassigned",
      listeningLabel: "Press a key",
      clearable: true,
      allowModifierOnly: action.allowModifierOnly,
    },
  ) as HotkeyButtonElement;
  css(hotkeyButton as HTMLElement, { flexShrink: "0" });

  let detachHold: (() => void) | null = null;
  if (action.holdDetection) {
    const hold = createHoldControl(action);
    detachHold = hold.detach;
    controls.appendChild(hold.root);
  }
  controls.appendChild(hotkeyButton);

  // The game section's core bindings must always keep a key, so they get no
  // clear button unless the action opts in.
  const clearBtn =
    action.sectionId === "game" && !action.allowClear
      ? null
      : button("✕", "danger", () => {
          setKeybind(action.id, null);
          const refreshed = getKeybind(action.id);
          hotkeyButton.refreshHotkey(refreshed);
          updateButtons(refreshed);
        });
  if (clearBtn) {
    clearBtn.title = "Remove this shortcut";
    controls.appendChild(clearBtn);
  }

  const defaultHotkey = getDefaultKeybind(action.id);
  const defaultString = hotkeyToString(defaultHotkey);

  const resetBtn = defaultHotkey
    ? button("⟲", "neutral", () => {
        resetKeybind(action.id);
        const refreshed = getKeybind(action.id);
        hotkeyButton.refreshHotkey(refreshed);
        updateButtons(refreshed);
      })
    : null;
  if (resetBtn) {
    resetBtn.title = "Restore default shortcut";
    controls.appendChild(resetBtn);
  }

  function setEnabled(btn: HTMLButtonElement | null, enabled: boolean): void {
    if (btn) setButtonEnabled(btn, enabled);
  }

  function updateButtons(current: ReturnType<typeof getKeybind>): void {
    setEnabled(clearBtn, hotkeyToString(current).length > 0);
    setEnabled(resetBtn, hotkeyToString(current) !== defaultString);
  }

  updateButtons(getKeybind(action.id));

  const stop = onKeybindChange(action.id, hk => {
    hotkeyButton.refreshHotkey(hk);
    updateButtons(hk);
  });
  ui.on("unmounted", stop);
  if (detachHold) ui.on("unmounted", detachHold);

  row.append(labelCol, controls);
  return row;
}

export async function renderKeybindsMenu(container: HTMLElement) {
  ensurePanelStyles();

  const ui = new Menu({ id: "keybinds", compact: true });
  ui.mount(container);

  // `.qmm-views` already *is* the panel: same gradient, same rounded border,
  // same padding, and its own scroller. Nesting a second identical panel inside
  // it would stack two scroll containers, so style it directly instead.
  const root = (ui.root.querySelector(".qmm-views") as HTMLElement) ?? ui.root;
  root.innerHTML = "";
  root.classList.add("qws-pnl-root");
  css(root, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "620px",
    maxWidth: "100%",
    // A definite height, not 100%: the HUD window is itself a scroller and has
    // no fixed height, so `height:100%` would collapse onto the content and
    // hand the scrollbar back to the whole window.
    height: "min(70vh, 600px)",
    overflowY: "auto",
    boxSizing: "border-box",
  });

  for (const section of getKeybindSections()) {
    const sectionCard = card();
    sectionCard.dataset.section = section.id;
    // The shared card() allows shrinking (minHeight:0) for the Skins two-column
    // layout. In a scrolling list that makes every card collapse under its own
    // content and the rows overlap, so opt out here.
    css(sectionCard, { flexShrink: "0", minHeight: "auto" });

    // Header doubles as the collapse control.
    const head = document.createElement("button");
    head.type = "button";
    css(head, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "0",
      border: "none",
      background: "none",
      cursor: "pointer",
      textAlign: "left",
      font: "inherit",
      color: "inherit",
    });

    const chevron = document.createElement("span");
    css(chevron, {
      color: TEXT_DIM,
      fontSize: "10px",
      transition: "transform 140ms ease",
      flex: "0 0 auto",
      marginLeft: "auto",
    });
    chevron.textContent = "▶";

    const titles = document.createElement("div");
    css(titles, { display: "flex", flexDirection: "column", gap: "3px", minWidth: "0", flex: "1 1 auto" });
    titles.appendChild(sectionLabel(`${section.icon} ${section.title}`));
    if (section.description) {
      const desc = document.createElement("div");
      css(desc, { fontSize: "11px", color: TEXT_DIM, lineHeight: "1.45" });
      desc.textContent = section.description;
      titles.appendChild(desc);
    }

    head.append(titles, chevron);
    sectionCard.appendChild(head);

    const body = document.createElement("div");
    css(body, { display: "flex", flexDirection: "column", gap: "8px" });
    for (const action of section.actions) {
      body.appendChild(createKeybindRow(ui, action));
    }
    sectionCard.appendChild(body);

    let collapsed = isSectionCollapsed(section.id);
    const applyCollapsed = () => {
      body.style.display = collapsed ? "none" : "flex";
      chevron.style.transform = collapsed ? "rotate(0deg)" : "rotate(90deg)";
      head.setAttribute("aria-expanded", collapsed ? "false" : "true");
    };
    applyCollapsed();

    head.addEventListener("click", () => {
      collapsed = !collapsed;
      applyCollapsed();
      setSectionCollapsed(section.id, collapsed);
    });

    root.appendChild(sectionCard);
  }
}
