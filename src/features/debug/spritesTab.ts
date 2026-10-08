import { button } from "../../ui/kit/button";
import { card } from "../../ui/kit/card";
import { select } from "../../ui/kit/fields";
import { createTwoColumns } from "./shared";
import { packFilesToZip, triggerBlobDownload } from "./zip";
import { setImageSafe } from "../../platform/discordCsp";
import { MUT_G1, MUT_G2, MUT_G3, type MutationName } from "../../game/sprites/settings";
import {
  fetchSpriteCatalog,
  composedSpriteUrl,
  mgApiGetBinary,
  type SpriteCatalogResponse,
} from "../../platform/mgApi";

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

export function renderSpritesTab(view: HTMLElement) {
  view.innerHTML = "";
  view.classList.add("dd-debug-view");

  const { leftCol, rightCol } = createTwoColumns(view);

  const explorerCard = card("Sprite Explorer", {
    tone: "muted",
    subtitle: "Browse the live sprite catalog from mg-api.ariedam.fr.",
  });
  leftCol.appendChild(explorerCard.root);

  const listCard = card("Sprites", {
    tone: "muted",
    subtitle: "Preview sprites for the selected category.",
  });
  rightCol.appendChild(listCard.root);

  const categorySelect = select({ width: "100%" });
  categorySelect.disabled = true;

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "Search name";
  searchInput.className = "dd-sprite-search";

  const reloadBtn = button("Reload sprites", {
    size: "sm",
    variant: "ghost",
    onClick: () => {
      void updateList(true);
    },
  }) as HTMLButtonElement;
  const downloadBtnLabel = "Download visible sprites";
  const downloadBtn = button(downloadBtnLabel, {
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

  const mutationCard = card("Mutations", {
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
      const files: Array<{ name: string; bytes: Uint8Array }> = [];
      for (const record of visibleSpriteRecords) {
        const bytes = await mgApiGetBinary(previewUrlFor(record, activeMutations));
        if (!bytes) continue;
        files.push({ name: buildSpriteFilename(record, activeMutations), bytes: new Uint8Array(bytes) });
        downloadBtn.textContent = `Collected ${files.length}/${visibleSpriteRecords.length}`;
      }
      if (!files.length) return;
      downloadBtn.textContent = "Bundling zip...";
      const zipBlob = packFilesToZip(files);
      triggerBlobDownload(zipBlob, `sprites-${Date.now()}.zip`);
    } finally {
      downloadInProgress = false;
      downloadBtn.textContent = downloadBtnLabel;
      downloadBtn.disabled = !visibleSpriteRecords.length;
    }
  }
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
