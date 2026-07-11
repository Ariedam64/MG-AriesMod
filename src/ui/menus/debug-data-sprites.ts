import { Menu } from "../menu";
import { createTwoColumns } from "./debug-data-shared";
import { setImageSafe } from "../../utils/discordCsp";
import { MUT_G1, MUT_G2, MUT_G3, type MutationName } from "../../sprite/settings";
import {
  fetchSpriteCatalog,
  composedSpriteUrl,
  mgApiGetBinary,
  type SpriteCatalogResponse,
} from "../../mgApi";

const ANY_CATEGORY = "all";
const MAX_VISIBLE_SPRITES = 400;
const SPRITE_ICON_SIZE = 96;

type SpriteRecord = { category: string; name: string; url: string };

let catalogPromise: Promise<SpriteCatalogResponse | null> | null = null;

async function loadCatalog(force = false): Promise<SpriteCatalogResponse | null> {
  if (force) catalogPromise = null;
  if (!catalogPromise) catalogPromise = fetchSpriteCatalog();
  return catalogPromise;
}

function flattenCatalog(catalog: SpriteCatalogResponse, category: string): SpriteRecord[] {
  const cats = category === ANY_CATEGORY ? Object.keys(catalog.sprites) : [category];
  const out: SpriteRecord[] = [];
  for (const cat of cats) {
    const entries = catalog.sprites[cat] ?? [];
    for (const entry of entries) {
      out.push({ category: cat, name: entry.name, url: entry.url });
    }
  }
  return out;
}

