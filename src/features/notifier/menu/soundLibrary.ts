import { pill } from "../../../ui/kit/badges";
import { button } from "../../../ui/kit/button";
import { card, errorBar } from "../../../ui/kit/card";
import { h } from "../../../ui/kit/dom";
import { color } from "../../../ui/kit/theme";
import { audio, type AudioContextKey } from "../audio/audio";

/** The Sound library card: import files, preview them, pick the defaults, remove them. */

const CONTEXT_LABELS: Array<[AudioContextKey, string]> = [
  ["shops", "Shops"],
  ["weather", "Weather"],
  ["pets", "Pets"],
];

const DROP_HINT = "Click to browse or drop files";

/** The dashed drop zone that opens the file picker. */
function dropZone(onFiles: (files: FileList | null) => Promise<void>): HTMLElement {
  const input = h("input");
  input.type = "file";
  input.accept = "audio/*";
  input.multiple = true;
  input.style.display = "none";

  const zone = h("div");
  zone.tabIndex = 0;
  zone.setAttribute("role", "button");
  zone.setAttribute("aria-label", "Select audio files");
  Object.assign(zone.style, {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "18px 22px",
    minHeight: "110px",
    borderRadius: "14px",
    border: `1px dashed ${color.borderStrong}`,
    background: color.mutedBg,
    transition: "border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
    cursor: "pointer",
    textAlign: "center",
  });
  const title = h("div", undefined, "Select audio files");
  Object.assign(title.style, { fontWeight: "600", fontSize: "14px", letterSpacing: "0.02em" });
  const status = h("div", undefined, DROP_HINT);
  Object.assign(status.style, { fontSize: "12px", opacity: "0.75" });
  zone.append(title, status);

  const highlight = (on: boolean) => {
    zone.style.borderColor = on ? color.accentBorderHover : color.borderStrong;
    zone.style.boxShadow = on ? `0 0 0 3px ${color.accentSoft}` : "none";
    zone.style.background = on ? color.accentSoft : color.mutedBg;
  };
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

/** One library sound: its name, the contexts using it by default, and its buttons. */
function soundRow(name: string, onChange: () => void): HTMLDivElement {
  const defaultFor = CONTEXT_LABELS.filter(([key]) => audio.getDefaultSoundName(key) === name);
  const usedByShopsOrWeather = defaultFor.some(([key]) => key !== "pets");

  const row = h("div");
  Object.assign(row.style, {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "12px",
    alignItems: "center",
    padding: "8px 10px",
    borderRadius: "8px",
    border: `1px solid ${defaultFor.length ? color.accentBorder : color.border}`,
    background: color.cardBg,
  });

  const info = h("div");
  Object.assign(info.style, { display: "flex", alignItems: "center", gap: "8px", minWidth: "0" });
  const title = h("span", undefined, name);
  Object.assign(title.style, { fontWeight: "600", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" });
  info.appendChild(title);
  for (const [, label] of defaultFor) info.appendChild(pill(label, "ok"));

  const actions = h("div");
  Object.assign(actions.style, { display: "flex", gap: "6px", justifyContent: "flex-end", flexWrap: "wrap" });
  actions.appendChild(
    button("▶", { size: "sm", title: "Preview", onClick: () => void audio.trigger("preview", { sound: name }, "shops").catch(() => {}) }),
  );
  for (const [key, label] of CONTEXT_LABELS) {
    actions.appendChild(
      button(`Set ${label.toLowerCase()}`, {
        size: "sm",
        title: `Set as ${label.toLowerCase()} default`,
        onClick: () => {
          audio.setDefaultSoundByName(name, key);
          onChange();
        },
      }),
    );
  }
  const remove = button("Remove", {
    size: "sm",
    title: "Remove from library",
    onClick: () => {
      audio.unregisterSound(name);
      onChange();
    },
  });
  if (audio.isProtectedSound(name) || usedByShopsOrWeather) {
    remove.setEnabled(false);
    remove.title = audio.isProtectedSound(name) ? "Built-in sound cannot be removed" : "Currently used as default";
  }
  actions.appendChild(remove);

  row.append(info, actions);
  return row;
}

/** The library card. `onLibraryChange` runs after anything that changes the sounds or the defaults. */
export function soundLibraryCard(onLibraryChange: () => void): { root: HTMLElement; refresh: () => void } {
  const section = card("Sound library", { tone: "muted" });
  const errors = errorBar();

  const list = h("div");
  Object.assign(list.style, {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    maxHeight: "240px",
    overflowY: "auto",
    minHeight: "0",
    padding: "4px 4px 4px 0",
  });

  const refresh = () => {
    const names = audio.listSounds();
    if (!names.length) {
      const empty = h("div", undefined, "No sounds in the library.");
      Object.assign(empty.style, { opacity: "0.75", textAlign: "center", padding: "12px 6px" });
      list.replaceChildren(empty);
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

  const tip = h("div", undefined, "MP3, WAV, OGG, at most 10 s and 200 KB.");
  Object.assign(tip.style, { opacity: "0.75", fontSize: "12px" });

  const listHeader = h("div");
  Object.assign(listHeader.style, {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    gap: "12px",
    fontSize: "12px",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    opacity: "0.65",
    paddingBottom: "4px",
    borderBottom: `1px solid ${color.border}`,
  });
  const actionsHead = h("span", undefined, "Actions");
  actionsHead.style.justifySelf = "end";
  listHeader.append(h("span", undefined, "Sound"), actionsHead);

  const listCard = h("div");
  Object.assign(listCard.style, {
    display: "grid",
    gridTemplateRows: "auto 1fr",
    gap: "6px",
    border: `1px solid ${color.border}`,
    borderRadius: "10px",
    background: color.mutedBg,
    padding: "10px",
  });
  listCard.append(listHeader, list);

  section.body.append(dropZone(importFiles), tip, listCard, errors.el);
  refresh();
  return { root: section.root, refresh };
}
