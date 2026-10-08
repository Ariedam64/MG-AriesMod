import { clamp } from "../../../lib/math";
import { Subscriptions } from "../../../lib/emitter";
import { pill } from "../../../ui/kit/badges";
import { button } from "../../../ui/kit/button";
import { h } from "../../../ui/kit/dom";
import { select } from "../../../ui/kit/fields";
import { slider } from "../../../ui/kit/sliders";
import { audio, type PlaybackMode } from "../audio/audio";
import { MIN_LOOP_INTERVAL_MS, type NotifierContext } from "../playbackDefaults";
import { NotifierRules, ruleDefaults, rulePatchFromEditor, shortSoundName } from "../rules";
import { ensureMenuStyles } from "./styles";

/** The popover that edits one item's or weather's custom rule. */

export type RuleTarget = {
  id: string;
  name: string;
  type: string;
  context: NotifierContext;
};

const MARGIN = 12;

let popover: HTMLDivElement | null = null;
let teardown = new Subscriptions();

export function closeRuleEditor(): void {
  popover?.remove();
  popover = null;
  teardown.dispose();
  teardown = new Subscriptions();
}

function listen<K extends keyof DocumentEventMap>(
  type: K,
  handler: (ev: DocumentEventMap[K]) => void,
  options: AddEventListenerOptions,
): void {
  document.addEventListener(type, handler, options);
  teardown.add(() => document.removeEventListener(type, handler, options));
}

function field(label: string, ...controls: HTMLElement[]): HTMLDivElement {
  const wrap = h("div", "qws-rule-field");
  wrap.append(h("label", undefined, label), ...controls);
  return wrap;
}

function option(sel: HTMLSelectElement, value: string, text: string): void {
  const opt = h("option", undefined, text);
  opt.value = value;
  sel.appendChild(opt);
}

/** Keeps `value` inside [a, b] whichever way round they are (a popover taller than the window). */
const clampBetween = (value: number, a: number, b: number) => clamp(value, Math.min(a, b), Math.max(a, b));

/** Lets the popover be dragged by its header. */
function makeDraggable(pop: HTMLDivElement, handle: HTMLElement, ignore: HTMLElement): void {
  const place = (left: number, top: number) => {
    pop.style.left = `${Math.round(clampBetween(left, MARGIN, window.innerWidth - pop.offsetWidth - MARGIN))}px`;
    pop.style.top = `${Math.round(clampBetween(top, MARGIN, window.innerHeight - pop.offsetHeight - MARGIN))}px`;
  };
  let drag: { pointerId: number; x: number; y: number; left: number; top: number } | null = null;

  const onMove = (ev: PointerEvent) => {
    if (drag && ev.pointerId === drag.pointerId) place(drag.left + ev.clientX - drag.x, drag.top + ev.clientY - drag.y);
  };
  const onEnd = (ev?: PointerEvent) => {
    if (!drag || (ev && ev.pointerId !== drag.pointerId)) return;
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onEnd);
    document.removeEventListener("pointercancel", onEnd);
    try {
      handle.releasePointerCapture(drag.pointerId);
    } catch {}
    drag = null;
  };
  const onDown = (ev: PointerEvent) => {
    if (ev.button !== 0 || ignore.contains(ev.target as Node)) return;
    onEnd();
    const rect = pop.getBoundingClientRect();
    drag = { pointerId: ev.pointerId, x: ev.clientX, y: ev.clientY, left: rect.left, top: rect.top };
    try {
      handle.setPointerCapture(ev.pointerId);
    } catch {}
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onEnd);
    document.addEventListener("pointercancel", onEnd);
    ev.preventDefault();
  };
  handle.addEventListener("pointerdown", onDown);
  teardown.add(() => {
    handle.removeEventListener("pointerdown", onDown);
    onEnd();
  });
}

/** Below the anchor, right-aligned with it; above it when there is no room below. */
function placeNear(pop: HTMLDivElement, anchor: HTMLElement): void {
  const anchorRect = anchor.getBoundingClientRect();
  const width = pop.offsetWidth;
  const height = pop.offsetHeight;
  const left = anchorRect.right - width;
  let top = anchorRect.bottom + 8;
  if (top + height > window.innerHeight - MARGIN) top = anchorRect.top - height - 8;
  if (top < MARGIN) top = MARGIN;
  pop.style.left = `${Math.round(clampBetween(left, MARGIN, window.innerWidth - width - MARGIN))}px`;
  pop.style.top = `${Math.round(clampBetween(top, MARGIN, window.innerHeight - height - MARGIN))}px`;
}

