// src/ui/menus/locker.ts
import { Menu } from "../menu";
import {
  plantCatalog,
  eggCatalog,
  tileRefsMutations,
  tileRefsMutationLabels,
} from "../../data";
import {
  lockerService,
  type LockerSettingsPersisted,
  type LockerScaleLockMode,
  type LockerLockMode,
  type LockerStatePersisted,
} from "../../services/locker";
import {
  FRIEND_BONUS_MAX,
  FRIEND_BONUS_STEP,
  friendBonusPercentFromMultiplier,
  friendBonusPercentFromPlayers,
  lockerRestrictionsService,
  percentToRequiredFriendCount,
} from "../../services/lockerRestrictions";
import { Atoms } from "../../store/atoms";
import { attachSpriteIcon, attachWeatherSpriteIcon } from "../spriteIconCache";
import { rarityBadge } from "./notifier";

// Reuse tag definitions from garden menu for consistency
type VisualTag = "Gold" | "Rainbow";
const NO_WEATHER_TAG = "NoWeatherEffect" as const;

type WeatherTag = (keyof typeof tileRefsMutations | typeof NO_WEATHER_TAG) & string;
type WeatherMode = "ANY" | "ALL" | "RECIPES";
type WeatherRecipeGroup = "condition" | "lighting";

export type LockerSeedOption = {
  key: string;
  seedName: string;
  cropName: string;
  /** Raw sprite path from game data e.g. "sprite/plant/CloverFourLeaf" */
  spriteKey?: string;
};

const SEED_EMOJIS = [
  "🥕",
  "🍓",
  "🍃",
  "🔵",
  "🍎",
  "🌷",
  "🍅",
  "🌼",
  "🌽",
  "🍉",
  "🎃",
  "🌿",
  "🥥",
  "🍌",
  "🌸",
  "🟢",
  "🍄",
  "🌵",
  "🎍",
  "🍇",
  "🌶️",
  "🍋",
  "🥭",
  "🐉",
  "🍒",
  "🌻",
  "✨",
  "🔆",
  "🔮",
];

function buildLockerSeedOptions(): LockerSeedOption[] {
  return Object.entries(plantCatalog as Record<string, any>).map(([key, def]) => ({
    key,
    seedName: def?.seed?.name ?? "",
    cropName: def?.crop?.name ?? "",
    spriteKey: def?.crop?.sprite ?? def?.plant?.sprite ?? undefined,
  }));
}

function buildLockerEmojiMaps(options: LockerSeedOption[]): {
  byKey: Map<string, string>;
  bySeedName: Map<string, string>;
} {
  const byKey = new Map<string, string>();
  const bySeedName = new Map<string, string>();
  options.forEach((opt, index) => {
    const emoji = SEED_EMOJIS[index % SEED_EMOJIS.length];
    byKey.set(opt.key, emoji);
    if (opt.seedName) bySeedName.set(opt.seedName, emoji);
  });
  return { byKey, bySeedName };
}

let _lockerOptionsCache: LockerSeedOption[] | null = null;
let _lockerEmojiByKey: Map<string, string> | null = null;
let _lockerEmojisBySeedName: Map<string, string> | null = null;

function getLockerCache(): { options: LockerSeedOption[]; byKey: Map<string, string>; bySeedName: Map<string, string> } {
  const options = buildLockerSeedOptions();
  if (!_lockerOptionsCache || options.length !== _lockerOptionsCache.length) {
    _lockerOptionsCache = options;
    const maps = buildLockerEmojiMaps(options);
    _lockerEmojiByKey = maps.byKey;
    _lockerEmojisBySeedName = maps.bySeedName;
  }
  return { options: _lockerOptionsCache, byKey: _lockerEmojiByKey!, bySeedName: _lockerEmojisBySeedName! };
}

export const getLockerSeedOptions = (): LockerSeedOption[] => getLockerCache().options;

export const getLockerSeedEmojiForKey = (key: string | undefined): string | undefined => {
  if (!key) return undefined;
  return getLockerCache().byKey.get(key) ?? "•";
};

export const getLockerSeedEmojiForSeedName = (name: string | undefined): string | undefined => {
  if (!name) return undefined;
  return getLockerCache().bySeedName.get(name) ?? "•";
};

type LockerSettingsState = {
  minScalePct: number;
  maxScalePct: number;
  scaleLockMode: LockerScaleLockMode;
  lockMode: LockerLockMode;
  minInventory: number;
  avoidNormal: boolean;
  visualMutations: Set<VisualTag>;
  weatherMode: WeatherMode;
  weatherSelected: Set<WeatherTag>;
  weatherRecipes: Array<Set<WeatherTag>>;
};

type LockerOverrideState = {
  enabled: boolean;
  settings: LockerSettingsState;
  hasPersistedSettings: boolean;
};

type IconOptions = {
  size?: number;
  fallback?: string;
  /** Raw sprite path from catalog e.g. "sprite/plant/CloverFourLeaf" */
  spriteKey?: string;
};

type WeatherIconFactory = (options?: IconOptions) => HTMLElement;

type WeatherMutationInfo = {
  key: WeatherTag;
  label: string;
  tileRef?: number | string | null;
  iconFactory?: WeatherIconFactory;
};

