import { pill } from "../../ui/kit/badges";
import { button } from "../../ui/kit/button";
import { card, errorBar } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { textInput } from "../../ui/kit/fields";
import { flexRow, settingRow } from "../../ui/kit/layout";
import { bar, copy, emptyNote, grow, hint, safeRegex, tabRoot } from "./shared";
import { getAudioUrlSafe } from "../../platform/discordCsp";
import { fetchAudioCatalog, type AudioCatalogResponse, type AudioSfxItem } from "../../platform/mgApi";

/** A play triangle, kept as text so no platform swaps in an emoji. */
const PLAY_GLYPH = "▶︎";

let catalogPromise: Promise<AudioCatalogResponse | null> | null = null;

async function loadCatalog(force = false): Promise<AudioCatalogResponse | null> {
  if (force) catalogPromise = null;
  if (!catalogPromise) catalogPromise = fetchAudioCatalog();
  return catalogPromise;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "-";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** A list row: a name and a detail line, with its buttons on the right. */
function audioRow(title: string, meta: string, actions: HTMLElement[]): HTMLDivElement {
  const row = h("div", "dd-row");
  const info = h("div", "dd-row__info");
  info.append(h("div", "dd-row__title", title), h("div", "dd-row__meta", meta));
  const acts = h("div", "dd-row__actions");
  acts.append(...actions);
  row.append(info, acts);
  return row;
}

export function renderAudioPlayerTab(view: HTMLElement) {
  const root = tabRoot(view);

  let catalog: AudioCatalogResponse | null = null;
  let visibleSfx: AudioSfxItem[] = [];

  // Shared player: only one clip (theme or sfx) plays at a time.
  const audioEl = document.createElement("audio");
  audioEl.preload = "none";
  root.appendChild(audioEl);
  let stopAtHandler: (() => void) | null = null;
  let nowPlayingLabel = "";

  // ---------- Player ----------
  const btnStop = button("Stop", {
    size: "sm",
    onClick: () => stopPlayback(),
  });
  const btnReload = button("Reload catalog", {
    variant: "ghost",
    size: "sm",
    onClick: () => { void refreshAll(true); },
  });
  const playerControls = flexRow({ gap: 6 });
  playerControls.append(btnStop, btnReload);
  const player = settingRow("Player", "Not playing.", playerControls);
  player.row.classList.add("dd-status");
  const nowPlaying = player.row.querySelector<HTMLElement>(".qmm-setting-row__hint")!;
  nowPlaying.classList.add("dd-now");

  const overviewError = errorBar();
  root.append(player.row, overviewError.el);

  // The lists stack rather than sit side by side, so each row keeps its buttons on one line.

  // ---------- Themes ----------
  const themeCount = pill("0");
  const themesCard = card("Themes", {
    subtitle: "Music and ambience for each area.",
    actions: [themeCount],
  });
  root.appendChild(themesCard.root);
  const themeList = h("div", "dd-well qmm-scroll");
  themesCard.body.append(themeList);

  // ---------- Sound effects ----------
  const sfxCount = pill("0");
  const sfxCard = card("Sound effects", {
    subtitle: "Cut from the single sound effect file.",
    actions: [sfxCount],
  });
  root.appendChild(sfxCard.root);

  const sfxFilter = grow(textInput("Filter, regex allowed", ""));
  const btnSfxClear = button("Clear", {
    variant: "ghost",
    size: "sm",
    onClick: () => {
      sfxFilter.value = "";
      renderSfx();
      sfxFilter.focus();
    },
  });
  const btnCopyVisible = button("Copy names", {
    variant: "ghost",
    size: "sm",
    title: "Copy the names of the sounds shown",
    onClick: () => {
      if (!visibleSfx.length) return;
      copy(visibleSfx.map(s => s.name).join("\n"));
    },
  });

  const sfxInfo = hint("");
  const sfxList = h("div", "dd-well qmm-scroll");
  sfxCard.body.append(bar(sfxFilter, btnSfxClear, btnCopyVisible), sfxInfo, sfxList);

  sfxFilter.addEventListener("input", () => renderSfx());
  sfxFilter.addEventListener("keydown", ev => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      renderSfx();
    }
  });

  function stopPlayback() {
    if (stopAtHandler) {
      audioEl.removeEventListener("timeupdate", stopAtHandler);
      stopAtHandler = null;
    }
    audioEl.pause();
    nowPlayingLabel = "";
    nowPlaying.textContent = "Not playing.";
    btnStop.setEnabled(false);
  }

  async function playClip(url: string, label: string, start?: number, end?: number) {
    stopPlayback();
    nowPlayingLabel = label;
    nowPlaying.textContent = `Loading ${label}…`;
    btnStop.setEnabled(true);
    const safeUrl = await getAudioUrlSafe(url);
    if (nowPlayingLabel !== label) return; // superseded by another play() call
    audioEl.src = safeUrl;
    const onLoaded = () => {
      audioEl.removeEventListener("loadedmetadata", onLoaded);
      if (typeof start === "number") audioEl.currentTime = start;
    };
    audioEl.addEventListener("loadedmetadata", onLoaded);
    if (typeof end === "number") {
      stopAtHandler = () => {
        if (audioEl.currentTime >= end) stopPlayback();
      };
      audioEl.addEventListener("timeupdate", stopAtHandler);
    }
    try {
      await audioEl.play();
      nowPlaying.textContent = `Playing ${label}`;
    } catch {
      nowPlaying.textContent = `Could not play ${label}`;
    }
  }

  function renderThemes() {
    themeList.innerHTML = "";
    const themes = catalog?.themes ?? [];
    themes.forEach(theme => {
      const actions: HTMLElement[] = [];
      if (theme.music) {
        actions.push(button("Music", {
          icon: PLAY_GLYPH, size: "sm", title: "Play the music",
          onClick: () => { void playClip(theme.music!, `${theme.name} · music`); },
        }));
      }
      if (theme.ambience) {
        actions.push(button("Ambience", {
          icon: PLAY_GLYPH, size: "sm", title: "Play the ambience",
          onClick: () => { void playClip(theme.ambience!, `${theme.name} · ambience`); },
        }));
      }
      actions.push(button("Copy URLs", {
        variant: "ghost", size: "sm",
        onClick: () => copy([theme.music, theme.ambience].filter(Boolean).join("\n")),
      }));
      const meta = [theme.music && "music", theme.ambience && "ambience"].filter(Boolean).join(" · ") || "(no tracks)";
      themeList.appendChild(audioRow(theme.name, meta, actions));
    });
    if (!themes.length) {
      themeList.appendChild(emptyNote(catalog ? "The catalog has no themes." : "No themes loaded yet."));
    }
  }

  function renderSfx() {
    const rx = safeRegex(sfxFilter.value.trim() || ".*");
    visibleSfx = [];
    sfxList.innerHTML = "";
    const items = catalog?.sfx.items ?? [];
    const atlasUrl = catalog?.sfx.url ?? "";

    for (const item of items) {
      if (!rx.test(item.name)) continue;
      visibleSfx.push(item);

      const playBtn = button("Play", {
        icon: PLAY_GLYPH, size: "sm",
        onClick: () => { void playClip(atlasUrl, item.name, item.start, item.end); },
      });
      const copyBtn = button("Copy URL", {
        variant: "ghost", size: "sm",
        onClick: () => copy(atlasUrl),
      });
      const meta = `${formatTime(item.start)} → ${formatTime(item.end)} · ${item.duration.toFixed(2)}s`;
      sfxList.appendChild(audioRow(item.name, meta, [playBtn, copyBtn]));
    }

    if (!visibleSfx.length) {
      sfxList.appendChild(emptyNote(items.length ? "No sound matches this filter." : "No sounds loaded yet."));
    }
    sfxInfo.textContent = items.length ? `${visibleSfx.length} of ${items.length} shown.` : "";
    sfxInfo.hidden = !items.length;
    btnCopyVisible.setEnabled(visibleSfx.length > 0);
    btnSfxClear.setEnabled(sfxFilter.value.trim().length > 0);
  }

  function updateSummary() {
    themeCount.textContent = String(catalog?.themes.length ?? 0);
    sfxCount.textContent = String(catalog?.sfx.items.length ?? 0);
    if (!nowPlayingLabel) nowPlaying.textContent = "Not playing.";
  }

  async function refreshAll(forceReload = false) {
    btnReload.setEnabled(false);
    overviewError.clear();
    try {
      catalog = await loadCatalog(forceReload);
      if (!catalog) {
        overviewError.show("The audio catalog did not load from mg-api.ariedam.fr.");
      }
      updateSummary();
      renderThemes();
      renderSfx();
    } finally {
      btnReload.setEnabled(true);
    }
  }

  btnStop.setEnabled(false);
  void refreshAll();
}