/** Only digits and editing keys; the game's own key handlers never see the typing. */
function digitsOnly(input: HTMLInputElement): void {
  const editing = new Set(["Backspace", "Delete", "Tab", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);
  input.addEventListener("keydown", (ev) => {
    ev.stopPropagation();
    ev.stopImmediatePropagation();
    if (ev.ctrlKey || ev.metaKey || ev.altKey || /^[0-9]$/.test(ev.key) || editing.has(ev.key)) return;
    ev.preventDefault();
  });
  input.addEventListener("input", () => {
    const digits = input.value.replace(/\D+/g, "");
    if (digits !== input.value) input.value = digits;
  });
}

export function openRuleEditor(target: RuleTarget, anchor: HTMLElement): void {
  closeRuleEditor();
  ensureMenuStyles();

  const current = NotifierRules.get(target.id);
  const defaults = ruleDefaults(target.context);
  const canLoop = target.context === "shops";

  const pop = h("div", "qws-rule-popover");

  // Header: title, item type, close button. Dragging it moves the popover.
  const header = h("div");
  Object.assign(header.style, {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "12px",
    cursor: "move",
    userSelect: "none",
    touchAction: "none",
  });
  const titles = h("div");
  const title = h("div", undefined, target.name);
  Object.assign(title.style, { fontWeight: "700", fontSize: "14px", lineHeight: "1.2" });
  const subtitle = h("div", "qws-rule-hint", target.type);
  subtitle.style.fontSize = "12px";
  titles.append(title, subtitle);
  const closeBtn = button("✕", { variant: "ghost", size: "xs", ariaLabel: "Close", onClick: closeRuleEditor });
  header.append(titles, closeBtn);
  pop.appendChild(header);
  makeDraggable(pop, header, closeBtn);

  // Sound: the context's default, then every library sound.
  const soundSelect = select();
  const selectedSound = current?.sound ?? "";
  const names = audio.listSounds();
  option(soundSelect, "", defaults.soundName);
  for (const name of names) {
    if (name !== defaults.soundName || selectedSound === name) option(soundSelect, name, name);
  }
  if (selectedSound && !names.includes(selectedSound)) option(soundSelect, selectedSound, shortSoundName(selectedSound));
  soundSelect.value = selectedSound;
  pop.appendChild(field("Sound", soundSelect));

  // Volume, in percent.
  const defaultVolumePct = Math.round(defaults.volume * 100);
  const initialVolumePct = Math.round(clamp(current?.volume ?? defaults.volume, 0, 1) * 100);
  const volumeRange = slider(0, 100, 1, initialVolumePct, { fill: true });
  const volumeValue = pill(`${initialVolumePct}%`);
  volumeRange.addEventListener("input", () => {
    volumeValue.textContent = `${clamp(Math.round(Number(volumeRange.value)) || 0, 0, 100)}%`;
  });
  const volumeRow = h("div");
  Object.assign(volumeRow.style, { display: "flex", alignItems: "center", gap: "10px" });
  volumeRow.append(volumeRange, volumeValue);
  pop.appendChild(field("Volume", volumeRow, h("div", "qws-rule-hint", `Default: ${defaultVolumePct}%`)));

  // Playback mode. Only shop alerts can loop.
  const modeSelect = select();
  const modes: PlaybackMode[] = canLoop ? (defaults.mode === "loop" ? ["loop", "oneshot"] : ["oneshot", "loop"]) : ["oneshot"];
  for (const mode of modes) option(modeSelect, mode, mode === "loop" ? "Loop" : "One-shot");
  modeSelect.value = canLoop ? (current?.playbackMode ?? defaults.mode) : "oneshot";
  modeSelect.disabled = !canLoop;
  pop.appendChild(field("Playback mode", modeSelect));

  // Loop settings: a shop loop stops once the item is bought.
  const stopSelect = select();
  option(stopSelect, "purchase", "Until purchase");
  const stopField = field("Stop condition", stopSelect);

  const intervalInput = h("input", "qmm-input qmm-input--sm");
  intervalInput.type = "number";
  intervalInput.min = String(MIN_LOOP_INTERVAL_MS);
  intervalInput.step = "50";
  intervalInput.inputMode = "numeric";
  intervalInput.placeholder = String(defaults.loopIntervalMs);
  intervalInput.value = current?.loopIntervalMs != null ? String(current.loopIntervalMs) : "";
  digitsOnly(intervalInput);
  const intervalField = field("Loop interval (ms)", intervalInput);

  const showLoopFields = () => {
    const show = canLoop && modeSelect.value === "loop";
    stopField.style.display = show ? "grid" : "none";
    intervalField.style.display = show ? "grid" : "none";
  };
  if (canLoop) {
    pop.append(stopField, intervalField);
    modeSelect.addEventListener("change", showLoopFields);
    // Editing a loop field means the player wants a loop.
    intervalInput.addEventListener("input", () => {
      if (modeSelect.value === "loop") return;
      modeSelect.value = "loop";
      showLoopFields();
    });
  }
  showLoopFields();

  pop.appendChild(
    h("div", "qws-rule-hint", "Use defaults by leaving values unchanged (matching the default volume keeps it inherited)."),
  );

  const actions = h("div", "qws-rule-actions");
  const clearBtn = button("Clear", { variant: "ghost", size: "sm", disabled: !current });
  clearBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    NotifierRules.clear(target.id);
    closeRuleEditor();
  });
  const saveBtn = button("Save", { variant: "primary", size: "sm" });
  saveBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    NotifierRules.set(
      target.id,
      rulePatchFromEditor(target.context, {
        sound: soundSelect.value,
        volumePct: Number(volumeRange.value),
        mode: modeSelect.value,
        stop: stopSelect.value,
        interval: intervalInput.value,
      }),
    );
    closeRuleEditor();
  });
  actions.append(clearBtn, saveBtn);
  pop.appendChild(actions);

  document.body.appendChild(pop);
  placeNear(pop, anchor);
  popover = pop;

  // A click elsewhere closes it; keys and the wheel stay with the popover.
  const onOutside = (ev: PointerEvent) => {
    const t = ev.target as Node | null;
    if (t && !pop.contains(t) && !anchor.contains(t)) closeRuleEditor();
  };
  const timer = window.setTimeout(() => listen("pointerdown", onOutside, { capture: true }));
  teardown.add(() => window.clearTimeout(timer));
  listen(
    "keydown",
    (ev) => {
      if (!pop.contains(ev.target as Node | null)) ev.stopImmediatePropagation();
    },
    { capture: true },
  );
  listen(
    "wheel",
    (ev) => {
      if (pop.contains(ev.target as Node | null)) ev.stopImmediatePropagation();
    },
    { capture: true, passive: true },
  );
}
