import { button } from "../../../ui/kit/button";
import { card, errorBar } from "../../../ui/kit/card";
import { h } from "../../../ui/kit/dom";
import { audio, type AudioContextKey } from "../audio/audio";

/** The Sound library card: import files, preview them, pick the defaults, remove them. */

const CONTEXT_LABELS: Array<[AudioContextKey, string]> = [
  ["shops", "Shops"],
  ["weather", "Weather"],
  ["pets", "Pets"],
];

const DROP_HINT = "Click to browse or drop files here.";

/** The dashed drop zone that opens the file picker. */
function dropZone(onFiles: (files: FileList | null) => Promise<void>): HTMLElement {
  const input = h("input");
  input.type = "file";
  input.accept = "audio/*";
  input.multiple = true;
  input.hidden = true;

  const zone = h("div", "qws-al-drop");
  zone.tabIndex = 0;
  zone.setAttribute("role", "button");
  zone.setAttribute("aria-label", "Select audio files");
  const status = h("div", "qws-al-drop__hint", DROP_HINT);
  zone.append(
    h("div", "qws-al-drop__title", "Add sounds"),
    status,
    h("div", "qws-al-drop__formats", "MP3, WAV or OGG, up to 10 s and 200 KB."),
  );

  const highlight = (on: boolean) => zone.classList.toggle("is-active", on);
  const settle = () => highlight(document.activeElement === zone);

  const take = async (files: FileList | null) => {
    status.textContent = !files?.length ? DROP_HINT : files.length === 1 ? files[0].name : `${files.length} files selected`;
    await onFiles(files);
    status.textContent = DROP_HINT;
    // Lets the same file be picked again.
    input.value = "";
    settle();
  };

  zone.addEventListener("mouseenter", () => highlight(true));
  zone.addEventListener("mouseleave", settle);
  zone.addEventListener("focus", () => highlight(true));
  zone.addEventListener("blur", () => highlight(false));
  zone.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    highlight(true);
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
  });
  zone.addEventListener("dragleave", settle);
  zone.addEventListener("drop", (ev) => {
    ev.preventDefault();
    void take(ev.dataTransfer?.files || null);
  });
  zone.addEventListener("click", () => input.click());
  zone.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      input.click();
    }
  });
  input.onchange = () => void take(input.files);

  const wrap = h("div");
  wrap.append(input, zone);
  return wrap;
}

/**
 * One library sound: preview, name, a button per alert type that makes it
 * that type's default (lit when it already is), and remove.
 */
function soundRow(name: string, onChange: () => void): HTMLDivElement {
  const defaultFor = CONTEXT_LABELS.filter(([key]) => audio.getDefaultSoundName(key) === name);
  const usedByShopsOrWeather = defaultFor.some(([key]) => key !== "pets");

  const row = h("div", "qws-al-sound");
  const play = button("", {
    icon: "▶",
    size: "sm",
    title: "Preview",
    ariaLabel: `Preview ${name}`,
    onClick: () => void audio.trigger("preview", { sound: name }, "shops").catch(() => {}),
  });
  const title = h("span", "qws-al-sound__name", name);
  title.title = name;

  const uses = h("div", "qws-al-sound__uses");
  uses.appendChild(h("span", "qws-al-sound__label", "Default for"));
  for (const [key, label] of CONTEXT_LABELS) {
    const isDefault = defaultFor.some(([k]) => k === key);
    uses.appendChild(
      button(label, {
        size: "xs",
        active: isDefault,
        title: isDefault ? `Default ${label.toLowerCase()} sound` : `Set as ${label.toLowerCase()} default`,
        onClick: () => {
          audio.setDefaultSoundByName(name, key);
          onChange();
        },
      }),
    );
  }

  const remove = button("", {
    icon: "✕",
    size: "sm",
    variant: "ghost",
    title: "Remove from library",
    ariaLabel: `Remove ${name}`,
    onClick: () => {
      audio.unregisterSound(name);
      onChange();
    },
  });
  if (audio.isProtectedSound(name) || usedByShopsOrWeather) {
    remove.setEnabled(false);
    remove.title = audio.isProtectedSound(name) ? "Built-in sound cannot be removed" : "Currently used as default";
  }

  row.append(play, title, uses, remove);
  return row;
}

/** The library card. `onLibraryChange` runs after anything that changes the sounds or the defaults. */
export function soundLibraryCard(onLibraryChange: () => void): { root: HTMLElement; refresh: () => void } {
  const section = card("Sound library");
  const errors = errorBar();
  const list = h("div", "qws-al-list");

  const refresh = () => {
    const names = audio.listSounds();
    if (!names.length) {
      list.replaceChildren(h("div", "qws-al-empty", "No sounds yet. Add one above."));
      return;
    }
    list.replaceChildren(...names.map((name) => soundRow(name, onLibraryChange)));
  };

  const importFiles = async (files: FileList | null) => {
    errors.clear();
    if (!files?.length) return;
    const { added, errors: failures } = await audio.importFiles(Array.from(files));
    if (failures.length) errors.show(failures[failures.length - 1]);
    if (added.length) onLibraryChange();
  };

  section.body.append(dropZone(importFiles), errors.el, list);
  refresh();
  return { root: section.root, refresh };
}
