// Crop thumbnails and selection tiles for the companion's popups.
//
// Two image sources, on purpose: the atlas already loaded for a plain crop,
// the mod's API for a crop carrying mutations, which stacks the layers on the
// server. Composing them here would mean rewriting a compositor that already
// exists, and guessing the layer order. No species or mutation name is
// hardcoded: everything comes from the garden and the catalogs.

import { plantCatalog } from "../../../data";
import { composedSpriteUrl, isComposableCategory } from "../../../platform/mgApi/sprites";
import { setImageSafe } from "../../../platform/discordCsp";
import { segmented, type SegmentedControl } from "../../../ui/kit/segmented";
import { attachSpriteIcon } from "../../../ui/kit/sprites/iconCache";
import { INTERNAL_TO_API } from "../../../ui/kit/sprites/resolver";
import { color } from "../../../ui/kit/theme";
import { iconSlot, spriteSpellings, styled } from "./dom";

const SPRITE_LOG_TAG = "companion-harvest";
const ICON_PX = 26;

/** The atlas key the catalog gives a species' crop, e.g. `sprite/plant/Aloe`. */
function catalogCropKey(species: string): string | null {
  const entry = (plantCatalog as Record<string, { crop?: { sprite?: unknown }; plant?: { sprite?: unknown } } | undefined>)[
    species
  ];
  const key = entry?.crop?.sprite ?? entry?.plant?.sprite;
  return typeof key === "string" && key ? key : null;
}

/**
 * A species' sprite name, stripped of everything that is not the name.
 *
 * Depending on the data source the catalog serves an atlas key
 * (`sprite/plant/Aloe`) or a full URL with a cache buster
 * (`.../plants/Aloe.png?v=1125`). The query must go BEFORE the extension, or
 * the string ends with `?v=1125` and the extension stays on the name: that is
 * what made the key `Aloe.png?v=1125`, which the API rejected with a 400.
 */
