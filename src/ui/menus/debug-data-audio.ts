import { Menu } from "../menu";
import { copy, createTwoColumns, safeRegex } from "./debug-data-shared";
import { getAudioUrlSafe } from "../../utils/discordCsp";
import { fetchAudioCatalog, type AudioCatalogResponse, type AudioSfxItem } from "../../mgApi";

let catalogPromise: Promise<AudioCatalogResponse | null> | null = null;

async function loadCatalog(force = false): Promise<AudioCatalogResponse | null> {
  if (force) catalogPromise = null;
  if (!catalogPromise) catalogPromise = fetchAudioCatalog();
  return catalogPromise;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function renderAudioPlayerTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  let catalog: AudioCatalogResponse | null = null;
  let visibleSfx: AudioSfxItem[] = [];

  // Shared player: only one clip (theme or sfx) plays at a time.
  const audioEl = document.createElement("audio");
  audioEl.preload = "none";
  view.appendChild(audioEl);
  let stopAtHandler: (() => void) | null = null;
  let nowPlayingLabel = "";

  const overviewCard = ui.card("🎧 Audio catalog", {
    tone: "muted",
    subtitle: "Browse themes and SFX from mg-api.ariedam.fr /assets/audios.",
  });
  leftCol.appendChild(overviewCard.root);

  const summary = document.createElement("div");
  summary.className = "dd-audio-summary";
  const summaryThemes = document.createElement("div");
  const summarySfx = document.createElement("div");
  summary.append(summaryThemes, summarySfx);

  const nowPlaying = document.createElement("div");
  nowPlaying.className = "dd-audio-volume";

  const overviewError = ui.errorBar();

  const actionsRow = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const btnReload = ui.btn("Reload catalog", {
    icon: "🔄",
    variant: "primary",
    onClick: () => { void refreshAll(true); },
  }) as HTMLButtonElement;
  const btnStop = ui.btn("Stop playback", {
    icon: "⏹️",
    onClick: () => stopPlayback(),
  }) as HTMLButtonElement;
  actionsRow.append(btnReload, btnStop);

  overviewCard.body.append(summary, nowPlaying, overviewError.el, actionsRow);

  const themesCard = ui.card("🎵 Themes", {
    tone: "muted",
    subtitle: "Per-area music and ambience tracks.",
  });
  leftCol.appendChild(themesCard.root);
  const themeList = document.createElement("div");
  themeList.className = "dd-audio-list";
  const themeEmpty = document.createElement("div");
  themeEmpty.className = "dd-audio-empty";
  themeEmpty.textContent = "No themes loaded yet.";
  themesCard.body.append(themeList, themeEmpty);

  const sfxCard = ui.card("🔉 SFX", {
    tone: "muted",
    subtitle: "Sliced from the single SFX atlas file.",
  });
  rightCol.appendChild(sfxCard.root);

  const sfxToolbar = ui.flexRow({ gap: 10, wrap: true, fullWidth: true });
  const sfxFilter = ui.inputText("filter sfx (regex)", "");
  sfxFilter.classList.add("dd-grow");
  const btnSfxClear = ui.btn("Clear", {
    icon: "🧹",
    onClick: () => {
      sfxFilter.value = "";
      renderSfx();
      sfxFilter.focus();
    },
  }) as HTMLButtonElement;
  const btnCopyVisible = ui.btn("Copy visible names", {
    icon: "📋",
    onClick: () => {
      if (!visibleSfx.length) return;
      copy(visibleSfx.map(s => s.name).join("\n"));
    },
  }) as HTMLButtonElement;
  sfxToolbar.append(sfxFilter, btnSfxClear, btnCopyVisible);

  const sfxInfo = document.createElement("p");
  sfxInfo.className = "dd-card-description";
  sfxInfo.style.margin = "0";

  const sfxList = document.createElement("div");
  sfxList.className = "dd-audio-list";

  const sfxEmpty = document.createElement("div");
  sfxEmpty.className = "dd-audio-empty";
  sfxEmpty.textContent = "No SFX match the current filter.";

  sfxCard.body.append(sfxToolbar, sfxInfo, sfxList, sfxEmpty);

  sfxFilter.addEventListener("input", () => renderSfx());
  sfxFilter.addEventListener("keydown", ev => {
    if (ev.key === "Enter") {
      ev.preventDefault();
      renderSfx();
    }
  });

  function setButtonEnabled(btn: HTMLButtonElement, enabled: boolean) {
    const setter = (btn as any).setEnabled;
    if (typeof setter === "function") setter(enabled);
    else btn.disabled = !enabled;
  }

  function stopPlayback() {
    if (stopAtHandler) {
      audioEl.removeEventListener("timeupdate", stopAtHandler);
      stopAtHandler = null;
    }
    audioEl.pause();
    nowPlayingLabel = "";
    nowPlaying.textContent = "Not playing.";
  }

  async function playClip(url: string, label: string, start?: number, end?: number) {
    stopPlayback();
    nowPlayingLabel = label;
    nowPlaying.textContent = `Loading: ${label}…`;
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
      nowPlaying.textContent = `Playing: ${label}`;
    } catch {
      nowPlaying.textContent = `Failed to play: ${label}`;
    }
  }

  function renderThemes() {
    themeList.innerHTML = "";
    const themes = catalog?.themes ?? [];
    themes.forEach(theme => {
      const row = document.createElement("div");
      row.className = "dd-audio-row";

      const infoWrap = document.createElement("div");
      infoWrap.className = "dd-audio-row__info";
      const title = document.createElement("div");
      title.className = "dd-audio-row__title";
      title.textContent = theme.name;
      const urlEl = document.createElement("div");
      urlEl.className = "dd-audio-url";
      urlEl.textContent = [theme.music && "music", theme.ambience && "ambience"].filter(Boolean).join(" · ") || "(no tracks)";
      infoWrap.append(title, urlEl);
      row.appendChild(infoWrap);

      const actions = ui.flexRow({ gap: 6, wrap: true, align: "center" });
      actions.className = "dd-audio-actions";
      if (theme.music) {
        actions.appendChild(ui.btn("Play music", {
          icon: "▶️", size: "sm",
          onClick: () => { void playClip(theme.music!, `${theme.name} · music`); },
        }) as HTMLButtonElement);
      }
      if (theme.ambience) {
        actions.appendChild(ui.btn("Play ambience", {
          icon: "▶️", size: "sm",
          onClick: () => { void playClip(theme.ambience!, `${theme.name} · ambience`); },
        }) as HTMLButtonElement);
      }
      actions.appendChild(ui.btn("Copy URLs", {
        icon: "📋", size: "sm",
        onClick: () => copy([theme.music, theme.ambience].filter(Boolean).join("\n")),
      }) as HTMLButtonElement);
      row.appendChild(actions);

      themeList.appendChild(row);
    });
    themeList.style.display = themes.length ? "" : "none";
    themeEmpty.style.display = themes.length ? "none" : "block";
    themeEmpty.textContent = catalog ? "No themes in the catalog." : "No themes loaded yet.";
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

      const row = document.createElement("div");
      row.className = "dd-audio-row";

      const infoWrap = document.createElement("div");
      infoWrap.className = "dd-audio-row__info";
      const title = document.createElement("div");
      title.className = "dd-audio-row__title";
      title.textContent = item.name;
      const meta = document.createElement("div");
      meta.className = "dd-audio-meta";
      meta.textContent = `${formatTime(item.start)} → ${formatTime(item.end)} (${item.duration.toFixed(2)}s)`;
      infoWrap.append(title, meta);
      row.appendChild(infoWrap);

      const actions = ui.flexRow({ gap: 6, wrap: false, align: "center" });
      actions.className = "dd-audio-actions";
      const playBtn = ui.btn("Play", {
        icon: "▶️", size: "sm",
        onClick: () => { void playClip(atlasUrl, item.name, item.start, item.end); },
      }) as HTMLButtonElement;
      const copyBtn = ui.btn("Copy URL", {
        icon: "📋", size: "sm",
        onClick: () => copy(atlasUrl),
      }) as HTMLButtonElement;
      actions.append(playBtn, copyBtn);
      row.appendChild(actions);

      sfxList.appendChild(row);
    }

    sfxInfo.textContent = items.length
      ? `${visibleSfx.length} / ${items.length} SFX shown.`
      : "No SFX loaded yet.";
    sfxList.style.display = visibleSfx.length ? "" : "none";
    sfxEmpty.style.display = visibleSfx.length ? "none" : "block";
    setButtonEnabled(btnCopyVisible, visibleSfx.length > 0);
    setButtonEnabled(btnSfxClear, sfxFilter.value.trim().length > 0);
  }

  function updateSummary() {
    summaryThemes.innerHTML = `<strong>${catalog?.themes.length ?? 0}</strong> themes`;
    summarySfx.innerHTML = `<strong>${catalog?.sfx.items.length ?? 0}</strong> SFX`;
    if (!nowPlayingLabel) nowPlaying.textContent = "Not playing.";
  }

  async function refreshAll(forceReload = false) {
    setButtonEnabled(btnReload, false);
    overviewError.clear();
    try {
      catalog = await loadCatalog(forceReload);
      if (!catalog) {
        overviewError.show("Failed to load the audio catalog from mg-api.ariedam.fr.");
      }
      updateSummary();
      renderThemes();
      renderSfx();
    } finally {
      setButtonEnabled(btnReload, true);
    }
  }

  void refreshAll();
}
