import { button } from "../../ui/kit/button";
import { card, sectionLabel } from "../../ui/kit/card";
import { h } from "../../ui/kit/dom";
import { select, textInput } from "../../ui/kit/fields";
import { toggleChip } from "../../ui/kit/toggles";
import { bar, barEnd, emptyNote, grow, hint, setBtnLabel, tabRoot } from "./shared";
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
  const root = tabRoot(view);

  const reloadBtn = button("Reload", {
    size: "sm",
    variant: "ghost",
    onClick: () => {
      void updateList(true);
    },
  });
  const filtersCard = card("Sprites", {
    subtitle: "The live catalog from mg-api.ariedam.fr. Click a sprite to download it.",
    actions: [reloadBtn],
  });
  root.appendChild(filtersCard.root);

  const categorySelect = select();
  categorySelect.disabled = true;

  const searchInput = textInput("Name", "");
  searchInput.type = "search";

  const downloadBtnLabel = "Download all shown";
  const downloadBtn = button(downloadBtnLabel, {
    size: "sm",
    variant: "primary",
    onClick: () => {
      void downloadVisibleSprites();
    },
  });
  downloadBtn.disabled = true;

  const fields = h("div", "dd-fields");
  fields.append(field("Category", categorySelect), field("Search", searchInput));

  const mutationFilters: MutationFilterState = { color: "None", condition: "None", lighting: "None" };
  const mutations = h("div", "dd-stack");
  mutations.append(
    mutationGroup("color", COLOR_SELECTIONS, "Colour"),
    mutationGroup("condition", CONDITION_SELECTIONS, "Weather"),
    mutationGroup("lighting", LIGHTING_SELECTIONS, "Lighting"),
  );

  const stats = hint("Loading sprite catalog…");
  stats.classList.add("dd-grow");
  filtersCard.body.append(fields, mutations, bar(stats, barEnd(downloadBtn)));

  const previewArea = h("div", "dd-sprite-grid");
  const previewWrap = h("div", "dd-sprites qmm-scroll");
  previewWrap.appendChild(previewArea);
  root.appendChild(previewWrap);

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
    previewArea.replaceChildren(emptyNote(message));
  };

  const getActiveMutations = (): MutationName[] => {
    const active: MutationName[] = [];
    if (mutationFilters.color !== "None") active.push(mutationFilters.color);
    if (mutationFilters.condition !== "None") active.push(mutationFilters.condition);
    if (mutationFilters.lighting !== "None") active.push(mutationFilters.lighting);
    return active;
  };

  /** One mutation slot: a caption and a pill per option, only one on at a time. */
  function mutationGroup(
    key: MutationGroupKey,
    options: readonly ("None" | MutationName)[],
    label: string,
  ): HTMLElement {
    const row = h("div", "dd-mutation");
    const chips = h("div", "dd-mutation__chips");
    options.forEach(option => {
      const chip = toggleChip(option, {
        type: "radio",
        name: `dd-sprite-mutation-${key}`,
        value: option,
        checked: mutationFilters[key] === option,
      });
      chip.input.addEventListener("change", () => {
        if (!chip.input.checked || mutationFilters[key] === option) return;
        mutationFilters[key] = option as any;
        if (visibleSpriteRecords.length) renderSpriteCards(visibleSpriteRecords);
      });
      chips.appendChild(chip.root);
    });
    row.append(sectionLabel(label), chips);
    return row;
  }

  function previewUrlFor(record: SpriteRecord, mutations: MutationName[]): string {
    return mutations.length ? composedSpriteUrl(record.category, record.name, mutations) : record.url;
  }

  function renderSpriteCards(records: SpriteRecord[]): void {
    if (!records.length) {
      renderEmptyState("No sprite matches these filters.");
      return;
    }
    const activeMutations = getActiveMutations();
    previewArea.innerHTML = "";
    records.forEach(record => {
      const tile = h("div", "dd-sprite");
      tile.title = `${record.category}/${record.name}\nClick to download`;

      const imgWrap = h("div", "dd-sprite__img");
      imgWrap.style.setProperty("--sprite-size", `${SPRITE_ICON_SIZE}px`);

      const iconSlot = h("span", "dd-sprite__icon");
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

      tile.append(
        imgWrap,
        h("span", "dd-sprite__name", record.name),
        h("span", "dd-sprite__meta", record.category),
      );
      const triggerDownload = () => {
        if (downloadInProgress) return;
        void downloadSpriteRecord(record, getActiveMutations());
      };
      tile.addEventListener("click", triggerDownload);
      tile.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          triggerDownload();
        }
      });
      tile.tabIndex = 0;
      previewArea.appendChild(tile);
    });
  }

  const updateList = async (forceReload = false) => {
    stats.textContent = "Loading sprite catalog…";
    const catalog = await loadCatalog(forceReload);
    if (!catalog) {
      renderEmptyState("The sprite catalog did not load from mg-api.ariedam.fr. Try Reload.");
      stats.textContent = "Catalog load failed.";
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
    if (!downloadInProgress) setBtnLabel(downloadBtn, downloadBtnLabel);
    downloadBtn.disabled = !limited.length || downloadInProgress;
    if (!limited.length) {
      renderEmptyState("No sprite matches these filters.");
    } else {
      renderSpriteCards(limited);
    }

    const clipped = filtered.length > MAX_VISIBLE_SPRITES;
    const categoryLabel = selectedCategory === ANY_CATEGORY ? "all categories" : `"${selectedCategory}"`;
    stats.textContent = clipped
      ? `Showing ${limited.length} of ${filtered.length} sprites in ${categoryLabel}.`
      : `${filtered.length} sprites in ${categoryLabel}.`;
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
    setBtnLabel(downloadBtn, "Preparing zip...");
    try {
      const activeMutations = getActiveMutations();
      const files: Array<{ name: string; bytes: Uint8Array }> = [];
      for (const record of visibleSpriteRecords) {
        const bytes = await mgApiGetBinary(previewUrlFor(record, activeMutations));
        if (!bytes) continue;
        files.push({ name: buildSpriteFilename(record, activeMutations), bytes: new Uint8Array(bytes) });
        setBtnLabel(downloadBtn, `Collected ${files.length}/${visibleSpriteRecords.length}`);
      }
      if (!files.length) return;
      setBtnLabel(downloadBtn, "Bundling zip...");
      const zipBlob = packFilesToZip(files);
      triggerBlobDownload(zipBlob, `sprites-${Date.now()}.zip`);
    } finally {
      downloadInProgress = false;
      setBtnLabel(downloadBtn, downloadBtnLabel);
      downloadBtn.disabled = !visibleSpriteRecords.length;
    }
  }
}

/** A caption above a control. */
function field(labelText: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = h("label", "dd-field");
  wrapper.append(sectionLabel(labelText), control);
  return wrapper;
}