function formatMutationLabel(key: string): string {
  const spaced = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  if (!spaced) return key;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const WEATHER_MUTATION_LABELS =
  (tileRefsMutationLabels as Record<string, string> | undefined) ?? {};

const WEATHER_MUTATIONS: WeatherMutationInfo[] = Object.entries(
  tileRefsMutations as Record<string, number | string>,
)
  .filter((entry): entry is [WeatherTag, number | string] => {
    const [key, value] = entry;
    if (key === "Puddle" || key === "ThunderstruckGround") {
      return false;
    }
    return typeof value === "number" || typeof value === "string";
  })
  .map(([key, value]) => ({
    key,
    label: WEATHER_MUTATION_LABELS[key] ?? formatMutationLabel(key),
    tileRef: value,
    iconFactory: options => createWeatherBadge(key, options),
  }));

const createNoWeatherIcon: WeatherIconFactory = options => {
  const size = Math.max(24, options?.size ?? 48);
  const wrap = applyStyles(document.createElement("div"), {
    width: `${size}px`,
    height: `${size}px`,
    display: "grid",
    placeItems: "center",
  });

  const glyph = applyStyles(document.createElement("span"), {
    color: "#ff5c5c",
    fontSize: `${Math.round(size * 0.65)}px`,
    fontWeight: "700",
    textShadow: "0 1px 2px rgba(0, 0, 0, 0.6)",
    lineHeight: "1",
  });
  glyph.textContent = "✖";
  wrap.appendChild(glyph);

  return wrap;
};

WEATHER_MUTATIONS.unshift({
  key: NO_WEATHER_TAG,
  label: "No weather effect",
  tileRef: null,
  iconFactory: createNoWeatherIcon,
});

const isWeatherMutationAvailable = (tag: WeatherTag): boolean =>
  WEATHER_MUTATIONS.some(info => info.key === tag);

const WEATHER_RECIPE_GROUPS: Partial<Record<WeatherTag, WeatherRecipeGroup>> = {
  Wet: "condition",
  Chilled: "condition",
  Frozen: "condition",
  Thunderstruck: "condition",
  Thundercharged: "condition",
  Dawnlit: "lighting",
  Amberlit: "lighting",
  Dawncharged: "lighting",
  Ambercharged: "lighting",
};

const WEATHER_RECIPE_GROUP_MEMBERS: Record<WeatherRecipeGroup, WeatherTag[]> = {
  condition: ["Wet", "Chilled", "Frozen", "Thunderstruck", "Thundercharged"],
  lighting: ["Dawnlit", "Amberlit", "Dawncharged", "Ambercharged"],
};

function normalizeWeatherSelection(selection: Set<WeatherTag>): void {
  selection.forEach(tag => {
    if (!isWeatherMutationAvailable(tag)) {
      selection.delete(tag);
    }
  });
}

function normalizeRecipeSelection(selection: Set<WeatherTag>): void {
  normalizeWeatherSelection(selection);
  const seen = new Set<WeatherRecipeGroup>();
  WEATHER_MUTATIONS.forEach(info => {
    if (!selection.has(info.key)) return;
    const group = WEATHER_RECIPE_GROUPS[info.key];
    if (!group) return;
    if (seen.has(group)) {
      selection.delete(info.key);
    } else {
      seen.add(group);
    }
  });
}

const applyStyles = <T extends HTMLElement>(el: T, styles: Record<string, string>): T => {
  Object.entries(styles).forEach(([prop, value]) => {
    (el.style as any)[prop] = value;
  });
  return el;
};

let weatherModeNameSeq = 0;

function createEmojiIcon(symbol: string, size: number): HTMLSpanElement {
  const wrap = applyStyles(document.createElement("span"), {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: `${Math.round(size * 0.75)}px`,
    lineHeight: "1",
  });
  wrap.textContent = symbol;
  wrap.setAttribute("aria-hidden", "true");
  return wrap;
}

function createSeedIcon(seedKey: string, options: IconOptions = {}): HTMLSpanElement {
  const size = Math.max(12, options.size ?? 24);
  const fallback =
    options.fallback ??
    getLockerSeedEmojiForKey(seedKey) ??
    getLockerSeedEmojiForSeedName(seedKey) ??
    "🌱";
  const wrap = applyStyles(document.createElement("span"), {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  wrap.appendChild(createEmojiIcon(fallback, size));
  const spriteBaseName = options.spriteKey?.split("/").pop();
  // Use the exact sprite base name first to avoid fuzzy-match collisions (e.g. "Clover" → "CloverFourLeaf")
  const candidates = spriteBaseName ? [spriteBaseName, seedKey] : seedKey;
  attachSpriteIcon(wrap, ["plant", "tallplant", "crop"], candidates, size, "plant");
  return wrap;
}

function createEggIcon(eggId: string, label?: string, size: number = 32): HTMLSpanElement {
  const fallback = "🥚";
  const wrap = applyStyles(document.createElement("span"), {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  wrap.appendChild(createEmojiIcon(fallback, size));

  const candidates = new Set<string>();
  const add = (value?: string | null) => {
    if (!value) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    candidates.add(trimmed);
    candidates.add(trimmed.replace(/\s+/g, ""));
    const last = trimmed.split(/[./]/).pop();
    if (last && last !== trimmed) {
      candidates.add(last);
      candidates.add(last.replace(/\s+/g, ""));
    }
  };

  add(eggId);
  add(label);

  if (candidates.size) {
    attachSpriteIcon(wrap, ["pet"], Array.from(candidates), size, "locker-eggs");
  }

  return wrap;
}

function createWeatherBadge(tag: WeatherTag, options: IconOptions = {}): HTMLElement {
  if (tag === NO_WEATHER_TAG) {
    return createNoWeatherIcon(options);
  }
  const size = Math.max(16, options.size ?? 32);
  const wrap = applyStyles(document.createElement("span"), {
    width: `${size}px`,
    height: `${size}px`,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "999px",
    background: "rgba(17,20,24,0.85)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontSize: `${Math.round(size * 0.55)}px`,
    color: "#e7eef7",
    lineHeight: "1",
  });
  const label = WEATHER_MUTATION_LABELS[tag] ?? formatMutationLabel(tag);
  const fallback = options.fallback ?? label.charAt(0);
  wrap.textContent = fallback || "?";
  wrap.title = label;
  wrap.setAttribute("aria-label", label);
  return wrap;
}

function createDefaultSettings(): LockerSettingsState {
  return {
    minScalePct: 50,
    maxScalePct: 100,
    scaleLockMode: "RANGE",
    lockMode: "LOCK",
    minInventory: 91,
    avoidNormal: false,
    visualMutations: new Set<VisualTag>(),
    weatherMode: "ANY",
    weatherSelected: new Set<WeatherTag>(),
    weatherRecipes: [],
  };
}

function copySettings(target: LockerSettingsState, source: LockerSettingsState): void {
  target.minScalePct = source.minScalePct;
  target.maxScalePct = source.maxScalePct;
  target.scaleLockMode = source.scaleLockMode;
  target.lockMode = source.lockMode;
  target.minInventory = source.minInventory;
  target.avoidNormal = source.avoidNormal;
  target.visualMutations.clear();
  source.visualMutations.forEach(v => target.visualMutations.add(v));
  target.weatherMode = source.weatherMode;
  target.weatherSelected.clear();
  source.weatherSelected.forEach(v => target.weatherSelected.add(v));
  target.weatherRecipes.length = 0;
  source.weatherRecipes.forEach(set => target.weatherRecipes.push(new Set<WeatherTag>(set)));
}

function hydrateSettingsFromPersisted(
  target: LockerSettingsState,
  persisted?: LockerSettingsPersisted | null,
): void {
  const src = persisted ?? ({} as LockerSettingsPersisted);
  const mode: LockerScaleLockMode =
    src.scaleLockMode === "MINIMUM" ? "MINIMUM" :
    src.scaleLockMode === "MAXIMUM" ? "MAXIMUM" :
    src.scaleLockMode === "NONE" ? "NONE" : "RANGE";
  let minScale = Math.max(50, Math.min(100, Math.round(src.minScalePct ?? 50)));
  let maxScale = Math.max(50, Math.min(100, Math.round(src.maxScalePct ?? 100)));
  if (mode === "RANGE") {
    maxScale = Math.max(51, Math.min(100, maxScale));
    if (maxScale <= minScale) {
      if (minScale >= 99) {
        minScale = 99;
        maxScale = 100;
      } else {
        maxScale = Math.min(100, Math.max(51, minScale + 1));
      }
    }
  } else if (mode === "MINIMUM") {
    minScale = Math.max(50, Math.min(100, minScale));
  } else if (mode === "MAXIMUM") {
    maxScale = Math.max(50, Math.min(100, maxScale));
  }
  target.minScalePct = minScale;
  target.maxScalePct = maxScale;
  target.scaleLockMode = mode;
  target.lockMode = src.lockMode === "ALLOW" ? "ALLOW" : "LOCK";
  target.minInventory = Math.max(0, Math.min(999, Math.round(src.minInventory ?? 91)));
  target.avoidNormal = src.avoidNormal === true || src.includeNormal === false;
  target.visualMutations.clear();
  (src.visualMutations ?? []).forEach(mut => {
    if (mut === "Gold" || mut === "Rainbow") target.visualMutations.add(mut);
  });
  target.weatherMode = src.weatherMode === "ALL" || src.weatherMode === "RECIPES" ? src.weatherMode : "ANY";
  target.weatherSelected.clear();
  (src.weatherSelected ?? []).forEach(tag => {
    const weatherTag = tag as WeatherTag;
    if (isWeatherMutationAvailable(weatherTag)) {
      target.weatherSelected.add(weatherTag);
    }
  });
  target.weatherRecipes.length = 0;
  (src.weatherRecipes ?? []).forEach(recipe => {
    const set = new Set<WeatherTag>();
    if (Array.isArray(recipe)) {
      recipe.forEach(tag => {
        const weatherTag = tag as WeatherTag;
        if (isWeatherMutationAvailable(weatherTag)) {
          set.add(weatherTag);
        }
      });
    }
    target.weatherRecipes.push(set);
  });
}

function serializeSettingsState(state: LockerSettingsState): LockerSettingsPersisted {
  normalizeWeatherSelection(state.weatherSelected);
  state.weatherRecipes.forEach(set => normalizeRecipeSelection(set));
  const mode: LockerScaleLockMode =
    state.scaleLockMode === "MINIMUM" ? "MINIMUM" :
    state.scaleLockMode === "MAXIMUM" ? "MAXIMUM" :
    state.scaleLockMode === "NONE" ? "NONE" : "RANGE";
  let minScale = Math.max(50, Math.min(100, Math.round(state.minScalePct || 50)));
  let maxScale = Math.max(50, Math.min(100, Math.round(state.maxScalePct || 100)));
  if (mode === "RANGE") {
    maxScale = Math.max(51, Math.min(100, maxScale));
    if (maxScale <= minScale) {
      if (minScale >= 99) {
        minScale = 99;
        maxScale = 100;
      } else {
        maxScale = Math.min(100, Math.max(51, minScale + 1));
      }
    }
  } else if (mode === "MINIMUM") {
    minScale = Math.max(50, Math.min(100, minScale));
  } else if (mode === "MAXIMUM") {
    maxScale = Math.max(50, Math.min(100, maxScale));
  }
  return {
    minScalePct: minScale,
    maxScalePct: maxScale,
    scaleLockMode: mode,
    lockMode: state.lockMode === "ALLOW" ? "ALLOW" : "LOCK",
    minInventory: Math.max(0, Math.min(999, Math.round(state.minInventory || 91))),
    avoidNormal: !!state.avoidNormal,
    includeNormal: !state.avoidNormal,
    visualMutations: Array.from(state.visualMutations),
    weatherMode: state.weatherMode,
    weatherSelected: Array.from(state.weatherSelected),
    weatherRecipes: state.weatherRecipes.map(set => Array.from(set)),
  };
}

class LockerMenuStore {
  readonly global: LockerOverrideState;
  readonly overrides = new Map<string, LockerOverrideState>();
  private listeners = new Set<() => void>();
  private syncing = false;

  constructor(initial: LockerStatePersisted) {
    this.global = { enabled: false, settings: createDefaultSettings(), hasPersistedSettings: true };
    this.syncFromService(initial);
  }

  private applyPersisted(state: LockerStatePersisted): void {
    this.global.enabled = !!state.enabled;
    hydrateSettingsFromPersisted(this.global.settings, state.settings);
    this.global.hasPersistedSettings = true;

    const seen = new Set<string>();
    Object.entries(state.overrides ?? {}).forEach(([key, value]) => {
      const entry = this.ensureOverride(key, { silent: true });
      entry.enabled = !!value?.enabled;
      hydrateSettingsFromPersisted(entry.settings, value?.settings);
      entry.hasPersistedSettings = true;
      seen.add(key);
    });

    for (const key of Array.from(this.overrides.keys())) {
      if (!seen.has(key)) {
        this.overrides.delete(key);
      }
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch {
        /* ignore */
      }
    }
  }

  syncFromService(state: LockerStatePersisted): void {
    this.syncing = true;
    this.applyPersisted(state);
    this.emit();
    this.syncing = false;
  }

  setGlobalEnabled(enabled: boolean): void {
    this.global.enabled = !!enabled;
    this.persistGlobal();
    this.emit();
  }

  notifyGlobalSettingsChanged(): void {
    this.persistGlobal();
    this.emit();
  }

  ensureOverride(key: string, opts: { silent?: boolean } = {}): LockerOverrideState {
    let entry = this.overrides.get(key);
    if (!entry) {
      entry = { enabled: false, settings: createDefaultSettings(), hasPersistedSettings: false };
      this.overrides.set(key, entry);
      if (!opts.silent) {
        this.emit();
      }
    }
    return entry;
  }

  getOverride(key: string): LockerOverrideState | undefined {
    return this.overrides.get(key);
  }

  setOverrideEnabled(key: string, enabled: boolean): void {
    const entry = this.ensureOverride(key, { silent: true });
    entry.enabled = !!enabled;
    this.persistOverride(key);
    this.emit();
  }

  notifyOverrideSettingsChanged(key: string): void {
    const entry = this.overrides.get(key);
    if (!entry) return;
    entry.hasPersistedSettings = true;
    this.persistOverride(key);
    this.emit();
  }

  removeOverride(key: string): void {
    if (!this.overrides.has(key)) return;
    this.overrides.delete(key);
    if (!this.syncing) {
      lockerService.removeOverride(key);
      lockerService.recomputeCurrentSlot();
    }
    this.emit();
  }

  private persistGlobal(): void {
    if (this.syncing) return;
    lockerService.setGlobalState({
      enabled: this.global.enabled,
      settings: serializeSettingsState(this.global.settings),
    });
    lockerService.recomputeCurrentSlot();
  }

  private persistOverride(key: string): void {
    if (this.syncing) return;
    const entry = this.overrides.get(key);
    if (!entry) {
      lockerService.removeOverride(key);
    } else {
      lockerService.setOverride(key, {
        enabled: entry.enabled,
        settings: serializeSettingsState(entry.settings),
      });
      entry.hasPersistedSettings = true;
    }
    lockerService.recomputeCurrentSlot();
  }
}

function setCheck(input: HTMLInputElement, value: boolean) {
  input.checked = !!value;
}

type WeatherMutationToggle = {
  key: WeatherTag;
  wrap: HTMLLabelElement;
  input: HTMLInputElement;
  setChecked: (value: boolean) => void;
  setDisabled: (value: boolean) => void;
};

type WeatherMutationToggleOptions = {
  key: WeatherTag;
  label: string;
  iconSize?: number;
  dense?: boolean;
  kind?: "main" | "recipe";
  iconFactory?: WeatherIconFactory;
};

function createWeatherMutationToggle({
  key,
  label,
  iconSize,
  dense,
  kind = "main",
  iconFactory,
}: WeatherMutationToggleOptions): WeatherMutationToggle {
  const isMain = kind === "main" && !dense;
  const gap = dense ? "3px" : isMain ? "3px" : "6px";
  const padding = dense ? "4px 6px" : isMain ? "6px 8px" : "10px 12px";
  const minWidth = dense ? "80px" : isMain ? "88px" : "120px";
  const wrapStyles: Record<string, string> = {
    position: "relative",
    display: "grid",
    justifyItems: "center",
    alignItems: "center",
    gap,
    padding,
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.02)",
    cursor: "pointer",
    minWidth,
    transition: "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease",
    boxShadow: "none",
  };
  if (isMain) {
    wrapStyles.width = "100%";
  }
  const wrap = applyStyles(document.createElement("label"), wrapStyles);
  wrap.title = "Active filters influence harvest conditions";

  const input = document.createElement("input");
  input.type = "checkbox";
  applyStyles(input, {
    position: "absolute",
    inset: "0",
    opacity: "0",
    pointerEvents: "none",
    margin: "0",
  });
  input.dataset.weatherToggle = kind;
  wrap.appendChild(input);
  wrap.dataset.weatherToggle = kind;

  const computedIconSize = Math.max(24, iconSize ?? (dense ? 36 : isMain ? 52 : 72));
  const iconWrap = applyStyles(document.createElement("span"), {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  });
  const fallbackIcon = iconFactory
    ? iconFactory({ size: computedIconSize, fallback: label.charAt(0) || "?" })
    : createWeatherBadge(key, {
        size: computedIconSize,
        fallback: label.charAt(0) || "?",
      });
  applyStyles(iconWrap, {
    filter: "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45))",
  });
  iconWrap.appendChild(fallbackIcon);
  wrap.appendChild(iconWrap);
  attachWeatherSpriteIcon(iconWrap, key, computedIconSize);

  const caption = applyStyles(document.createElement("div"), {
    fontSize: dense ? "11px" : "11.5px",
    fontWeight: dense ? "500" : "600",
    opacity: "0.85",
    textAlign: "center",
  });
  caption.textContent = label;
  wrap.appendChild(caption);

  const applyDisabledState = () => {
    if (input.disabled) {
      wrap.style.cursor = "default";
      wrap.style.opacity = "0.55";
      wrap.style.pointerEvents = "none";
    } else {
      wrap.style.cursor = "pointer";
      wrap.style.opacity = "";
      wrap.style.pointerEvents = "";
    }
  };

  const updateState = () => {
    if (input.checked) {
      applyStyles(wrap, {
        borderColor: "rgba(94,234,212,0.40)",
        boxShadow: "0 0 0 1px rgba(94,234,212,0.25) inset, 0 2px 6px rgba(0, 0, 0, 0.45)",
        background: "rgba(94,234,212,0.12)",
      });
    } else {
      applyStyles(wrap, {
        borderColor: "rgba(255,255,255,0.10)",
        boxShadow: "none",
        background: "rgba(255,255,255,0.02)",
      });
    }
    applyDisabledState();
  };

  const setChecked = (value: boolean) => {
    setCheck(input, value);
    updateState();
  };

  const setDisabled = (value: boolean) => {
    input.disabled = !!value;
    updateState();
  };

  input.addEventListener("change", updateState);
  input.addEventListener("mg-weather-toggle-refresh", updateState as EventListener);
  updateState();

  return { key, wrap, input, setChecked, setDisabled };
}

function styleBtnFullWidth(button: HTMLButtonElement, text: string) {
  button.textContent = text;
  button.style.flex = "1";
  button.style.margin = "0";
  button.style.padding = "6px 10px";
  button.style.borderRadius = "8px";
  button.style.border = "1px solid rgba(255,255,255,0.10)";
  button.style.background = "rgba(255,255,255,0.04)";
  button.style.color = "#e7eef7";
  button.style.fontSize = "13px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.justifyContent = "center";
  button.onmouseenter = () => { button.style.borderColor = "rgba(94,234,212,0.35)"; button.style.background = "rgba(94,234,212,0.08)"; };
  button.onmouseleave = () => { button.style.borderColor = "rgba(255,255,255,0.10)"; button.style.background = "rgba(255,255,255,0.04)"; };
}

function styleBtnCompact(button: HTMLButtonElement, text: string) {
  button.textContent = text;
  button.style.margin = "0";
  button.style.padding = "4px 8px";
  button.style.borderRadius = "8px";
  button.style.border = "1px solid rgba(255,255,255,0.10)";
  button.style.background = "rgba(255,255,255,0.04)";
  button.style.color = "#e7eef7";
  button.style.fontSize = "12px";
  button.style.fontWeight = "600";
  button.style.cursor = "pointer";
  button.style.display = "inline-flex";
  button.style.alignItems = "center";
  button.style.justifyContent = "center";
  button.style.minWidth = "36px";
  button.onmouseenter = () => { button.style.borderColor = "rgba(94,234,212,0.35)"; button.style.background = "rgba(94,234,212,0.08)"; };
  button.onmouseleave = () => { button.style.borderColor = "rgba(255,255,255,0.10)"; button.style.background = "rgba(255,255,255,0.04)"; };
}

type SettingsCardOptions = {
  onChange?: () => void;
};

type SettingsCardHandle = {
  root: HTMLDivElement;
  refresh: () => void;
  setDisabled: (disabled: boolean) => void;
};

function createLockerSettingsCard(
  ui: Menu,
  state: LockerSettingsState,
  opts: SettingsCardOptions = {}
): SettingsCardHandle {
  const card = document.createElement("div");
  card.dataset.lockerSettingsCard = "1";
  card.style.border = "1px solid rgba(255,255,255,0.10)";
  card.style.borderRadius = "10px";
  card.style.padding = "12px";
  card.style.display = "flex";
  card.style.flexDirection = "column";
  card.style.gap = "12px";
  card.style.alignItems = "center";
  card.style.overflow = "auto";
  card.style.minHeight = "0";
  card.style.width = "min(760px, 100%)";

  let recipesTitleElement: HTMLDivElement | null = null;

  const updateRecipeTitleText = () => {
    if (!recipesTitleElement) return;
    const prefix = state.lockMode === "ALLOW" ? "Allow" : "Lock";
    recipesTitleElement.textContent = `${prefix} when any recipe row matches (OR between rows)`;
  };

  const makeSection = (titleText: string, content: HTMLElement) => {
    const section = document.createElement("div");
    section.style.display = "grid";
    section.style.justifyItems = "center";
    section.style.gap = "8px";
    section.style.textAlign = "center";
    section.style.border = "1px solid rgba(255,255,255,0.10)";
    section.style.borderRadius = "10px";
    section.style.padding = "10px";
    section.style.background = "rgba(255,255,255,0.04)";
    section.style.boxShadow = "none";
    section.style.width = "min(720px, 100%)";

    const heading = document.createElement("div");
    heading.textContent = titleText;
    heading.style.fontWeight = "600";
    heading.style.opacity = "0.95";

    section.append(heading, content);
    return section;
  };

  const centerRow = () => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.justifyContent = "center";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    return row;
  };

  type LockModeValue = "lock" | "allow";
  const toLockMode = (value: LockModeValue): LockerLockMode =>
    value === "allow" ? "ALLOW" : "LOCK";
  const fromLockMode = (mode: LockerLockMode): LockModeValue =>
    mode === "ALLOW" ? "allow" : "lock";

  const lockModeRow = centerRow();
  lockModeRow.style.flexDirection = "column";
  lockModeRow.style.alignItems = "center";
  lockModeRow.style.gap = "10px";

  const lockModeHint = document.createElement("div");
  lockModeHint.style.fontSize = "12px";
  lockModeHint.style.opacity = "0.8";
  lockModeHint.style.textAlign = "center";

  let isProgrammaticLockMode = false;
  const lockModeSegmented = ui.segmented<LockModeValue>(
    [
      { value: "lock", label: "Lock" },
      { value: "allow", label: "Allow" },
    ],
    fromLockMode(state.lockMode),
    value => {
      if (isProgrammaticLockMode) return;
      state.lockMode = toLockMode(value);
      updateLockModeUI();
      opts.onChange?.();
    },
    { ariaLabel: "Harvest mode" }
  );
  lockModeRow.append(lockModeSegmented, lockModeHint);

  const updateLockModeUI = () => {
    const value = fromLockMode(state.lockMode);
    const current = (lockModeSegmented as any).get?.();
    if (current !== value) {
      isProgrammaticLockMode = true;
      try {
        (lockModeSegmented as any).set?.(value);
      } finally {
        isProgrammaticLockMode = false;
      }
    }
    lockModeHint.textContent =
      value === "allow"
        ? "Harvest only when every active filter category matches"
        : "Harvest is locked whenever any active filter matches";
    updateRecipeTitleText();
  };

  const scaleRow = centerRow();
  scaleRow.style.flexDirection = "column";
  scaleRow.style.alignItems = "center";
  scaleRow.style.width = "100%";
  scaleRow.style.gap = "12px";

  const scaleModeRow = centerRow();
  scaleModeRow.style.flexWrap = "wrap";
  scaleModeRow.style.justifyContent = "center";
  scaleModeRow.style.gap = "12px";

  const minSlider = ui.slider(50, 100, 1, state.minScalePct);
  applyStyles(minSlider, { width: "min(420px, 100%)" });
  const maxSlider = ui.slider(50, 100, 1, state.maxScalePct);
  applyStyles(maxSlider, { width: "min(420px, 100%)" });

  type ScaleSegmentValue = "none" | "minimum" | "maximum" | "ranged";
  const toMode = (value: ScaleSegmentValue): LockerScaleLockMode => {
    switch (value) {
      case "minimum": return "MINIMUM";
      case "maximum": return "MAXIMUM";
      case "ranged": return "RANGE";
      default: return "NONE";
    }
  };
  const fromMode = (mode: LockerScaleLockMode): ScaleSegmentValue => {
    switch (mode) {
      case "MINIMUM": return "minimum";
      case "MAXIMUM": return "maximum";
      case "RANGE": return "ranged";
      default: return "none";
    }
  };

  let isProgrammaticScaleMode = false;
  const initialScaleMode = fromMode(state.scaleLockMode);
  const scaleModeSegmented = ui.segmented<ScaleSegmentValue>(
    [
      { value: "none", label: "None" },
      { value: "minimum", label: "Minimum" },
      { value: "maximum", label: "Maximum" },
      { value: "ranged", label: "Range" },
    ],
    initialScaleMode,
    value => {
      if (isProgrammaticScaleMode) return;
      applyScaleMode(toMode(value), true);
    },
    { ariaLabel: "Scale lock mode" }
  );
  scaleModeRow.append(scaleModeSegmented);

  const scaleSlider = ui.rangeDual(50, 100, 1, state.minScalePct, state.maxScalePct);
  applyStyles(scaleSlider.root, {
    width: "min(420px, 100%)",
    marginLeft: "auto",
    marginRight: "auto",
  });

  const scaleMinSlider = scaleSlider.min;
  const scaleMaxSlider = scaleSlider.max;

  const scaleMinValue = ui.label("50%");
  const scaleMaxValue = ui.label("100%");
  const scaleMinimumValue = ui.label("50%");
  const scaleMaximumValue = ui.label("100%");
  [scaleMinValue, scaleMaxValue, scaleMinimumValue, scaleMaximumValue].forEach(label => {
    label.style.margin = "0";
    label.style.fontWeight = "600";
  });

  const makeScaleValue = (labelText: string, valueLabel: HTMLLabelElement) => {
    const wrap = applyStyles(document.createElement("div"), {
      display: "flex",
      alignItems: "center",
      gap: "6px",
    });
    const label = ui.label(labelText);
    label.style.margin = "0";
    label.style.opacity = "0.9";
    wrap.append(label, valueLabel);
    return wrap;
  };

  const scaleValues = applyStyles(document.createElement("div"), {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    width: "min(420px, 100%)",
    gap: "16px",
  });

  scaleValues.append(makeScaleValue("Min", scaleMinValue), makeScaleValue("Max", scaleMaxValue));

  const minControls = applyStyles(document.createElement("div"), {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    width: "100%",
  });
  minControls.append(minSlider, makeScaleValue("Minimum", scaleMinimumValue));

  const maxControls = applyStyles(document.createElement("div"), {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    width: "100%",
  });
  maxControls.append(maxSlider, makeScaleValue("Maximum", scaleMaximumValue));

  const rangeControls = applyStyles(document.createElement("div"), {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "12px",
    width: "100%",
  });
  rangeControls.append(scaleSlider.root, scaleValues);

  scaleRow.append(scaleModeRow, minControls, maxControls, rangeControls);

  const applyScaleRange = (commit: boolean, notify = commit) => {
    let minValue = parseInt(scaleMinSlider.value, 10);
    let maxValue = parseInt(scaleMaxSlider.value, 10);
    if (!Number.isFinite(minValue)) minValue = state.minScalePct;
    if (!Number.isFinite(maxValue)) maxValue = state.maxScalePct;
    minValue = Math.max(50, Math.min(99, minValue));
    maxValue = Math.max(51, Math.min(100, maxValue));
    if (maxValue <= minValue) {
      if (minValue >= 99) {
        minValue = 99;
        maxValue = 100;
      } else {
        maxValue = Math.min(100, Math.max(51, minValue + 1));
      }
    }
    scaleSlider.setValues(minValue, maxValue);
    scaleMinValue.textContent = `${minValue}%`;
    scaleMaxValue.textContent = `${maxValue}%`;
    if (commit) {
      state.minScalePct = minValue;
      state.maxScalePct = maxValue;
      if (notify) opts.onChange?.();
    }
  };

  const applyScaleMinimum = (commit: boolean, notify = commit) => {
    let minValue = parseInt(minSlider.value, 10);
    if (!Number.isFinite(minValue)) minValue = state.minScalePct;
    minValue = Math.max(50, Math.min(100, minValue));
    minSlider.value = String(minValue);
    scaleMinimumValue.textContent = `${minValue}%`;
    if (commit) {
      state.minScalePct = minValue;
      if (notify) opts.onChange?.();
    }
  };

  const applyScaleMaximum = (commit: boolean, notify = commit) => {
    let maxValue = parseInt(maxSlider.value, 10);
    if (!Number.isFinite(maxValue)) maxValue = state.maxScalePct;
    maxValue = Math.max(50, Math.min(100, maxValue));
    maxSlider.value = String(maxValue);
    scaleMaximumValue.textContent = `${maxValue}%`;
    if (commit) {
      state.maxScalePct = maxValue;
      if (notify) opts.onChange?.();
    }
  };

  const updateScaleModeUI = () => {
    const isRange = state.scaleLockMode === "RANGE";
    const isMin = state.scaleLockMode === "MINIMUM";
    const isMax = state.scaleLockMode === "MAXIMUM";
    rangeControls.style.display = isRange ? "" : "none";
    minControls.style.display = isMin ? "" : "none";
    maxControls.style.display = isMax ? "" : "none";
    const segValue = fromMode(state.scaleLockMode);
    if ((scaleModeSegmented as any).get?.() !== segValue) {
      isProgrammaticScaleMode = true;
      try {
        (scaleModeSegmented as any).set?.(segValue);
      } finally {
        isProgrammaticScaleMode = false;
      }
    }
  };

  const applyScaleMode = (mode: LockerScaleLockMode, notify: boolean) => {
    const prevMode = state.scaleLockMode;
    state.scaleLockMode = mode;
    if (mode === "RANGE") {
      scaleSlider.setValues(state.minScalePct, state.maxScalePct);
      applyScaleRange(prevMode !== mode, false);
    } else if (mode === "MINIMUM") {
      minSlider.value = String(state.minScalePct);
      applyScaleMinimum(prevMode !== mode, false);
    } else if (mode === "MAXIMUM") {
      maxSlider.value = String(state.maxScalePct);
      applyScaleMaximum(prevMode !== mode, false);
    }
    updateScaleModeUI();
    if (notify && prevMode !== mode) {
      opts.onChange?.();
    }
  };

  minSlider.addEventListener("input", () => applyScaleMinimum(false));
  minSlider.addEventListener("change", () => applyScaleMinimum(true));
  maxSlider.addEventListener("input", () => applyScaleMaximum(false));
  maxSlider.addEventListener("change", () => applyScaleMaximum(true));
  scaleMinSlider.addEventListener("input", () => applyScaleRange(false));
  scaleMaxSlider.addEventListener("input", () => applyScaleRange(false));
  scaleMinSlider.addEventListener("change", () => applyScaleRange(true));
  scaleMaxSlider.addEventListener("change", () => applyScaleRange(true));
  applyScaleRange(false);
  applyScaleMinimum(false);
  applyScaleMaximum(false);
  applyScaleMode(state.scaleLockMode, false);

  const colorsRow = centerRow();
  colorsRow.style.flexWrap = "wrap";
  colorsRow.style.gap = "8px";

  const createColorButton = (label: string, gradient?: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.title = "Active filters influence harvest conditions";
    applyStyles(button, {
      padding: "6px 12px",
      borderRadius: "8px",
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.04)",
      color: "#e7eef7",
      fontWeight: "600",
      letterSpacing: "0.3px",
      transition: "border-color 120ms ease, box-shadow 120ms ease, background 120ms ease, opacity 120ms ease",
      boxShadow: "none",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      minWidth: "92px",
      cursor: "pointer",
    });

    const text = document.createElement("span");
    text.textContent = label;
    if (gradient) {
      applyStyles(text, {
        backgroundImage: gradient,
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        color: "transparent",
        fontWeight: "700",
        textShadow: "0 0 6px rgba(0, 0, 0, 0.35)",
      });
    }
    button.appendChild(text);

    button.addEventListener("mouseenter", () => {
      if (button.disabled || button.dataset.active === "1") return;
      button.style.borderColor = "rgba(94,234,212,0.35)";
    });
    button.addEventListener("mouseleave", () => {
      if (button.dataset.active === "1") return;
      button.style.borderColor = "rgba(255,255,255,0.10)";
    });

    return button;
  };

  const btnNormal = createColorButton("Normal");
  const btnGold = createColorButton(
    "Gold",
    "linear-gradient(120deg, #f5d76e, #c9932b, #f9e9b6)",
  );
  const btnRainbow = createColorButton(
    "Rainbow",
    "linear-gradient(90deg, #ff6b6b, #f7d35c, #3fd3ff, #9b6bff, #ff6b6b)",
  );

  const updateColorButtonVisual = (button: HTMLButtonElement, active: boolean) => {
    button.dataset.active = active ? "1" : "0";
    button.style.borderColor = active ? "rgba(94,234,212,0.40)" : "rgba(255,255,255,0.10)";
    button.style.boxShadow = active
      ? "0 0 0 1px rgba(94,234,212,0.25) inset, 0 2px 6px rgba(0, 0, 0, 0.45)"
      : "none";
    button.style.background = active ? "rgba(94,234,212,0.12)" : "rgba(255,255,255,0.04)";
    button.style.opacity = button.disabled ? "0.55" : "";
    button.style.cursor = button.disabled ? "default" : "pointer";
  };

  const updateColorButtons = () => {
    updateColorButtonVisual(btnNormal, state.avoidNormal);
    updateColorButtonVisual(btnGold, state.visualMutations.has("Gold"));
    updateColorButtonVisual(btnRainbow, state.visualMutations.has("Rainbow"));
  };

  btnNormal.addEventListener("click", () => {
    state.avoidNormal = !state.avoidNormal;
    updateColorButtons();
    opts.onChange?.();
  });

  btnGold.addEventListener("click", () => {
    if (state.visualMutations.has("Gold")) state.visualMutations.delete("Gold");
    else state.visualMutations.add("Gold");
    updateColorButtons();
    opts.onChange?.();
  });

  btnRainbow.addEventListener("click", () => {
    if (state.visualMutations.has("Rainbow")) state.visualMutations.delete("Rainbow");
    else state.visualMutations.add("Rainbow");
    updateColorButtons();
    opts.onChange?.();
  });

  colorsRow.append(btnNormal, btnGold, btnRainbow);

  const weatherGrid = applyStyles(document.createElement("div"), {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    columnGap: "6px",
    rowGap: "6px",
    justifyItems: "stretch",
    width: "min(640px, 100%)",
    marginInline: "auto",
  });

  const applyWeatherSelection = (selection: Set<WeatherTag>) =>
    (tag: WeatherTag, checked: boolean) => {
      if (checked) {
        selection.add(tag);
      } else {
        selection.delete(tag);
      }
      opts.onChange?.();
    };

  const updateMainWeatherSelection = applyWeatherSelection(state.weatherSelected);
  const weatherToggles = WEATHER_MUTATIONS.map(info => {
    const toggle = createWeatherMutationToggle({
      key: info.key,
      label: info.label,
      kind: "main",
      iconFactory: info.iconFactory,
    });
    toggle.input.addEventListener("change", () =>
      updateMainWeatherSelection(info.key, toggle.input.checked),
    );
    weatherGrid.appendChild(toggle.wrap);
    return toggle;
  });

  const updateWeatherMutationsDisabled = () => {
    const disabled = card.dataset.disabled === "1" || state.weatherMode === "RECIPES";
    weatherGrid.style.opacity = disabled ? "0.55" : "";
    weatherGrid.style.pointerEvents = disabled ? "none" : "";
    weatherToggles.forEach(toggle => toggle.setDisabled(disabled));
  };

  const weatherModeName = `locker-weather-mode-${++weatherModeNameSeq}`;
  const weatherModeRow = centerRow();
  const buildRadio = (value: WeatherMode, label: string) => {
    const wrap = document.createElement("label");
    wrap.style.display = "inline-flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "6px";
    const input = ui.radio(weatherModeName, value);
    const span = document.createElement("span");
    span.textContent = label;
    wrap.append(input, span);
    input.addEventListener("change", () => {
      if (!input.checked) return;
      state.weatherMode = value;
      recipesWrap.style.display = value === "RECIPES" ? "" : "none";
      updateWeatherMutationsDisabled();
      opts.onChange?.();
    });
    return { wrap, input };
  };

  const radioAny = buildRadio("ANY", "Any match (OR)");
  const radioAll = buildRadio("ALL", "All match (AND)");
  const radioRecipes = buildRadio("RECIPES", "Recipes (match rows)");
  weatherModeRow.append(radioAny.wrap, radioAll.wrap, radioRecipes.wrap);

  const recipesWrap = document.createElement("div");
  recipesWrap.style.display = "grid";
  recipesWrap.style.gap = "8px";
  recipesWrap.style.justifyItems = "center";
  recipesWrap.style.width = "min(720px, 100%)";

  const recipesHeader = centerRow();
  recipesHeader.style.width = "100%";
  recipesHeader.style.justifyContent = "space-between";
  const recipesTitle = document.createElement("div");
  recipesTitleElement = recipesTitle;
  updateRecipeTitleText();
  recipesTitle.style.fontWeight = "600";
  recipesTitle.style.opacity = "0.9";
  const btnAddRecipe = document.createElement("button");
  btnAddRecipe.style.maxWidth = "140px";
  styleBtnFullWidth(btnAddRecipe, "+ Recipe");
  recipesHeader.append(recipesTitle, btnAddRecipe);

  const recipesList = document.createElement("div");
  recipesList.style.display = "grid";
  recipesList.style.gap = "8px";
  recipesList.style.gridTemplateColumns = "repeat(auto-fit, minmax(320px, 1fr))";
  recipesList.style.justifyItems = "stretch";

  let editingRecipeIndex: number | null = null;
  let editingRecipeDraft: Set<WeatherTag> = new Set();

  const emptyRecipes = document.createElement("div");
  emptyRecipes.textContent = "No recipe rows yet.";
  emptyRecipes.style.fontSize = "12px";
  emptyRecipes.style.opacity = "0.7";
  emptyRecipes.style.textAlign = "center";

  const updateAddRecipeDisabled = () => {
    const editing = editingRecipeIndex !== null;
    const cardDisabled = card.dataset.disabled === "1";
    btnAddRecipe.disabled = editing || cardDisabled;
    btnAddRecipe.style.opacity = editing ? "0.7" : "";
    btnAddRecipe.style.pointerEvents = editing ? "none" : "";
  };

  const startEditingRecipe = (index: number, base?: Set<WeatherTag>) => {
    editingRecipeIndex = index;
    editingRecipeDraft = new Set(base ?? []);
    normalizeRecipeSelection(editingRecipeDraft);
    repaintRecipes();
  };

  const cancelEditingRecipe = () => {
    editingRecipeIndex = null;
    editingRecipeDraft = new Set();
    repaintRecipes();
  };

  const commitEditingRecipe = () => {
    if (editingRecipeIndex === null) return;
    const draft = new Set(editingRecipeDraft);
    normalizeRecipeSelection(draft);
    if (editingRecipeIndex === state.weatherRecipes.length) {
      state.weatherRecipes.push(draft);
    } else if (editingRecipeIndex >= 0 && editingRecipeIndex < state.weatherRecipes.length) {
      state.weatherRecipes[editingRecipeIndex] = draft;
    }
    editingRecipeIndex = null;
    editingRecipeDraft = new Set();
    repaintRecipes();
    opts.onChange?.();
  };

  const deleteRecipeAt = (index: number) => {
    if (index < 0) return;
    if (index < state.weatherRecipes.length) {
      state.weatherRecipes.splice(index, 1);
    }
    if (editingRecipeIndex !== null) {
      if (index === editingRecipeIndex) {
        editingRecipeIndex = null;
        editingRecipeDraft = new Set();
      } else if (index < editingRecipeIndex) {
        editingRecipeIndex -= 1;
      }
    }
    repaintRecipes();
    opts.onChange?.();
  };

  const buildRecipeBadge = (info: WeatherMutationInfo) => {
    const { key: tag, label } = info;
    const badge = document.createElement("div");
    applyStyles(badge, {
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 10px",
      borderRadius: "999px",
      border: "1px solid rgba(255,255,255,0.10)",
      background: "rgba(255,255,255,0.04)",
      color: "#e7eef7",
      fontSize: "12px",
      fontWeight: "600",
      letterSpacing: "0.2px",
    });

    const iconWrap = applyStyles(document.createElement("span"), {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
    });
    const fallbackIcon = info.iconFactory
      ? info.iconFactory({ size: 20, fallback: label.charAt(0) || "?" })
      : createWeatherBadge(tag, {
          size: 20,
          fallback: label.charAt(0) || "?",
        });
    applyStyles(iconWrap, {
      filter: "drop-shadow(0 1px 1px rgba(0, 0, 0, 0.45))",
    });
    iconWrap.appendChild(fallbackIcon);
    attachWeatherSpriteIcon(iconWrap, tag, 20);

    const text = document.createElement("span");
    text.textContent = label;

    badge.append(iconWrap, text);
    return badge;
  };

  const renderRecipeSummary = (container: HTMLElement, selection: Set<WeatherTag>) => {
    container.innerHTML = "";
    const badges = document.createElement("div");
    applyStyles(badges, {
      display: "flex",
      flexWrap: "wrap",
      gap: "6px",
      justifyContent: "flex-start",
    });

    let count = 0;
    WEATHER_MUTATIONS.forEach(info => {
      if (!selection.has(info.key)) return;
      count += 1;
      badges.appendChild(buildRecipeBadge(info));
    });

    if (count === 0) {
      const empty = document.createElement("div");
      empty.textContent = "No weather mutation selected.";
      empty.style.fontSize = "12px";
      empty.style.opacity = "0.7";
      empty.style.textAlign = "left";
      badges.appendChild(empty);
    }

    container.appendChild(badges);
  };

  const applyDisabled = () => {
    const cardDisabled = card.dataset.disabled === "1";
    const inputs = card.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input,button,select,textarea");
    inputs.forEach(el => {
      if ((el as HTMLElement).dataset.weatherToggle === "main") {
        return;
      }
      el.disabled = cardDisabled;
      el.dispatchEvent(new Event("mg-weather-toggle-refresh"));
    });
    updateWeatherMutationsDisabled();
    updateColorButtons();
    card.style.opacity = cardDisabled ? "0.55" : "";
    updateAddRecipeDisabled();
  };

  function buildRecipeToggleGrid(selection: Set<WeatherTag>, onSelectionChange: () => void) {
    const toggleGrid = applyStyles(document.createElement("div"), {
      display: "grid",
      gridTemplateColumns: "repeat(4, minmax(80px, 1fr))",
      columnGap: "6px",
      rowGap: "6px",
      justifyItems: "center",
    });

    const toggles = new Map<WeatherTag, WeatherMutationToggle>();

    WEATHER_MUTATIONS.forEach(info => {
      const toggle = createWeatherMutationToggle({
        key: info.key,
        label: info.label,
        iconSize: 40,
        dense: true,
        kind: "recipe",
        iconFactory: info.iconFactory,
      });
      toggles.set(info.key, toggle);
      toggle.setChecked(selection.has(toggle.key));
      toggle.input.addEventListener("change", () => {
        const checked = toggle.input.checked;
        const group = WEATHER_RECIPE_GROUPS[toggle.key];

        if (checked && group) {
          WEATHER_RECIPE_GROUP_MEMBERS[group].forEach(other => {
            if (other === toggle.key) return;
            if (!selection.has(other)) return;
            selection.delete(other);
            toggles.get(other)?.setChecked(false);
          });
        }

        if (checked) {
          selection.add(toggle.key);
        } else {
          selection.delete(toggle.key);
        }

        onSelectionChange();
      });
      toggleGrid.appendChild(toggle.wrap);
    });

    return toggleGrid;
  }

  function repaintRecipes() {
    recipesList.innerHTML = "";

    const hasDraftNew = editingRecipeIndex !== null && editingRecipeIndex === state.weatherRecipes.length;
    const totalRows = state.weatherRecipes.length + (hasDraftNew ? 1 : 0);

    if (totalRows === 0) {
      recipesList.appendChild(emptyRecipes);
      applyDisabled();
      return;
    }

    state.weatherRecipes.forEach((set, index) => {
      normalizeRecipeSelection(set);
      const isEditing = editingRecipeIndex === index;
      const selection = isEditing ? editingRecipeDraft : set;

      const row = applyStyles(document.createElement("div"), {
        display: "flex",
        gap: isEditing ? "10px" : "12px",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: "10px",
        padding: isEditing ? "12px" : "10px 12px",
        background: "rgba(255,255,255,0.02)",
        boxShadow: "none",
        width: "100%",
      });
      if (isEditing) {
        row.style.flexDirection = "column";
      } else {
        row.style.flexDirection = "row";
        row.style.alignItems = "center";
        row.style.justifyContent = "space-between";
        row.style.flexWrap = "wrap";
      }

      const summary = document.createElement("div");
      renderRecipeSummary(summary, selection);
      if (!isEditing) {
        summary.style.flex = "1 1 auto";
        summary.style.minWidth = "220px";
      }
      row.appendChild(summary);

      if (isEditing) {
        const toggleGrid = buildRecipeToggleGrid(selection, () => renderRecipeSummary(summary, selection));
        row.appendChild(toggleGrid);

        const actions = applyStyles(document.createElement("div"), {
          display: "flex",
          gap: "8px",
          width: "100%",
        });

        const btnCancel = document.createElement("button");
        styleBtnFullWidth(btnCancel, "❌");
        btnCancel.onclick = cancelEditingRecipe;

        const btnValidate = document.createElement("button");
        styleBtnFullWidth(btnValidate, "✔️");
        btnValidate.onclick = commitEditingRecipe;

        actions.append(btnCancel, btnValidate);

        if (editingRecipeIndex !== null && editingRecipeIndex < state.weatherRecipes.length) {
          const btnDelete = document.createElement("button");
          styleBtnFullWidth(btnDelete, "🗑️");
          btnDelete.title = "Delete";
          btnDelete.setAttribute("aria-label", "Delete");
          btnDelete.onclick = () => deleteRecipeAt(index);
          actions.append(btnDelete);
        }

        row.appendChild(actions);
      } else {
        const actions = applyStyles(document.createElement("div"), {
          display: "flex",
          gap: "6px",
          alignItems: "center",
          justifyContent: "flex-end",
          flex: "0 0 auto",
        });
        actions.style.flexWrap = "nowrap";

        const btnEdit = document.createElement("button");
        styleBtnCompact(btnEdit, "✏️");
        btnEdit.title = "Edit";
        btnEdit.setAttribute("aria-label", "Edit");
        btnEdit.onclick = () => startEditingRecipe(index, set);

        const btnDelete = document.createElement("button");
        styleBtnCompact(btnDelete, "🗑️");
        btnDelete.title = "Delete";
        btnDelete.setAttribute("aria-label", "Delete");
        btnDelete.onclick = () => deleteRecipeAt(index);

        actions.append(btnEdit, btnDelete);
        row.appendChild(actions);
      }

      recipesList.appendChild(row);
    });

    if (hasDraftNew && editingRecipeIndex !== null) {
      const selection = editingRecipeDraft;
      const row = applyStyles(document.createElement("div"), {
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: "10px",
        padding: "12px",
        background: "rgba(255,255,255,0.02)",
        boxShadow: "none",
        width: "100%",
      });

      const summary = document.createElement("div");
      renderRecipeSummary(summary, selection);
      row.appendChild(summary);

      const toggleGrid = buildRecipeToggleGrid(selection, () => renderRecipeSummary(summary, selection));
      row.appendChild(toggleGrid);

      const actions = applyStyles(document.createElement("div"), {
        display: "flex",
        gap: "8px",
        width: "100%",
      });

      const btnCancel = document.createElement("button");
      styleBtnFullWidth(btnCancel, "❌");
      btnCancel.onclick = cancelEditingRecipe;

      const btnValidate = document.createElement("button");
      styleBtnFullWidth(btnValidate, "✔️");
      btnValidate.onclick = commitEditingRecipe;

      actions.append(btnCancel, btnValidate);
      row.appendChild(actions);

      recipesList.appendChild(row);
    }

    applyDisabled();
  }

  btnAddRecipe.onclick = () => {
    startEditingRecipe(state.weatherRecipes.length);
  };

  recipesWrap.append(recipesHeader, recipesList);

  card.append(
    makeSection("Harvest mode", lockModeRow),
    makeSection("Filter by size", scaleRow),
    makeSection("Filter by color", colorsRow),
    makeSection("Filter by weather", weatherGrid),
    makeSection("Weather filter mode", weatherModeRow),
    makeSection("Weather recipes", recipesWrap),
  );

  const refresh = () => {
    updateLockModeUI();
    scaleSlider.setValues(state.minScalePct, state.maxScalePct);
    minSlider.value = String(state.minScalePct);
    maxSlider.value = String(state.maxScalePct);
    applyScaleRange(false);
    applyScaleMinimum(false);
    applyScaleMaximum(false);
    applyScaleMode(state.scaleLockMode, false);

    updateColorButtons();

    weatherToggles.forEach(toggle => toggle.setChecked(state.weatherSelected.has(toggle.key)));

    radioAny.input.checked = state.weatherMode === "ANY";
    radioAll.input.checked = state.weatherMode === "ALL";
    radioRecipes.input.checked = state.weatherMode === "RECIPES";
    recipesWrap.style.display = state.weatherMode === "RECIPES" ? "" : "none";

    updateWeatherMutationsDisabled();

    repaintRecipes();
  };

  const setDisabled = (value: boolean) => {
    card.dataset.disabled = value ? "1" : "0";
    applyDisabled();
  };

  refresh();

  return { root: card, refresh, setDisabled };
}

type LockerTabRenderer = {
  render(view: HTMLElement): void;
  destroy: () => void;
};

function createRestrictionsTabRenderer(ui: Menu): LockerTabRenderer {
  let state = lockerRestrictionsService.getState();
  let bonusFromMultiplier: number | null = null;
  let bonusFromPlayers: number | null = friendBonusPercentFromPlayers(1);
  let eggOptions: Array<{ id: string; name: string }> = [];
  const disposables: Array<() => void> = [];
  let subsAttached = false;

  const clampPercent = (value: number) =>
    Math.max(0, Math.min(FRIEND_BONUS_MAX, Math.round(value / FRIEND_BONUS_STEP) * FRIEND_BONUS_STEP));

  const resolveCurrentBonus = (): number | null =>
    bonusFromMultiplier ?? bonusFromPlayers ?? 0;

  const layout = applyStyles(document.createElement("div"), {
    display: "grid",
    gap: "12px",
    justifyItems: "center",
    width: "100%",
    maxWidth: "1100px",
  });

  const card = ui.card("Friend bonus locker", {
    align: "stretch",
  });
  card.root.style.width = "100%";
  card.header.style.display = "flex";
  card.header.style.alignItems = "center";
  card.header.style.justifyContent = "space-between";

  const sliderWrap = applyStyles(document.createElement("div"), {
    display: "grid",
    gap: "6px",
  });

  const sliderHeader = ui.flexRow({ justify: "between", align: "center", fullWidth: true });
  const sliderTitle = document.createElement("div");
  sliderTitle.textContent = "Minimum friend bonus required‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ‎ ";
  sliderTitle.style.fontWeight = "600";
  const sliderValue = applyStyles(document.createElement("div"), {
    fontWeight: "700",
    color: "#ff7a1f",
    textShadow: "0 1px 1px rgba(0, 0, 0, 0.5)",
  });
  sliderHeader.append(sliderTitle, sliderValue);

  const initialRequiredPct = friendBonusPercentFromPlayers(state.minRequiredPlayers) ?? 0;
  const slider = ui.slider(0, FRIEND_BONUS_MAX, FRIEND_BONUS_STEP, initialRequiredPct);
  slider.style.width = "100%";

  sliderWrap.append(sliderHeader, slider);

  const statusBadge = applyStyles(document.createElement("div"), {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "4px 10px",
    borderRadius: "999px",
    fontWeight: "700",
    fontSize: "12px",
    letterSpacing: "0.25px",
  });
  statusBadge.style.marginLeft = "auto";
  card.header.appendChild(statusBadge);

  const statusText = applyStyles(document.createElement("div"), {
    fontSize: "12.5px",
    lineHeight: "1.5",
    opacity: "0.92",
  });

  card.body.append(sliderWrap, statusText);
  layout.append(card.root);

  /* Decor picker locker */
  const decorCard = ui.card("Decor pick locker", { align: "stretch" });
  decorCard.root.style.width = "100%";

  const decorRow = applyStyles(document.createElement("div"), {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
  });

  const decorText = applyStyles(document.createElement("div"), {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  });
  const decorSubtitle = document.createElement("div");
  decorSubtitle.textContent = "Prevents placed decors from being picked up";
  decorSubtitle.style.fontSize = "12.5px";
  decorSubtitle.style.opacity = "0.85";
  decorText.append(decorSubtitle);

  const decorToggle = ui.switch(state.decorPickupLocked);
  decorToggle.addEventListener("change", () => {
    const locked = !!decorToggle.checked;
    state.decorPickupLocked = locked;
    lockerRestrictionsService.setDecorPickupLocked(locked);
  });

  decorRow.append(decorText, decorToggle);
  decorCard.body.append(decorRow);
  layout.append(decorCard.root);

  /* Egg hatch locker */
  const eggCard = ui.card("Egg hatch locker", { align: "stretch" });
  eggCard.root.style.width = "100%";
  const eggList = applyStyles(document.createElement("div"), {
    display: "grid",
    gap: "8px",
    width: "100%",
  });
  eggCard.body.append(eggList);
  layout.append(eggCard.root);

  /* Sell all pets protections */
  const sellPetsCard = ui.card("Sell all pets protections", { align: "stretch" });
  sellPetsCard.root.style.width = "100%";

  const sellPetsIntro = document.createElement("div");
  sellPetsIntro.textContent = "Show a confirmation modal when protected pets are detected.";
  sellPetsIntro.style.fontSize = "12.5px";
  sellPetsIntro.style.opacity = "0.8";

  const sellPetsGrid = applyStyles(document.createElement("div"), {
    display: "grid",
    gap: "10px",
    marginTop: "6px",
  });

  const createRuleRow = (title: string, subtitle?: string) => {
    const row = applyStyles(document.createElement("div"), {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: "12px",
      padding: "8px 10px",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: "10px",
      background: "rgba(255,255,255,0.02)",
    });
    const text = applyStyles(document.createElement("div"), {
      display: "grid",
      gap: "2px",
    });
    const titleEl = document.createElement("div");
    titleEl.textContent = title;
    titleEl.style.fontWeight = "600";
    titleEl.style.fontSize = "13px";
    text.appendChild(titleEl);
    if (subtitle) {
      const sub = document.createElement("div");
      sub.textContent = subtitle;
      sub.style.fontSize = "12px";
      sub.style.opacity = "0.75";
      text.appendChild(sub);
    }
    const controls = applyStyles(document.createElement("div"), {
      display: "flex",
      alignItems: "center",
      gap: "8px",
    });
    row.append(text, controls);
    return { row, controls };
  };

  const sellRulesInitial = lockerRestrictionsService.getSellAllPetsRules();
  const sellEnableToggle = ui.switch(sellRulesInitial.enabled);
  const sellEnableRow = createRuleRow("Enable protection rules");
  sellEnableRow.controls.append(sellEnableToggle);

  const sellGoldToggle = ui.switch(sellRulesInitial.protectGold);
  const sellGoldRow = createRuleRow("Protect Gold mutation");
  sellGoldRow.controls.append(sellGoldToggle);

  const sellRainbowToggle = ui.switch(sellRulesInitial.protectRainbow);
  const sellRainbowRow = createRuleRow("Protect Rainbow mutation");
  sellRainbowRow.controls.append(sellRainbowToggle);

  const sellMaxStrToggle = ui.switch(sellRulesInitial.protectMaxStr);
  const sellMaxStrInput = ui.inputNumber(0, 100, 1, sellRulesInitial.maxStrThreshold);
  const sellMaxStrWrap = (sellMaxStrInput as any).wrap as HTMLElement;
  const sellMaxStrRow = createRuleRow("Protect pets with Max STR");
  sellMaxStrRow.controls.append(sellMaxStrToggle, sellMaxStrWrap);

  /* Rarity protection row */
  const SELL_ALL_RARITIES = ["Common", "Uncommon", "Rare", "Legendary", "Mythical", "Divine", "Celestial"];

  const rarityRow = applyStyles(document.createElement("div"), {
    padding: "8px 10px",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.02)",
    display: "grid",
    gap: "8px",
  });

  const rarityRowHeader = applyStyles(document.createElement("div"), {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  });

  const rarityRowTitle = applyStyles(document.createElement("div"), {
    fontWeight: "600",
    fontSize: "13px",
  });
  rarityRowTitle.textContent = "Protect by rarity";

  const rarityAddBtn = applyStyles(document.createElement("button"), {
    border: "1px solid rgba(255,255,255,0.25)",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    fontSize: "16px",
    lineHeight: "1",
    padding: "2px 8px",
    cursor: "pointer",
    fontWeight: "700",
  });
  rarityAddBtn.type = "button";
  rarityAddBtn.textContent = "+";

  rarityRowHeader.append(rarityRowTitle, rarityAddBtn);

  const raritySelectedArea = applyStyles(document.createElement("div"), {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
  });

  const rarityPickerArea = applyStyles(document.createElement("div"), {
    display: "none",
    flexWrap: "wrap",
    gap: "6px",
    alignItems: "center",
    padding: "8px",
    background: "rgba(0,0,0,0.25)",
    borderRadius: "8px",
  });

  rarityRow.append(rarityRowHeader, raritySelectedArea, rarityPickerArea);

  let rarityPickerOpen = false;

  const refreshRarityRow = () => {
    const rules = lockerRestrictionsService.getSellAllPetsRules();
    const selected = Array.isArray(rules.protectedRarities) ? rules.protectedRarities : [];
    const enabled = rules.enabled !== false;
    const selectedSet = new Set(selected);

    raritySelectedArea.innerHTML = "";
    if (selected.length === 0) {
      const none = applyStyles(document.createElement("span"), {
        fontSize: "12px",
        opacity: "0.5",
      });
      none.textContent = "No rarities protected";
      raritySelectedArea.appendChild(none);
    } else {
      for (const r of selected) {
        const wrap = applyStyles(document.createElement("div"), {
          display: "inline-flex",
          alignItems: "center",
          gap: "3px",
        });
        const badge = rarityBadge(r);
        badge.style.margin = "0";

        const xBtn = applyStyles(document.createElement("button"), {
          background: "none",
          border: "none",
          color: "rgba(255,255,255,0.6)",
          fontSize: "14px",
          cursor: "pointer",
          padding: "0 2px",
          lineHeight: "1",
        });
        xBtn.type = "button";
        xBtn.textContent = "×";
        xBtn.addEventListener("click", () => {
          const current = lockerRestrictionsService.getSellAllPetsRules().protectedRarities ?? [];
          lockerRestrictionsService.setSellAllPetsRules({
            protectedRarities: current.filter(x => x !== r),
          });
          refreshRarityRow();
        });

        wrap.append(badge, xBtn);
        raritySelectedArea.appendChild(wrap);
      }
    }

    rarityPickerArea.innerHTML = "";
    const remaining = SELL_ALL_RARITIES.filter(r => !selectedSet.has(r));
    if (rarityPickerOpen && remaining.length > 0) {
      rarityPickerArea.style.display = "flex";
      for (const r of remaining) {
        const badge = rarityBadge(r);
        badge.style.margin = "0";
        badge.style.cursor = "pointer";
        badge.addEventListener("click", () => {
          const current = lockerRestrictionsService.getSellAllPetsRules().protectedRarities ?? [];
          lockerRestrictionsService.setSellAllPetsRules({
            protectedRarities: [...current, r],
          });
          refreshRarityRow();
        });
        rarityPickerArea.appendChild(badge);
      }
    } else {
      rarityPickerArea.style.display = "none";
      if (remaining.length === 0) rarityPickerOpen = false;
    }

    rarityAddBtn.textContent = rarityPickerOpen ? "×" : "+";

    rarityRow.style.opacity = enabled ? "1" : "0.6";
    rarityRow.style.pointerEvents = enabled ? "auto" : "none";
  };

  let rarityPickerOutsideHandler: ((ev: MouseEvent) => void) | null = null;

  rarityAddBtn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    rarityPickerOpen = !rarityPickerOpen;
    refreshRarityRow();

    if (rarityPickerOpen) {
      rarityPickerOutsideHandler = (ev: MouseEvent) => {
        if (!rarityRow.contains(ev.target as Node)) {
          rarityPickerOpen = false;
          refreshRarityRow();
          document.removeEventListener("click", rarityPickerOutsideHandler!, true);
          rarityPickerOutsideHandler = null;
        }
      };
      document.addEventListener("click", rarityPickerOutsideHandler, true);
    } else if (rarityPickerOutsideHandler) {
      document.removeEventListener("click", rarityPickerOutsideHandler, true);
      rarityPickerOutsideHandler = null;
    }
  });

  refreshRarityRow();

  sellPetsGrid.append(sellEnableRow.row, sellGoldRow.row, sellRainbowRow.row, sellMaxStrRow.row, rarityRow);
  sellPetsCard.body.append(sellPetsIntro, sellPetsGrid);
  layout.append(sellPetsCard.root);

  const LOCKED_ICON = "🔒";
  const UNLOCKED_ICON = "🔓";
  const eggRowCache = new Map<
    string,
    {
      row: HTMLDivElement;
      toggle: HTMLButtonElement;
      name: HTMLDivElement;
    }
  >();
  const emptyEggPlaceholder = applyStyles(document.createElement("div"), {
    opacity: "0.7",
    fontSize: "12px",
  });
  emptyEggPlaceholder.textContent = "No eggs available.";

  const updateEggToggleAppearance = (toggle: HTMLButtonElement, locked: boolean): void => {
    toggle.textContent = locked ? LOCKED_ICON : UNLOCKED_ICON;
    toggle.style.background = locked ? "rgba(239,68,68,0.15)" : "rgba(16,185,129,0.15)";
    toggle.style.color = locked ? "#fca5a5" : "#9ef7c3";
  };

  let renderEggList: () => void;

  const createEggRow = (opt: { id: string; name: string }): {
    row: HTMLDivElement;
    toggle: HTMLButtonElement;
    name: HTMLDivElement;
  } => {
    const row = applyStyles(document.createElement("div"), {
      display: "grid",
      gridTemplateColumns: "auto auto 1fr",
      alignItems: "center",
      gap: "10px",
      padding: "8px 10px",
      border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: "10px",
      background: "rgba(255,255,255,0.02)",
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.style.border = "1px solid rgba(255,255,255,0.10)";
    toggle.style.borderRadius = "10px";
    toggle.style.padding = "6px 10px";
    toggle.style.fontSize = "14px";
    toggle.style.fontWeight = "700";
    toggle.addEventListener("click", () => {
      const next = !Boolean(state.eggLocks?.[opt.id]);
      state.eggLocks = { ...(state.eggLocks || {}), [opt.id]: next };
      lockerRestrictionsService.setEggLock(opt.id, next);
      renderEggList();
    });

    const name = document.createElement("div");
    name.style.fontWeight = "600";
    name.style.color = "#e7eef7";
    const icon = createEggIcon(opt.id, opt.name, 32);
    row.append(toggle, icon, name);

    return { row, toggle, name };
  };

  renderEggList = () => {
    eggList.innerHTML = "";
    if (!eggOptions.length) {
      eggList.appendChild(emptyEggPlaceholder);
      return;
    }

    const fragment = document.createDocumentFragment();
    const seen = new Set<string>();
    eggOptions.forEach(opt => {
      const id = opt.id;
      seen.add(id);
      let entry = eggRowCache.get(id);
      if (!entry) {
        entry = createEggRow(opt);
        eggRowCache.set(id, entry);
      }
      entry.name.textContent = opt.name || id;
      const locked = !!state.eggLocks?.[id];
      updateEggToggleAppearance(entry.toggle, locked);
      fragment.appendChild(entry.row);
    });

    for (const id of Array.from(eggRowCache.keys())) {
      if (seen.has(id)) continue;
      const entry = eggRowCache.get(id);
      if (entry) {
        entry.row.remove();
      }
      eggRowCache.delete(id);
    }

    eggList.appendChild(fragment);
  };

  const updateSliderValue = (pct: number) => {
    slider.value = String(pct);
    sliderValue.textContent = `+${pct}%`;
  };

  const clampMaxStr = (value: number) => {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
  };

  const setRuleRowDisabled = (row: HTMLElement, disabled: boolean) => {
    row.style.opacity = disabled ? "0.6" : "1";
  };

  const refreshSellAllPetsControls = () => {
    const rules = lockerRestrictionsService.getSellAllPetsRules();
    const enabled = rules.enabled !== false;
    const protectGold = rules.protectGold !== false;
    const protectRainbow = rules.protectRainbow !== false;
    const protectMaxStr = rules.protectMaxStr !== false;

    setCheck(sellEnableToggle, enabled);
    setCheck(sellGoldToggle, protectGold);
    setCheck(sellRainbowToggle, protectRainbow);
    setCheck(sellMaxStrToggle, protectMaxStr);
    sellMaxStrInput.value = String(clampMaxStr(rules.maxStrThreshold));

    sellGoldToggle.disabled = !enabled;
    sellRainbowToggle.disabled = !enabled;
    sellMaxStrToggle.disabled = !enabled;

    const maxStrDisabled = !enabled || !protectMaxStr;
    sellMaxStrInput.disabled = maxStrDisabled;
    sellMaxStrWrap.style.opacity = maxStrDisabled ? "0.6" : "1";
    sellMaxStrWrap.style.pointerEvents = maxStrDisabled ? "none" : "auto";

    setRuleRowDisabled(sellGoldRow.row, !enabled);
    setRuleRowDisabled(sellRainbowRow.row, !enabled);
    setRuleRowDisabled(sellMaxStrRow.row, !enabled);
    refreshRarityRow();
  };

  const setStatusTone = (tone: "success" | "warn" | "info") => {
    const palette =
      tone === "success"
        ? { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.35)", color: "#9ef7c3" }
        : tone === "warn"
          ? { bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.35)", color: "#fca5a5" }
          : { bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.35)", color: "#a5c7ff" };
    statusBadge.style.background = palette.bg;
    statusBadge.style.border = `1px solid ${palette.border}`;
    statusBadge.style.color = palette.color;
  };

  const updateStatus = () => {
    const requiredPct = clampPercent(friendBonusPercentFromPlayers(state.minRequiredPlayers) ?? 0);
    const currentPct = resolveCurrentBonus();
    const requiredPlayers = state.minRequiredPlayers;
    const currentPlayers = currentPct != null ? percentToRequiredFriendCount(currentPct) : null;
    const allowed = requiredPct <= 0 || (currentPct != null && currentPct + 0.0001 >= requiredPct);

    if (requiredPct <= 0) {
      statusBadge.textContent = "Unlocked";
      setStatusTone("info");
      statusText.textContent = currentPct != null
        ? `Current friend bonus: ${currentPct}% (${currentPlayers} players).`
        : "Current friend bonus not detected yet.";
      return;
    }

    statusBadge.textContent = allowed ? "Sale allowed" : "Sale locked";
    setStatusTone(allowed ? "success" : "warn");
    statusText.textContent = allowed
      ? `Current bonus ${currentPct}% (${currentPlayers} players) meets the requirement (${requiredPct}%).`
      : `Requires ${requiredPct}% (${requiredPlayers} players) or more`;
  };

  const handleSliderInput = (commit: boolean) => {
    const raw = Number(slider.value);
    const pct = clampPercent(Number.isFinite(raw) ? raw : 0);
    updateSliderValue(pct);
    state.minRequiredPlayers = percentToRequiredFriendCount(pct);
    updateStatus();
    if (commit) {
      lockerRestrictionsService.setMinRequiredPlayers(state.minRequiredPlayers);
    }
  };

  slider.addEventListener("input", () => handleSliderInput(false));
  slider.addEventListener("change", () => handleSliderInput(true));

  sellEnableToggle.addEventListener("change", () => {
    const enabled = !!sellEnableToggle.checked;
    lockerRestrictionsService.setSellAllPetsRules({ enabled });
    refreshSellAllPetsControls();
  });

  sellGoldToggle.addEventListener("change", () => {
    lockerRestrictionsService.setSellAllPetsRules({ protectGold: !!sellGoldToggle.checked });
  });

  sellRainbowToggle.addEventListener("change", () => {
    lockerRestrictionsService.setSellAllPetsRules({ protectRainbow: !!sellRainbowToggle.checked });
  });

  sellMaxStrToggle.addEventListener("change", () => {
    lockerRestrictionsService.setSellAllPetsRules({ protectMaxStr: !!sellMaxStrToggle.checked });
    refreshSellAllPetsControls();
  });

  sellMaxStrInput.addEventListener("change", () => {
    const next = clampMaxStr(Number(sellMaxStrInput.value));
    sellMaxStrInput.value = String(next);
    lockerRestrictionsService.setSellAllPetsRules({ maxStrThreshold: next });
  });

  const syncFromService = (next: typeof state) => {
    state = { ...next };
    setCheck(decorToggle, state.decorPickupLocked);
    updateSliderValue(friendBonusPercentFromPlayers(state.minRequiredPlayers) ?? 0);
    updateStatus();
    renderEggList();
    refreshSellAllPetsControls();
  };

  const attachSubscriptions = async () => {
    if (subsAttached) return;
    subsAttached = true;
    try {
      const initialBonus = await Atoms.server.friendBonusMultiplier.get();
      bonusFromMultiplier = friendBonusPercentFromMultiplier(initialBonus);
    } catch {}
    try {
      const unsub = await Atoms.server.friendBonusMultiplier.onChange(next => {
        bonusFromMultiplier = friendBonusPercentFromMultiplier(next);
        updateStatus();
      });
      if (typeof unsub === "function") disposables.push(unsub);
    } catch {}

    try {
      const initialPlayers = await Atoms.server.numPlayers.get();
      bonusFromPlayers = friendBonusPercentFromPlayers(initialPlayers);
    } catch {}
    try {
      const unsubPlayers = await Atoms.server.numPlayers.onChange(next => {
        bonusFromPlayers = friendBonusPercentFromPlayers(next);
        updateStatus();
      });
      if (typeof unsubPlayers === "function") disposables.push(unsubPlayers);
    } catch {}

    const unsubService = lockerRestrictionsService.subscribe(syncFromService);
    disposables.push(unsubService);

    eggOptions = extractEggOptionsFromCatalog();
    try {
      const initialEggShop = await Atoms.shop.eggShop.get();
      eggOptions = mergeEggOptions(eggOptions, extractEggOptions(initialEggShop));
    } catch {}
    renderEggList();
    try {
      const unsubEggShop = await Atoms.shop.eggShop.onChange((next) => {
        eggOptions = mergeEggOptions(extractEggOptionsFromCatalog(), extractEggOptions(next));
        renderEggList();
      });
      if (typeof unsubEggShop === "function") disposables.push(unsubEggShop);
    } catch {}
  };

  const render = (view: HTMLElement) => {
    view.innerHTML = "";
    view.style.maxHeight = "54vh";
    view.style.overflow = "auto";
    view.append(layout);
    syncFromService(lockerRestrictionsService.getState());
    updateStatus();
    void attachSubscriptions();
  };

  const destroy = () => {
    while (disposables.length) {
      const dispose = disposables.pop();
      try {
        dispose?.();
      } catch {
        /* ignore */
      }
    }
  };

  return { render, destroy };
}

type EggOption = { id: string; name: string };

function extractEggOptions(raw: any): EggOption[] {
  const seen = new Set<string>();
  const options: EggOption[] = [];

  const add = (id: unknown, name?: unknown) => {
    if (typeof id !== "string" || !id) return;
    if (seen.has(id)) return;
    seen.add(id);
    const label =
      (typeof name === "string" && name) ||
      (typeof (raw?.names?.[id]) === "string" && raw.names[id]) ||
      id;
    options.push({ id, name: label });
  };

  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const candidate = (node as any).eggId ?? (node as any).id ?? null;
    add(candidate, (node as any).name);
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") walk(value);
    }
  };

  walk(raw);
  return options;
}