function spriteBaseName(species: string): string {
  const last = catalogCropKey(species)?.split("/").pop() ?? null;
  if (!last) return species;
  const withoutQuery = last.split(/[?#]/)[0];
  return withoutQuery.replace(/\.[a-z0-9]+$/i, "") || species;
}

/**
 * The crop's sprite, not the seed's.
 *
 * The name alone is not enough: guessing from the species often lands on the
 * seed, which has the same name in another atlas. So the crop name the
 * catalog gives comes first, and guessed spellings only when the catalog does
 * not know the species.
 */
function attachAtlasCrop(box: HTMLElement, species: string, sizePx: number): void {
  const candidates = spriteSpellings(spriteBaseName(species), species);
  const bases = candidates.map((value) => value.replace(/icon$/i, "")).filter(Boolean);
  const all = [...new Set([...candidates, ...bases.map((base) => `${base}Icon`)])];
  if (all.length) attachSpriteIcon(box, ["crop", "tallplant", "plant"], all, sizePx, SPRITE_LOG_TAG);
}

export function speciesIcon(species: string, sizePx = ICON_PX): HTMLElement {
  const box = iconSlot(sizePx);
  attachAtlasCrop(box, species, sizePx);
  return box;
}

/**
 * The composed render URL of a crop and its mutations.
 *
 * The segment before the name comes in two vocabularies: the mod's, singular
 * (`plant`), or the API's, plural (`plants`). Both are accepted, with plants
 * as the last resort: every crop lives there, `crop` being only an internal
 * search category.
 */
function composedUrl(species: string, mutations: string[]): string {
  const key = catalogCropKey(species);
  const parts = key ? key.split(/[?#]/)[0].split("/").filter(Boolean) : [];
  const segment = parts.length >= 2 ? parts[parts.length - 2] : "";
  const apiCategory = INTERNAL_TO_API[segment] ?? (isComposableCategory(segment) ? segment : "plants");
  return composedSpriteUrl(apiCategory, spriteBaseName(species), mutations);
}

/**
 * The crop as it looks with its mutations on.
 *
 * The composed render comes from the network and may fail: a name the API
 * does not know, offline, an endpoint in error. An `onerror` then falls back
 * on the plain atlas sprite: the right crop without its mutations beats an
 * empty box.
 */
export function variantIcon(species: string, mutations: string[], sizePx = ICON_PX): HTMLElement {
  if (mutations.length === 0) return speciesIcon(species, sizePx);

  const box = iconSlot(sizePx);
  const url = composedUrl(species, mutations);
  const img = styled("img", { maxWidth: "100%", maxHeight: "100%", imageRendering: "auto" });
  img.alt = "";
  img.addEventListener("error", () => {
    // A silent fallback looks like a composed render that stacked nothing:
    // the log says which of the two happened.
    console.warn("[companion] composed sprite failed, falling back to the plain crop:", url);
    box.replaceChildren();
    attachAtlasCrop(box, species, sizePx);
  });
  setImageSafe(img, url);
  box.append(img);
  return box;
}

/**
 * A mutation's interface badge.
 *
 * The `ui` atlas holds the round badges (`MutationGold`, `MutationWet`...) the
 * game shows in its own screens. The `mutation` category holds the overlays
 * put on the plant: superb in the game, unreadable at 26 px.
 */
export function mutationIconEl(mutation: string, sizePx = ICON_PX): HTMLElement {
  const box = iconSlot(sizePx);
  const candidates = spriteSpellings(mutation).flatMap((name) => [`Mutation${name}`, name]);
  attachSpriteIcon(box, ["ui", "mutation"], candidates, sizePx, SPRITE_LOG_TAG);
  return box;
}

/* ---------------------------------- tiles --------------------------------- */

/** A tile's look, selected or not, through its border and background. */
function tileLook(selected: boolean): Partial<CSSStyleDeclaration> {
  return {
    background: selected ? color.accentSoft : color.cardBg,
    border: `1px solid ${selected ? color.accentBorder : color.border}`,
  };
}

/** A hover highlight, kept off the selected tile. */
function hoverable(tile: HTMLElement, selected: boolean): void {
  if (selected) return;
  tile.addEventListener("mouseenter", () => (tile.style.background = color.hoverBg));
  tile.addEventListener("mouseleave", () => (tile.style.background = color.cardBg));
}

type TileOptions = {
  icon: HTMLElement;
  /** The full name, as a tooltip since it is not written. */
  title: string;
  /**
   * The count under the sprite. Left out, the tile only shows the icon.
   *
   * Harvesting needs it: the number says how many crops would go. A keep rule
   * describes what is wanted later, and counting what is already owned
   * answers none of its questions.
   */
  count?: number;
  selected: boolean;
  onClick: () => void;
};

/**
 * A selection tile: a sprite, its count, and nothing else.
 *
 * Selection shows through the border and background, never a text colour: on
 * an already coloured picture a label tint would not show.
 */
export function spriteTile(options: TileOptions): HTMLButtonElement {
  const tile = styled("button", {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1px",
    padding: "5px 6px 3px",
    borderRadius: "10px",
    cursor: "pointer",
    lineHeight: "1",
    transition: "background 120ms ease, border-color 120ms ease",
    ...tileLook(options.selected),
  });
  tile.type = "button";
  tile.title = options.title;

  tile.append(options.icon);
  if (options.count !== undefined) {
    tile.append(
      styled("span", { fontSize: "10px", color: options.selected ? color.accent : color.textDim }, String(options.count)),
    );
  }
  tile.addEventListener("click", options.onClick);
  hoverable(tile, options.selected);
  return tile;
}

/**
 * A thumbnail whose name is written next to the icon rather than in a tooltip.
 *
 * For lists that cannot be read by eye. A species is found by its sprite, but
 * an ability only has a coloured square: in a long list, finding it would mean
 * hovering the squares one by one.
 */
export function labelledTile(options: { icon: HTMLElement; label: string; selected: boolean; onClick: () => void }): HTMLButtonElement {
  const tile = styled("button", {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 9px 4px 5px",
    borderRadius: "10px",
    cursor: "pointer",
    lineHeight: "1",
    transition: "background 120ms ease, border-color 120ms ease",
    ...tileLook(options.selected),
  });
  tile.type = "button";
  tile.title = options.label;

  const name = styled(
    "span",
    {
      fontSize: "11.5px",
      fontWeight: options.selected ? "600" : "500",
      color: options.selected ? color.accent : color.text,
      whiteSpace: "nowrap",
    },
    options.label,
  );

  tile.append(options.icon, name);
  tile.addEventListener("click", options.onClick);
  hoverable(tile, options.selected);
  return tile;
}

/** The "all" tile, which has no sprite: a word is enough. */
export function allTile(label: string, selected: boolean, onClick: () => void): HTMLButtonElement {
  const tile = styled(
    "button",
    {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "40px",
      padding: "0 10px",
      alignSelf: "stretch",
      borderRadius: "10px",
      cursor: "pointer",
      fontSize: "11px",
      lineHeight: "1",
      color: selected ? color.accent : color.text,
      ...tileLook(selected),
    },
    label,
  );
  tile.type = "button";
  tile.addEventListener("click", onClick);
  return tile;
}

/** A wrapping row of tiles. */
export function tileRow(): HTMLElement {
  return styled("div", { display: "flex", flexWrap: "wrap", alignItems: "stretch", gap: "5px" });
}

type ChoiceOption<T extends string> = { value: T; label: string; title: string };

/**
 * A kit segmented control with a tooltip on each choice.
 *
 * Built once and kept: the kit control listens to window resizes, so building
 * a fresh one on every render would pile those listeners up. `onChange` only
 * fires for a real change, so callers can set the value from their render.
 */
export function choiceControl<T extends string>(
  options: Array<ChoiceOption<T>>,
  selected: T,
  onChange: (value: T) => void,
): SegmentedControl<T> {
  let current = selected;
  const control = segmented(
    options.map(({ value, label }) => ({ value, label })),
    selected,
    (value) => {
      if (value === current) return;
      current = value;
      onChange(value);
    },
  );
  // Dense, like the rest of the popup: compact padding and the small font.
  control.classList.add("qmm-compact");
  control.style.fontSize = "11px";
  control.style.setProperty("--seg-pad", "2px");
  control.querySelectorAll<HTMLButtonElement>(".qmm-seg__btn").forEach((btn, i) => {
    btn.title = options[i]?.title ?? "";
  });
  return control;
}