const sanitizeFileComponent = (value: string): string =>
  value.replace(/[^a-z0-9_\-]+/gi, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "sprite";

const buildSpriteFilename = (record: SpriteRecord, mutations: MutationName[]): string => {
  const mutSegment = mutations.length ? `-${mutations.map(m => sanitizeFileComponent(m)).join("_")}` : "";
  return `${sanitizeFileComponent(record.category)}-${sanitizeFileComponent(record.name)}${mutSegment}.png`;
};

type ColorSelection = "None" | (typeof MUT_G1)[number];
type ConditionSelection = "None" | (typeof MUT_G2)[number];
type LightingSelection = "None" | (typeof MUT_G3)[number];

const COLOR_SELECTIONS: ColorSelection[] = ["None", ...MUT_G1];
const CONDITION_SELECTIONS: ConditionSelection[] = ["None", ...MUT_G2];
const LIGHTING_SELECTIONS: LightingSelection[] = ["None", ...MUT_G3];

type MutationFilterState = {
  color: ColorSelection;
  condition: ConditionSelection;
  lighting: LightingSelection;
};

type MutationGroupKey = "color" | "condition" | "lighting";

export function renderSpritesTab(view: HTMLElement, ui: Menu) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  const explorerCard = ui.card("Sprite Explorer", {
    tone: "muted",
    subtitle: "Browse the live sprite catalog from mg-api.ariedam.fr.",
  });
  leftCol.appendChild(explorerCard.root);

  const listCard = ui.card("Sprites", {
    tone: "muted",
    subtitle: "Preview sprites for the selected category.",
  });
  rightCol.appendChild(listCard.root);

  const categorySelect = ui.select({ width: "100%" });
  categorySelect.disabled = true;

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Search name";
  searchInput.className = "dd-sprite-search";

  const reloadBtn = ui.btn("Reload sprites", {
    size: "sm",
    variant: "ghost",
    onClick: () => {
      void updateList(true);
    },
  }) as HTMLButtonElement;
  const downloadBtnLabel = "Download visible sprites";
  const downloadBtn = ui.btn(downloadBtnLabel, {
    size: "sm",
    variant: "primary",
    onClick: () => {
      void downloadVisibleSprites();
    },
  }) as HTMLButtonElement;
  downloadBtn.disabled = true;

  const controlsGrid = document.createElement("div");
  controlsGrid.className = "dd-sprite-control-grid";
  controlsGrid.append(
    createSelectControl("Asset category", categorySelect),
    createSelectControl("Search", searchInput),
  );
  explorerCard.body.appendChild(controlsGrid);
  const actionRow = document.createElement("div");
  actionRow.className = "dd-sprite-actions";
  actionRow.append(reloadBtn, downloadBtn);
  explorerCard.body.appendChild(actionRow);

  const mutationFilters: MutationFilterState = { color: "None", condition: "None", lighting: "None" };
  const mutationGroupContainers: Record<MutationGroupKey, HTMLDivElement> = {
    color: document.createElement("div"),
    condition: document.createElement("div"),
    lighting: document.createElement("div"),
  };

  const mutationCard = ui.card("Mutations", {
    tone: "muted",
    subtitle: "Apply color or weather overlays via /assets/sprites/composed.",
  });
  leftCol.appendChild(mutationCard.root);
  const mutationBody = document.createElement("div");
  mutationBody.className = "dd-sprite-mutation-card";
  mutationCard.body.appendChild(mutationBody);
  mutationGroupContainers.color.className = "dd-sprite-mutation-group";
  mutationGroupContainers.condition.className = "dd-sprite-mutation-group";
  mutationGroupContainers.lighting.className = "dd-sprite-mutation-group";
  mutationBody.append(
    mutationGroupContainers.color,
    mutationGroupContainers.condition,
    mutationGroupContainers.lighting,
  );
  renderMutationControls();

  const stats = document.createElement("p");
  stats.className = "dd-sprite-stats";
  stats.textContent = "Loading sprite catalog…";
  explorerCard.body.appendChild(stats);

  const previewArea = document.createElement("div");
  previewArea.className = "dd-sprite-grid";
  const previewWrap = document.createElement("div");
  previewWrap.className = "dd-sprite-grid-wrap";
  previewWrap.appendChild(previewArea);
  listCard.body.appendChild(previewWrap);

  let selectedCategory = ANY_CATEGORY;
  let searchTerm = "";
  let searchDebounce: number | null = null;
  let visibleSpriteRecords: SpriteRecord[] = [];
  let downloadInProgress = false;

  const applyCategories = (categories: string[]) => {
    categorySelect.innerHTML = "";
    const allOption = document.createElement("option");
    allOption.value = ANY_CATEGORY;
    allOption.textContent = categories.length ? "All categories" : "No categories";
    categorySelect.appendChild(allOption);
    categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category;
      option.textContent = category;
      categorySelect.appendChild(option);
    });
    const valid = categories.includes(selectedCategory);
    selectedCategory = valid ? selectedCategory : ANY_CATEGORY;
    categorySelect.value = selectedCategory;
    categorySelect.disabled = !categories.length;
  };

  const renderEmptyState = (message: string) => {
    previewArea.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "dd-sprite-grid__empty";
    empty.textContent = message;
    previewArea.appendChild(empty);
  };

  const getActiveMutations = (): MutationName[] => {
    const active: MutationName[] = [];
    if (mutationFilters.color !== "None") active.push(mutationFilters.color);
    if (mutationFilters.condition !== "None") active.push(mutationFilters.condition);
    if (mutationFilters.lighting !== "None") active.push(mutationFilters.lighting);
    return active;
  };

  function renderMutationControls(): void {
    renderMutationGroup("color", COLOR_SELECTIONS, "Color", mutationGroupContainers.color);
    renderMutationGroup("condition", CONDITION_SELECTIONS, "Weather", mutationGroupContainers.condition);
    renderMutationGroup("lighting", LIGHTING_SELECTIONS, "Lighting", mutationGroupContainers.lighting);
  }

  function renderMutationGroup(
    key: MutationGroupKey,
    options: readonly ("None" | MutationName)[],
    label: string,
    container: HTMLElement,
  ): void {
    container.innerHTML = "";
    const heading = document.createElement("span");
    heading.className = "dd-sprite-mutation-group-title";
    heading.textContent = label;
    const row = document.createElement("div");
    row.className = "dd-sprite-mutation-buttons";
    options.forEach(option => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "dd-sprite-mutation-btn";
      btn.textContent = option === "None" ? "None" : option;
      if (mutationFilters[key] === option) btn.classList.add("active");
      btn.setAttribute("aria-pressed", mutationFilters[key] === option ? "true" : "false");
      btn.addEventListener("click", () => {
        if (mutationFilters[key] === option) return;
        mutationFilters[key] = option as any;
        renderMutationControls();
        if (visibleSpriteRecords.length) renderSpriteCards(visibleSpriteRecords);
      });
      row.appendChild(btn);
    });
    container.append(heading, row);
  }

  function previewUrlFor(record: SpriteRecord, mutations: MutationName[]): string {
    return mutations.length ? composedSpriteUrl(record.category, record.name, mutations) : record.url;
  }

  function renderSpriteCards(records: SpriteRecord[]): void {
    if (!records.length) {
      renderEmptyState("No sprites match the current filters.");
      return;
    }
    const activeMutations = getActiveMutations();
    previewArea.innerHTML = "";
    records.forEach(record => {
      const card = document.createElement("div");
      card.className = "dd-sprite-grid__item";
      card.title = `${record.category}/${record.name}`;

      const imgWrap = document.createElement("div");
      imgWrap.className = "dd-sprite-grid__img";
      imgWrap.style.setProperty("--sprite-size", `${SPRITE_ICON_SIZE}px`);

      const iconSlot = document.createElement("span");
      iconSlot.className = "dd-sprite-grid__icon";
      const img = document.createElement("img");
      img.alt = record.name;
      img.decoding = "async";
      img.loading = "lazy";
      img.addEventListener("error", () => {
        if (img.dataset.fallbackApplied) return;
        img.dataset.fallbackApplied = "1";
        setImageSafe(img, record.url);
      });
      iconSlot.appendChild(img);
      setImageSafe(img, previewUrlFor(record, activeMutations));
      imgWrap.appendChild(iconSlot);

      const nameEl = document.createElement("span");
      nameEl.className = "dd-sprite-grid__name";
      nameEl.textContent = record.name;

      const meta = document.createElement("span");
      meta.className = "dd-sprite-grid__meta";
      meta.textContent = `${record.category}/${record.name}`;

      card.append(imgWrap, nameEl, meta);
      const triggerDownload = () => {
        if (downloadInProgress) return;
        void downloadSpriteRecord(record, getActiveMutations());
      };
      card.addEventListener("click", triggerDownload);
      card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          triggerDownload();
        }
      });
      card.tabIndex = 0;
      previewArea.appendChild(card);
    });
  }

  const updateList = async (forceReload = false) => {
    stats.textContent = "Loading sprite catalog…";
    const catalog = await loadCatalog(forceReload);
    if (!catalog) {
      renderEmptyState("Failed to load the sprite catalog from mg-api.ariedam.fr.");
      stats.textContent = "Catalog load failed. Try Reload.";
      return;
    }

    applyCategories(catalog.categories);

    const records = flattenCatalog(catalog, selectedCategory);
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filtered = !normalizedSearch
      ? records
      : records.filter(r => r.name.toLowerCase().includes(normalizedSearch));

    const limited = filtered.slice(0, MAX_VISIBLE_SPRITES);
    visibleSpriteRecords = limited;
    if (!downloadInProgress) downloadBtn.textContent = downloadBtnLabel;
    downloadBtn.disabled = !limited.length || downloadInProgress;
    if (!limited.length) {
      renderEmptyState("No sprites match the current filters.");
    } else {
      renderSpriteCards(limited);
    }

    const clipped = filtered.length > MAX_VISIBLE_SPRITES;
    const categoryLabel = selectedCategory === ANY_CATEGORY ? "all categories" : `category "${selectedCategory}"`;
    stats.textContent = clipped
      ? `Showing ${limited.length}/${filtered.length} sprites for ${categoryLabel}.`
      : `${filtered.length} sprites for ${categoryLabel}.`;
  };

  categorySelect.addEventListener("change", () => {
    selectedCategory = categorySelect.value || ANY_CATEGORY;
    void updateList();
  });

  searchInput.addEventListener("input", () => {
    if (searchDebounce !== null) clearTimeout(searchDebounce);
    searchDebounce = window.setTimeout(() => {
      searchDebounce = null;
      searchTerm = searchInput.value || "";
      void updateList();
    }, 150);
  });

  void updateList();

  async function downloadSpriteRecord(record: SpriteRecord, mutations: MutationName[]): Promise<void> {
    const bytes = await mgApiGetBinary(previewUrlFor(record, mutations));
    if (!bytes) return;
    triggerBlobDownload(new Blob([bytes], { type: "image/png" }), buildSpriteFilename(record, mutations));
  }

  async function downloadVisibleSprites(): Promise<void> {
    if (!visibleSpriteRecords.length || downloadInProgress) return;
    downloadInProgress = true;
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Preparing zip...";
    try {
      const activeMutations = getActiveMutations();
      const files: { name: string; dataUrl: string }[] = [];
      for (const record of visibleSpriteRecords) {
        const bytes = await mgApiGetBinary(previewUrlFor(record, activeMutations));
        if (!bytes) continue;
        files.push({ name: buildSpriteFilename(record, activeMutations), dataUrl: arrayBufferToDataUrl(bytes, "image/png") });
        downloadBtn.textContent = `Collected ${files.length}/${visibleSpriteRecords.length}`;
      }
      if (!files.length) return;
      downloadBtn.textContent = "Bundling zip...";
      const zipBlob = await packFilesToZip(files);
      triggerBlobDownload(zipBlob, `sprites-${Date.now()}.zip`);
    } finally {
      downloadInProgress = false;
      downloadBtn.textContent = downloadBtnLabel;
      downloadBtn.disabled = !visibleSpriteRecords.length;
    }
  }
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${mime};base64,${btoa(binary)}`;
}

async function packFilesToZip(files: { name: string; dataUrl: string }[]): Promise<Blob> {
  const chunks: Uint8Array[] = [];
  const fileEntries: { nameBytes: Uint8Array; data: Uint8Array; crc: number; offset: number }[] = [];
  let offset = 0;
  for (const file of files) {
    const { bytes: data, crc32: crc } = dataUrlToBytesAndCrc(file.dataUrl);
    const nameBytes = new TextEncoder().encode(file.name);
    const localHeader = buildZipLocalHeader(nameBytes, data.length, crc);
    fileEntries.push({ nameBytes, data, crc, offset });
    chunks.push(localHeader, data);
    offset += localHeader.length + data.length;
  }

  const centralRecords: Uint8Array[] = [];
  fileEntries.forEach(entry => {
    centralRecords.push(buildZipCentralDirectory(entry.nameBytes, entry.data.length, entry.crc, entry.offset));
  });
  const centralDirectory = concatUint8Arrays(centralRecords);
  const endRecord = buildZipEndRecord(fileEntries.length, centralDirectory.length, offset);
  return new Blob([...chunks, centralDirectory, endRecord].map(chunk => chunk.slice()), {
    type: "application/zip",
  });
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_FLAGS = 0;
const ZIP_METHOD_STORE = 0;

function buildZipLocalHeader(nameBytes: Uint8Array, size: number, crc32: number): Uint8Array {
  const buffer = new ArrayBuffer(30 + nameBytes.length);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint32(offset, LOCAL_HEADER_SIGNATURE, true);
  offset += 4;
  view.setUint16(offset, ZIP_VERSION, true);
  offset += 2;
  view.setUint16(offset, ZIP_FLAGS, true);
  offset += 2;
  view.setUint16(offset, ZIP_METHOD_STORE, true);
  offset += 2;
  view.setUint16(offset, 0, true); // mod time
  offset += 2;
  view.setUint16(offset, 0, true); // mod date
  offset += 2;
  view.setUint32(offset, crc32 >>> 0, true);
  offset += 4;
  view.setUint32(offset, size, true);
  offset += 4;
  view.setUint32(offset, size, true);
  offset += 4;
  view.setUint16(offset, nameBytes.length, true);
  offset += 2;
  view.setUint16(offset, 0, true); // extra length
  const out = new Uint8Array(buffer);
  out.set(nameBytes, offset);
  return out;
}

function buildZipCentralDirectory(nameBytes: Uint8Array, size: number, crc32: number, offset: number): Uint8Array {
  const buffer = new ArrayBuffer(46 + nameBytes.length);
  const view = new DataView(buffer);
  let pos = 0;
  view.setUint32(pos, CENTRAL_DIR_SIGNATURE, true);
  pos += 4;
  view.setUint16(pos, ZIP_VERSION, true);
  pos += 2;
  view.setUint16(pos, ZIP_VERSION, true);
  pos += 2;
  view.setUint16(pos, ZIP_FLAGS, true);
  pos += 2;
  view.setUint16(pos, ZIP_METHOD_STORE, true);
  pos += 2;
  view.setUint16(pos, 0, true);
  pos += 2;
  view.setUint16(pos, 0, true);
  pos += 2;
  view.setUint32(pos, crc32 >>> 0, true);
  pos += 4;
  view.setUint32(pos, size, true);
  pos += 4;
  view.setUint32(pos, size, true);
  pos += 4;
  view.setUint16(pos, nameBytes.length, true);
  pos += 2;
  view.setUint16(pos, 0, true); // extra
  pos += 2;
  view.setUint16(pos, 0, true); // comment
  pos += 2;
  view.setUint16(pos, 0, true); // disk number
  pos += 2;
  view.setUint16(pos, 0, true); // internal attrs
  pos += 2;
  view.setUint32(pos, 0, true); // external attrs
  pos += 4;
  view.setUint32(pos, offset, true);
  pos += 4;
  const out = new Uint8Array(buffer);
  out.set(nameBytes, pos);
  return out;
}

function buildZipEndRecord(fileCount: number, centralSize: number, centralOffset: number): Uint8Array {
  const buffer = new ArrayBuffer(22);
  const view = new DataView(buffer);
  let pos = 0;
  view.setUint32(pos, END_SIGNATURE, true);
  pos += 4;
  view.setUint16(pos, 0, true); // disk number
  pos += 2;
  view.setUint16(pos, 0, true); // disk with central dir
  pos += 2;
  view.setUint16(pos, fileCount, true);
  pos += 2;
  view.setUint16(pos, fileCount, true);
  pos += 2;
  view.setUint32(pos, centralSize, true);
  pos += 4;
  view.setUint32(pos, centralOffset, true);
  pos += 4;
  view.setUint16(pos, 0, true); // comment length
  return new Uint8Array(buffer);
}

function concatUint8Arrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  arrays.forEach(arr => {
    result.set(arr, offset);
    offset += arr.length;
  });
  return result;
}

function dataUrlToBytesAndCrc(dataUrl: string): { bytes: Uint8Array; crc32: number } {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return { bytes, crc32: crc32(bytes) };
}

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ bytes[i]) & 0xff];
  }
  return ~crc >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function createSelectControl(labelText: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "dd-sprite-control";
  const label = document.createElement("span");
  label.className = "dd-sprite-control__label";
  label.textContent = labelText;
  wrapper.append(label, control);
  return wrapper;
}
