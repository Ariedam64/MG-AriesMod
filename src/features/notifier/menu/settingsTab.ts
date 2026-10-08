import { pill } from "../../../ui/kit/badges";
import { button } from "../../../ui/kit/button";
import { card, plainCard } from "../../../ui/kit/card";
import { h } from "../../../ui/kit/dom";
import { numberInput, select, type NumberInput } from "../../../ui/kit/fields";
import { formRow, settingRow } from "../../../ui/kit/layout";
import { segmented, type SegmentedControl } from "../../../ui/kit/segmented";
import { slider } from "../../../ui/kit/sliders";
import { switchInput } from "../../../ui/kit/toggles";
import { audio, type AudioContextKey, type PlaybackMode } from "../audio/audio";
import { isFloatingBellEnabled, setFloatingBellEnabled } from "../bell/floatingBell";
import { PetAlertService } from "../petAlerts";
import {
  LoopDefaults,
  MAX_LOOP_INTERVAL_MS,
  MIN_LOOP_INTERVAL_MS,
  clampLoopInterval,
  setContextPlayback,
} from "../playbackDefaults";
import { soundLibraryCard } from "./soundLibrary";

/** The bell mode, each alert context's sound settings, and the sound library. */

type ContextSpec = { key: AudioContextKey; label: string; canLoop: boolean; info: string };

const CONTEXTS: ContextSpec[] = [
  { key: "shops", label: "Shops", canLoop: true, info: "Loops stop automatically when the item is purchased." },
  { key: "weather", label: "Weather", canLoop: false, info: "Weather alerts play once per trigger." },
  { key: "pets", label: "Pets", canLoop: true, info: "Loops keep repeating; stop manually by disabling the alert." },
];

const muted = (el: HTMLElement) => Object.assign(el.style, { opacity: "0.75", fontSize: "12px", lineHeight: "1.4" });

function row(label: string, control: HTMLElement): HTMLElement {
  const { root, label: labelEl } = formRow(label, control, { labelWidth: "160px" });
  labelEl.style.opacity = "0.9";
  return root;
}

function bellCard(): HTMLElement {
  const bell = card("Notification bell", { tone: "muted" });
  const toggle = switchInput(isFloatingBellEnabled(), (on) => setFloatingBellEnabled(on));
  bell.body.appendChild(
    settingRow(
      "Floating bell (movable widget)",
      "Detaches the bell from the game's icon rail and shows it as a draggable floating button instead. " +
        "Use this if the bell is missing or misplaced on your screen.",
      toggle,
    ).row,
  );
  return bell.root;
}

/** One context's sound settings. `sync` re-reads them from the audio engine. */
class ContextSoundCard {
  readonly root = plainCard();
  private readonly soundSelect: HTMLSelectElement;
  private readonly volume = slider(0, 100, 1, 0);
  private readonly volumeValue = pill("0%");
  private readonly mode: SegmentedControl<PlaybackMode> | null = null;
  private readonly loopRow: HTMLElement | null = null;
  private readonly loopInput: NumberInput | null = null;

