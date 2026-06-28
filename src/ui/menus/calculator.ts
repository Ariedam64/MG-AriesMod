// src/ui/menus/calculator.ts
import { addStyle } from "../../core/dom";
import { coin, plantCatalog, petAbilities, petCatalog } from "../../data";
import { DefaultPricing, estimateProduceValue } from "../../utils/calculators";
import { getPetMaxStrength, getPetStrength } from "../../utils/petCalcul";
import {
  getLockerSeedEmojiForKey,
  getLockerSeedEmojiForSeedName,
  getLockerSeedOptions,
  type LockerSeedOption,
} from "./locker";
import { Menu } from "../menu";
import { attachSpriteIcon, getSpriteObjectUrlByName } from "../spriteIconCache";

const ROOT_CLASS = "mg-crop-simulation";
const SIZE_MIN = 50;
const SIZE_MAX = 100;
const SCALE_MIN = 1;
const SCALE_MAX = 3;

const COLOR_MUTATION_LABELS = ["None", "Gold", "Rainbow"] as const;
const WEATHER_CONDITION_LABELS = ["None", "Wet", "Chilled", "Frozen", "Thunderstruck", "Thundercharged"] as const;
const WEATHER_LIGHTING_LABELS = ["None", "Dawnlit", "Dawnbound", "Amberlit", "Amberbound"] as const;
const FRIEND_BONUS_LABELS = ["+0%", "+10%", "+20%", "+30%", "+40%", "+50%"] as const;
const FRIEND_BONUS_MIN_PLAYERS = 1;
const FRIEND_BONUS_MAX_PLAYERS = FRIEND_BONUS_LABELS.length;

const COLOR_SEGMENT_METADATA: Record<string, Record<string, string>> = {
  None: { mgColor: "none" },
  Gold: { mgColor: "gold" },
  Rainbow: { mgColor: "rainbow" },
};

const WEATHER_CONDITION_SEGMENT_METADATA: Record<string, Record<string, string>> = {
  None: { mgWeather: "none" },
  Wet: { mgWeather: "wet" },
  Chilled: { mgWeather: "chilled" },
  Frozen: { mgWeather: "frozen" },
  Thunderstruck: { mgWeather: "thunderstruck" },
  Thundercharged: { mgWeather: "thundercharged" },
};

const WEATHER_LIGHTING_SEGMENT_METADATA: Record<string, Record<string, string>> = {
  None: { mgLighting: "none" },
  Dawnlit: { mgLighting: "dawnlit" },
  Dawnbound: { mgLighting: "dawnbound" },
  Amberlit: { mgLighting: "amberlit" },
  Amberbound: { mgLighting: "amberbound" },
};

const MUTATION_SPRITE_OVERRIDES: Record<string, string> = {
  dawnlit: "Dawnlit",
  dawnbound: "Dawncharged",
  amberlit: "Ambershine",
  amberbound: "Ambercharged",
  thunderstruck: "Thunderstruck",
  thundercharged: "Thundercharged",
};

type ColorLabel = (typeof COLOR_MUTATION_LABELS)[number];
type WeatherConditionLabel = (typeof WEATHER_CONDITION_LABELS)[number];
type WeatherLightingLabel = (typeof WEATHER_LIGHTING_LABELS)[number];

type CalculatorState = {
  sizePercent: number;
  color: ColorLabel;
  weatherCondition: WeatherConditionLabel;
  weatherLighting: WeatherLightingLabel;
  friendPlayers: number;
};

type CalculatorRefs = {
  root: HTMLDivElement;
  sprite: HTMLSpanElement;
  sizeSlider: HTMLInputElement;
  sizeValue: HTMLSpanElement;
  sizeWeight: HTMLSpanElement;
  colorMutations: HTMLDivElement;
  weatherConditions: HTMLDivElement;
  weatherLighting: HTMLDivElement;
  friendBonus: HTMLDivElement;
  priceValue: HTMLSpanElement;
};

const segmentedUi = new Menu({ compact: true });
const ensureMenuStyles = (segmentedUi as unknown as { ensureStyles?: () => void }).ensureStyles;
ensureMenuStyles?.call(segmentedUi);

const priceFormatter = new Intl.NumberFormat("en-US");
const weightFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

const DEFAULT_STATE: CalculatorState = {
  sizePercent: SIZE_MIN,
  color: "None",
  weatherCondition: "None",
  weatherLighting: "None",
  friendPlayers: FRIEND_BONUS_MIN_PLAYERS,
};


type CropSimulationSpriteOptions = {
  fallback?: string | null;
  candidates?: string[];
  mutations?: string[];
  categories?: string[];
};

const BASE_SPRITE_SIZE_PX = 96;
const DEFAULT_SPRITE_CATEGORIES = ["tallplant", "plant", "crop"] as const;
const PLANT_PRIORITY_IDENTIFIERS = new Set([
  "dawncelestial",
  "mooncelestial",
  "dawnbinder",
  "moonbinder",
  "dawnbinderbulb",
  "moonbinderbulb",
  "dawnbinderpod",
  "moonbinderpod",
]);

