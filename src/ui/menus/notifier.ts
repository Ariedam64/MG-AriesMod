// src/ui/menus/notifier.ts
import { Menu } from "../menu";
import {
  NotifierService,
  formatRuleSummary,
  formatLastSeen,
  weatherStateSignature,
  formatWeatherMutation,
  type NotifierRow,
  type NotifierState,
  type NotifierFilters,
  type NotifierRule,
  type WeatherRow,
  type WeatherState,
  type NotifierContext,
  type ContextStopDefaults,
} from "../../services/notifier";


import { audio, type AudioContextKey, type PlaybackMode } from "../../utils/audio";
import { PetAlertService } from "../../services/pet-alerts";
import { PetsService } from "../../services/pets";
import type { PetInfo } from "../../services/player";
import { attachSpriteIcon } from "../spriteIconCache";
import { isFloatingBellEnabled, setFloatingBellEnabled } from "../../utils/notificationBellFloating";

type RuleEditorRow = {
  id: string;
  name: string;
  type: string;
  context: NotifierContext;
};

let rulePopover: HTMLDivElement | null = null;
let detachRuleDocHandler: (() => void) | null = null;
let detachRuleKeyBlocker: (() => void) | null = null;
let detachRuleWheelBlocker: (() => void) | null = null;
let detachRuleDragHandler: (() => void) | null = null;

export const closeRuleEditor = () => {
  if (rulePopover) {
    try { rulePopover.remove(); } catch {}
    rulePopover = null;
  }
  if (detachRuleDocHandler) {
    detachRuleDocHandler();
    detachRuleDocHandler = null;
  }
  if (detachRuleKeyBlocker) {
    detachRuleKeyBlocker();
    detachRuleKeyBlocker = null;
  }
  if (detachRuleWheelBlocker) {
    detachRuleWheelBlocker();
    detachRuleWheelBlocker = null;
  }
  if (detachRuleDragHandler) {
    detachRuleDragHandler();
    detachRuleDragHandler = null;
  }
};

const setSwitchCapState = (wrap: HTMLElement, capped: boolean) => {
  if (capped) {
    wrap.setAttribute("aria-disabled", "true");
    wrap.style.opacity = "0.5";
    wrap.style.pointerEvents = "none";
    (wrap as HTMLLabelElement).style.cursor = "not-allowed";
    (wrap as HTMLLabelElement).title = "Max owned — notifications disabled";
  } else {
    wrap.removeAttribute("aria-disabled");
    wrap.style.opacity = "";
    wrap.style.pointerEvents = "";
    (wrap as HTMLLabelElement).style.cursor = "";
    (wrap as HTMLLabelElement).removeAttribute("title");
  }
};

const createSwitch = (onToggle?: (checked: boolean) => void) => {
  const wrap = document.createElement("label");
  wrap.style.display = "inline-flex";
  wrap.style.alignItems = "center";
  wrap.style.justifyContent = "center";
  wrap.style.width = "100%";
  wrap.style.padding = "4px 6px";
  wrap.style.userSelect = "none";
  wrap.setAttribute("role", "switch");
  wrap.setAttribute("aria-checked", "false");

  const box = document.createElement("span");
  box.style.position = "relative";
  box.style.width = "42px";
  box.style.height = "24px";
  box.style.borderRadius = "999px";
  box.style.background = "#1f2328";
  box.style.border = "1px solid #4446";
  box.style.display = "inline-block";
  box.style.boxShadow = "inset 0 0 0 1px #0005";

  const knob = document.createElement("span");
  knob.style.position = "absolute";
  knob.style.top = "50%";
  knob.style.left = "3px";
  knob.style.transform = "translateY(-50%)";
  knob.style.width = "18px";
  knob.style.height = "18px";
  knob.style.borderRadius = "50%";
  knob.style.background = "#e7eef7";
  knob.style.boxShadow = "0 1px 2px rgba(0,0,0,.7)";
  knob.style.transition = "left 160ms ease, transform 160ms ease";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.style.position = "absolute";
  input.style.opacity = "0";
  input.style.pointerEvents = "none";
  input.tabIndex = -1;

  const apply = (on: boolean) => {
    input.checked = on;
    wrap.setAttribute("aria-checked", on ? "true" : "false");
    knob.style.left = on ? "21px" : "3px";
    knob.style.transform = on ? "translateY(-50%) scale(1.02)" : "translateY(-50%) scale(1)";
    if (on) {
      box.style.background = "linear-gradient(180deg, #2b5cff, #1e40ff)";
      box.style.borderColor = "#7aa2ff";
      box.style.boxShadow = "0 0 0 2px #7aa2ff55, inset 0 0 0 1px #0005";
    } else {
      box.style.background = "#1f2328";
      box.style.borderColor = "#4446";
      box.style.boxShadow = "inset 0 0 0 1px #0005";
    }
  };

  input.disabled = true;
  wrap.addEventListener("mousedown", (e) => e.preventDefault());
  wrap.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    apply(!input.checked);
    onToggle?.(input.checked);
  });

  box.appendChild(knob);
  wrap.appendChild(input);
  wrap.appendChild(box);
  apply(false);
  return wrap;
};

const setSwitchVisual = (wrap: HTMLElement, checked: boolean) => {
  const input = wrap.querySelector("input") as HTMLInputElement | null;
  const box = wrap.querySelector("span") as HTMLSpanElement | null;
  const knob = box?.querySelector("span") as HTMLSpanElement | null;
  if (!input || !box || !knob) return;

  input.checked = !!checked;
  knob.style.left = checked ? "21px" : "3px";
  knob.style.transform = checked ? "translateY(-50%) scale(1.02)" : "translateY(-50%) scale(1)";
  if (checked) {
    box.style.background = "linear-gradient(180deg, #2b5cff, #1e40ff)";
    box.style.borderColor = "#7aa2ff";
    box.style.boxShadow = "0 0 0 2px #7aa2ff55, inset 0 0 0 1px #0005";
    (wrap as HTMLLabelElement).setAttribute("aria-checked", "true");
  } else {
    box.style.background = "#1f2328";
    box.style.borderColor = "#4446";
    box.style.boxShadow = "inset 0 0 0 1px #0005";
    (wrap as HTMLLabelElement).setAttribute("aria-checked", "false");
  }
};

const wrapCell = (child: HTMLElement) => {
  const d = document.createElement("div");
  d.style.display = "flex";
  d.style.alignItems = "center";
  d.style.justifyContent = "center";
  d.style.borderBottom = "1px solid #ffffff12";
  d.style.padding = "4px 6px";
  d.style.boxSizing = "border-box";
  d.appendChild(child);
  return d;
};

const mkHeadCell = (txt: string, align: "center" | "left" = "center") => {
  const el = document.createElement("div");
  el.textContent = txt;
  el.style.fontWeight = "600";
  el.style.opacity = "0.9";
  el.style.padding = "4px 6px";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = align === "left" ? "flex-start" : "center";
  return el;
};

export function rarityBadge(raw: string) {
  const rarity = String(raw || "").trim();
  const key = (() => {
    const k = rarity.toLowerCase();
    // MGData's API returns "Mythic" while the hardcoded catalog uses "Mythical".
    if (k === "mythic" || k === "mythical") return "Mythical";
    if (k === "celestial") return "Celestial";
    if (k === "divine") return "Divine";
    if (k === "legendary") return "Legendary";
    if (k === "rare") return "Rare";
    if (k === "uncommon") return "Uncommon";
    if (k === "common") return "Common";
    return rarity || "—";
  })();

  const COLORS: Record<string, string | null> = {
    Common: "#E7E7E7",
    Uncommon: "#67BD4D",
    Rare: "#0071C6",
    Legendary: "#FFC734",
    Mythical: "#9944A7",
    Divine: "#FF7835",
    Celestial: null,
  };

  const darkText = new Set(["Common", "Uncommon", "Legendary", "Divine"]);

  const el = document.createElement("div");
  el.textContent = key;
  Object.assign(el.style, {
    display: "inline-flex",
    justifyContent: "center",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: "5px",
    fontSize: "12px",
    fontWeight: "700",
    margin: "2px auto",
    color: darkText.has(key) ? "#0b0b0b" : "#ffffff",
    boxShadow: "0 0 0 1px #0006 inset",
    lineHeight: "1.1",
    whiteSpace: "nowrap",
  } as CSSStyleDeclaration);

  if (key === "Celestial") {
    if (!document.getElementById("qws-celestial-kf")) {
      const style = document.createElement("style");
      style.id = "qws-celestial-kf";
      style.textContent = `
@keyframes qwsCelestialShift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}`;
      document.head.appendChild(style);
    }
    el.style.background = `linear-gradient(130deg,
      rgb(0,180,216) 0%,
      rgb(124,42,232) 40%,
      rgb(160,0,126) 60%,
      rgb(255,215,0) 100%)`;
    el.style.backgroundSize = "200% 200%";
    el.style.animation = "qwsCelestialShift 4s linear infinite";
  } else {
    el.style.background = COLORS[key] || "#444";
  }

  return el;
}


const applyRuleState = (
  itemCell: HTMLDivElement,
  ruleCell: HTMLDivElement | null,
  rule: NotifierRule | null,
) => {
  const gearBtn = ruleCell?.querySelector<HTMLButtonElement>("button[data-role='rule']") ?? null;
  const hint = itemCell.querySelector<HTMLDivElement>('[data-role="rule-hint"]');
  const hasRule = !!(rule && (rule.sound || rule.volume != null || rule.playbackMode || rule.stopMode || rule.loopIntervalMs != null));
  const summary = hasRule ? formatRuleSummary(rule) : "";
  if (gearBtn) {
    gearBtn.dataset.active = hasRule ? "1" : "0";
    gearBtn.title = hasRule && summary ? `Custom rule — ${summary}` : "Custom rule";
  }
  if (hint) {
    if (hasRule && summary) {
      hint.textContent = summary;
      hint.style.visibility = "visible";
    } else {
      hint.textContent = "";
      hint.style.visibility = "hidden";
    }
  }
};

