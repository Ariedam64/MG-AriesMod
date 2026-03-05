// src/ui/menus/keybinds.ts
import { Menu, hotkeyToString, type HotkeyButtonElement } from "../menu";
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

function createKeybindRow(ui: Menu, action: KeybindAction) {
  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.alignItems = "center";
  controls.style.flexWrap = "nowrap";
  controls.style.gap = "8px";

  const button = ui.hotkeyButton(
    getKeybind(action.id),
    (hk) => setKeybind(action.id, hk),
    {
      emptyLabel: "Unassigned",
      listeningLabel: "Press a key",
      clearable: true,
      allowModifierOnly: action.allowModifierOnly,
    }
  ) as HotkeyButtonElement;
  (button as HTMLElement).style.flexShrink = "0";

  controls.appendChild(button);

  let detachHoldListener: (() => void) | null = null;
  if (action.holdDetection) {
    if (action.id === "game.action") {
      const holdContainer = document.createElement("div");
      holdContainer.style.display = "flex";
      holdContainer.style.flexDirection = "column";
      holdContainer.style.alignItems = "center";
      holdContainer.style.gap = "4px";
      holdContainer.style.flex = "0 1 160px";
      holdContainer.style.alignSelf = "center";

      const holdButton = ui.btn("Hold", { size: "sm", variant: "secondary" });
      holdButton.style.display = "inline-flex";
      holdButton.style.alignItems = "center";
      holdButton.style.gap = "6px";
      holdButton.setAttribute("aria-label", action.holdDetection.label);
      holdButton.title = action.holdDetection.label;

      const holdIndicator = document.createElement("span");
      holdIndicator.textContent = "●";
      holdIndicator.style.fontSize = "10px";
      holdIndicator.style.lineHeight = "1";
      holdIndicator.setAttribute("aria-hidden", "true");

      const holdText = document.createElement("span");
      holdText.textContent = "Hold";

      holdButton.replaceChildren(holdIndicator, holdText);

      let holdEnabled = getKeybindHoldDetection(action.id);

      const updateHoldButton = (enabled: boolean) => {
        holdEnabled = enabled;
        holdButton.setAttribute("aria-pressed", enabled ? "true" : "false");
        holdIndicator.style.color = enabled ? "#34c759" : "#ff3b30";
      };

      updateHoldButton(holdEnabled);

      holdButton.addEventListener("click", () => {
        setKeybindHoldDetection(action.id, !holdEnabled);
      });

      detachHoldListener = onKeybindHoldDetectionChange(action.id, (enabled) => {
        updateHoldButton(enabled);
      });

      holdContainer.appendChild(holdButton);

      if (action.holdDetection.description) {
        const holdDesc = document.createElement("div");
        holdDesc.textContent = action.holdDetection.description;
        holdDesc.style.fontSize = "11px";
        holdDesc.style.opacity = "0.65";
        holdDesc.style.maxWidth = "100%";
        holdDesc.style.textAlign = "center";
        holdContainer.appendChild(holdDesc);
      }

      controls.appendChild(holdContainer);
    } else {
      const holdContainer = document.createElement("div");
      holdContainer.style.display = "flex";
      holdContainer.style.flexDirection = "column";
      holdContainer.style.alignItems = "flex-start";
      holdContainer.style.gap = "2px";
      holdContainer.style.padding = "2px 4px";
      holdContainer.style.borderRadius = "8px";
      holdContainer.style.background = "rgba(255, 255, 255, 0.04)";
      holdContainer.style.flex = "0 1 180px";
      holdContainer.style.maxWidth = "180px";

      const holdLabel = document.createElement("label");
      holdLabel.style.display = "inline-flex";
      holdLabel.style.alignItems = "center";
      holdLabel.style.gap = "6px";
      holdLabel.style.fontSize = "12px";
      holdLabel.style.cursor = "pointer";

      const holdToggle = ui.switch(getKeybindHoldDetection(action.id)) as HTMLInputElement;
      holdToggle.style.margin = "0";
      holdToggle.setAttribute("aria-label", action.holdDetection.label);

      const holdText = document.createElement("span");
      holdText.textContent = action.holdDetection.label;
      holdText.style.opacity = "0.85";

      holdLabel.append(holdToggle, holdText);
      holdContainer.appendChild(holdLabel);

      if (action.holdDetection.description) {
        const holdDesc = document.createElement("div");
        holdDesc.textContent = action.holdDetection.description;
        holdDesc.style.fontSize = "11px";
        holdDesc.style.opacity = "0.65";
        holdDesc.style.maxWidth = "100%";
        holdContainer.appendChild(holdDesc);
      }

      holdToggle.addEventListener("change", () => {
        setKeybindHoldDetection(action.id, holdToggle.checked);
      });

      detachHoldListener = onKeybindHoldDetectionChange(action.id, (enabled) => {
        holdToggle.checked = enabled;
      });

      controls.appendChild(holdContainer);
    }
  }

  const actionsWrap = document.createElement("div");
  actionsWrap.style.display = "flex";
  actionsWrap.style.alignItems = "center";
  actionsWrap.style.gap = "4px";
  actionsWrap.style.marginLeft = "auto";

  const clearBtn =
    action.sectionId === "game" && !action.allowClear
      ? null
      : ui.btn("", {
          icon: "🗑️",
          variant: "danger",
          size: "sm",
          tooltip: "Remove this shortcut",
          ariaLabel: "Remove keybind",
        });

  if (clearBtn) {
    actionsWrap.appendChild(clearBtn);
  }

  const defaultHotkey = getDefaultKeybind(action.id);
  const defaultString = hotkeyToString(defaultHotkey);

  let resetBtn: HTMLButtonElement | null = null;
  if (defaultHotkey) {
    resetBtn = ui.btn("", {
      icon: "🔄",
      variant: "primary",
      size: "sm",
      tooltip: "Restore default shortcut",
      ariaLabel: "Reset keybind to default",
    });

    actionsWrap.appendChild(resetBtn);
  }

  const setButtonEnabled = (btn: HTMLButtonElement | null, enabled: boolean) => {
    if (!btn) return;
    const setter = (btn as any).setEnabled as ((value: boolean) => void) | undefined;
    if (setter) {
      setter(enabled);
    } else {
      btn.disabled = !enabled;
      btn.classList.toggle("is-disabled", !enabled);
      btn.setAttribute("aria-disabled", (!enabled).toString());
    }
  };

  const updateButtons = (current: ReturnType<typeof getKeybind>) => {
    const hasHotkey = hotkeyToString(current).length > 0;
    if (clearBtn) {
      setButtonEnabled(clearBtn, hasHotkey);
    }

    if (resetBtn) {
      const isDefault = hotkeyToString(current) === defaultString;
      setButtonEnabled(resetBtn, !isDefault);
    }
  };

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      setKeybind(action.id, null);
      const refreshed = getKeybind(action.id);
      button.refreshHotkey(refreshed);
      updateButtons(refreshed);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      resetKeybind(action.id);
      const refreshed = getKeybind(action.id);
      button.refreshHotkey(refreshed);
      updateButtons(refreshed);
    });
  }

  controls.appendChild(actionsWrap);

  updateButtons(getKeybind(action.id));

  const stop = onKeybindChange(action.id, (hk) => {
    button.refreshHotkey(hk);
    updateButtons(hk);
  });
  ui.on("unmounted", stop);
  if (detachHoldListener) ui.on("unmounted", detachHoldListener);

  const row = ui.formRow(action.label, controls, { labelWidth: "180px" });
  row.label.style.fontSize = "13px";
  row.label.style.opacity = "0.92";

  if (action.hint) {
    const hintEl = document.createElement("div");
    hintEl.textContent = action.hint;
    hintEl.style.fontSize = "11px";
    hintEl.style.opacity = "0.7";
    hintEl.style.marginTop = "2px";
    hintEl.style.gridColumn = "2 / 3";
    row.root.appendChild(hintEl);
  }

  return row.root;
}