function extractEggOptionsFromCatalog(): EggOption[] {
  const options: EggOption[] = [];
  const seen = new Set<string>();
  for (const [id, raw] of Object.entries(eggCatalog as Record<string, any>)) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const name = (typeof raw?.name === "string" && raw.name) || id;
    options.push({ id, name });
  }
  return options;
}

function mergeEggOptions(base: EggOption[], extra: EggOption[]): EggOption[] {
  const seen = new Set(base.map(o => o.id));
  const result = [...base];
  for (const opt of extra) {
    if (seen.has(opt.id)) continue;
    seen.add(opt.id);
    result.push(opt);
  }
  return result;
}

function createGeneralTabRenderer(ui: Menu, store: LockerMenuStore): LockerTabRenderer {
  const viewRoot = applyStyles(document.createElement("div"), {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    alignItems: "center",
    width: "100%",
  });
  const layout = applyStyles(document.createElement("div"), {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    alignItems: "center",
    width: "100%",
  });

  const header = applyStyles(document.createElement("div"), {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    justifyContent: "space-between",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "10px",
    padding: "12px 16px",
    background: "rgba(255,255,255,0.04)",
    boxShadow: "none",
    width: "min(760px, 100%)",
  });

  const textWrap = applyStyles(document.createElement("div"), {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  });

  const title = document.createElement("div");
  title.textContent = "Global locker";
  title.style.fontWeight = "600";
  title.style.fontSize = "15px";

  const subtitle = document.createElement("div");
  subtitle.textContent = "Set the rules for locking or allowing harvests using the filters below";
  subtitle.style.opacity = "0.8";
  subtitle.style.fontSize = "12px";

  textWrap.append(title, subtitle);

  const toggleWrap = applyStyles(document.createElement("label"), {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  });

  const toggleLabel = ui.label("Enabled");
  toggleLabel.style.margin = "0";
  const toggle = ui.switch(store.global.enabled);
  toggleWrap.append(toggleLabel, toggle);

  header.append(textWrap, toggleWrap);

  const form = createLockerSettingsCard(ui, store.global.settings, {
    onChange: () => store.notifyGlobalSettingsChanged(),
  });

  layout.append(header, form.root);
  viewRoot.append(layout);

  const update = () => {
    setCheck(toggle, store.global.enabled);
    form.setDisabled(!store.global.enabled);
    form.refresh();
  };

  toggle.addEventListener("change", () => {
    store.setGlobalEnabled(!!toggle.checked);
  });

  const unsubscribe = store.subscribe(() => {
    update();
  });

  update();

  const render = (view: HTMLElement) => {
    view.innerHTML = "";
    view.style.maxHeight = "54vh";
    view.style.overflow = "auto";
    view.append(viewRoot);
    update();
  };

  return {
    render,
    destroy: () => unsubscribe(),
  };
}

