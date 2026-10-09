import { pill } from "../../../ui/kit/badges";
import { button } from "../../../ui/kit/button";
import { card } from "../../../ui/kit/card";
import { h } from "../../../ui/kit/dom";
import { numberInput, select, type NumberInput } from "../../../ui/kit/fields";
import { settingRow } from "../../../ui/kit/layout";
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
import { ensureMenuStyles } from "./styles";

/** Each alert type's sound settings, the sound library, and the bell mode. */

type ContextSpec = { key: AudioContextKey; label: string; canLoop: boolean; info: string | null };

const CONTEXTS: ContextSpec[] = [
  { key: "shops", label: "Shops", canLoop: true, info: null },
  { key: "weather", label: "Weather", canLoop: false, info: "Weather alerts play once." },
  { key: "pets", label: "Pets", canLoop: true, info: "A loop keeps playing until you turn the alert off." },
];

function bellCard(): HTMLElement {
  const bell = card("Notification bell");
  const toggle = switchInput(isFloatingBellEnabled(), (on) => setFloatingBellEnabled(on));
  bell.body.appendChild(
    settingRow("Floating bell", "A bell you can drag anywhere, for when the game's one is missing.", toggle).row,
  );
  return bell.root;
}

function inline(...children: Array<HTMLElement | string>): HTMLDivElement {
  const row = h("div", "qws-rule-inline");
  row.append(...children);
  return row;
}

/** One alert type's sound settings. `sync` re-reads them from the audio engine. */
class ContextSounds {
  readonly root = h("div", "qws-al-ctx");
  private readonly soundSelect: HTMLSelectElement;
  private readonly volume = slider(0, 100, 1, 0);
  private readonly volumeValue = pill("0%");
  private readonly mode: SegmentedControl<PlaybackMode> | null = null;
  private readonly loopRow: HTMLElement | null = null;
  private readonly loopInput: NumberInput | null = null;

  constructor(private readonly spec: ContextSpec, private readonly onDefaultChange: () => void) {
    const name = spec.label.toLowerCase();
    this.soundSelect = select({ id: `ap.defaultSound.${spec.key}` });
    this.soundSelect.setAttribute("aria-label", `${spec.label} sound`);
    const play = button("", { icon: "▶", size: "sm", tooltip: `Play ${name} sound`, ariaLabel: `Play ${name} sound` });
    play.addEventListener("click", () => {
      audio.trigger("preview", { sound: this.soundSelect.value }, spec.key).catch(() => {});
    });
    this.soundSelect.addEventListener("change", () => {
      audio.setDefaultSoundByName(this.soundSelect.value, spec.key);
      this.onDefaultChange();
    });
    const pick = inline(this.soundSelect, play);
    pick.classList.add("qws-al-sound-pick");
    this.root.appendChild(settingRow("Sound", null, pick).row);

    this.volume.setAttribute("aria-label", `${spec.label} volume`);
    this.volume.addEventListener("input", () => {
      const pct = Math.max(0, Math.min(100, Math.round(Number(this.volume.value)) || 0));
      this.volumeValue.textContent = `${pct}%`;
      audio.setVolume(pct / 100, spec.key);
    });
    this.root.appendChild(settingRow("Volume", null, inline(this.volume, this.volumeValue)).row);

    if (!spec.canLoop) {
      this.root.appendChild(settingRow("Playback", spec.info, pill("One-shot")).row);
      return;
    }

    this.mode = segmented<PlaybackMode>(
      [
        { value: "oneshot", label: "One-shot" },
        { value: "loop", label: "Loop" },
      ],
      audio.getPlaybackMode(spec.key),
      (mode) => this.apply(mode),
      { ariaLabel: `${spec.label} playback` },
    );
    this.root.appendChild(settingRow("Playback", spec.info, this.mode).row);

    if (spec.key === "shops") {
      const stored = clampLoopInterval("", LoopDefaults.get("shops").loopIntervalMs);
      this.loopInput = numberInput(MIN_LOOP_INTERVAL_MS, MAX_LOOP_INTERVAL_MS, 50, stored);
      this.loopInput.setAttribute("aria-label", "Loop interval in milliseconds");
      // Typing an interval means the player wants loops.
      this.loopInput.addEventListener("change", () => this.apply("loop"));
      this.loopInput.addEventListener("blur", () => this.apply("loop"));
      this.loopRow = settingRow("Repeat every", "Stops once the item is bought.", inline(this.loopInput.wrap, "ms")).row;
      this.root.appendChild(this.loopRow);
    }
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
    if (this.loopRow) this.loopRow.hidden = mode !== "loop";
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
  ensureMenuStyles();
  void PetAlertService.start().catch(() => {});

  const tab = h("div", "qws-al-tab");
  const scroll = h("div", "qws-al-scroll qmm-scroll");
  tab.appendChild(scroll);
  view.replaceChildren(tab);

  const contexts: ContextSounds[] = [];
  const library = soundLibraryCard(() => {
    for (const ctx of contexts) ctx.fillSounds();
    library.refresh();
  });
  for (const spec of CONTEXTS) contexts.push(new ContextSounds(spec, () => library.refresh()));

  // One alert type shows at a time; the switch above picks which.
  const showContext = (key: AudioContextKey) => {
    contexts.forEach((ctx, i) => (ctx.root.hidden = CONTEXTS[i].key !== key));
  };
  const picker = segmented<AudioContextKey>(
    CONTEXTS.map(({ key, label }) => ({ value: key, label })),
    "shops",
    showContext,
    { ariaLabel: "Alert type" },
  );
  const soundsCard = card("Alert sounds", { actions: [picker] });
  soundsCard.body.append(...contexts.map((ctx) => ctx.root));
  showContext("shops");

  scroll.append(soundsCard.root, library.root, bellCard());

  for (const ctx of contexts) {
    ctx.fillSounds();
    ctx.sync();
  }
  library.refresh();
}
