import { Menu } from "../menu";
import { detectEnvironment, EnvironmentInfo } from "../../utils/api";
import { getLocalVersion } from "../../utils/version";
import { gameVersion } from "../../utils/gameVersion";
import {
  AriesBackup,
  deleteBackup,
  exportAllSettings,
  importSettings,
  listBackups,
  loadBackup,
  saveBackup,
  SettingsImportResult,
} from "../../services/settings";
import { pageWindow } from "../../utils/page-context";

declare const GM_download: ((options: { name?: string; url: string; saveAs?: boolean }) => void) | undefined;
declare const GM_openInTab: ((url: string, options?: { active?: boolean; insert?: boolean; setParent?: boolean }) => void) | undefined;

function createActionButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.borderRadius = "6px";
  button.style.border = "1px solid rgba(255,255,255,0.2)";
  button.style.background = "rgba(255,255,255,0.04)";
  button.style.color = "inherit";
  button.style.fontWeight = "600";
  button.style.fontSize = "13px";
  button.style.padding = "6px 12px";
  button.style.cursor = "pointer";
  button.addEventListener("mouseenter", () => (button.style.background = "rgba(255,255,255,0.08)"));
  button.addEventListener("mouseleave", () => (button.style.background = "rgba(255,255,255,0.04)"));
  return button;
}

function createStatusLine(): HTMLDivElement {
  const line = document.createElement("div");
  line.style.fontSize = "13px";
  line.style.minHeight = "18px";
  line.style.opacity = "0.9";
  return line;
}

function showStatus(line: HTMLElement, result: SettingsImportResult): void {
  line.textContent = result.message;
  line.style.color = result.success ? "#8bf1b5" : "#ff9c9c";
}

function formatBackupDate(value: number): string {
  return new Date(value).toLocaleDateString();
}