  constructor(private readonly spec: ContextSpec, private readonly onDefaultChange: () => void) {
    this.soundSelect = select({ id: `ap.defaultSound.${spec.key}`, width: "180px" });
    const heading = h("div", undefined, spec.label);
    Object.assign(heading.style, { fontWeight: "700", fontSize: "14px", letterSpacing: "0.02em" });
    this.root.appendChild(heading);

    const play = button("", { icon: "▶", size: "sm", tooltip: `Play ${spec.label.toLowerCase()} sound`, ariaLabel: `Play ${spec.label.toLowerCase()} sound` });
    play.addEventListener("click", () => {
      audio.trigger("preview", { sound: this.soundSelect.value }, spec.key).catch(() => {});
    });
    this.soundSelect.addEventListener("change", () => {
      audio.setDefaultSoundByName(this.soundSelect.value, spec.key);
      this.onDefaultChange();
    });
    const soundRow = h("div");
    Object.assign(soundRow.style, { display: "flex", alignItems: "center", gap: "8px" });
    soundRow.append(this.soundSelect, play);
    this.root.appendChild(row("Default sound", soundRow));

    this.volume.addEventListener("input", () => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(this.volume.value)) || 0));
      this.volumeValue.textContent = `${pct}%`;
      audio.setVolume(pct / 100, spec.key);
    });
    const volumeRow = h("div");
    Object.assign(volumeRow.style, { display: "flex", alignItems: "center", gap: "10px" });
    volumeRow.append(this.volume, this.volumeValue);
    this.root.appendChild(row("Volume", volumeRow));

    if (!spec.canLoop) {
      this.root.appendChild(row("Playback mode", pill("One-shot")));
      const info = h("div", undefined, spec.info);
      muted(info);
      this.root.appendChild(row("Details", info));
      return;
    }

    this.mode = segmented<PlaybackMode>(
      [
        { value: "oneshot", label: "One-shot" },
        { value: "loop", label: "Loop" },
      ],
      audio.getPlaybackMode(spec.key),
      (mode) => this.apply(mode),
    );
    this.root.appendChild(row("Playback mode", this.mode));

    const loopDetails = h("div");
    Object.assign(loopDetails.style, { display: "flex", flexDirection: "column", gap: "10px" });
    const info = h("div", undefined, spec.info);
    muted(info);
    loopDetails.appendChild(info);
    if (spec.key === "shops") {
      const stored = clampLoopInterval("", LoopDefaults.get("shops").loopIntervalMs);
      this.loopInput = numberInput(MIN_LOOP_INTERVAL_MS, MAX_LOOP_INTERVAL_MS, 50, stored);
      // Typing an interval means the player wants loops.
      this.loopInput.addEventListener("change", () => this.apply("loop"));
      this.loopInput.addEventListener("blur", () => this.apply("loop"));
      const interval = h("div");
      Object.assign(interval.style, { display: "inline-flex", alignItems: "center", gap: "8px" });
      const unit = h("span", undefined, "ms between plays");
      unit.style.opacity = "0.85";
      interval.append(this.loopInput.wrap, unit);
      loopDetails.appendChild(interval);
    }
    this.loopRow = row(spec.key === "shops" ? "Stop condition" : "Loop interval", loopDetails);
    this.root.appendChild(this.loopRow);
  }

  /** The loop interval in the field, or the stored one, kept in range and written back. */
  private loopInterval(): number {
    const fallback = this.spec.key === "pets" ? audio.getLoopInterval("pets") : LoopDefaults.get(this.spec.key).loopIntervalMs;
    const ms = clampLoopInterval(this.loopInput?.value, fallback);
    if (this.loopInput) this.loopInput.value = String(ms);
    return ms;
  }

  private apply(mode: PlaybackMode): void {
    // Setting the control calls back here with the same mode.
    if (this.mode && this.mode.get() !== mode) return this.mode.set(mode);
    setContextPlayback(this.spec.key, mode, this.loopInterval());
    if (this.loopRow) this.loopRow.style.display = mode === "loop" ? "" : "none";
  }

  /** Lists the library's sounds, keeping the selection when it still exists. */
  fillSounds(): void {
    const names = audio.listSounds();
    const current = this.soundSelect.value;
    this.soundSelect.replaceChildren(
      ...names.map((name) => {
        const opt = h("option", undefined, name);
        opt.value = name;
        return opt;
      }),
    );
    const preferred = audio.getDefaultSoundName(this.spec.key);
    if (names.includes(current)) this.soundSelect.value = current;
    else if (preferred && names.includes(preferred)) this.soundSelect.value = preferred;
    else if (names.length) this.soundSelect.value = names[0];
  }

  /** Shows the engine's settings, and re-applies them so the stored ones agree. */
  sync(): void {
    const settings = audio.getPlaybackSettings(this.spec.key);
    if (settings.defaultSoundName && audio.listSounds().includes(settings.defaultSoundName)) {
      this.soundSelect.value = settings.defaultSoundName;
    }
    const pct = Math.round(settings.volume * 100);
    this.volume.value = String(pct);
    this.volumeValue.textContent = `${pct}%`;
    this.apply(this.spec.canLoop && settings.mode === "loop" ? "loop" : "oneshot");
  }
}

export function renderSettingsTab(view: HTMLElement): void {
  view.replaceChildren();
  void PetAlertService.start().catch(() => {});

  const root = h("div");
  Object.assign(root.style, {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: "12px",
    height: "54vh",
    minHeight: "0",
    overflow: "hidden",
  });
  view.appendChild(root);

  const contexts: ContextSoundCard[] = [];
  const library = soundLibraryCard(() => {
    for (const ctx of contexts) ctx.fillSounds();
    library.refresh();
  });
  for (const spec of CONTEXTS) {
    contexts.push(new ContextSoundCard(spec, () => library.refresh()));
  }

  const audioCard = card("Audio & Playback", { tone: "muted" });
  audioCard.body.append(...contexts.map((ctx) => ctx.root));

  const scroller = h("div");
  Object.assign(scroller.style, { overflow: "auto", minHeight: "0", height: "100%", display: "grid", alignContent: "start", gap: "12px" });
  scroller.append(audioCard.root, library.root);
  root.append(bellCard(), scroller);

  for (const ctx of contexts) {
    ctx.fillSounds();
    ctx.sync();
  }
  library.refresh();
}