const CROP_SIMULATION_CSS = `
.${ROOT_CLASS} {
  display: none;
  width: min(100%, 500px);
  padding: 12px 14px;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  position: relative;
  z-index: 2000;
  pointer-events: auto;
}
.${ROOT_CLASS} .mg-crop-simulation__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.${ROOT_CLASS} .mg-crop-simulation__title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #f8fafc;
}
.${ROOT_CLASS} .mg-crop-simulation__crop-name {
  font-size: 13px;
  font-weight: 600;
  color: #5eead4;
  text-transform: capitalize;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-section {
  display: flex;
  flex-direction: column;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-box {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: ${BASE_SPRITE_SIZE_PX}px;
  height: ${BASE_SPRITE_SIZE_PX}px;
  position: relative;
  flex-shrink: 0;
  --mg-crop-simulation-scale: 1;
  transform-origin: center;
  transform: scale(var(--mg-crop-simulation-scale));
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer,
.${ROOT_CLASS} .mg-crop-simulation__sprite-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  image-rendering: pixelated;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer--base {
  z-index: 1;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer--overlay {
  z-index: 2;
  transform: translateY(-4px);
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-layer--overlay-lighting {
  transform: translateY(-30px);
}
.${ROOT_CLASS} .mg-crop-simulation__sprite-fallback {
  z-index: 0;
  font-size: 42px;
}
.${ROOT_CLASS} .mg-crop-simulation__sprite[data-mg-has-sprite="1"] .mg-crop-simulation__sprite-fallback {
  opacity: 0;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-container {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-label {
  font-size: 12px;
  color: rgba(226, 232, 240, 0.82);
  flex: 0 0 auto;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-value {
  margin-left: auto;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: #f8fafc;
  text-align: right;
  width: 4ch;
  min-width: 4ch;
  flex: 0 0 4ch;
  white-space: nowrap;
}
.${ROOT_CLASS} .mg-crop-simulation__slider-weight {
  font-size: 11px;
  color: rgba(148, 163, 184, 0.82);
  font-variant-numeric: tabular-nums;
  text-align: center;
  white-space: nowrap;
}
.${ROOT_CLASS} .mg-crop-simulation__slider {
  flex: 1 1 auto;
  min-width: 0;
  accent-color: #5eead4;
}
.${ROOT_CLASS} .mg-crop-simulation__price {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 14px;
  color: #ffd84d;
  align-self: flex-start;
  margin-top: auto;
}
.${ROOT_CLASS} .mg-crop-simulation__price-icon {
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  display: inline-block;
  user-select: none;
  pointer-events: none;
}
.${ROOT_CLASS} .mg-crop-simulation__price-value {
  line-height: 1;
}
.${ROOT_CLASS} .mg-crop-simulation__section-title {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
}
.${ROOT_CLASS}.mg-crop-simulation--calculator {
  align-items: center;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__layout {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  width: min(440px, 100%);
  margin: 0 auto;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__section {
  display: grid;
  gap: 10px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  box-shadow: none;
  justify-items: stretch;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__section-heading {
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(226, 232, 240, 0.82);
  font-weight: 600;
  text-align: center;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__section--preview {
  justify-items: center;
  text-align: center;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__section--preview .mg-crop-simulation__slider-row {
  width: 100%;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__mutations-weather {
  display: grid;
  gap: 8px;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-calculator__mutations-heading {
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.82);
  text-align: center;
}
.${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-simulation__price {
  margin-top: 0;
}
.${ROOT_CLASS} .mg-crop-simulation__segmented {
  display: flex;
  width: 100%;
}
.${ROOT_CLASS} .mg-crop-simulation__segmented-control {
  --qmm-bg-soft: rgba(11, 15, 19, 0.8);
  --qmm-border-2: rgba(148, 163, 184, 0.28);
  --qmm-text: #e2e8f0;
  --qmm-text-dim: rgba(148, 163, 184, 0.82);
  --seg-pad: 6px;
  --seg-fill: rgba(56, 191, 248, 0.02);
  --seg-stroke-color: rgba(255, 255, 255, 0.49);
  flex: 1 1 auto;
  min-width: 0;
  width: 100%;
}
.${ROOT_CLASS} .mg-crop-simulation__segmented-control .qmm-seg__btn {
  font-size: 11px;
  letter-spacing: 0.02em;
  font-weight: 600;
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  min-width: 0;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="none"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="none"].active {
  color: rgba(148, 163, 184, 0.92);
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="gold"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="gold"].active {
  color: #facc15;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="gold"] .qmm-seg__btn-label,
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="gold"].active .qmm-seg__btn-label {
  color: transparent;
  background-image: linear-gradient(90deg, #fef08a, #facc15, #fef08a);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="rainbow"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="rainbow"].active {
  color: #fbbf24;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="rainbow"] .qmm-seg__btn-label,
.${ROOT_CLASS} .qmm-seg__btn[data-mg-color="rainbow"].active .qmm-seg__btn-label {
  color: transparent;
  background-image: linear-gradient(90deg, #f87171, #fbbf24, #34d399, #5eead4, #c084fc);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-size: 100% 100%;
  background-repeat: no-repeat;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="none"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="none"].active,
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="none"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="none"].active {
  color: rgba(148, 163, 184, 0.92);
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="wet"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="wet"].active {
  color: #5AF6F5;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="chilled"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="chilled"].active {
  color: #AFE0F6;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="frozen"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="frozen"].active {
  color: #AABEFF;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="thunderstruck"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-weather="thunderstruck"].active {
  color: rgb(16, 141, 163);
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="dawnlit"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="dawnlit"].active {
  color: #7864B4;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="dawnbound"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="dawnbound"].active {
  color: #9785CB;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="amberlit"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="amberlit"].active {
  color: #A04632;
  font-weight: 700;
}
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="amberbound"],
.${ROOT_CLASS} .qmm-seg__btn[data-mg-lighting="amberbound"].active {
  color: #F06E50;
  font-weight: 700;
}
.${ROOT_CLASS} .mg-crop-simulation__mutations-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
`;

let cropSimulationStyleEl: HTMLStyleElement | null = null;