function copyTextToClipboard(text: string): void {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const CHUNK_SIZE = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

function downloadJSONFile(filename: string, payload: string): void {
  if (typeof GM_download === "function") {
    try {
      // Base64 data URI: some download managers save percent-encoded URIs
      // without decoding them, producing files full of "%7B%0A...".
      const url = `data:application/json;base64,${toBase64Utf8(payload)}`;
      GM_download({ name: filename, url, saveAs: true });
      return;
    } catch {
      // ignore and fallback
    }
  }

  const win = pageWindow || window;
  const safePayload = JSON.stringify(payload);
  const safeFilename = JSON.stringify(filename);
  const script = `(function(){try{const data=${safePayload};const name=${safeFilename};const blob=new Blob([data],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;a.style.display="none";const parent=document.body||document.documentElement||document;parent.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}catch(e){console.error("[settings] download:",e)}})();`;
  try {
    win.eval(script);
    return;
  } catch {
    // ignore and fallback
  }

  try {
    const doc = (win.document || document) as Document;
    const root: ParentNode | null =
      (doc.body as ParentNode | null) ||
      (doc.documentElement as ParentNode | null) ||
      (document.body as ParentNode | null);
    const blob = new Blob([payload], { type: "application/json" });
    const url = (win.URL || URL).createObjectURL(blob);
    const a = doc.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    if (root) {
      root.appendChild(a);
    }
    a.click();
    if (root) {
      root.removeChild(a);
    }
    (win.URL || URL).revokeObjectURL(url);
  } catch {
    copyTextToClipboard(payload);
  }
}

function exportBackupData(entry: AriesBackup): void {
  const json = JSON.stringify(entry.data, null, 2);
  const filename = `${entry.name || "aries-backup"}-${entry.id}.json`;
  downloadJSONFile(filename, json);
}

function createBackupRow(entry: AriesBackup, statusLine: HTMLElement, listHolder: HTMLElement): HTMLElement {
  const container = document.createElement("div");
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.gap = "6px";
  container.style.padding = "10px";
  container.style.borderRadius = "8px";
  container.style.border = "1px solid rgba(255,255,255,0.08)";
  container.style.background = "rgba(255,255,255,0.01)";

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "baseline";
  header.style.flexWrap = "wrap";
  header.style.gap = "8px";

  const title = document.createElement("div");
  title.textContent = entry.name;
  title.style.fontWeight = "600";
  title.style.fontSize = "13px";

  const date = document.createElement("div");
  date.innerHTML = `<strong>Created:</strong> ${formatBackupDate(entry.timestamp)}`;
  date.style.fontSize = "11px";
  date.style.opacity = "0.65";

  header.append(title, date);

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "6px";
  actions.style.flexWrap = "wrap";

  const loadButton = createActionButton("Load");
  loadButton.addEventListener("click", () => {
    const result = loadBackup(entry.id);
    showStatus(statusLine, result);
  });
  const deleteButton = createActionButton("Delete");
  deleteButton.addEventListener("click", () => {
    const result = deleteBackup(entry.id);
    showStatus(statusLine, result);
    refreshBackupList(statusLine, listHolder);
  });
  const exportButton = createActionButton("Export");
  exportButton.addEventListener("click", () => {
    exportBackupData(entry);
    showStatus(statusLine, { success: true, message: "Backup exported." });
  });

  actions.append(loadButton, deleteButton);
  actions.append(exportButton);

  container.append(header, actions);
  return container;
}

function refreshBackupList(statusLine: HTMLElement, listHolder: HTMLElement): void {
  const backups = listBackups();
  listHolder.innerHTML = "";
  if (!backups.length) {
    const empty = document.createElement("div");
    empty.textContent = "No backups saved yet.";
    empty.style.opacity = "0.6";
    listHolder.appendChild(empty);
    return;
  }
  backups.forEach((entry) => {
    const row = createBackupRow(entry, statusLine, listHolder);
    listHolder.appendChild(row);
  });
}

function renderDataTab(view: HTMLElement, ui: Menu): void {
  view.innerHTML = "";

  const layout = document.createElement("div");
  layout.style.display = "flex";
  layout.style.flexDirection = "column";
  layout.style.gap = "12px";

  const ioCard = ui.card("Import / Export", {
    description: "Import or export the mod settings directly through JSON files.",
  });
  const card = ui.card("Backup", {
    description: "Save our settings directly inside the mod storage for easy restores.",
  });

  ioCard.body.style.display = "flex";
  ioCard.body.style.flexDirection = "column";
  ioCard.body.style.gap = "10px";

  card.body.style.display = "flex";
  card.body.style.flexDirection = "column";
  card.body.style.gap = "10px";

  const ioStatus = createStatusLine();

  const exportButton = createActionButton("Export Settings");
  exportButton.style.width = "100%";
  exportButton.style.boxSizing = "border-box";
  exportButton.addEventListener("click", () => {
    const payload = exportAllSettings();
    const filename = `aries-settings-${Date.now()}.json`;
    downloadJSONFile(filename, payload);
    showStatus(ioStatus, { success: true, message: "Settings exported as JSON file." });
  });

  const importWrapper = document.createElement("div");
  importWrapper.style.display = "flex";
  importWrapper.style.flexDirection = "column";
  importWrapper.style.gap = "8px";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json,application/json,text/plain";
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
  fileCard.setAttribute("aria-label", "Import settings JSON");

  const fileCardTitle = document.createElement("div");
  fileCardTitle.textContent = "Import settings";
  Object.assign(fileCardTitle.style, {
    fontWeight: "600",
    fontSize: "14px",
    letterSpacing: "0.02em",
  });

  const fileStatus = document.createElement("div");
  const defaultStatusText = "Drop a JSON file or click to browse.";
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

  const triggerFileSelect = () => fileInput.click();

  fileCard.addEventListener("mouseenter", () => setFileCardActive(true));
  fileCard.addEventListener("mouseleave", () => setFileCardActive(document.activeElement === fileCard));
  fileCard.addEventListener("focus", () => setFileCardActive(true));
  fileCard.addEventListener("blur", () => setFileCardActive(false));

  fileCard.addEventListener("click", triggerFileSelect);
  fileCard.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      triggerFileSelect();
    }
  });

  fileCard.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    setFileCardActive(true);
    if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
  });
  fileCard.addEventListener("dragleave", () => setFileCardActive(document.activeElement === fileCard));

  const displaySelection = (files: FileList | null | undefined) => {
    if (!files || !files.length) {
      fileStatus.textContent = defaultStatusText;
      return;
    }
    fileStatus.textContent = files.length === 1 ? files[0].name : `${files.length} files selected`;
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    try {
      const text = await file.text();
      const result = importSettings(text);
      showStatus(ioStatus, result);
    } catch (error) {
      showStatus(ioStatus, {
        success: false,
        message: `Failed to read file (${error instanceof Error ? error.message : "unknown error"}).`,
      });
    } finally {
      fileInput.value = "";
    }
  };

  fileCard.addEventListener("drop", async (ev) => {
    ev.preventDefault();
    const files = ev.dataTransfer?.files || null;
    displaySelection(files);
    await handleFiles(files);
    displaySelection(null);
    setFileCardActive(document.activeElement === fileCard);
  });

  fileInput.onchange = async () => {
    const files = fileInput.files;
    displaySelection(files);
    await handleFiles(files);
    displaySelection(null);
    setFileCardActive(document.activeElement === fileCard);
  };

  importWrapper.append(fileInput, fileCard);
  ioCard.body.append(importWrapper, ioStatus, exportButton);
  layout.appendChild(ioCard.root);

  const controlRow = document.createElement("div");
  controlRow.style.display = "flex";
  controlRow.style.gap = "8px";
  controlRow.style.alignItems = "center";

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Backup name";
  nameInput.style.flex = "1";
  nameInput.style.borderRadius = "6px";
  nameInput.style.border = "1px solid rgba(255,255,255,0.08)";
  nameInput.style.background = "rgba(255,255,255,0.02)";
  nameInput.style.color = "inherit";
  nameInput.style.padding = "8px 10px";
  nameInput.style.fontSize = "13px";

  const saveButton = createActionButton("Save");
  const controlStatus = createStatusLine();

  const backupListHolder = document.createElement("div");
  backupListHolder.style.display = "flex";
  backupListHolder.style.flexDirection = "column";
  backupListHolder.style.gap = "10px";

  saveButton.addEventListener("click", () => {
    const result = saveBackup(nameInput.value);
    showStatus(controlStatus, result);
    if (result.success) {
      nameInput.value = "";
      refreshBackupList(controlStatus, backupListHolder);
    }
  });

  controlRow.append(nameInput, saveButton);
  card.body.append(controlRow, controlStatus, backupListHolder);
  layout.appendChild(card.root);

  view.appendChild(layout);

  refreshBackupList(controlStatus, backupListHolder);
}