const openRuleEditor = (ui: Menu, row: RuleEditorRow, anchor: HTMLElement) => {
  closeRuleEditor();

  const pop = document.createElement("div");
  pop.className = "qws-rule-popover";
  Object.assign(pop.style, {
    position: "fixed",
    zIndex: "var(--qws-z-popover)",
    minWidth: "260px",
    maxWidth: "320px",
    padding: "14px 16px",
    borderRadius: "14px",
    border: "1px solid #32404e",
    background: "linear-gradient(180deg, #111923, #0b131c)",
    boxShadow: "0 16px 40px rgba(0,0,0,0.45)",
  } as CSSStyleDeclaration);

  const margin = 12;
  const clampPosition = (value: number, min: number, max: number) => {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return value;
    if (max >= min) {
      return Math.min(Math.max(value, min), max);
    }
    return Math.min(Math.max(value, max), min);
  };
  const applyPosition = (left: number, top: number) => {
    const width = pop.offsetWidth;
    const height = pop.offsetHeight;
    const boundedLeft = clampPosition(left, margin, window.innerWidth - width - margin);
    const boundedTop = clampPosition(top, margin, window.innerHeight - height - margin);
    pop.style.left = `${Math.round(boundedLeft)}px`;
    pop.style.top = `${Math.round(boundedTop)}px`;
    return { left: boundedLeft, top: boundedTop };
  };

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "flex-start";
  header.style.gap = "12px";
  header.style.cursor = "move";
  header.style.userSelect = "none";
  header.style.touchAction = "none";

  const titleWrap = document.createElement("div");
  const title = document.createElement("div");
  title.textContent = row.name;
  title.style.fontWeight = "700";
  title.style.fontSize = "14px";
  title.style.lineHeight = "1.2";
  const subtitle = document.createElement("div");
  subtitle.textContent = row.type;
  subtitle.style.opacity = "0.7";
  subtitle.style.fontSize = "12px";
  titleWrap.append(title, subtitle);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  Object.assign(closeBtn.style, {
    background: "transparent",
    border: "none",
    color: "#c8d7e8",
    fontSize: "16px",
    lineHeight: "1",
    cursor: "pointer",
  } as CSSStyleDeclaration);
  closeBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    closeRuleEditor();
  });

  header.append(titleWrap, closeBtn);

  let dragState: {
    pointerId: number;
    startX: number;
    startY: number;
    baseLeft: number;
    baseTop: number;
  } | null = null;

  const onDragMove = (ev: PointerEvent) => {
    if (!dragState) return;
    if (ev.pointerId !== dragState.pointerId) return;
    const dx = ev.clientX - dragState.startX;
    const dy = ev.clientY - dragState.startY;
    applyPosition(dragState.baseLeft + dx, dragState.baseTop + dy);
  };

  const stopDrag = (ev?: PointerEvent) => {
    if (!dragState) return;
    if (ev && ev.pointerId !== dragState.pointerId) return;
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", stopDrag);
    document.removeEventListener("pointercancel", stopDrag);
    try { header.releasePointerCapture(dragState.pointerId); } catch {}
    dragState = null;
  };

  const onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement | null;
    if (target && closeBtn.contains(target)) return;
    if (dragState) stopDrag();
    const rect = pop.getBoundingClientRect();
    dragState = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      baseLeft: rect.left,
      baseTop: rect.top,
    };
    try { header.setPointerCapture(ev.pointerId); } catch {}
    document.addEventListener("pointermove", onDragMove);
    document.addEventListener("pointerup", stopDrag);
    document.addEventListener("pointercancel", stopDrag);
    ev.preventDefault();
  };

  header.addEventListener("pointerdown", onPointerDown);
  detachRuleDragHandler = () => {
    header.removeEventListener("pointerdown", onPointerDown);
    stopDrag();
  };

  pop.appendChild(header);

  const current = NotifierService.getRule(row.id);
  const defaults = audio.getPlaybackSettings(row.context);
  const contextDefaults = (row.context === "shops" || row.context === "weather")
    ? NotifierService.getContextStopDefaults(row.context)
    : { stopMode: "manual", stopRepeats: null, loopIntervalMs: defaults.loopIntervalMs };
  const allowPurchase = row.context === "shops";

  const defaultSoundName = (() => {
    const label = (defaults.defaultSoundName || "").trim();
    return label || "Default";
  })();
  const formatModeLabel = (mode: PlaybackMode) => mode === "loop" ? "Loop" : "One-shot";
  const defaultModeLabel = formatModeLabel(defaults.mode);
  const defaultIntervalMs = Math.max(
    150,
    Math.floor(contextDefaults.loopIntervalMs ?? defaults.loopIntervalMs ?? 150),
  );

  const soundField = document.createElement("div");
  soundField.className = "qws-rule-field";
  const soundLabel = document.createElement("label");
  soundLabel.textContent = "Sound";
  const soundSelect = document.createElement("select");
  soundSelect.className = "qmm-input";
  soundSelect.style.width = "100%";
  const populateSoundOptions = () => {
    const selected = current?.sound ?? "";
    soundSelect.innerHTML = "";
    const optDefault = document.createElement("option");
    optDefault.value = "";
    optDefault.textContent = defaultSoundName;
    soundSelect.appendChild(optDefault);
    const names = audio.listSounds();
    for (const name of names) {
      if (name === defaultSoundName && selected !== name) continue;
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      soundSelect.appendChild(opt);
    }
    if (selected && !names.includes(selected)) {
      const extra = document.createElement("option");
      extra.value = selected;
      extra.textContent = selected.length > 32 ? `${selected.slice(0, 29)}…` : selected;
      extra.dataset.extra = "1";
      soundSelect.appendChild(extra);
    }
    soundSelect.value = selected;
  };
  populateSoundOptions();
  soundField.append(soundLabel, soundSelect);
  pop.appendChild(soundField);

  const baseVolume = Math.max(0, Math.min(1, defaults.volume || 0));
  const defaultVolumePct = Math.round(baseVolume * 100);
  const volumeField = document.createElement("div");
  volumeField.className = "qws-rule-field";
  const volumeLabel = document.createElement("label");
  volumeLabel.textContent = "Volume";
  const volumeWrap = document.createElement("div");
  volumeWrap.style.display = "flex";
  volumeWrap.style.alignItems = "center";
  volumeWrap.style.gap = "10px";
  const volumeRange = document.createElement("input");
  volumeRange.type = "range";
  volumeRange.min = "0";
  volumeRange.max = "100";
  volumeRange.step = "1";
  volumeRange.style.width = "100%";
  const volumeValue = document.createElement("span");
  volumeValue.style.minWidth = "38px";
  volumeValue.style.textAlign = "right";
  const applyVolumeDisplay = (value: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    volumeRange.value = String(clamped);
    volumeValue.textContent = `${clamped}%`;
  };
  const initialVolume = current?.volume != null ? current.volume : baseVolume;
  applyVolumeDisplay(Math.round(Math.max(0, Math.min(1, initialVolume)) * 100));
  volumeRange.addEventListener("input", () => {
    const raw = Number(volumeRange.value);
    const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(100, Math.round(raw))) : defaultVolumePct;
    applyVolumeDisplay(clamped);
  });
  const volumeHint = document.createElement("div");
  volumeHint.textContent = `Default: ${defaultVolumePct}%`;
  volumeHint.style.opacity = "0.7";
  volumeHint.style.fontSize = "11px";
  volumeHint.style.marginTop = "4px";
  volumeWrap.append(volumeRange, volumeValue);
  volumeField.append(volumeLabel, volumeWrap, volumeHint);
  pop.appendChild(volumeField);

  const modeField = document.createElement("div");
  modeField.className = "qws-rule-field";
  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Playback mode";
  const modeSelect = document.createElement("select");
  modeSelect.className = "qmm-input";
  const modeOptions: PlaybackMode[] = allowPurchase
    ? (defaults.mode === "loop" ? ["loop", "oneshot"] : ["oneshot", "loop"])
    : ["oneshot"];
  modeOptions.forEach((value) => {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = formatModeLabel(value);
    modeSelect.appendChild(opt);
  });
  const initialMode = allowPurchase
    ? (current?.playbackMode ?? defaults.mode)
    : "oneshot";
  modeSelect.value = initialMode === "loop" && !allowPurchase ? "oneshot" : initialMode;
  if (!allowPurchase) modeSelect.disabled = true;
  modeField.append(modeLabel, modeSelect);
  pop.appendChild(modeField);

  let stopSelect: HTMLSelectElement | null = null;
  const stopField = document.createElement("div");
  stopField.className = "qws-rule-field";
  if (allowPurchase) {
    const stopLabel = document.createElement("label");
    stopLabel.textContent = "Stop condition";
    stopSelect = document.createElement("select");
    stopSelect.className = "qmm-input";
    const stopOption = document.createElement("option");
    stopOption.value = "purchase";
    stopOption.textContent = "Until purchase";
    stopSelect.appendChild(stopOption);
    const initialStopMode = current?.stopMode ?? contextDefaults.stopMode;
    stopSelect.value = initialStopMode === "purchase" ? "purchase" : "purchase";
    stopField.append(stopLabel, stopSelect);
    pop.appendChild(stopField);
  }

  const intervalField = document.createElement("div");
  intervalField.className = "qws-rule-field";
  const intervalLabel = document.createElement("label");
  intervalLabel.textContent = "Loop interval (ms)";
  const intervalInput = document.createElement("input");
  intervalInput.type = "number";
  intervalInput.className = "qmm-input";
  intervalInput.min = "150";
  intervalInput.step = "50";
  intervalInput.placeholder = String(defaultIntervalMs);
  intervalInput.value = current?.loopIntervalMs != null ? String(current.loopIntervalMs) : "";
  intervalInput.inputMode = "numeric";
  intervalField.append(intervalLabel, intervalInput);
  if (allowPurchase) pop.appendChild(intervalField);

  const enforceIntegerOnly = (input: HTMLInputElement) => {
    input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const key = ev.key;
      if (/^[0-9]$/.test(key)) return;
      if (
        key === "Backspace" || key === "Delete" || key === "Tab" || key === "Enter" ||
        key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown" ||
        key === "Home" || key === "End"
      ) {
        return;
      }
      ev.preventDefault();
    });
    input.addEventListener("input", () => {
      const sanitized = input.value.replace(/\D+/g, "");
      if (sanitized !== input.value) input.value = sanitized;
    });
  };
  enforceIntegerOnly(intervalInput);

  const resolveMode = (): PlaybackMode => {
    const raw = modeSelect.value;
    if (raw === "oneshot" || raw === "loop") return raw;
    return allowPurchase ? defaults.mode : "oneshot";
  };
  const resolveStop = (): "manual" | "purchase" => {
    if (!allowPurchase) return "purchase";
    const raw = stopSelect?.value;
    if (raw === "purchase") return "purchase";
    return "purchase";
  };

  const updateLoopVisibility = () => {
    if (!allowPurchase) {
      stopField.style.display = "none";
      intervalField.style.display = "none";
      return;
    }
    const mode = resolveMode();
    const showLoop = mode === "loop";
    stopField.style.display = showLoop ? "grid" : "none";
    intervalField.style.display = showLoop ? "grid" : "none";
  };

  const forceLoopMode = () => {
    if (!allowPurchase) return;
    if (modeSelect.value === "loop") return;
    modeSelect.value = "loop";
    updateLoopVisibility();
  };

  modeSelect.addEventListener("change", () => {
    updateLoopVisibility();
  });
  if (allowPurchase && stopSelect) {
    stopSelect.addEventListener("change", () => {
      forceLoopMode();
    });
  }
  if (allowPurchase) intervalInput.addEventListener("input", forceLoopMode);

  updateLoopVisibility();

  const hint = document.createElement("div");
  hint.textContent = "Use defaults by leaving values unchanged (matching the default volume keeps it inherited).";
  hint.style.opacity = "0.7";
  hint.style.fontSize = "12px";
  pop.appendChild(hint);

  const actions = document.createElement("div");
  actions.className = "qws-rule-actions";
  const clearBtn = ui.btn("Clear", { variant: "ghost", size: "sm" });
  clearBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    NotifierService.clearRule(row.id);
    closeRuleEditor();
  });
  if (!current) ui.setButtonEnabled(clearBtn, false);

  const saveBtn = ui.btn("Save", { variant: "primary", size: "sm" });
  saveBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const sound = soundSelect.value?.trim() || null;
    const modeRaw = modeSelect.value || "";
    const stopRaw = stopSelect?.value || "";
    const intervalRaw = intervalInput.value?.trim();
    const volRaw = Math.max(0, Math.min(100, parseInt(volumeRange.value || "", 10) || 0));
    const volRatio = volRaw / 100;

    let playbackMode = modeRaw === "oneshot" || modeRaw === "loop" ? (modeRaw as PlaybackMode) : null;
    if (playbackMode === defaults.mode) playbackMode = null;

    let stopMode: "manual" | "purchase" | null = allowPurchase
      ? (stopRaw === "purchase" ? "purchase" : null)
      : null;

    if (stopMode != null && stopMode === contextDefaults.stopMode) {
      stopMode = null;
    }

    let loopIntervalMs: number | null = null;
    if (allowPurchase && intervalRaw) {
      const parsed = Number(intervalRaw);
      if (Number.isFinite(parsed)) {
        const normalized = Math.max(150, Math.min(10000, Math.floor(parsed)));
        if (normalized !== defaultIntervalMs) loopIntervalMs = normalized;
      }
    }

    let volume: number | null = null;
    if (Math.abs(volRatio - baseVolume) > 0.001) {
      volume = Math.max(0, Math.min(1, volRatio));
    }

    if (allowPurchase && !playbackMode && defaults.mode !== "loop" && (stopMode != null || loopIntervalMs != null)) {
      playbackMode = "loop";
    }

    NotifierService.setRule(row.id, {
      sound,
      volume,
      playbackMode,
      stopMode,
      loopIntervalMs,
    });
    closeRuleEditor();
  });

  actions.append(clearBtn, saveBtn);
  pop.appendChild(actions);

  document.body.appendChild(pop);

  const anchorRect = anchor.getBoundingClientRect();
  const width = pop.offsetWidth;
  const height = pop.offsetHeight;
  let left = anchorRect.right - width;
  let top = anchorRect.bottom + 8;
  if (left < margin) left = margin;
  if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
  if (top + height > window.innerHeight - margin) top = anchorRect.top - height - 8;
  if (top < margin) top = margin;
  applyPosition(left, top);

  const onDocPointer = (ev: PointerEvent) => {
    const target = ev.target as Node | null;
    if (!target) return;
    if (pop.contains(target)) return;
    if (anchor.contains(target)) return;
    closeRuleEditor();
  };
  setTimeout(() => document.addEventListener("pointerdown", onDocPointer, true));
  detachRuleDocHandler = () => document.removeEventListener("pointerdown", onDocPointer, true);

  const keyBlocker = (ev: KeyboardEvent) => {
    if (!rulePopover) return;
    if (rulePopover.contains(ev.target as Node | null)) return;
    ev.stopImmediatePropagation();
  };
  document.addEventListener("keydown", keyBlocker, true);
  detachRuleKeyBlocker = () => document.removeEventListener("keydown", keyBlocker, true);

  const wheelBlocker = (ev: WheelEvent) => {
    const t = ev.target as Node | null;
    if (rulePopover && t && rulePopover.contains(t)) {
      ev.stopImmediatePropagation();
    }
  };
  document.addEventListener("wheel", wheelBlocker, { capture: true, passive: true });
  detachRuleWheelBlocker = () => {
    document.removeEventListener("wheel", wheelBlocker, { capture: true } as any);
  };

  rulePopover = pop;
};

function renderSettingsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  void PetAlertService.start().catch(() => {});

  // ========= Helpers UI =========
  const section = (title: string) => {
    const card = ui.card(title, { tone: "muted" });
    card.body.style.display = "grid";
    card.body.style.gap = "10px";
    return card;
  };

  const row = (labelTxt: string, control: HTMLElement, opts?: { alignTop?: boolean }) => {
    const { root: r, label } = ui.formRow(labelTxt, control, { alignTop: opts?.alignTop, labelWidth: "160px" });
    label.style.opacity = "0.9";
    label.style.fontWeight = "600";
    return r;
  };

  const radio = (name: string, value: string, text: string) => {
    const chip = ui.toggleChip(text, { type: "radio", name, value });
    chip.root.classList.add("qmm-radio-chip");
    return { label: chip.root, input: chip.input };
  };

  const makeSelect = (id?: string) => {
    const sel = ui.select({ id, width: "180px" });
    return sel;
  };

  const playIconBtn = (title = "Play") => {
    return ui.btn("", { icon: "▶", size: "sm", tooltip: title, ariaLabel: title });
  };

  const smallBtn = (txt: string) => ui.btn(txt, { size: "sm" });

  const errorBar = () => ui.errorBar();

  // ========= Layout racine =========
  const root = document.createElement("div");
  Object.assign(root.style, {
    display: "grid",
    gridTemplateRows: "1fr",
    gap: "12px",
    height: "54vh",
    minHeight: "0",
    overflow: "hidden",
  });
  view.appendChild(root);

  // =========================
  // NOTIFICATION BELL
  // =========================
  const bellSection = section("Notification bell");
  root.appendChild(bellSection.root);

  const bellRow = document.createElement("label");
  Object.assign(bellRow.style, {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
  });

  const bellSwitch = ui.switch(isFloatingBellEnabled()) as HTMLInputElement;
  bellSwitch.addEventListener("change", () => {
    setFloatingBellEnabled(bellSwitch.checked);
  });

  const bellLabel = document.createElement("span");
  bellLabel.textContent = "Floating bell (movable widget)";
  bellLabel.style.fontSize = "13px";

  bellRow.append(bellSwitch, bellLabel);
  bellSection.body.appendChild(bellRow);

  const bellHint = document.createElement("div");
  bellHint.textContent =
    "Detaches the bell from the game's icon rail and shows it as a draggable floating button instead. "
    + "Use this if the bell is missing or misplaced on your screen.";
  Object.assign(bellHint.style, {
    opacity: "0.7",
    fontSize: "12px",
    lineHeight: "1.4",
  });
  bellSection.body.appendChild(bellHint);

  // =========================
  // AUDIO & PLAYBACK
  // =========================
  const s1 = section("Audio & Playback");
  root.appendChild(s1.root);

  // Context-specific audio sections
  type ContextControls = {
    container: HTMLDivElement;
    select: HTMLSelectElement;
    playBtn: HTMLButtonElement;
    volumeRange: HTMLInputElement;
    volumeValue: HTMLSpanElement;
    modeOneshot: HTMLInputElement;
    modeLoop?: HTMLInputElement;
    stopRow?: HTMLElement;
    loopInput?: HTMLInputElement;
    loopWrap?: HTMLElement;
  };

  const contextControls: Record<AudioContextKey, ContextControls> = {} as Record<AudioContextKey, ContextControls>;

  const contextOrder: Array<{ key: AudioContextKey; label: string; allowPurchase: boolean; showStop?: boolean }> = [
    { key: "shops", label: "Shops", allowPurchase: true, showStop: true },
    { key: "weather", label: "Weather", allowPurchase: false },
    { key: "pets", label: "Pets", allowPurchase: true, showStop: false },
  ];

  for (const cfg of contextOrder) {
    const card = document.createElement("div");
    Object.assign(card.style, {
      display: "grid",
      gap: "12px",
      padding: "16px",
      borderRadius: "12px",
      border: "1px solid #1f2429",
      background: "#111821",
    });

    const heading = document.createElement("div");
    heading.textContent = cfg.label;
    heading.style.fontWeight = "700";
    heading.style.fontSize = "14px";
    heading.style.letterSpacing = "0.02em";
    card.appendChild(heading);

    const defaultWrap = document.createElement("div");
    defaultWrap.style.display = "flex";
    defaultWrap.style.alignItems = "center";
    defaultWrap.style.gap = "8px";

    const select = makeSelect(`ap.defaultSound.${cfg.key}`);
    select.dataset.soundSelect = cfg.key;

    const playBtn = playIconBtn(`Play ${cfg.label.toLowerCase()} sound`);
    defaultWrap.append(select, playBtn);
    card.appendChild(row("Default sound", defaultWrap));

    const volumeWrap = document.createElement("div");
    volumeWrap.style.display = "flex";
    volumeWrap.style.alignItems = "center";
    volumeWrap.style.gap = "10px";

    const volumeRange = document.createElement("input");
    volumeRange.type = "range";
    volumeRange.min = "0"; volumeRange.max = "100"; volumeRange.step = "1";
    volumeRange.style.width = "220px";

    const volumeValue = document.createElement("span");
    volumeValue.style.minWidth = "32px";
    volumeValue.style.textAlign = "right";

    volumeWrap.append(volumeRange, volumeValue);
    card.appendChild(row("Volume", volumeWrap));

    const modeWrap = document.createElement("div");
    modeWrap.style.display = "flex";
    modeWrap.style.gap = "12px";
    const modeOne = radio(`ap.mode.${cfg.key}`, "oneshot", "One-shot");
    modeWrap.append(modeOne.label);
    let modeLoop: ReturnType<typeof radio> | null = null;
    if (cfg.allowPurchase) {
      modeLoop = radio(`ap.mode.${cfg.key}`, "loop", "Loop");
      modeWrap.append(modeLoop.label);
    }
    card.appendChild(row("Playback mode", modeWrap));

    let stopRow: HTMLElement | undefined;
    let loopInput: HTMLInputElement | undefined;
    let loopWrap: HTMLElement | undefined;

    if (cfg.allowPurchase) {
      const stopWrap = document.createElement("div");
      stopWrap.style.display = "flex";
      stopWrap.style.flexDirection = "column";
      stopWrap.style.gap = "10px";

      const stopInfo = document.createElement("div");
      stopInfo.textContent = cfg.showStop === false
        ? "Loops keep repeating; stop manually by disabling the alert."
        : "Loops stop automatically when the item is purchased.";
      stopInfo.style.opacity = "0.75";
      stopInfo.style.fontSize = "12px";
      stopInfo.style.lineHeight = "1.4";

      if (cfg.key !== "pets") {
        loopWrap = document.createElement("div");
        loopWrap.style.display = "flex";
        loopWrap.style.flexDirection = "column";
        loopWrap.style.gap = "4px";

        const loopTitle = document.createElement("div");
        loopTitle.textContent = "Loop interval";
        loopTitle.style.opacity = "0.8";
        loopTitle.style.fontSize = "12px";
        loopTitle.style.fontWeight = "600";

        const loopBox = document.createElement("div");
        loopBox.style.display = "inline-flex";
        loopBox.style.alignItems = "center";
        loopBox.style.gap = "8px";

        loopInput = document.createElement("input");
        loopInput.type = "number";
        loopInput.min = "150"; loopInput.max = "10000"; loopInput.step = "50";
        loopInput.style.width = "100px";
        loopInput.style.textAlign = "center";

        const loopLabel = document.createElement("span");
        loopLabel.textContent = "ms between plays";
        loopLabel.style.opacity = "0.85";
        loopBox.append(loopInput, loopLabel);
        loopWrap.append(loopTitle, loopBox);
        stopWrap.append(stopInfo, loopWrap);
      } else {
        stopWrap.append(stopInfo);
      }

      if (cfg.showStop !== false) {
        stopRow = row("Stop condition", stopWrap);
      } else {
        stopRow = row("Loop interval", stopWrap);
      }
      card.appendChild(stopRow);
    } else {
      const info = document.createElement("div");
      info.textContent = "Weather alerts play once per trigger.";
      info.style.opacity = "0.75";
      info.style.fontSize = "12px";
      info.style.lineHeight = "1.4";
      card.appendChild(row("Details", info));
    }

    contextControls[cfg.key] = {
      container: card,
      select,
      playBtn: playBtn as HTMLButtonElement,
      volumeRange,
      volumeValue,
      modeOneshot: modeOne.input,
      modeLoop: modeLoop?.input,
      stopRow,
      loopInput,
      loopWrap,
    };

    s1.body.appendChild(card);
  }

  // error area (Audio & Playback)
  const s1Err = errorBar();
  s1.body.appendChild(s1Err.el);

  // =========================
  // SOUND LIBRARY
  // =========================
  const s2 = section("Sound library");
  root.appendChild(s2.root);

  // importer
  const importRow = document.createElement("div");
  Object.assign(importRow.style, {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    width: "100%",
  });

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "audio/*";
  fileInput.multiple = true;
  fileInput.style.display = "none";

  const fileCard = document.createElement("div");
  Object.assign(fileCard.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "18px 22px",
    width: "100%",
    minHeight: "110px",
    borderRadius: "14px",
    border: "1px dashed #5d6a7d",
    background: "linear-gradient(180deg, #0b141c, #091018)",
    transition: "border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
    cursor: "pointer",
    textAlign: "center",
  });
  fileCard.tabIndex = 0;
  fileCard.setAttribute("role", "button");
  fileCard.setAttribute("aria-label", "Select audio files");

  const fileCardTitle = document.createElement("div");
  fileCardTitle.textContent = "Select audio files";
  Object.assign(fileCardTitle.style, {
    fontWeight: "600",
    fontSize: "14px",
    letterSpacing: "0.02em",
  });

  const fileStatus = document.createElement("div");
  const defaultStatusText = "Click to browse or drop files";
  fileStatus.textContent = defaultStatusText;
  Object.assign(fileStatus.style, {
    fontSize: "12px",
    opacity: "0.75",
  });

  fileCard.append(fileCardTitle, fileStatus);

  const setFileCardActive = (active: boolean) => {
    if (active) {
      fileCard.style.borderColor = "#6fc3ff";
      fileCard.style.boxShadow = "0 0 0 3px #6fc3ff22";
      fileCard.style.background = "linear-gradient(180deg, #102030, #0b1826)";
    } else {
      fileCard.style.borderColor = "#5d6a7d";
      fileCard.style.boxShadow = "none";
      fileCard.style.background = "linear-gradient(180deg, #0b141c, #091018)";
    }
  };

  fileCard.addEventListener("mouseenter", () => setFileCardActive(true));
  fileCard.addEventListener("mouseleave", () => setFileCardActive(document.activeElement === fileCard));
  fileCard.addEventListener("focus", () => setFileCardActive(true));
  fileCard.addEventListener("blur", () => setFileCardActive(false));

  fileCard.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    setFileCardActive(true);
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
  });
  fileCard.addEventListener("dragleave", () => setFileCardActive(document.activeElement === fileCard));

  const triggerFileSelect = () => fileInput.click();

  fileCard.addEventListener("click", triggerFileSelect);
  fileCard.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      triggerFileSelect();
    }
  });

  const displaySelection = (files: FileList | null | undefined) => {
    if (!files || !files.length) {
      fileStatus.textContent = defaultStatusText;
      return;
    }
    fileStatus.textContent =
      files.length === 1 ? files[0].name : `${files.length} files selected`;
  };

  fileCard.addEventListener("drop", async (ev) => {
    ev.preventDefault();
    const files = ev.dataTransfer?.files || null;
    displaySelection(files);
    await handleFiles(files);
    displaySelection(null);
    setFileCardActive(document.activeElement === fileCard);
  });

  importRow.append(fileInput, fileCard);
  s2.body.appendChild(importRow);

  // tips
  const tip = document.createElement("div");
  tip.textContent = "MP3, WAV, OGG — limited to ≤ 10 s and ≤ 200 KB.";
  tip.style.opacity = "0.75";
  tip.style.fontSize = "12px";
  s2.body.appendChild(tip);

  const listWrap = document.createElement("div");
  Object.assign(listWrap.style, {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: "6px",
    border: "1px solid #4445",
    borderRadius: "10px",
    background: "#10161c",
    padding: "10px",
  });

  const listHeader = document.createElement("div");
  Object.assign(listHeader.style, {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "12px",
    fontSize: "12px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    opacity: "0.65",
    paddingBottom: "4px",
    borderBottom: "1px solid #ffffff14",
  });

  const headName = document.createElement("span");
  headName.textContent = "Sound";

  const headActions = document.createElement("span");
  headActions.textContent = "Actions";
  headActions.style.justifySelf = "end";

  listHeader.append(headName, headActions);

  const listBody = document.createElement("div");
  Object.assign(listBody.style, {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "240px",
    overflowY: "auto",
    paddingRight: "4px",
    minHeight: "0",
    padding: "4px 0",
  });

  listWrap.append(listHeader, listBody);
  s2.body.appendChild(listWrap);

  const s2Err = errorBar();
  s2.body.appendChild(s2Err.el);

  // =========================
  // Wiring / logique
  // =========================

  const sanitizeLoopInput = (input: HTMLInputElement, fallback: number) => {
    const trimmed = (input.value || "").trim();
    const raw = trimmed ? Number(trimmed) : NaN;
    const normalized = Number.isFinite(raw) ? raw : fallback;
    const clamped = Math.max(150, Math.min(10000, Math.floor(normalized)));
    input.value = String(clamped);
    return clamped;
  };

  const updateStopVisibility = (context: AudioContextKey) => {
    const controls = contextControls[context];
    const loopChecked = controls.modeLoop?.checked ?? false;
    if (controls.stopRow) controls.stopRow.style.display = loopChecked ? "" : "none";
    if (controls.loopWrap) controls.loopWrap.style.display = loopChecked ? "flex" : "none";
  };

  const applyMode = (context: AudioContextKey, mode: PlaybackMode) => {
    if (context === "weather" && mode === "loop") {
      audio.setPlaybackMode("oneshot", context);
      contextControls[context].modeOneshot.checked = true;
      contextControls[context].modeLoop && (contextControls[context].modeLoop.checked = false);
      updateStopVisibility(context);
      return;
    }
    audio.setPlaybackMode(mode, context);
    updateStopVisibility(context);
  };

  const applyShopsStop = () => {
    const controls = contextControls.shops;
    if (!controls.loopInput) return;
    const loopMs = sanitizeLoopInput(controls.loopInput, audio.getLoopInterval("shops"));
    audio.setLoopInterval(loopMs, "shops");
    if (!controls.modeLoop?.checked) {
      if (controls.modeLoop) controls.modeLoop.checked = true;
      controls.modeOneshot.checked = false;
      applyMode("shops", "loop");
    }
    audio.setStopPurchase("shops");
    NotifierService.setContextStopDefaults("shops", { stopMode: "purchase", stopRepeats: null, loopIntervalMs: loopMs });
    return loopMs;
  };

  for (const cfg of contextOrder) {
    const controls = contextControls[cfg.key];
    controls.select.addEventListener("change", () => {
      audio.setDefaultSoundByName(controls.select.value, cfg.key);
      renderLibList();
    });
    controls.playBtn.addEventListener("click", () => {
      audio.trigger("preview", { sound: controls.select.value }, cfg.key).catch(() => {});
    });
    controls.volumeRange.addEventListener("input", () => {
      const value = Math.max(0, Math.min(100, parseInt(controls.volumeRange.value || "0", 10) || 0));
      controls.volumeValue.textContent = `${value}%`;
      audio.setVolume(value / 100, cfg.key);
    });
    controls.modeOneshot.addEventListener("change", () => {
      if (!controls.modeOneshot.checked) return;
      applyMode(cfg.key, "oneshot");
      if (cfg.key === "shops") {
        const loopMs = controls.loopInput
          ? sanitizeLoopInput(controls.loopInput, audio.getLoopInterval("shops"))
          : audio.getLoopInterval("shops");
        audio.setLoopInterval(loopMs, "shops");
        audio.setStopManual("shops");
        NotifierService.setContextStopDefaults("shops", { stopMode: "manual", stopRepeats: null, loopIntervalMs: loopMs });
      }
    });
    controls.modeLoop?.addEventListener("change", () => {
      if (!controls.modeLoop?.checked) return;
      applyMode(cfg.key, "loop");
      if (cfg.key === "shops") applyShopsStop();
    });
    if (cfg.allowPurchase) {
      controls.loopInput?.addEventListener("change", applyShopsStop);
      controls.loopInput?.addEventListener("blur", applyShopsStop);
    }
  }

  const refreshAllSoundSelects = () => {
    const names = audio.listSounds();
    const applyOptions = (sel: HTMLSelectElement, context: AudioContextKey) => {
      const current = sel.value;
      sel.innerHTML = "";
      for (const n of names) {
        const option = document.createElement("option");
        option.value = n;
        option.textContent = n;
        sel.appendChild(option);
      }
      const preferred = audio.getDefaultSoundName(context);
      if (names.includes(current)) sel.value = current;
      else if (preferred && names.includes(preferred)) sel.value = preferred;
      else if (names.length) sel.value = names[0];
    };

    for (const cfg of contextOrder) {
      applyOptions(contextControls[cfg.key].select, cfg.key);
    }

    const all = Array.from(document.querySelectorAll<HTMLSelectElement>("select[data-sound-select]"));
    for (const sel of all) {
      const ctx = (sel.dataset.soundSelect as AudioContextKey) || "shops";
      if (contextControls[ctx]?.select === sel) continue;
      applyOptions(sel, ctx);
    }
  };

  const renderLibList = () => {
    listBody.replaceChildren();
    const names = audio.listSounds();
    if (!names.length) {
      const empty = document.createElement("div");
      empty.textContent = "No sounds in the library.";
      empty.style.opacity = "0.75";
      empty.style.textAlign = "center";
      empty.style.padding = "12px 6px";
      listBody.appendChild(empty);
      return;
    }
    const defaultShops = audio.getDefaultSoundName("shops");
    const defaultWeather = audio.getDefaultSoundName("weather");

    for (const name of names) {
      const row = document.createElement("div");
      Object.assign(row.style, {
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        gap: "12px",
        alignItems: "center",
        padding: "8px 10px",
        borderRadius: "8px",
        border: "1px solid #1f2429",
        background: "#151b22",
      });

      const info = document.createElement("div");
      Object.assign(info.style, {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        minWidth: "0",
      });

      const title = document.createElement("span");
      title.textContent = name;
      title.style.fontWeight = "600";
      title.style.overflow = "hidden";
      title.style.textOverflow = "ellipsis";
      title.style.whiteSpace = "nowrap";
      info.appendChild(title);

      const badges = document.createElement("div");
      badges.style.display = "flex";
      badges.style.gap = "6px";

      const makeBadge = (label: string) => {
        const badge = document.createElement("span");
        badge.textContent = label;
        Object.assign(badge.style, {
          fontSize: "11px",
          padding: "2px 6px",
          borderRadius: "999px",
          background: "#2b5cff33",
          border: "1px solid #2b5cff66",
          color: "#9cbcff",
          fontWeight: "600",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
        });
        return badge;
      };

      const isShopsDefault = defaultShops === name;
      const isWeatherDefault = defaultWeather === name;
      const isPetsDefault = audio.getDefaultSoundName("pets") === name;
      if (isShopsDefault) badges.appendChild(makeBadge("Shops"));
      if (isWeatherDefault) badges.appendChild(makeBadge("Weather"));
      if (isPetsDefault) badges.appendChild(makeBadge("Pets"));
      if (badges.childElementCount) info.appendChild(badges);

      if (isShopsDefault || isWeatherDefault || isPetsDefault) {
        row.style.borderColor = "#2b5cff99";
        row.style.boxShadow = "0 0 0 1px #2b5cff33";
      }

      const actions = document.createElement("div");
      Object.assign(actions.style, {
        display: "flex",
        gap: "6px",
        justifyContent: "flex-end",
        flexWrap: "wrap",
      });

      const btnPlay = smallBtn("▶");
      const btnSetShops = smallBtn("Set shops");
      const btnSetWeather = smallBtn("Set weather");
      const btnSetPets = smallBtn("Set pets");
      const btnDel = smallBtn("Remove");

      btnPlay.title = "Preview";
      btnSetShops.title = "Set as shops default";
      btnSetWeather.title = "Set as weather default";
      btnSetPets.title = "Set as pets default";
      btnDel.title = "Remove from library";

      const isProtected = typeof (audio as any).isProtectedSound === "function" && audio.isProtectedSound(name);
      if (isProtected || isShopsDefault || isWeatherDefault) {
        btnDel.disabled = true;
        btnDel.style.opacity = "0.6";
        if (isProtected) btnDel.title = "Built-in sound cannot be removed";
        else btnDel.title = "Currently used as default";
      }

      btnPlay.onclick = () => audio.trigger("preview", { sound: name }, "shops").catch(() => {});
      btnSetShops.onclick = () => {
        audio.setDefaultSoundByName(name, "shops");
        refreshAllSoundSelects();
        renderLibList();
      };
      btnSetWeather.onclick = () => {
        audio.setDefaultSoundByName(name, "weather");
        refreshAllSoundSelects();
        renderLibList();
      };
      btnSetPets.onclick = () => {
        audio.setDefaultSoundByName(name, "pets");
        refreshAllSoundSelects();
        renderLibList();
      };
      btnDel.onclick = () => {
        audio.unregisterSound(name);
        refreshAllSoundSelects();
        renderLibList();
      };

      actions.append(btnPlay, btnSetShops, btnSetWeather, btnSetPets, btnDel);
      row.append(info, actions);
      listBody.appendChild(row);
    }
  };

  const syncContext = (context: AudioContextKey) => {
    const controls = contextControls[context];
    const settings = audio.getPlaybackSettings(context);
    const names = audio.listSounds();

    if (settings.defaultSoundName && names.includes(settings.defaultSoundName)) {
      controls.select.value = settings.defaultSoundName;
    }

    const volPercent = Math.round(settings.volume * 100);
    controls.volumeRange.value = String(volPercent);
    controls.volumeValue.textContent = `${volPercent}%`;

    if (controls.modeLoop && settings.mode === "loop") controls.modeLoop.checked = true;
    else controls.modeOneshot.checked = true;

    const defaults =
      context === "shops" || context === "weather"
        ? NotifierService.getContextStopDefaults(context)
        : { stopMode: "manual" as const, stopRepeats: null, loopIntervalMs: settings.loopIntervalMs };
    const fallbackLoop = Math.max(
      150,
      Math.min(10000, Math.floor(defaults.loopIntervalMs || settings.loopIntervalMs || 150)),
    );
    const loopMs = controls.loopInput ? sanitizeLoopInput(controls.loopInput, fallbackLoop) : fallbackLoop;
    audio.setLoopInterval(loopMs, context);

    if (context === "shops") {
      if (controls.modeLoop?.checked) {
        audio.setStopPurchase("shops");
        NotifierService.setContextStopDefaults("shops", { stopMode: "purchase", stopRepeats: null, loopIntervalMs: loopMs });
      } else {
        audio.setStopManual("shops");
        NotifierService.setContextStopDefaults("shops", { stopMode: "manual", stopRepeats: null, loopIntervalMs: loopMs });
      }
    } else if (context === "weather") {
      applyMode("weather", "oneshot");
      audio.setStopManual("weather");
      NotifierService.setContextStopDefaults("weather", { stopMode: "manual", stopRepeats: null, loopIntervalMs: loopMs });
    } else if (context === "pets") {
      // Pets: loops are manual stop; inherit mode selection and loop interval
      audio.setLoopInterval(loopMs, "pets");
      audio.setStopManual("pets");
    }

    updateStopVisibility(context);
  };

  const syncFromAudio = () => {
    refreshAllSoundSelects();
    syncContext("shops");
    syncContext("weather");
    syncContext("pets");
    renderLibList();
  };

  // Importer (≤ 200KB avec compression)
  const handleFiles = async (files: FileList | null) => {
    s2Err.clear();
    if (!files || !files.length) return;
    const added: string[] = [];
    for (const f of Array.from(files)) {
      try {
        const res = await audio.importFileAsSound(f, {
          maxBytes: 200 * 1024,
          maxSeconds: 10.0,
          bitrates: [48000, 32000, 20000, 12000, 8000],
          maxInputBytes: 8 * 1024 * 1024,
        });
        added.push(res.name);
      } catch (e: any) {
        s2Err.show(`Failed for "${f.name}": ${e?.message || e}`);
      }
    }
    if (added.length) {
      refreshAllSoundSelects();
      renderLibList();
      for (const cfg of contextOrder) {
        if (!audio.getDefaultSoundName(cfg.key)) {
          audio.setDefaultSoundByName(added[0], cfg.key);
        }
      }
      refreshAllSoundSelects();
      renderLibList();
    }
    // reset input pour permettre de ré-importer le même fichier si besoin
    fileInput.value = "";
  };

  fileInput.onchange = async () => {
    const files = fileInput.files;
    displaySelection(files);
    await handleFiles(files);
    displaySelection(null);
    setFileCardActive(document.activeElement === fileCard);
  };

  // Première sync
  syncFromAudio();

  // Scroller stable
  const scroller = document.createElement("div");
  Object.assign(scroller.style, {
    overflow: "auto",
    minHeight: "0",
    height: "100%",
    display: "grid",
    gap: "12px",
  });
  // Déplacer les sections dans le scroller
  scroller.append(s1.root, s2.root);
  root.appendChild(scroller);

  // cleanup (rien de spécial ici, mais pattern prêt)
  (view as any).__cleanup__ = (() => {
    const prev = (view as any).__cleanup__;
    return () => { try { prev?.(); } catch {} };
  })();
}

function renderShopTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.style.cssText = "";

  if (!document.getElementById("qws-rule-style")) {
    const style = document.createElement("style");
    style.id = "qws-rule-style";
style.textContent = `
:root {
  /* PATCH: z-index centralisé */
  --qws-z-popover: 99999999999999;
}

/* PATCH: bouton engrenage carré, centré, plus gros */
.qws-rule-btn {
  display: inline-grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 8px;
  line-height: 1;
  font-size: 18px; /* taille de l'icône */
  min-width: 32px; /* évite les rétrécissements */
  box-sizing: border-box;
}
.qws-rule-btn[data-active="1"] {
  background: linear-gradient(180deg, #1b2735, #101821);
  box-shadow: 0 0 0 1px #658dff88 inset;
  color: #c7daff;
}

/* PATCH: popover toujours devant */
.qws-rule-popover {
  position: fixed !important;
  z-index: var(--qws-z-popover) !important;
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: #f1f6ff;
}
.qws-rule-popover .qws-rule-field {
  display: grid;
  gap: 6px;
}
.qws-rule-popover .qws-rule-field label {
  font-weight: 600;
  font-size: 13px;
}
.qws-rule-popover .qws-rule-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

/* PATCH: réserve un espace pour le résumé afin d'éviter tout shift */
[data-role="rule-hint"] {
  min-height: 1.2em;  /* ~1 ligne réservée */
}
`;

    document.head.appendChild(style);
  }

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: "10px",
    height: "54vh",
    overflow: "hidden",
    minHeight: "0",
    position: "relative",
  });
  view.appendChild(wrap);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.flexWrap = "wrap";
  header.style.alignItems = "center";
  header.style.gap = "10px";
  header.style.rowGap = "8px";
  wrap.appendChild(header);

  const lblType = ui.label("Type");
  const selType = document.createElement("select");
  selType.className = "qmm-input";
  selType.style.minWidth = "140px";
  selType.id = "shop.filter.type";
  [
    ["all", "All"],
    ["seed", "Seeds"],
    ["egg", "Eggs"],
    ["tool", "Tools"],
    ["decor", "Decor"],
  ].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    selType.appendChild(o);
  });
  selType.value = "all";

  const lblRarity = ui.label("Rarity");
  const selRarity = document.createElement("select");
  selRarity.className = "qmm-input";
  selRarity.style.minWidth = "160px";
  selRarity.id = "shop.filter.rarity";
  [
    ["all", "All"],
    ["common", "Common"],
    ["uncommon", "Uncommon"],
    ["rare", "Rare"],
    ["legendary", "Legendary"],
    ["mythical", "Mythical"],
    ["divine", "Divine"],
    ["celestial", "Celestial"],
  ].forEach(([v, t]) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    selRarity.appendChild(o);
  });
  selRarity.value = "all";

  const followedBadge = document.createElement("div");
  followedBadge.id = "shop.followedCount";
  followedBadge.textContent = "Followed: 0";
  followedBadge.title = "Items with Overlay enabled";
  followedBadge.style.padding = "6px 10px";
  followedBadge.style.borderRadius = "999px";
  followedBadge.style.border = "1px solid #4445";
  followedBadge.style.background = "#1f2328";
  followedBadge.style.color = "#e7eef7";
  followedBadge.style.fontWeight = "600";
  followedBadge.style.marginLeft = "auto";
  followedBadge.style.width = "115px";

  header.append(lblType, selType, lblRarity, selRarity, followedBadge);

  const card = document.createElement("div");
  card.style.border = "1px solid #4445";
  card.style.borderRadius = "10px";
  card.style.padding = "10px";
  card.style.background = "#0f1318";
  card.style.overflow = "hidden";
  card.style.display = "grid";
  card.style.gridTemplateRows = "auto 1fr";
  card.style.minHeight = "0";
  wrap.appendChild(card);

  const headerGrid = document.createElement("div");
  const COLS = "minmax(200px, 1fr) 9rem 7rem 8rem";
  headerGrid.style.display = "grid";
  headerGrid.style.gridTemplateColumns = COLS;
  headerGrid.style.justifyContent = "start";
  headerGrid.style.columnGap = "0";
  headerGrid.style.borderBottom = "1px solid #ffffff1a";
  headerGrid.style.padding = "0 0 4px 0";
  headerGrid.style.position = "sticky";
  headerGrid.style.top = "0";

  headerGrid.append(
    mkHeadCell("Item", "left"),
    mkHeadCell("Rarity"),
    mkHeadCell("Notify"),
    mkHeadCell("Custom rules"),
  );
  card.appendChild(headerGrid);

  const bodyGrid = document.createElement("div");
  bodyGrid.style.display = "grid";
  bodyGrid.style.gridTemplateColumns = COLS;
  bodyGrid.style.justifyContent = "start";
  bodyGrid.style.gridAutoRows = "auto";
  bodyGrid.style.alignContent = "start";
  bodyGrid.style.minHeight = "0";
  bodyGrid.style.height = "100%";
  bodyGrid.style.overflow = "auto";
  bodyGrid.style.overscrollBehavior = "contain";
  bodyGrid.style.width = "100%";
  bodyGrid.style.scrollbarGutter = "stable";
  card.appendChild(bodyGrid);

  const refreshRulesUI = () => {
    const kids = Array.from(bodyGrid.children);
    for (let i = 0; i + 3 < kids.length; i += 4) {
      const itemCell = kids[i] as HTMLDivElement;
      const ruleCell = kids[i + 3] as HTMLDivElement | undefined;
      const id = itemCell?.dataset?.id;
      if (!id) continue;
      applyRuleState(itemCell, ruleCell ?? null, NotifierService.getRule(id));
    }
  };

  const softUpdateRenderedRows = (next: NotifierState) => {
    const byId = new Map(next.rows.map((r) => [r.id, r]));
    const kids = Array.from(bodyGrid.children);

    for (let i = 0; i + 3 < kids.length; i += 4) {
      const itemCell = kids[i] as HTMLDivElement;
      const popupCell = kids[i + 2] as HTMLDivElement;
      const ruleCell = kids[i + 3] as HTMLDivElement | undefined;

      const id = itemCell.dataset.id!;
      const row = byId.get(id);
      if (!row) continue;

      const popupSwitch = popupCell.querySelector("label") as HTMLLabelElement | null;

      if (popupSwitch) setSwitchVisual(popupSwitch, !!row.popup);
      itemCell.dataset.follow = row.followed ? "1" : "0";
      applyRuleState(itemCell, ruleCell ?? null, NotifierService.getRule(id));

      const capped = (NotifierService as any).isIdCapped?.(id) ?? false;
      if (popupSwitch) setSwitchCapState(popupSwitch, capped);
    }
  };

  const syncHeaderToScrollbar = () => {
    const sbw = bodyGrid.offsetWidth - bodyGrid.clientWidth;
    headerGrid.style.boxSizing = "border-box";
    headerGrid.style.paddingRight = `${sbw}px`;
  };
  syncHeaderToScrollbar();
  const resizeObserver = new ResizeObserver(syncHeaderToScrollbar);
  resizeObserver.observe(bodyGrid);
  const onResize = () => syncHeaderToScrollbar();
  window.addEventListener("resize", onResize);

  const lastSeenRefs = new Map<string, HTMLDivElement>();

  /* ================== Wiring avec NotifierService ================== */

  // snapshot courant
  let state: NotifierState | null = null;
  // pour savoir si on doit rebuild
  let renderedIds = new Set<string>();

  // filters courants (UI -> service.filterRows)
  const getFilters = (): NotifierFilters => ({
    type: (selType.value || "all") as NotifierFilters["type"],
    rarity: (selRarity.value || "all") as NotifierFilters["rarity"],
  });

  const passesFilters = (rows: NotifierRow[]) =>
    NotifierService.filterRows(rows, getFilters());

  const mkItemCell = (row: NotifierRow) => {
    const wrap = document.createElement("div");
    Object.assign(wrap.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 6px",
      borderBottom: "1px solid #ffffff12",
    });

    const ICON = 40;

    const iconWrap = document.createElement("div");
    Object.assign(iconWrap.style, {
      width: `${ICON}px`,
      height: `${ICON}px`,
      flex: `0 0 ${ICON}px`,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "8px",
      background: "#101820",
      marginRight: "6px",
      aspectRatio: "1 / 1",
    });

    const iconFallback =
      row.type === "Seed" ? "🌱" :
      row.type === "Egg"  ? "🥚" :
      row.type === "Tool" ? "🧰" : "🏠";

    const icon = document.createElement("span");
    icon.textContent = iconFallback;
    icon.style.fontSize = `${ICON - 10}px`;
    icon.setAttribute("aria-hidden", "true");
    iconWrap.appendChild(icon);

    const spriteCategories =
      row.type === "Seed" ? ["seed"] :
      row.type === "Egg" ? ["pet"] :
      row.type === "Tool" ? ["item"] :
      row.type === "Decor" ? ["decor"] : null;

    if (spriteCategories) {
      const baseId = row.id.split(":")[1] ?? row.name ?? row.id;
      const candidatesSet = new Set<string>();
      const addCandidate = (value: string | undefined | null) => {
        if (!value) return;
        const trimmed = value.trim();
        if (!trimmed) return;
        candidatesSet.add(trimmed);
        candidatesSet.add(trimmed.replace(/\s+/g, ""));
        if (row.type === "Seed" || row.type === "Egg") {
          const stripped = trimmed.replace(/(?:seed|egg)$/i, "").trim();
          if (stripped) {
            candidatesSet.add(stripped);
            candidatesSet.add(stripped.replace(/\s+/g, ""));
          }
        }
      };
      addCandidate(baseId);
      addCandidate(row.id);
      addCandidate(row.name);
      const candidates = Array.from(candidatesSet).filter(Boolean);
      if (candidates.length) {
        attachSpriteIcon(iconWrap, spriteCategories, candidates, ICON, "alerts");
      }
    }

    // ---- Texte
    const col = document.createElement("div");
    Object.assign(col.style, {
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      lineHeight: "1.15",
      minWidth: "0", // autorise l'ellipsis
      flex: "1 1 auto",
    });

    const title = document.createElement("div");
    title.textContent = row.name;
    Object.assign(title.style, {
      fontWeight: "700",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    });

    const sub = document.createElement("div");
    sub.style.opacity = "0.7";
    sub.style.fontSize = "12px";
    sub.style.display = "flex";
    sub.style.alignItems = "center";
    sub.style.gap = "6px";

    const sectionLabel = document.createElement("span");
    sectionLabel.textContent = row.type;
    sub.appendChild(sectionLabel);

    if (row.weathers?.length || row.weatherOnly) {
      const weathers = row.weathers && row.weathers.length ? row.weathers : [];
      for (const w of weathers) {
        const badge = document.createElement("span");
        badge.textContent = w;
        Object.assign(badge.style, {
          padding: "1px 6px",
          borderRadius: "999px",
          fontSize: "10px",
          fontWeight: "600",
          background: row.weatherOnly ? "rgba(250, 204, 21, 0.18)" : "rgba(96, 165, 250, 0.18)",
          color: row.weatherOnly ? "#facc15" : "#60a5fa",
          border: row.weatherOnly ? "1px solid rgba(250, 204, 21, 0.35)" : "1px solid rgba(96, 165, 250, 0.35)",
        });
        badge.title = row.weatherOnly
          ? `Only available during ${w}`
          : `Also available during ${w}`;
        sub.appendChild(badge);
      }
    }

    const ruleHint = document.createElement("div");
    ruleHint.dataset.role = "rule-hint";
    ruleHint.style.display = "none";
    ruleHint.style.opacity = "0.75";
    ruleHint.style.fontSize = "11px";
    ruleHint.style.whiteSpace = "nowrap";
    ruleHint.style.overflow = "hidden";
    ruleHint.style.textOverflow = "ellipsis";
    ruleHint.style.minHeight = "1.2em";
    ruleHint.style.visibility = "hidden";

    col.append(title, sub, ruleHint);

    wrap.append(iconWrap, col);
    return wrap;
  };

  const addRow = (row: NotifierRow) => {
    const itemCell = mkItemCell(row);
    itemCell.dataset.id = row.id;
    itemCell.dataset.type = row.type as string;
    itemCell.dataset.follow = row.followed ? "1" : "0";
    itemCell.dataset.context = "shops";

    const rarityCell = document.createElement("div");
    rarityCell.style.display = "flex";
    rarityCell.style.alignItems = "center";
    rarityCell.style.justifyContent = "center";
    rarityCell.style.borderBottom = "1px solid #ffffff12";
    rarityCell.appendChild(rarityBadge(String(row.rarity ?? "—")));

    // switch Overlay (branché au service)
    const popupSwitch = createSwitch((on) => {
      try {
        NotifierService.setPopup(row.id, !!on);
      } catch {}
      // dataset.follow mis à jour via onChange; on le reflète tout de suite visuellement
      const cur = NotifierService.getPref(row.id);
      itemCell.dataset.follow = cur.followed ? "1" : "0";
    });

    // init switch à l’état stocké, sans déclencher setPopup
    setSwitchVisual(popupSwitch, !!row.popup);

    (popupSwitch as HTMLLabelElement).style.padding = "0";
    const popupCell = wrapCell(popupSwitch);

    const capped = (NotifierService as any).isIdCapped?.(row.id) ?? false;
    setSwitchCapState(popupSwitch, capped);

    const gearBtn = ui.btn("", {
      icon: "⚙",
      size: "sm",
      tooltip: "Custom rule",
      ariaLabel: `Custom rule for ${row.name}`,
    });
    gearBtn.dataset.role = "rule";
    gearBtn.classList.add("qws-rule-btn");
    gearBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openRuleEditor(ui, {
        id: row.id,
        name: row.name,
        type: row.type,
        context: "shops",
      }, gearBtn);
    });

    const ruleCell = wrapCell(gearBtn);
    ruleCell.dataset.role = "rule-cell";

    bodyGrid.append(itemCell, rarityCell, popupCell, ruleCell);
    applyRuleState(itemCell, ruleCell, NotifierService.getRule(row.id));
  };

  function clearBody() {
    closeRuleEditor();
    bodyGrid.innerHTML = "";
    renderedIds = new Set();
  }

  function renderEmpty() {
    const empty = document.createElement("div");
    empty.textContent = "No items.";
    empty.style.opacity = "0.75";
    empty.style.gridColumn = "1 / -1";
    empty.style.padding = "8px";
    bodyGrid.appendChild(empty);
  }

  function rebuildGrid() {
    clearBody();
    if (!state) {
      renderEmpty();
      return;
    }
    const rows = passesFilters(state.rows);
    if (!rows.length) {
      renderEmpty();
    } else {
      rows.forEach((r) => {
        addRow(r);
        renderedIds.add(r.id);
      });
    }
    refreshRulesUI();
    followedBadge.textContent = `Followed: ${state.counts.followed}`;
    syncHeaderToScrollbar();
  }

  // soft-update: badge only
  function softUpdateBadge(next: NotifierState) {
    followedBadge.textContent = `Followed: ${next.counts.followed}`;
  }

  // compare membership (ids visibles après filtres)
  function filteredIdSet(s: NotifierState): Set<string> {
    const set = new Set<string>();
    for (const r of passesFilters(s.rows)) set.add(r.id);
    return set;
  }

  // abos service
  let unsub: (() => void) | null = null;
  let unsubRules: (() => void) | null = null;
  (async () => {
    try {
      await NotifierService.start();
    } catch {}
    unsub = await NotifierService.onChangeNow((s) => {
      const prev = state;
      state = s;

      if (!prev) {
        rebuildGrid();
        softUpdateRenderedRows(state);
        return;
      }

      // décide si rebuild complet (changement de composition filtrée)
      const prevIds = renderedIds;
      const nextIds = filteredIdSet(s);

      let needRebuild = false;
      if (prevIds.size !== nextIds.size) needRebuild = true;
      else {
        for (const id of nextIds) if (!prevIds.has(id)) {
          needRebuild = true;
          break;
        }
      }

      if (needRebuild) {
        rebuildGrid();
      } else {
        softUpdateBadge(s);
        softUpdateRenderedRows(s);
      }
    });
    try {
      unsubRules = await NotifierService.onRulesChangeNow(() => refreshRulesUI());
    } catch {}
  })();

  // handlers filtres
  const onFilterChange = () => {
    if (state) rebuildGrid();
  };
  selType.onchange = onFilterChange;
  selRarity.onchange = onFilterChange;

  // cleanup on tab unmount
  (view as any).__cleanup__ = (() => {
    const prev = (view as any).__cleanup__;
    return () => {
      try { unsub?.(); } catch {}
      try { unsubRules?.(); } catch {}
      try { resizeObserver.disconnect(); } catch {}
      try { window.removeEventListener("resize", onResize); } catch {}
      try { closeRuleEditor(); } catch {}
      try { prev?.(); } catch {}
    };
  })();
}

function renderPetAlertsTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  void PetAlertService.start().catch(() => {});

  const card = document.createElement("div");
  Object.assign(card.style, {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 260px) minmax(0, 1fr)",
    gap: "10px",
    alignItems: "stretch",
    height: "54vh",
    overflow: "hidden",
    border: "1px solid #4445",
    borderRadius: "10px",
    padding: "10px",
    background: "#0f1318",
  });
  view.appendChild(card);

  const petList = document.createElement("div");
  Object.assign(petList.style, {
    display: "grid",
    gridTemplateColumns: "1fr",
    rowGap: "6px",
    overflow: "auto",
    padding: "6px",
    border: "1px solid #4445",
    borderRadius: "10px",
  });
  card.appendChild(petList);

  const right = document.createElement("div");
  Object.assign(right.style, {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    overflow: "auto",
    minHeight: "0",
  });
  card.appendChild(right);

  let pets: PetInfo[] = [];
  let unsubPets: (() => void) | null = null;
  let generalEnabled = PetAlertService.isGeneralEnabled();

  const formRow = (labelTxt: string, control: HTMLElement) => {
    const { root } = ui.formRow(labelTxt, control, { labelWidth: "180px" });
    return root;
  };

  const generalCard = ui.card("General notifications", { tone: "muted", align: "stretch" });
  generalCard.body.style.display = "grid";
  generalCard.body.style.gap = "10px";

  const generalRow = ui.flexRow({ justify: "start", gap: 10 });
  const generalSw = ui.switch(PetAlertService.isGeneralEnabled());
  const generalLbl = document.createElement("div");
  generalLbl.textContent = "Use a shared threshold for all pets";
  generalLbl.style.opacity = "0.9";
  generalRow.append(generalSw, generalLbl);
  generalCard.body.append(formRow("Enable general", generalRow));

  const generalInput = ui.inputNumber(1, 100, 1, PetAlertService.getGeneralThresholdPct());
  generalCard.body.append(formRow("General threshold (%)", (generalInput as any).wrap ?? generalInput));

  right.appendChild(generalCard.root);

  const syncGeneralUI = () => {
    generalEnabled = PetAlertService.isGeneralEnabled();
    generalSw.checked = generalEnabled;
    generalInput.value = String(PetAlertService.getGeneralThresholdPct());
  };

  generalSw.onchange = () => {
    PetAlertService.setGeneralEnabled(generalSw.checked);
    syncGeneralUI();
    // no per-pet selection anymore
  };

  generalInput.addEventListener("change", () => {
    const next = Math.max(1, Math.min(100, Number(generalInput.value) || PetAlertService.getGeneralThresholdPct()));
    generalInput.value = String(PetAlertService.setGeneralThresholdPct(next));
  });

  // run once after controls exist
  syncGeneralUI();

  const renderPetList = () => {
    petList.innerHTML = "";
    if (!pets.length) {
      const empty = document.createElement("div");
      empty.textContent = "No active pets.";
      empty.style.opacity = "0.75";
      petList.appendChild(empty);
      return;
    }

    for (const pet of pets) {
      const slot = (pet as any)?.slot ?? {};
      const name = String(slot?.name || slot?.petSpecies || "Pet");
      const hunger = PetsService.getHungerPctFor(pet);
      const hungerText = Number.isFinite(hunger) ? `${hunger}%` : "—";

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.justifyContent = "space-between";
      row.style.gap = "10px";
      row.style.width = "100%";
      row.style.textAlign = "left";
      row.style.padding = "6px 8px";
      row.style.borderRadius = "8px";
      row.style.border = "1px solid #4445";
      row.style.background = "#121820";

      const left = document.createElement("div");
      left.style.display = "flex";
      left.style.alignItems = "center";
      left.style.gap = "8px";
      left.style.minWidth = "0";

      const avatar = document.createElement("div");
      avatar.style.width = "40px";
      avatar.style.height = "40px";
      avatar.style.borderRadius = "8px";
      avatar.style.display = "inline-flex";
      avatar.style.alignItems = "center";
      avatar.style.justifyContent = "center";
      avatar.style.background = "#111821";
      avatar.style.border = "1px solid #1f2429";
      avatar.style.overflow = "hidden";

      const useEmojiFallback = () => {
        avatar.replaceChildren();
        const span = document.createElement("span");
        span.textContent = "🐾";
        span.style.fontSize = "28px";
        span.setAttribute("aria-hidden", "true");
        avatar.appendChild(span);
      };

      const setIcon = (species?: string, mutations?: string[]) => {
        const speciesLabel = String(species ?? "").trim();
        avatar.replaceChildren();
        if (!speciesLabel) {
          useEmojiFallback();
          return;
        }
        const span = document.createElement("span");
        span.textContent = speciesLabel.charAt(0).toUpperCase() || "ĐY?ó";
        span.style.fontSize = "28px";
        span.setAttribute("aria-hidden", "true");
        avatar.appendChild(span);
        attachSpriteIcon(avatar, ["pet"], [speciesLabel], 36, "alerts-pet", {
          mutations: Array.isArray(mutations) ? mutations : undefined,
        });
      };
      const species = String(slot?.petSpecies || "");
      const mutations = (slot as any)?.mutations ?? (pet as any)?.mutations;
      setIcon(species, Array.isArray(mutations) ? mutations : undefined);

      const titleWrap = document.createElement("div");
      titleWrap.style.display = "flex";
      titleWrap.style.flexDirection = "column";
      titleWrap.style.gap = "2px";
      titleWrap.style.minWidth = "0";
      const title = document.createElement("div");
      title.textContent = name;
      title.style.fontWeight = "600";
      title.style.overflow = "hidden";
      title.style.textOverflow = "ellipsis";
      title.style.whiteSpace = "nowrap";
      titleWrap.append(title);

      left.append(avatar, titleWrap);

      const hungerValue = document.createElement("div");
      hungerValue.textContent = hungerText;
      hungerValue.style.fontWeight = "700";
      hungerValue.style.color = "#FFD84D";

      row.append(left, hungerValue);
      petList.appendChild(row);
    }
  };

  (async () => {
    try {
      unsubPets = await PetsService.onPetsChangeNow((arr) => {
        pets = Array.isArray(arr) ? arr.slice(0, 3) : [];
        renderPetList();
      });
    } catch {
      pets = [];
      renderPetList();
    }
  })();

  (view as any).__cleanup__ = (() => {
    const prev = (view as any).__cleanup__;
    return () => {
      try { unsubPets?.(); } catch {}
      try { prev?.(); } catch {}
    };
  })();
}

function renderWeatherTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.style.cssText = "";

  const wrap = document.createElement("div");
  Object.assign(wrap.style, {
    display: "grid",
    gridTemplateRows: "1fr",
    height: "54vh",
    overflow: "hidden",
    minHeight: "0",
  });
  view.appendChild(wrap);

  const card = document.createElement("div");
  card.style.border = "1px solid #4445";
  card.style.borderRadius = "10px";
  card.style.padding = "10px";
  card.style.background = "#0f1318";
  card.style.overflow = "hidden";
  card.style.display = "grid";
  card.style.gridTemplateRows = "auto 1fr";
  card.style.minHeight = "0";
  wrap.appendChild(card);

  const headerGrid = document.createElement("div");
  const COLS = "minmax(240px, 1fr) 9rem 7rem 8rem";
  headerGrid.style.display = "grid";
  headerGrid.style.gridTemplateColumns = COLS;
  headerGrid.style.justifyContent = "start";
  headerGrid.style.columnGap = "0";
  headerGrid.style.borderBottom = "1px solid #ffffff1a";
  headerGrid.style.padding = "0 0 4px 0";
  headerGrid.style.position = "sticky";
  headerGrid.style.top = "0";

  headerGrid.append(
    mkHeadCell("Weather", "left"),
    mkHeadCell("Last seen"),
    mkHeadCell("Notify"),
    mkHeadCell("Custom rules"),
  );
  card.appendChild(headerGrid);

  const bodyGrid = document.createElement("div");
  bodyGrid.style.display = "grid";
  bodyGrid.style.gridTemplateColumns = COLS;
  bodyGrid.style.justifyContent = "start";
  bodyGrid.style.gridAutoRows = "auto";
  bodyGrid.style.alignContent = "start";
  bodyGrid.style.minHeight = "0";
  bodyGrid.style.height = "100%";
  bodyGrid.style.overflow = "auto";
  bodyGrid.style.overscrollBehavior = "contain";
  bodyGrid.style.width = "100%";
  bodyGrid.style.scrollbarGutter = "stable";
  card.appendChild(bodyGrid);

  const weatherLastSeenRefs = new Map<string, HTMLDivElement>();

  const refreshRulesUI = () => {
    const kids = Array.from(bodyGrid.children);
    for (let i = 0; i + 3 < kids.length; i += 4) {
      const itemCell = kids[i] as HTMLDivElement;
      const ruleCell = kids[i + 3] as HTMLDivElement | undefined;
      const id = itemCell?.dataset?.id;
      if (!id) continue;
      applyRuleState(itemCell, ruleCell ?? null, NotifierService.getRule(id));
    }
  };

  const syncHeaderToScrollbar = () => {
    const sbw = bodyGrid.offsetWidth - bodyGrid.clientWidth;
    headerGrid.style.boxSizing = "border-box";
    headerGrid.style.paddingRight = `${sbw}px`;
  };
  syncHeaderToScrollbar();
  const resizeObserver = new ResizeObserver(syncHeaderToScrollbar);
  resizeObserver.observe(bodyGrid);
  const onResize = () => syncHeaderToScrollbar();
  window.addEventListener("resize", onResize);

  const makeItemCell = (row: WeatherRow) => {
    const wrapCellDiv = document.createElement("div");
    Object.assign(wrapCellDiv.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      padding: "6px",
      borderBottom: "1px solid #ffffff12",
    });

    const ICON = 40;
    const iconWrap = document.createElement("div");
    Object.assign(iconWrap.style, {
      width: `${ICON}px`,
      height: `${ICON}px`,
      flex: `0 0 ${ICON}px`,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "8px",
      background: "#101820",
    });

    const weatherIcon = document.createElement("span");
    weatherIcon.textContent = row.name.trim().charAt(0) || "🌦";
    weatherIcon.style.fontSize = `${ICON - 8}px`;
    weatherIcon.setAttribute("aria-hidden", "true");
    iconWrap.appendChild(weatherIcon);

    const weatherCategories = ["ui", "weather", "mutation"];
    const candidateSet = new Set<string>();
    const addCandidate = (value?: string | null) => {
      if (!value) return;
      const trimmed = value.trim();
      if (trimmed) {
        candidateSet.add(trimmed);
        candidateSet.add(trimmed.replace(/\s+/g, ""));
      }
    };
    addCandidate(row.name);
    addCandidate(row.atomValue);
    addCandidate(row.id);
    const bases = Array.from(candidateSet).map(value => value.replace(/icon$/i, ""));
    const candidates = Array.from(
      new Set(
        bases
          .map(base => `${base}Icon`)
          .concat(Array.from(candidateSet)),
      ).values(),
    ).filter(Boolean);
    if (candidates.length) {
      attachSpriteIcon(iconWrap, weatherCategories, candidates, ICON, "alerts-weather");
    }

    const col = document.createElement("div");
    Object.assign(col.style, {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      lineHeight: "1.2",
      minWidth: "0",
      flex: "1 1 auto",
    });

    const headerRow = document.createElement("div");
    Object.assign(headerRow.style, {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      minWidth: "0",
    });

    const title = document.createElement("div");
    title.textContent = row.name;
    Object.assign(title.style, {
      fontWeight: "700",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      flex: "1 1 auto",
    });

    headerRow.appendChild(title);

    if (row.isCurrent) {
      const badge = document.createElement("span");
      badge.textContent = "Current";
      Object.assign(badge.style, {
        fontSize: "11px",
        padding: "2px 6px",
        borderRadius: "999px",
        background: "#2b5cff33",
        border: "1px solid #2b5cff66",
        color: "#9cbcff",
        fontWeight: "600",
        whiteSpace: "nowrap",
      });
      headerRow.appendChild(badge);
    }

    const mutationsLabel = document.createElement("div");
    mutationsLabel.textContent = "Mutations";
    Object.assign(mutationsLabel.style, {
      fontSize: "11px",
      opacity: "0.7",
      fontWeight: "600",
    });

    const mutationsList = document.createElement("div");
    Object.assign(mutationsList.style, {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      alignItems: "flex-start",
      fontSize: "12px",
      lineHeight: "1.3",
      opacity: row.mutations.length ? "0.85" : "0.6",
    });

    if (row.mutations.length) {
      for (const mutation of row.mutations) {
        const chip = document.createElement("span");
        chip.textContent = formatWeatherMutation(mutation);
        Object.assign(chip.style, {
          display: "inline-flex",
          alignItems: "center",
          padding: "2px 8px",
          borderRadius: "999px",
          background: "#ffffff12",
          whiteSpace: "nowrap",
        });
        mutationsList.appendChild(chip);
      }
    } else {
      const chip = document.createElement("span");
      chip.textContent = "No mutation effects.";
      chip.style.whiteSpace = "nowrap";
      mutationsList.appendChild(chip);
    }

    const ruleHint = document.createElement("div");
    ruleHint.dataset.role = "rule-hint";
    ruleHint.style.opacity = "0.75";
    ruleHint.style.fontSize = "11px";
    ruleHint.style.whiteSpace = "nowrap";
    ruleHint.style.overflow = "hidden";
    ruleHint.style.textOverflow = "ellipsis";
    ruleHint.style.minHeight = "1.2em";
    ruleHint.style.visibility = "hidden";

    col.append(headerRow, mutationsLabel, mutationsList, ruleHint);

    wrapCellDiv.append(iconWrap, col);
    if (row.isCurrent) {
      wrapCellDiv.style.background = "linear-gradient(180deg, #1b2735, #141d25)";
      wrapCellDiv.style.borderRadius = "8px";
    }

    return wrapCellDiv;
  };

  const addRow = (row: WeatherRow) => {
    const itemCell = makeItemCell(row);
    itemCell.dataset.id = row.id;
    itemCell.dataset.context = "weather";
    itemCell.dataset.current = row.isCurrent ? "1" : "0";

    const lastSeenInfo = document.createElement("div");
    const { label, title } = formatLastSeen(row.lastSeen, row.isCurrent);
    lastSeenInfo.textContent = label;
    lastSeenInfo.title = title;
    lastSeenInfo.style.fontWeight = "600";
    lastSeenInfo.style.opacity = label === "Never" ? "0.7" : "1";
    lastSeenInfo.style.whiteSpace = "nowrap";
    const lastSeenCell = wrapCell(lastSeenInfo);
    weatherLastSeenRefs.set(row.id, lastSeenInfo);

    const notifySwitch = createSwitch((on) => {
      try {
        NotifierService.setWeatherNotify(row.id, !!on);
      } catch {}
    });
    setSwitchVisual(notifySwitch, !!row.notify);
    (notifySwitch as HTMLLabelElement).style.padding = "0";
    const notifyCell = wrapCell(notifySwitch);

    const gearBtn = ui.btn("", {
      icon: "⚙",
      size: "sm",
      tooltip: "Custom rule",
      ariaLabel: `Custom rule for ${row.name}`,
    });
    gearBtn.dataset.role = "rule";
    gearBtn.classList.add("qws-rule-btn");
    gearBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openRuleEditor(ui, {
        id: row.id,
        name: row.name,
        type: row.type,
        context: "weather",
      }, gearBtn);
    });
    const ruleCell = wrapCell(gearBtn);
    ruleCell.dataset.role = "rule-cell";

    bodyGrid.append(itemCell, lastSeenCell, notifyCell, ruleCell);
    applyRuleState(itemCell, ruleCell, NotifierService.getRule(row.id));
  };

  const clearGrid = () => {
    closeRuleEditor();
    bodyGrid.innerHTML = "";
    weatherLastSeenRefs.clear();
  };

  const renderEmpty = () => {
    const empty = document.createElement("div");
    empty.textContent = "No weather entries.";
    empty.style.opacity = "0.75";
    empty.style.gridColumn = "1 / -1";
    empty.style.padding = "8px";
    bodyGrid.appendChild(empty);
  };

  let state: WeatherState | null = null;
  let stateSig = "";

  const updateDynamicWeatherStats = () => {
    if (!state) return;
    for (const row of state.rows) {
      const target = weatherLastSeenRefs.get(row.id);
      if (target) {
        const { label, title } = formatLastSeen(row.lastSeen, row.isCurrent);
        target.textContent = label;
        target.title = title;
        target.style.opacity = label === "Never" ? "0.7" : "1";
      }
    }
  };

  const rebuildGrid = () => {
    clearGrid();
    if (!state || !state.rows.length) {
      renderEmpty();
    } else {
      state.rows.forEach(addRow);
      refreshRulesUI();
    }
    syncHeaderToScrollbar();
    updateDynamicWeatherStats();
  };

  let unsubWeather: (() => void) | null = null;
  let unsubRules: (() => void) | null = null;
  (async () => {
    try {
      await NotifierService.start();
    } catch {}
    try {
      unsubWeather = await NotifierService.onWeatherChangeNow((next) => {
        state = next;
        stateSig = weatherStateSignature(next.rows);
        rebuildGrid();
      });
    } catch {}
    try {
      unsubRules = await NotifierService.onRulesChangeNow(() => refreshRulesUI());
    } catch {}
  })();

  const refreshWeatherState = async () => {
    try {
      const next = await NotifierService.getWeatherState();
      const nextSig = weatherStateSignature(next.rows);
      const changed = nextSig !== stateSig;
      state = next;
      stateSig = nextSig;
      if (changed) rebuildGrid();
      else updateDynamicWeatherStats();
    } catch {}
  };

  const dynamicTimer = window.setInterval(updateDynamicWeatherStats, 30_000);
  const weatherRefreshTimer = window.setInterval(() => { void refreshWeatherState(); }, 60_000);

  (view as any).__cleanup__ = (() => {
    const prev = (view as any).__cleanup__;
    return () => {
      try { unsubWeather?.(); } catch {}
      try { unsubRules?.(); } catch {}
      try { resizeObserver.disconnect(); } catch {}
      try { window.removeEventListener("resize", onResize); } catch {}
      try { window.clearInterval(dynamicTimer); } catch {}
      try { window.clearInterval(weatherRefreshTimer); } catch {}
      try { closeRuleEditor(); } catch {}
      try { prev?.(); } catch {}
    };
  })();
}

/* ================== MENU WRAPPER ================== */

export function renderNotifierMenu(root: HTMLElement) {
  const ui = new Menu({ id: "alerts", compact: true, windowSelector: ".qws-win" });
  ui.addTab("shops", "🛒 Shops", (view) => renderShopTab(view, ui));
  ui.addTab("weather", "🌦 Weather", (view) => renderWeatherTab(view, ui));
  ui.addTab("pets", "🐾 Pets", (view) => renderPetAlertsTab(view, ui));
  ui.addTab("settings", "⚙️ Settings", (view) => renderSettingsTab(view, ui));
  ui.mount(root);
}