function ensureCropSimulationStyles(): void {
  if (cropSimulationStyleEl) return;
  cropSimulationStyleEl = addStyle(CROP_SIMULATION_CSS);
}

function extractSpriteNameFromUrl(urlOrPath: string): string | null {
  const str = String(urlOrPath || "").trim();
  if (!str) return null;
  // Extract filename from URL or path
  const filename = str.split("/").pop() || "";
  // Strip file extension and query params (e.g. "CloverFourLeaf.png?v=163" → "CloverFourLeaf")
  return filename.replace(/\.[a-z0-9]+(\?.*)?$/i, "") || null;
}

function buildSpriteCandidates(primary: string, option?: LockerSeedOption | null): string[] {
  const candidates = new Set<string>();
  const addCandidate = (value?: string | null) => {
    if (!value) return;
    const trimmed = String(value).trim();
    if (!trimmed) return;
    candidates.add(trimmed);
    candidates.add(trimmed.replace(/\W+/g, ""));
  };
  // Sprite name from API data is the most accurate candidate — add it first
  if (option?.spriteKey) {
    const spriteName = extractSpriteNameFromUrl(option.spriteKey);
    if (spriteName) addCandidate(spriteName);
  }
  addCandidate(primary);
  if (option) {
    addCandidate(option.cropName);
    addCandidate(option.seedName);
  }
  const baseCandidates = Array.from(candidates)
    .map(value => value.replace(/icon$/i, ""))
    .filter(Boolean);
  const expanded = Array.from(
    new Set([
      ...baseCandidates.map(value => `${value}Icon`),
      ...Array.from(candidates),
    ]),
  ).filter(Boolean);
  return expanded.length ? expanded : [primary];
}

function getSpriteCategoriesForKey(key?: string | null, ...alts: Array<string | null | undefined>): string[] {
  const candidates = [key, ...alts];
  for (const candidate of candidates) {
    const normalized = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
    if (normalized && PLANT_PRIORITY_IDENTIFIERS.has(normalized)) {
      return ["plant", "tallplant", "crop"];
    }
  }
  return [...DEFAULT_SPRITE_CATEGORIES];
}

type CropSpriteLayers = {
  fallback: HTMLSpanElement;
  layer: HTMLSpanElement;
};

function ensureCropSpriteLayers(el: HTMLSpanElement): CropSpriteLayers {
  let fallback = el.querySelector<HTMLSpanElement>(".mg-crop-simulation__sprite-fallback");
  if (!fallback) {
    fallback = document.createElement("span");
    fallback.className = "mg-crop-simulation__sprite-fallback";
    el.appendChild(fallback);
  }
  let layer = el.querySelector<HTMLSpanElement>(".mg-crop-simulation__sprite-layer--base");
  if (!layer) {
    layer = document.createElement("span");
    layer.className = "mg-crop-simulation__sprite-layer mg-crop-simulation__sprite-layer--base";
    el.appendChild(layer);
  }
  return { fallback, layer };
}

function syncCropSpriteLoadedState(el: HTMLSpanElement, layer: HTMLElement): void {
  if (layer.childElementCount > 0) {
    el.dataset.mgHasSprite = "1";
  } else {
    delete el.dataset.mgHasSprite;
  }
}

function resetCropSimulationSprite(el: HTMLSpanElement): void {
  el.innerHTML = "";
  delete el.dataset.mgHasSprite;
}