function describeSurface(env: EnvironmentInfo | null): string {
  if (!env) return "n/a";
  return env.surface === "discord" ? "Discord" : "Web";
}

function describePlatform(env: EnvironmentInfo | null, nav: Navigator | null): string {
  if (!env) return "n/a";
  if (env.platform === "desktop") {
    return "Desktop";
  }
  if (env.platform === "mobile") {
    const ua = nav?.userAgent ?? "";
    if (/tablet|ipad|playbook|silk|kindle/i.test(ua)) {
      return "Mobile (Tablet)";
    }
    if (/mobile|iphone|ipod|android/i.test(ua)) {
      return "Mobile (Phone)";
    }
    return "Mobile";
  }
  return env.platform;
}

function detectOsLabel(nav: Navigator | null): string {
  const platform = nav?.platform ?? "";
  const userAgent = nav?.userAgent ?? "";
  const target = `${platform} ${userAgent}`.toLowerCase();
  if (!target.trim()) {
    return "n/a";
  }
  if (/windows/.test(target)) return "Windows";
  if (/mac os|macintosh|darwin/.test(target)) return "macOS";
  if (/android/.test(target) && !/windows/.test(target)) return "Android";
  if (/iphone|ipad|ipod/.test(target)) return "iOS";
  if (/linux/.test(target) && !/android/.test(target)) return "Linux";
  if (/cros/.test(target)) return "Chrome OS";
  if (/freebsd/.test(target)) return "FreeBSD";
  if (/sunos|solaris/.test(target)) return "Solaris";
  return nav?.platform || nav?.userAgent || "Unknown";
}