function createOverridesTabRenderer(ui: Menu, store: LockerMenuStore): LockerTabRenderer {
  const layout = applyStyles(document.createElement("div"), {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 280px) minmax(0, 1fr)",
    gap: "10px",
    alignItems: "stretch",
    height: "54vh",
    overflow: "hidden",
  });

  const left = applyStyles(document.createElement("div"), {
    display: "grid",
    gridTemplateRows: "1fr",
    gap: "8px",
    minHeight: "0",
  });
  layout.appendChild(left);

  const list = applyStyles(document.createElement("div"), {
    display: "grid",
    gridTemplateColumns: "1fr",
    rowGap: "6px",
    overflow: "auto",
    paddingRight: "2px",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "10px",
    padding: "6px",
  });
  left.appendChild(list);

  const right = applyStyles(document.createElement("div"), {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    minHeight: "0",
  });
  layout.appendChild(right);

  const detail = applyStyles(document.createElement("div"), {
    display: "grid",
    gap: "12px",
    justifyItems: "center",
    alignContent: "start",
    height: "100%",
    overflow: "auto",
  });
  right.appendChild(detail);

  let selectedKey: string | null = null;
  let renderedDetailKey: string | null = null;
  const detailScrollMemory = new Map<string, { detail: number; card: number }>();
  const listButtons = new Map<
    string,
    { button: HTMLButtonElement; dot: HTMLSpanElement }
  >();

  const getClampedScrollTop = (element: HTMLElement): number => {
    const max = Math.max(0, element.scrollHeight - element.clientHeight);
    return Math.max(0, Math.min(element.scrollTop, max));
  };

  const restoreScrollTop = (element: HTMLElement, value: number): number => {
    const max = Math.max(0, element.scrollHeight - element.clientHeight);
    const target = Math.max(0, Math.min(value, max));
    element.scrollTop = target;
    return target;
  };

  const updateDetailScrollMemory = (key: string) => {
    const current = detailScrollMemory.get(key) ?? { detail: 0, card: 0 };
    current.detail = getClampedScrollTop(detail);
    const currentCard = detail.querySelector('[data-locker-settings-card="1"]') as HTMLElement | null;
    if (currentCard) {
      current.card = getClampedScrollTop(currentCard);
    }
    detailScrollMemory.set(key, current);
  };

  detail.addEventListener("scroll", () => {
    if (!renderedDetailKey) return;
    const memory = detailScrollMemory.get(renderedDetailKey) ?? { detail: 0, card: 0 };
    memory.detail = getClampedScrollTop(detail);
    detailScrollMemory.set(renderedDetailKey, memory);
  });

  const refreshListStyles = () => {
    listButtons.forEach(({ button, dot }, key) => {
      const isSelected = selectedKey === key;
      button.style.background = isSelected ? "rgba(94,234,212,0.15)" : "rgba(255,255,255,0.04)";
      dot.style.background = store.getOverride(key)?.enabled ? "#2ecc71" : "#e74c3c";
    });
  };

  const renderList = () => {
    const previousScrollTop = getClampedScrollTop(list);
    list.innerHTML = "";
    const seeds = getLockerSeedOptions();
    if (!seeds.length) {
      const empty = document.createElement("div");
      empty.textContent = "No crops available.";
      empty.style.opacity = "0.7";
      empty.style.fontSize = "12px";
      empty.style.textAlign = "center";
      empty.style.padding = "16px";
      list.appendChild(empty);
      restoreScrollTop(list, previousScrollTop);
      selectedKey = null;
      return;
    }

    if (selectedKey && !seeds.some(opt => opt.key === selectedKey)) {
      selectedKey = null;
    }

    listButtons.clear();
    const fragment = document.createDocumentFragment();
    seeds.forEach(opt => {
      const button = document.createElement("button");
      button.className = "qmm-vtab";
      button.style.display = "grid";
      button.style.gridTemplateColumns = "16px 1fr auto";
      button.style.alignItems = "center";
      button.style.gap = "8px";
      button.style.textAlign = "left";
      button.style.padding = "6px 8px";
      button.style.borderRadius = "8px";
      button.style.border = "1px solid rgba(255,255,255,0.10)";
      button.style.background = selectedKey === opt.key ? "rgba(94,234,212,0.15)" : "rgba(255,255,255,0.04)";
      button.style.color = "#e7eef7";

      const dot = document.createElement("span");
      dot.className = "qmm-dot";
      dot.style.background = store.getOverride(opt.key)?.enabled ? "#2ecc71" : "#e74c3c";

      const label = document.createElement("span");
      label.className = "label";
      label.textContent = opt.cropName || opt.key;

      const icon = createSeedIcon(opt.key, { size: 24, spriteKey: opt.spriteKey });

      button.append(dot, label, icon);
      listButtons.set(opt.key, { button, dot });

      button.onmouseenter = () => (button.style.borderColor = "rgba(94,234,212,0.35)");
      button.onmouseleave = () => (button.style.borderColor = "rgba(255,255,255,0.10)");
      button.onclick = () => {
        if (selectedKey === opt.key) return;
        selectedKey = opt.key;
        refreshListStyles();
        renderDetail();
      };

      fragment.appendChild(button);
    });

    list.appendChild(fragment);
    refreshListStyles();
    restoreScrollTop(list, previousScrollTop);
  };

  const renderDetail = () => {
    if (renderedDetailKey) {
      updateDetailScrollMemory(renderedDetailKey);
    }

    detail.innerHTML = "";
    if (!selectedKey) {
      const empty = document.createElement("div");
      empty.textContent = "Select a crop on the left to customise its locker settings.";
      empty.style.opacity = "0.7";
      empty.style.fontSize = "13px";
      empty.style.textAlign = "center";
      empty.style.padding = "32px 24px";
      empty.style.border = "1px dashed rgba(255,255,255,0.12)";
      empty.style.borderRadius = "10px";
      empty.style.width = "min(760px, 100%)";
      detail.appendChild(empty);
      renderedDetailKey = null;
      return;
    }

    const seeds = getLockerSeedOptions();
    const seed = seeds.find(opt => opt.key === selectedKey);
    if (!seed) {
      selectedKey = null;
      renderedDetailKey = null;
      renderDetail();
      return;
    }

    const override = store.ensureOverride(selectedKey, { silent: true });

    const header = ui.flexRow({ justify: "between", align: "center", fullWidth: true });
    header.style.border = "1px solid rgba(255,255,255,0.10)";
    header.style.borderRadius = "10px";
    header.style.padding = "12px 16px";
    header.style.background = "rgba(255,255,255,0.04)";
    header.style.boxShadow = "none";
    header.style.width = "min(760px, 100%)";

    const titleWrap = ui.flexRow({ gap: 10, align: "center" });
    titleWrap.style.flexWrap = "nowrap";

    const title = document.createElement("div");
    title.textContent = seed.cropName || seed.key;
    title.style.fontWeight = "600";
    title.style.fontSize = "15px";

    const icon = createSeedIcon(seed.key, { size: 32, spriteKey: seed.spriteKey });
    titleWrap.append(icon, title);

    const toggleWrap = ui.flexRow({ gap: 8, align: "center" });
    toggleWrap.style.flexWrap = "nowrap";
    const toggleLabel = ui.label("Override");
    toggleLabel.style.margin = "0";
    const toggle = ui.switch(override.enabled);
    toggleWrap.append(toggleLabel, toggle);

    header.append(titleWrap, toggleWrap);

    const status = document.createElement("div");
    status.style.fontSize = "12px";
    status.style.opacity = "0.75";
    status.style.textAlign = "center";
    status.style.width = "min(760px, 100%)";

    const updateStatus = () => {
      status.textContent = override.enabled
        ? "This crop uses its own locker filters."
        : "Uses the global locker settings.";
    };

    const form = createLockerSettingsCard(ui, override.settings, {
      onChange: () => {
        if (selectedKey) {
          store.notifyOverrideSettingsChanged(selectedKey);
        }
      },
    });

    const applyEnabledState = () => {
      form.setDisabled(!override.enabled);
      form.refresh();
      updateStatus();
    };

    toggle.addEventListener("change", () => {
      if (!selectedKey) return;
      const wasEnabled = override.enabled;
      const nextEnabled = !!toggle.checked;
      if (nextEnabled && !wasEnabled && !override.hasPersistedSettings) {
        copySettings(override.settings, store.global.settings);
      }
      if (nextEnabled) {
        override.hasPersistedSettings = true;
      }
      store.setOverrideEnabled(selectedKey, nextEnabled);
    });

    applyEnabledState();

    detail.append(header, status, form.root);

    if (selectedKey) {
      const memory = detailScrollMemory.get(selectedKey) ?? { detail: 0, card: 0 };
      memory.detail = restoreScrollTop(detail, memory.detail);
      memory.card = restoreScrollTop(form.root, memory.card);
      detailScrollMemory.set(selectedKey, memory);

      const activeKey = selectedKey;
      form.root.addEventListener("scroll", () => {
        if (renderedDetailKey !== activeKey) return;
        const current = detailScrollMemory.get(activeKey) ?? { detail: getClampedScrollTop(detail), card: 0 };
        current.card = getClampedScrollTop(form.root);
        detailScrollMemory.set(activeKey, current);
      });
      renderedDetailKey = activeKey;
    }
  };

  renderList();
  renderDetail();

  const refresh = () => {
    refreshListStyles();
    renderDetail();
  };

  const unsubscribe = store.subscribe(refresh);

  const onDataUpdated = (e: Event) => {
    const key = (e as CustomEvent<{ key: string }>).detail?.key;
    if (key === "plants") renderList();
  };
  window.addEventListener("gemini:data-updated", onDataUpdated);

  const render = (view: HTMLElement) => {
    view.innerHTML = "";
    view.append(layout);
    refresh();
  };

  return {
    render,
    destroy: () => {
      unsubscribe();
      window.removeEventListener("gemini:data-updated", onDataUpdated);
    },
  };
}

export async function renderLockerMenu(container: HTMLElement) {
  const ui = new Menu({ id: "locker", compact: true });
  ui.mount(container);

  const store = new LockerMenuStore(lockerService.getState());
  const restrictionsTab = createRestrictionsTabRenderer(ui);
  const generalTab = createGeneralTabRenderer(ui, store);
  const overridesTab = createOverridesTabRenderer(ui, store);

  ui.addTabs([
    { id: "locker-general", title: "General", render: view => generalTab.render(view) },
    { id: "locker-overrides", title: "Overrides", render: view => overridesTab.render(view) },
    { id: "locker-restrictions", title: "Restrictions", render: view => restrictionsTab.render(view) },
  ]);

  ui.switchTo("locker-general");

  const disposables: Array<() => void> = [];
  disposables.push(lockerService.subscribe(event => store.syncFromService(event.state)));
  disposables.push(() => restrictionsTab.destroy());
  disposables.push(() => generalTab.destroy());
  disposables.push(() => overridesTab.destroy());

  const cleanup = () => {
    while (disposables.length) {
      const dispose = disposables.pop();
      try {
        dispose?.();
      } catch {
        /* ignore */
      }
    }
  };

  ui.on("unmounted", cleanup);
}