function createSeedSpriteIcon(option: LockerSeedOption, fallback: string, size: number, logTag: string): HTMLSpanElement {
  const wrap = applyStyles(document.createElement("span"), {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  wrap.textContent = fallback && fallback.trim().length > 0 ? fallback : "??";
  const candidates = buildSpriteCandidates(option.key, option);
  const categories = getSpriteCategoriesForKey(option?.key, option?.seedName, option?.cropName);
  attachSpriteIcon(wrap, categories, candidates, size, logTag);
  return wrap;
}

function applyCropSimulationSprite(
  el: HTMLSpanElement,
  speciesKey: string | null,
  options: CropSimulationSpriteOptions = {},
): void {
  const { fallback, layer } = ensureCropSpriteLayers(el);
  const fallbackText =
    typeof options.fallback === "string" && options.fallback.trim().length > 0
      ? options.fallback
      : "??";
  fallback.textContent = fallbackText;

  if (!speciesKey) {
    layer.replaceChildren();
    syncCropSpriteLoadedState(el, layer);
    return;
  }

  const candidates =
    options.candidates && options.candidates.length
      ? options.candidates
      : buildSpriteCandidates(speciesKey);
  const mutations =
    Array.isArray(options.mutations) && options.mutations.length
      ? options.mutations
      : undefined;
  const categories =
    options.categories && options.categories.length
      ? options.categories
      : getSpriteCategoriesForKey(speciesKey);

  const updateLoadedState = () => syncCropSpriteLoadedState(el, layer);
  updateLoadedState();

  attachSpriteIcon(
    layer,
    categories,
    candidates,
    BASE_SPRITE_SIZE_PX,
    "calculator",
    {
      mutations,
      onSpriteApplied: updateLoadedState,
    },
  );
}

const applyStyles = <T extends HTMLElement>(el: T, styles: Record<string, string>): T => {
   const toKebab = (s: string) => s.startsWith("--")
     ? s
     : s.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
  for (const [key, value] of Object.entries(styles)) {
     el.style.setProperty(toKebab(key), value);
   }
   return el;
};

let calculatorStyleEl: HTMLStyleElement | null = null;

function ensureCalculatorStyles(): void {
  ensureCropSimulationStyles();
  if (calculatorStyleEl) return;
  calculatorStyleEl = addStyle(`
    .${ROOT_CLASS}.mg-crop-simulation--calculator {
      width: 100%;
      max-width: none;
      min-width: 0;
      position: relative;
    }
    .${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-simulation__price {
      justify-content: center;
      margin: 0 0 12px;
      font-size: 20px;
      gap: 10px;
    }
    .${ROOT_CLASS}.mg-crop-simulation--calculator .mg-crop-simulation__price-value {
      font-size: 20px;
    }
    .mg-crop-calculator__placeholder {
      font-size: 13px;
      text-align: center;
      opacity: 0.7;
      padding: 24px 12px;
    }
    .mg-crop-calculator__source-hint {
      font-size: 11px;
      color: rgba(226, 232, 240, 0.7);
      text-align: center;
      margin-top: 20px;
      padding-bottom: 4px;
    }
    .mg-crop-calculator__source-hint a {
      color: #5eead4;
      text-decoration: underline;
    }
  `);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function coerceLabel<T extends string>(label: string, allowed: readonly T[]): T {
  const normalized = typeof label === "string" ? label.trim().toLowerCase() : "";
  for (const candidate of allowed) {
    if (candidate.toLowerCase() === normalized) {
      return candidate;
    }
  }
  return allowed[0];
}

function clampFriendPlayers(players: number | null | undefined): number {
  if (typeof players !== "number" || !Number.isFinite(players)) {
    return FRIEND_BONUS_MIN_PLAYERS;
  }
  const rounded = Math.round(players);
  return clamp(rounded, FRIEND_BONUS_MIN_PLAYERS, FRIEND_BONUS_MAX_PLAYERS);
}

function friendPlayersToLabel(players: number | null | undefined): string {
  const clamped = clampFriendPlayers(players);
  return FRIEND_BONUS_LABELS[clamped - 1] ?? FRIEND_BONUS_LABELS[0];
}

function labelToFriendPlayers(label: string): number {
  const coerced = coerceLabel(label, FRIEND_BONUS_LABELS) as (typeof FRIEND_BONUS_LABELS)[number];
  const index = FRIEND_BONUS_LABELS.indexOf(coerced);
  const players = index >= 0 ? index + 1 : FRIEND_BONUS_MIN_PLAYERS;
  return clamp(players, FRIEND_BONUS_MIN_PLAYERS, FRIEND_BONUS_MAX_PLAYERS);
}

function setSpriteScale(el: HTMLSpanElement, sizePercent: number): void {
  const clamped = clamp(Math.round(sizePercent), SIZE_MIN, SIZE_MAX);
  const scale = clamped / 100;
  el.style.setProperty("--mg-crop-simulation-scale", scale.toString());
}

function applySizePercent(
  refs: CalculatorRefs,
  sizePercent: number,
  maxScale: number | null,
  baseWeight: number | null,
): void {
  const clamped = clamp(Math.round(sizePercent), SIZE_MIN, SIZE_MAX);
  refs.sizeSlider.value = String(clamped);
  refs.sizeValue.textContent = `${clamped}%`;
  setSpriteScale(refs.sprite, clamped);
  if (typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > SCALE_MIN) {
    refs.sizeSlider.dataset.maxScale = String(maxScale);
  } else {
    delete refs.sizeSlider.dataset.maxScale;
  }

  const [minWeight, maxWeight] = computeWeightRange(baseWeight, clamped, maxScale);
  refs.sizeWeight.textContent = formatWeightRange(minWeight, maxWeight);
}

function formatCoinValue(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const safe = Math.max(0, Math.round(value));
  return priceFormatter.format(safe);
}

function formatCoinRange(min: number | null, max: number | null): string {
  const minValue = typeof min === "number" && Number.isFinite(min) ? Math.max(0, min) : null;
  const maxValue = typeof max === "number" && Number.isFinite(max) ? Math.max(0, max) : null;
  if (minValue == null && maxValue == null) return "—";
  if (minValue == null) return formatCoinValue(maxValue);
  if (maxValue == null) return formatCoinValue(minValue);
  if (Math.round(minValue) === Math.round(maxValue)) {
    return formatCoinValue(minValue);
  }
  return `${formatCoinValue(minValue)} – ${formatCoinValue(maxValue)}`;
}

function computeWeightRange(
  baseWeight: number | null,
  sizePercent: number,
  maxScale: number | null,
): [number | null, number | null] {
  const numericWeight = typeof baseWeight === "number" ? baseWeight : Number(baseWeight);
  if (!Number.isFinite(numericWeight) || numericWeight == null || numericWeight <= 0) {
    return [null, null];
  }
  const scale = sizePercentToScale(sizePercent, maxScale);
  if (!Number.isFinite(scale) || scale <= 0) {
    return [null, null];
  }
  const minWeight = numericWeight * scale;
  const safeMax =
    typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > SCALE_MIN
      ? maxScale
      : SCALE_MIN;
  const variation = 1 + Math.max(0, (safeMax - scale) * 0.02);
  const maxWeight = minWeight * variation;
  return [minWeight, maxWeight];
}

function formatWeight(value: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const formatted = weightFormatter.format(value);
  return formatted.replace(/(\.\d*?[1-9])0+$/u, "$1").replace(/\.0+$/u, "");
}

function formatWeightRange(min: number | null, max: number | null): string {
  const minFormatted = formatWeight(min);
  const maxFormatted = formatWeight(max);
  if (!minFormatted && !maxFormatted) return "—";
  if (!maxFormatted || minFormatted === maxFormatted) {
    return `${minFormatted ?? maxFormatted} kg`;
  }
  return `${minFormatted ?? "—"} – ${maxFormatted} kg`;
}

function sizePercentToScale(sizePercent: number, maxScale: number | null): number {
  const numeric = Number(sizePercent);
  if (!Number.isFinite(numeric)) return SCALE_MIN;
  const clampedPercent = clamp(numeric, SIZE_MIN, SIZE_MAX);
  const safeMax =
    typeof maxScale === "number" && Number.isFinite(maxScale) && maxScale > SCALE_MIN
      ? maxScale
      : SCALE_MAX;
  if (safeMax <= SCALE_MIN) return SCALE_MIN;
  const normalized = (clampedPercent - SIZE_MIN) / (SIZE_MAX - SIZE_MIN);
  const scale = SCALE_MIN + normalized * (safeMax - SCALE_MIN);
  return Number.isFinite(scale) ? scale : SCALE_MIN;
}

/** Map from mutation label → UI sprite name in the sprite index */
const MUTATION_UI_SPRITE_NAMES: Record<string, string> = {
  Gold: "MutationGold",
  Rainbow: "MutationRainbow",
  Wet: "MutationWet",
  Chilled: "MutationChilled",
  Frozen: "MutationFrozen",
  Thunderstruck: "MutationThunderstruck",
  Thundercharged: "MutationThundercharged",
  Dawnlit: "MutationDawnlit",
  Amberlit: "MutationAmberlit",
  Dawnbound: "MutationDawncharged",
  Amberbound: "MutationAmbercharged",
};

function createSegmentedControl<T extends string>(
  labels: readonly T[],
  selectedLabel: string,
  interactive: boolean,
  onSelect: ((label: T) => void) | undefined,
  ariaLabel: string,
): HTMLDivElement {
  const coerced = coerceLabel(selectedLabel, labels) as T;
  const items = labels.map(label => ({ value: label, label, disabled: !interactive }));
  const segmented = segmentedUi.segmented<T>(
    items,
    coerced,
    interactive && onSelect ? value => onSelect(value) : undefined,
    { ariaLabel, fullWidth: true },
  );
  segmented.classList.add("mg-crop-simulation__segmented-control");

  // Replace mutation text labels with UI sprite icons
  const buttons = segmented.querySelectorAll<HTMLButtonElement>(".qmm-seg__btn");
  buttons.forEach(button => {
    const label = button.dataset.value || button.textContent?.trim() || "";
    const spriteName = MUTATION_UI_SPRITE_NAMES[label];
    if (!spriteName) return; // "None" and others keep text label
    const labelSpan = button.querySelector<HTMLSpanElement>(".qmm-seg__btn-label");
    if (!labelSpan) return;
    getSpriteObjectUrlByName(["ui"], spriteName).then(url => {
      if (!url) return;
      const img = document.createElement("img");
      img.src = url;
      img.alt = label;
      img.title = label;
      img.width = 20;
      img.height = 20;
      img.style.width = "20px";
      img.style.height = "20px";
      img.style.objectFit = "contain";
      img.style.display = "block";
      img.draggable = false;
      labelSpan.textContent = "";
      labelSpan.appendChild(img);
    });
  });

  return segmented;
}

function applySegmentedButtonMetadata(
  segmented: HTMLDivElement,
  metadata: Record<string, Record<string, string | undefined>>,
): void {
  const buttons = segmented.querySelectorAll<HTMLButtonElement>(".qmm-seg__btn");
  buttons.forEach(button => {
    const label = button.textContent?.trim();
    if (!label) return;
    const meta = metadata[label];
    if (!meta) return;
    Object.entries(meta).forEach(([key, value]) => {
      if (!value) return;
      (button.dataset as DOMStringMap)[key] = value;
    });
  });
}

function getMutationsForState(state: CalculatorState): string[] {
  const mutations: string[] = [];
  if (state.color !== "None") mutations.push(state.color);
  if (state.weatherCondition !== "None") mutations.push(state.weatherCondition);
  if (state.weatherLighting !== "None") mutations.push(state.weatherLighting);
  return mutations.map((label) => normalizeMutationLabelForSprite(label));
}

function normalizeMutationLabelForSprite(label: string): string {
  const normalized = label.trim();
  if (!normalized) return normalized;
  const overridden = MUTATION_SPRITE_OVERRIDES[normalized.toLowerCase()];
  return overridden ?? normalized;
}

function computePrice(
  speciesKey: string,
  state: CalculatorState,
  percent: number,
  maxScale: number | null,
): number | null {
  const scale = sizePercentToScale(percent, maxScale);
  if (!Number.isFinite(scale) || scale <= 0) return null;
  const mutations = getMutationsForState(state);
  const friendPlayers = clampFriendPlayers(state.friendPlayers);
  const pricingOptions = { ...DefaultPricing, friendPlayers };
  const value = estimateProduceValue(speciesKey, scale, mutations, pricingOptions);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function getMaxScaleForSpecies(key: string): number | null {
  const entry = (plantCatalog as Record<string, any>)[key];
  const candidates = [entry?.crop?.maxScale, entry?.plant?.maxScale, entry?.seed?.maxScale];
  for (const candidate of candidates) {
    const numeric = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

function getBaseWeightForSpecies(key: string): number | null {
  const entry = (plantCatalog as Record<string, any>)[key];
  const candidates = [
    entry?.produce?.baseWeight,
    entry?.crop?.baseWeight,
    entry?.item?.baseWeight,
    entry?.seed?.baseWeight,
  ];
  for (const candidate of candidates) {
    const numeric = typeof candidate === "number" ? candidate : Number(candidate);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
  }
  return null;
}

export async function renderCalculatorMenu(container: HTMLElement) {
  ensureCalculatorStyles();

  const ui = new Menu({ id: "calculator", compact: true });

  ui.addTab("crops", "Crops", root => {
    root.innerHTML = "";
    root.style.padding = "8px";
    root.style.boxSizing = "border-box";
    root.style.height = "66vh";
    root.style.overflow = "auto";
    root.style.display = "grid";

    const layout = applyStyles(document.createElement("div"), {
      display: "grid",
      gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
      gap: "10px",
      alignItems: "stretch",
      height: "100%",
      overflow: "hidden",
    });
    root.appendChild(layout);

    const left = applyStyles(document.createElement("div"), {
      display: "grid",
      gridTemplateRows: "minmax(0, 1fr)",
      minHeight: "0",
      flex: "0 0 260px",
      minWidth: "220px",
      maxWidth: "280px",
    });
    layout.appendChild(left);

    const list = applyStyles(document.createElement("div"), {
  display: "grid",
  gridTemplateColumns: "1fr",
  overflow: "auto",
  paddingRight: "2px",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: "10px",
  minHeight: "0",     // important
  height: "100%",     // pour que overflow: auto prenne effet
});
    left.appendChild(list);

    const right = applyStyles(document.createElement("div"), {
      display: "flex",
      flexDirection: "column",
      minHeight: "0",
      flex: "1 1 auto",
    });
    layout.appendChild(right);

    const detailScroll = applyStyles(document.createElement("div"), {
      flex: "1 1 auto",
      overflow: "auto",
      display: "flex",
      justifyContent: "center",
    });
    right.appendChild(detailScroll);

    const simulationRoot = document.createElement("div");
    simulationRoot.className = `${ROOT_CLASS} mg-crop-simulation--visible mg-crop-simulation--calculator`;

    const detailLayout = document.createElement("div");
    detailLayout.className = "mg-crop-calculator__layout";

    const createSection = (title: string | null, extraClass?: string): HTMLDivElement => {
      const section = document.createElement("div");
      section.className = "mg-crop-calculator__section";
      if (extraClass) {
        section.classList.add(extraClass);
      }
      if (title) {
        const heading = document.createElement("div");
        heading.className = "mg-crop-calculator__section-heading";
        heading.textContent = title;
        section.appendChild(heading);
      }
      return section;
    };

    const previewSection = createSection(null, "mg-crop-calculator__section--preview");

    const priceRow = document.createElement("div");
    priceRow.className = "mg-crop-simulation__price";

    const priceIcon = document.createElement("img");
    priceIcon.className = "mg-crop-simulation__price-icon";
    priceIcon.src = coin.img64;
    priceIcon.alt = "";
    priceIcon.decoding = "async";
    (priceIcon as any).loading = "lazy";
    priceIcon.setAttribute("aria-hidden", "true");
    priceIcon.draggable = false;

    const priceValue = document.createElement("span");
    priceValue.className = "mg-crop-simulation__price-value";
    priceValue.textContent = "—";

    priceRow.append(priceIcon, priceValue);

    const spriteSection = document.createElement("div");
    spriteSection.className = "mg-crop-simulation__sprite-section";

    const spriteBox = document.createElement("div");
    spriteBox.className = "mg-crop-simulation__sprite-box";

    const sprite = document.createElement("span");
    sprite.className = "mg-crop-simulation__sprite";
    spriteBox.appendChild(sprite);

    const sliderContainer = document.createElement("div");
    sliderContainer.className = "mg-crop-simulation__slider-container";

    const sliderRow = document.createElement("div");
    sliderRow.className = "mg-crop-simulation__slider-row";

    const sliderLabel = document.createElement("span");
    sliderLabel.className = "mg-crop-simulation__slider-label";
    sliderLabel.textContent = "Size";

    const slider = ui.slider(SIZE_MIN, SIZE_MAX, 1, SIZE_MIN);
    slider.classList.add("mg-crop-simulation__slider");
    slider.disabled = true;

    const sliderValue = document.createElement("span");
    sliderValue.className = "mg-crop-simulation__slider-value";
    sliderValue.textContent = `${SIZE_MIN}%`;

    const sliderWeight = document.createElement("span");
    sliderWeight.className = "mg-crop-simulation__slider-weight";
    sliderWeight.textContent = "—";

    sliderRow.append(sliderLabel, slider, sliderValue);
    sliderContainer.append(sliderRow, sliderWeight);
    spriteSection.append(spriteBox, sliderContainer);
    previewSection.appendChild(spriteSection);

    const mutationsSection = createSection("Mutations");

    const colorList = document.createElement("div");
    colorList.className = "mg-crop-simulation__segmented";
    mutationsSection.appendChild(colorList);

    const weatherContainer = document.createElement("div");
    weatherContainer.className = "mg-crop-calculator__mutations-weather";

    const weatherConditions = document.createElement("div");
    weatherConditions.className = "mg-crop-simulation__segmented";

    const weatherLighting = document.createElement("div");
    weatherLighting.className = "mg-crop-simulation__segmented";

    weatherContainer.append(weatherConditions, weatherLighting);
    mutationsSection.appendChild(weatherContainer);

    const friendBonusSection = createSection("Friend bonus", "mg-crop-calculator__section--friend-bonus");

    const friendBonus = document.createElement("div");
    friendBonus.className = "mg-crop-simulation__segmented";

    friendBonusSection.appendChild(friendBonus);

    detailLayout.append(
      priceRow,
      previewSection,
      mutationsSection,
      friendBonusSection,
    );

    simulationRoot.appendChild(detailLayout);
    detailScroll.appendChild(simulationRoot);

        const sourceHint = document.createElement("div");
    sourceHint.className = "mg-crop-calculator__source-hint";
    sourceHint.innerHTML = `
      Based on
      <a href="https://daserix.github.io/magic-garden-calculator" target="_blank" rel="noreferrer noopener">
        Daserix&apos; Magic Garden Calculators
      </a>
    `;

    root.appendChild(sourceHint);

    const refs: CalculatorRefs = {
      root: simulationRoot,
      sprite,
      sizeSlider: slider,
      sizeValue: sliderValue,
      sizeWeight: sliderWeight,
      colorMutations: colorList,
      weatherConditions,
      weatherLighting,
      friendBonus,
      priceValue,
    };

    const states = new Map<string, CalculatorState>();
    const optionByKey = new Map<string, LockerSeedOption>();

    const getStateForKey = (key: string): CalculatorState => {
      const existing = states.get(key);
      if (existing) return existing;
      const state: CalculatorState = { ...DEFAULT_STATE };
      states.set(key, state);
      return state;
    };

    let selectedKey: string | null = null;
    let currentMaxScale: number | null = null;
    let currentBaseWeight: number | null = null;
    const listButtons = new Map<
      string,
      { button: HTMLButtonElement; dot: HTMLSpanElement }
    >();

    const refreshListStyles = () => {
      listButtons.forEach(({ button, dot }, key) => {
        const isSelected = selectedKey === key;
        button.style.background = isSelected ? "rgba(94,234,212,0.15)" : "rgba(255,255,255,0.04)";
        button.style.borderColor = isSelected ? "rgba(94,234,212,0.35)" : "rgba(255,255,255,0.10)";
        dot.style.background = isSelected ? "rgba(94,234,212,0.85)" : "rgba(255,255,255,0.20)";
      });
    };

    function renderColorSegment(state: CalculatorState | null, interactive: boolean): void {
      const active = state?.color ?? COLOR_MUTATION_LABELS[0];
      const segmented = createSegmentedControl(
        COLOR_MUTATION_LABELS,
        active,
        interactive,
        interactive
          ? label => {
              if (!selectedKey) return;
              const target = getStateForKey(selectedKey);
              target.color = coerceLabel(label, COLOR_MUTATION_LABELS) as ColorLabel;
              renderColorSegment(target, true);
              renderWeatherConditions(target, true);
              renderWeatherLighting(target, true);
              updateSprite();
              updateOutputs();
            }
          : undefined,
        "Mutations",
      );
      applySegmentedButtonMetadata(segmented, COLOR_SEGMENT_METADATA);
      refs.colorMutations.innerHTML = "";
      refs.colorMutations.appendChild(segmented);
    }

    function renderWeatherConditions(state: CalculatorState | null, interactive: boolean): void {
      const active = state?.weatherCondition ?? WEATHER_CONDITION_LABELS[0];
      const segmented = createSegmentedControl(
        WEATHER_CONDITION_LABELS,
        active,
        interactive,
        interactive
          ? label => {
              if (!selectedKey) return;
              const target = getStateForKey(selectedKey);
              target.weatherCondition = coerceLabel(label, WEATHER_CONDITION_LABELS) as WeatherConditionLabel;
              renderWeatherConditions(target, true);
              updateSprite();
              updateOutputs();
            }
          : undefined,
        "Weather condition",
      );
      applySegmentedButtonMetadata(segmented, WEATHER_CONDITION_SEGMENT_METADATA);
      refs.weatherConditions.innerHTML = "";
      refs.weatherConditions.appendChild(segmented);
    }

    function renderWeatherLighting(state: CalculatorState | null, interactive: boolean): void {
      const active = state?.weatherLighting ?? WEATHER_LIGHTING_LABELS[0];
      const segmented = createSegmentedControl(
        WEATHER_LIGHTING_LABELS,
        active,
        interactive,
        interactive
          ? label => {
              if (!selectedKey) return;
              const target = getStateForKey(selectedKey);
              target.weatherLighting = coerceLabel(label, WEATHER_LIGHTING_LABELS) as WeatherLightingLabel;
              renderWeatherLighting(target, true);
              updateSprite();
              updateOutputs();
            }
          : undefined,
        "Weather lighting",
      );
      applySegmentedButtonMetadata(segmented, WEATHER_LIGHTING_SEGMENT_METADATA);
      refs.weatherLighting.innerHTML = "";
      refs.weatherLighting.appendChild(segmented);
    }

    function renderFriendBonus(state: CalculatorState | null, interactive: boolean): void {
      const active = friendPlayersToLabel(state?.friendPlayers ?? FRIEND_BONUS_MIN_PLAYERS);
      const segmented = createSegmentedControl(
        FRIEND_BONUS_LABELS,
        active,
        interactive,
        interactive
          ? label => {
              if (!selectedKey) return;
              const target = getStateForKey(selectedKey);
              target.friendPlayers = labelToFriendPlayers(label);
              renderFriendBonus(target, true);
              updateOutputs();
            }
          : undefined,
        "Friend bonus",
      );
      refs.friendBonus.innerHTML = "";
      refs.friendBonus.appendChild(segmented);
    }

    function updateOutputs(): void {
      const key = selectedKey;
      if (!key) {
        refs.priceValue.textContent = "—";
        return;
      }
      const state = getStateForKey(key);
      const min = computePrice(key, state, state.sizePercent, currentMaxScale);
      const maxPercent = Math.min(SIZE_MAX, state.sizePercent + 1);
      const max = computePrice(key, state, maxPercent, currentMaxScale);
      refs.priceValue.textContent = formatCoinRange(min, max);
    }

    function updateSprite(): void {
      const key = selectedKey;
      if (!key) {
        resetCropSimulationSprite(refs.sprite);
        return;
      }
      const state = getStateForKey(key);
      const option = optionByKey.get(key);
      const fallbackEmoji =
        getLockerSeedEmojiForKey(key) ||
        (option?.seedName ? getLockerSeedEmojiForSeedName(option.seedName) : undefined) ||
        "🌱";
      const mutations = getMutationsForState(state);
      const candidates = buildSpriteCandidates(key, option);
      const categories = getSpriteCategoriesForKey(key, option?.seedName, option?.cropName);
      applyCropSimulationSprite(refs.sprite, key, {
        fallback: fallbackEmoji,
        candidates,
        mutations,
        categories,
      });
    }

    function renderDetail(): void {
      const key = selectedKey;
      if (!key) {
        resetCropSimulationSprite(refs.sprite);
        refs.sizeSlider.disabled = true;
        currentBaseWeight = null;
        applySizePercent(refs, SIZE_MIN, null, currentBaseWeight);
        renderColorSegment(null, false);
        renderWeatherConditions(null, false);
        renderWeatherLighting(null, false);
        renderFriendBonus(null, false);
        refs.priceValue.textContent = "—";
        return;
      }

      currentMaxScale = getMaxScaleForSpecies(key);
      currentBaseWeight = getBaseWeightForSpecies(key);
      const state = getStateForKey(key);

      refs.sizeSlider.disabled = false;
      applySizePercent(refs, state.sizePercent, currentMaxScale, currentBaseWeight);

      renderColorSegment(state, true);
      renderWeatherConditions(state, true);
      renderWeatherLighting(state, true);
      renderFriendBonus(state, true);
      updateSprite();
      updateOutputs();
    }

    slider.addEventListener("input", () => {
      if (!selectedKey) return;
      const state = getStateForKey(selectedKey);
      const raw = Number(slider.value);
      const value = clamp(Math.round(raw), SIZE_MIN, SIZE_MAX);
      state.sizePercent = value;
      applySizePercent(refs, value, currentMaxScale, currentBaseWeight);
      updateOutputs();
    });

    function renderList(): void {
      const options = getLockerSeedOptions();
      optionByKey.clear();
      options.forEach(opt => optionByKey.set(opt.key, opt));
      const previous = list.scrollTop;
      list.innerHTML = "";
      listButtons.clear();
      if (!options.length) {
        const empty = document.createElement("div");
        empty.className = "mg-crop-calculator__placeholder";
        empty.textContent = "No crops available.";
        list.appendChild(empty);
        selectedKey = null;
        currentMaxScale = null;
        renderDetail();
        return;
      }

      if (selectedKey && !options.some(opt => opt.key === selectedKey)) {
        selectedKey = options[0]!.key;
        currentMaxScale = getMaxScaleForSpecies(selectedKey);
      }

      if (!selectedKey) {
        selectedKey = options[0]!.key;
        currentMaxScale = getMaxScaleForSpecies(selectedKey);
      }

      const fragment = document.createDocumentFragment();

      options.forEach(opt => {
        const button = document.createElement("button");
        button.className = "qmm-vtab";
        button.style.display = "grid";
        button.style.gridTemplateColumns = "16px 1fr auto";
        button.style.alignItems = "center";
        button.style.gap = "8px";
        button.style.textAlign = "left";
        button.style.padding = "6px 8px";
        button.style.marginBottom = "6px";
        button.style.borderRadius = "8px";
        button.style.border = "1px solid rgba(255,255,255,0.10)";
        button.style.background = selectedKey === opt.key ? "rgba(94,234,212,0.15)" : "rgba(255,255,255,0.04)";
        button.style.color = "#e7eef7";

        const dot = document.createElement("span");
        dot.className = "qmm-dot";
        dot.style.background = selectedKey === opt.key ? "rgba(94,234,212,0.85)" : "rgba(255,255,255,0.20)";

        const label = document.createElement("span");
        label.className = "label";
        label.textContent = opt.cropName || opt.key;

        const fallbackEmoji =
          getLockerSeedEmojiForKey(opt.key) ||
          getLockerSeedEmojiForSeedName(opt.seedName) ||
          "🌱";
        const sprite = createSeedSpriteIcon(opt, fallbackEmoji, 24, "calculator-list");

        button.append(dot, label, sprite);

        button.onmouseenter = () => { button.style.borderColor = "rgba(94,234,212,0.35)"; button.style.background = selectedKey === opt.key ? "rgba(94,234,212,0.18)" : "rgba(255,255,255,0.07)"; };
        button.onmouseleave = () => { button.style.borderColor = "rgba(255,255,255,0.10)"; button.style.background = selectedKey === opt.key ? "rgba(94,234,212,0.15)" : "rgba(255,255,255,0.04)"; };
        button.onclick = () => {
          if (selectedKey === opt.key) return;
          selectedKey = opt.key;
          currentMaxScale = getMaxScaleForSpecies(opt.key);
          refreshListStyles();
          renderDetail();
          updateOutputs();
        };

        listButtons.set(opt.key, { button, dot });

        fragment.appendChild(button);
      });

      list.appendChild(fragment);

      list.scrollTop = previous;
      refreshListStyles();
      renderDetail();
    }

    renderList();

    const onDataUpdated = (e: Event) => {
      const key = (e as CustomEvent<{ key: string }>).detail?.key;
      if (key === "plants") renderList();
    };
    window.addEventListener("gemini:data-updated", onDataUpdated);
  });

  ui.mount(container);
}