function renderInfosTab(view: HTMLElement, _ui: Menu): void {
  view.innerHTML = "";

  const safeWindow = typeof window !== "undefined" ? window : null;
  const safeNavigator = typeof navigator !== "undefined" ? navigator : null;
  const safeLocation = typeof location !== "undefined" ? location : null;

  const environment = safeWindow ? detectEnvironment() : null;
  const resolvedGameVersion = gameVersion ?? "unknown";
  const resolvedModVersion = getLocalVersion() ?? "unknown";

  // ── Header ───────────────────────────────────────────────────────────────
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.flexDirection = "column";
  header.style.alignItems = "center";
  header.style.gap = "6px";
  header.style.padding = "18px 0 14px";
  header.style.textAlign = "center";

  const headerTitle = document.createElement("div");
  headerTitle.textContent = "Arie's Mod";
  headerTitle.style.fontSize = "18px";
  headerTitle.style.fontWeight = "700";
  headerTitle.style.color = "#e7eef7";
  headerTitle.style.letterSpacing = "-0.3px";

  const versionBadge = document.createElement("div");
  versionBadge.textContent = `v${resolvedModVersion}`;
  versionBadge.style.display = "inline-block";
  versionBadge.style.padding = "2px 10px";
  versionBadge.style.borderRadius = "999px";
  versionBadge.style.background = "rgba(94,234,212,0.12)";
  versionBadge.style.border = "1px solid rgba(94,234,212,0.25)";
  versionBadge.style.color = "#5eead4";
  versionBadge.style.fontSize = "11px";
  versionBadge.style.fontWeight = "600";
  versionBadge.style.letterSpacing = "0.3px";

  const headerSub = document.createElement("div");
  headerSub.textContent = "Browser userscript for MagicGarden";
  headerSub.style.fontSize = "11px";
  headerSub.style.color = "rgba(231,238,247,0.45)";
  headerSub.style.marginTop = "2px";

  header.append(headerTitle, versionBadge, headerSub);
  view.appendChild(header);

  // ── Separator ─────────────────────────────────────────────────────────────
  const sep = document.createElement("div");
  sep.style.height = "1px";
  sep.style.background = "rgba(255,255,255,0.07)";
  sep.style.margin = "0 0 12px";
  view.appendChild(sep);

  // ── Runtime grid ──────────────────────────────────────────────────────────
  const runtimeRows: [string, string][] = [
    ["Game version", resolvedGameVersion],
    ["Host", environment?.host ?? safeLocation?.hostname ?? "n/a"],
    ["Surface", describeSurface(environment)],
    ["Platform", describePlatform(environment, safeNavigator)],
    ["OS", detectOsLabel(safeNavigator)],
  ];

  const grid = document.createElement("div");
  grid.style.display = "flex";
  grid.style.flexDirection = "column";
  grid.style.borderRadius = "10px";
  grid.style.border = "1px solid rgba(255,255,255,0.07)";
  grid.style.overflow = "hidden";
  grid.style.marginBottom = "14px";

  runtimeRows.forEach(([label, value], i) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.padding = "8px 12px";
    row.style.background = i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent";

    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    labelEl.style.fontSize = "12px";
    labelEl.style.color = "rgba(231,238,247,0.5)";

    const valueEl = document.createElement("span");
    valueEl.textContent = value;
    valueEl.style.fontSize = "12px";
    valueEl.style.fontWeight = "600";
    valueEl.style.color = "#e7eef7";

    row.append(labelEl, valueEl);
    grid.appendChild(row);
  });

  view.appendChild(grid);

  // ── Support ───────────────────────────────────────────────────────────────
  const supportBlock = document.createElement("div");
  supportBlock.style.display = "flex";
  supportBlock.style.flexDirection = "column";
  supportBlock.style.alignItems = "center";
  supportBlock.style.gap = "10px";
  supportBlock.style.padding = "16px 12px";
  supportBlock.style.borderRadius = "10px";
  supportBlock.style.border = "1px solid rgba(255,255,255,0.07)";
  supportBlock.style.background = "rgba(255,255,255,0.02)";

  const supportText = document.createElement("div");
  supportText.style.fontSize = "12px";
  supportText.style.lineHeight = "1.5";
  supportText.style.color = "rgba(231,238,247,0.55)";
  supportText.style.textAlign = "center";
  supportText.textContent = "Some features rely on paid server hosting. If you enjoy the mod, a coffee is always appreciated!";

  const kofiUrl = "https://ko-fi.com/E1E11TWTM1";
  const isDiscord = environment?.surface === "discord";

  const kofiButton = document.createElement("a");
  kofiButton.href = kofiUrl;
  kofiButton.target = "_blank";
  kofiButton.rel = "noopener noreferrer";
  kofiButton.title = "Buy Me a Coffee at ko-fi.com";
  kofiButton.style.transition = "opacity 0.15s ease, transform 0.15s ease";

  if (isDiscord) {
    kofiButton.textContent = "☕ Support on Ko-fi";
    kofiButton.style.display = "inline-flex";
    kofiButton.style.alignItems = "center";
    kofiButton.style.padding = "8px 20px";
    kofiButton.style.borderRadius = "8px";
    kofiButton.style.background = "rgba(94,234,212,0.1)";
    kofiButton.style.border = "1px solid rgba(94,234,212,0.28)";
    kofiButton.style.color = "#5eead4";
    kofiButton.style.fontSize = "13px";
    kofiButton.style.fontWeight = "600";
    kofiButton.style.textDecoration = "none";
    kofiButton.style.cursor = "pointer";
  } else {
    kofiButton.style.display = "inline-block";
    kofiButton.style.border = "0";
    const kofiImg = document.createElement("img");
    kofiImg.src = "https://storage.ko-fi.com/cdn/kofi5.png?v=6";
    kofiImg.alt = "Buy Me a Coffee at ko-fi.com";
    kofiImg.height = 36;
    kofiImg.style.height = "36px";
    kofiImg.style.border = "0";
    kofiImg.style.display = "block";
    kofiButton.appendChild(kofiImg);
  }

  kofiButton.addEventListener("click", (event) => {
    if (isDiscord && typeof GM_openInTab === "function") {
      event.preventDefault();
      GM_openInTab(kofiUrl, { active: true });
    }
  });
  kofiButton.addEventListener("mouseenter", () => {
    kofiButton.style.opacity = "0.82";
    kofiButton.style.transform = "translateY(-2px)";
  });
  kofiButton.addEventListener("mouseleave", () => {
    kofiButton.style.opacity = "1";
    kofiButton.style.transform = "translateY(0)";
  });

  supportBlock.append(supportText, kofiButton);
  view.appendChild(supportBlock);
}

export function renderSettingsMenu(container: HTMLElement) {
  const ui = new Menu({ id: "settings", compact: true });
  ui.mount(container);
  ui.addTabs([
    { id: "settings-data", title: "Settings", render: (root) => renderDataTab(root, ui) },
    { id: "settings-infos", title: "Infos", render: (root) => renderInfosTab(root, ui) },
  ]);
  ui.switchTo("settings-data");
}