export async function renderKeybindsMenu(container: HTMLElement) {
  const ui = new Menu({ id: "keybinds", compact: true });
  ui.mount(container);

  const view = ui.root.querySelector(".qmm-views") as HTMLElement;
  view.innerHTML = "";
  view.style.display = "flex";
  view.style.flexDirection = "column";
  view.style.gap = "12px";
  view.style.padding = "8px";
  view.style.maxHeight = "60vh";
  view.style.overflowY = "auto";

  const wrapper = document.createElement("div");
  wrapper.style.display = "grid";
  wrapper.style.gap = "12px";
  wrapper.style.width = "100%";
  wrapper.style.maxWidth = "720px";
  wrapper.style.margin = "0 auto";

  for (const section of getKeybindSections()) {
    const card = ui.card(`${section.icon} ${section.title}`, { tone: "muted", align: "stretch" });
    card.root.dataset.section = section.id;
    card.body.style.display = "flex";
    card.body.style.flexDirection = "column";
    card.body.style.gap = "10px";

    const desc = document.createElement("p");
    desc.textContent = section.description;
    desc.style.margin = "0";
    desc.style.fontSize = "12px";
    desc.style.opacity = "0.78";
    card.body.appendChild(desc);

    for (const action of section.actions) {
      const row = createKeybindRow(ui, action);
      card.body.appendChild(row);
    }

    wrapper.appendChild(card.root);
  }

  view.appendChild(wrapper);
}
