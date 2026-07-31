// src/data/dynamic/logic/abilityColors.ts

import { captureState } from "../state";
import { ABILITY_COLOR_ANCHOR, MAX_COLOR_POLL_ATTEMPTS, COLOR_POLL_INTERVAL_MS } from "./constants";
import {
  fetchMainBundle,
  fetchQuinoaViewBundle,
  findAllIndices,
  extractBalancedBlock,
} from "./bundleParser";

export interface AbilityColor {
  bg: string;
  hover: string;
}

const DEFAULT_COLOR: AbilityColor = {
  bg: "rgba(100, 100, 100, 0.9)",
  hover: "rgba(150, 150, 150, 1)",
};

// Fallback color per ability id, sourced from https://mg-api.ariedam.fr/data/abilities
// (fetched 2026-07-31). Used when the bundle's own color switch doesn't cover
// an ability (e.g. rarer celestial abilities like DawnCapture aren't in
// whatever switch findAbilityColorSwitchBlock locates) — without this, those
// abilities fell straight to flat gray instead of their real color. Most
// values are hex; GoldGranter/RainbowGranter are linear-gradient strings and
// are used as-is (see resolveStaticColor below).
const STATIC_ABILITY_COLORS: Record<string, string> = {
  CoinFinderI: "#B49600", CoinFinderII: "#B49600", CoinFinderIII: "#B49600",
  SnowyCoinFinder: "#B49600", DawnCoinFinder: "#B49600", ThunderCoinFinder: "#B49600",
  SeedFinderI: "#A86626", SeedFinderII: "#A86626", SeedFinderIII: "#A86626", SeedFinderIV: "#A86626",
  PlantGrowthBoost: "#008080", PlantGrowthBoostII: "#008080", PlantGrowthBoostIII: "#969696",
  SnowyPlantGrowthBoost: "#008080", DawnPlantGrowthBoost: "#008080",
  AmberPlantGrowthBoost: "#008080", ThunderPlantGrowthBoost: "#008080",
  ProduceEater: "#FF4500",
  ProduceScaleBoost: "#228B22", ProduceScaleBoostII: "#228B22", ProduceScaleBoostIII: "#969696",
  SnowyCropSizeBoost: "#228B22",
  ProduceMutationBoost: "#8C0F46", ProduceMutationBoostII: "#8C0F46", ProduceMutationBoostIII: "#969696",
  SnowyCropMutationBoost: "#8C0F46", DawnBoost: "#8C0F46", AmberMoonBoost: "#8C0F46", ThunderBoost: "#8C0F46",
  EggGrowthBoost: "#B45AF0", EggGrowthBoostII_NEW: "#B45AF0", EggGrowthBoostII: "#B45AF0",
  SnowyEggGrowthBoost: "#B45AF0", ThunderEggGrowthBoost: "#B45AF0",
  PetXpBoost: "#1E90FF", PetXpBoostII: "#1E90FF", PetXpBoostIII: "#969696",
  SnowyPetXpBoost: "#1E90FF", DawnXpBoost: "#1E90FF", ThunderXpBoost: "#1E90FF",
  HungerBoost: "#FF1493", HungerBoostII: "#FF1493", HungerBoostIII: "#969696", SnowyHungerBoost: "#FF1493",
  HungerRestore: "#FF69B4", HungerRestoreII: "#FF69B4", HungerRestoreIII: "#969696", SnowyHungerRestore: "#FF69B4",
  PetMutationBoost: "#A03264", PetMutationBoostII: "#A03264", PetMutationBoostIII: "#969696",
  SellBoostI: "#DC143C", SellBoostII: "#DC143C", SellBoostIII: "#DC143C", SellBoostIV: "#DC143C",
  ProduceRefund: "#FF6347",
  DoubleHarvest: "#0078B4",
  PetAgeBoost: "#9370DB", PetAgeBoostII: "#9370DB", PetAgeBoostIII: "#969696",
  PetHatchSizeBoost: "#800080", PetHatchSizeBoostII: "#800080", PetHatchSizeBoostIII: "#969696",
  DoubleHatch: "#3C5AB4",
  PetRefund: "#005078", PetRefundII: "#005078",
  RainDance: "#4CCCCC",
  SnowGranter: "#90B8CC",
  FrostGranter: "#94A0CC",
  DawnlitGranter: "#C47CB4",
  AmberlitGranter: "#CC9060",
  GoldGranter: "linear-gradient(135deg, #DCC846 0%, #D2AF05 40%, #D2B937 70%, #C8AF1E 100%)",
  RainbowGranter: "linear-gradient(45deg, #C80000, #C87800, #A0AA1E, #3CAA3C, #32AAAA, #2896B4, #145AB4, #461E96)",
  DawnbinderBoost: "#B468A0",
  Copycat: "#FF8C00",
  DawnCapture: "#B25A9E",
  ThunderstruckGranter: "#C2B83C",
  Thundercharger: "#1FA382",
  MoonKisser: "#FAA623",
  DawnKisser: "#A25CF2",
  Thunderbloom: "#70F6CB",
};

function findAbilityColorSwitchBlock(bundleText: string): string | null {
  const indices = findAllIndices(bundleText, ABILITY_COLOR_ANCHOR);
  if (!indices.length) return null;

  for (const pos of indices) {
    const winStart = Math.max(0, pos - 4000);
    const winEnd = Math.min(bundleText.length, pos + 4000);
    const windowText = bundleText.slice(winStart, winEnd);

    const relSwitch = windowText.lastIndexOf("switch(");
    if (relSwitch === -1) continue;

    const absSwitch = winStart + relSwitch;
    const braceAfterSwitch = bundleText.indexOf("{", absSwitch);
    if (braceAfterSwitch === -1) continue;

    const block = extractBalancedBlock(bundleText, braceAfterSwitch);
    if (!block) continue;

    const hasObjectColors = block.includes('bg:"') || block.includes("bg:'");
    const hasHexColors = /return\s*[`'"](?:#|linear-gradient)/.test(block);
    if (block.includes(ABILITY_COLOR_ANCHOR) && (hasObjectColors || hasHexColors)) {
      return block;
    }
  }

  return null;
}

function parseAbilityColorsFromSwitch(switchBlock: string): Record<string, AbilityColor> | null {
  const colors: Record<string, AbilityColor> = {};
  const pending: string[] = [];
  const tokenRe = /case\s*(['"])([^'"]+)\1\s*:|default\s*:|return\s*\{/g;

  const findProp = (segment: string, prop: "bg" | "hover"): string | null => {
    const propRe = new RegExp(`${prop}\\s*:\\s*(['"])([\\s\\S]*?)\\1`);
    const propMatch = segment.match(propRe);
    return propMatch ? propMatch[2] : null;
  };

  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(switchBlock)) !== null) {
    if (match[2]) {
      pending.push(match[2]);
      continue;
    }

    const token = match[0];
    if (token.startsWith("default")) {
      pending.length = 0;
      continue;
    }

    if (!token.startsWith("return")) continue;

    const braceIndex = switchBlock.indexOf("{", match.index);
    if (braceIndex === -1) {
      pending.length = 0;
      continue;
    }

    const literal = extractBalancedBlock(switchBlock, braceIndex);
    if (!literal) {
      pending.length = 0;
      continue;
    }

    const bg = findProp(literal, "bg");
    if (!bg) {
      pending.length = 0;
      continue;
    }
    const hover = findProp(literal, "hover") || bg;

    for (const id of pending) {
      if (!colors[id]) colors[id] = { bg, hover };
    }
    pending.length = 0;
  }

  return Object.keys(colors).length ? colors : null;
}

function hexToRgba(hex: string, alpha: number): string | null {
  const match = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;
  let h = match[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Newer game versions replaced the `{bg, hover}` object switch with a switch
 * returning plain hex colors (or linear-gradient strings) per ability id.
 * Derive {bg, hover} from those: hex at 0.9 alpha for bg, opaque for hover.
 */
function parseAbilityColorsFromHexSwitch(switchBlock: string): Record<string, AbilityColor> | null {
  const colors: Record<string, AbilityColor> = {};
  const pending: string[] = [];
  const tokenRe = /case\s*([`'"])([^`'"]+)\1\s*:|default\s*:|return\s*([`'"])((?:#|linear-gradient)[^`'"]*)\3/g;

  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(switchBlock)) !== null) {
    if (match[2]) {
      pending.push(match[2]);
      continue;
    }

    if (match[0].startsWith("default")) {
      pending.length = 0;
      continue;
    }

    const value = match[4];
    if (!value) {
      pending.length = 0;
      continue;
    }

    const bg = value.startsWith("#") ? hexToRgba(value, 0.9) ?? value : value;
    const hover = value.startsWith("#") ? hexToRgba(value, 1) ?? value : value;
    for (const id of pending) {
      if (!colors[id]) colors[id] = { bg, hover };
    }
    pending.length = 0;
  }

  return Object.keys(colors).length ? colors : null;
}

async function loadAbilityColorsFromBundle(): Promise<Record<string, AbilityColor> | null> {
  // Legacy versions ship the color switch in the main bundle; newer ones
  // moved it (hex format) into the lazily-loaded QuinoaView chunk.
  for (const fetchBundle of [fetchMainBundle, fetchQuinoaViewBundle]) {
    const bundleText = await fetchBundle();
    if (!bundleText) continue;

    const switchBlock = findAbilityColorSwitchBlock(bundleText);
    if (!switchBlock) continue;

    const parsed =
      parseAbilityColorsFromSwitch(switchBlock) ?? parseAbilityColorsFromHexSwitch(switchBlock);
    if (parsed) return parsed;
  }

  return null;
}

function isAlreadyEnriched(abilities: Record<string, unknown>): boolean {
  const sample = abilities[ABILITY_COLOR_ANCHOR];
  return sample != null && typeof sample === "object" && "color" in sample;
}

// Hex → {bg, hover}; non-hex values (e.g. GoldGranter/RainbowGranter's
// linear-gradient strings) are already valid CSS and are used as-is.
function toAbilityColor(raw: string): AbilityColor {
  if (!raw.startsWith("#")) return { bg: raw, hover: raw };
  const bg = hexToRgba(raw, 0.9) ?? raw;
  return { bg, hover: hexToRgba(raw, 1) ?? bg };
}

// Abilities the bundle's color switch doesn't cover (e.g. rarer celestial
// abilities like DawnCapture live in a different code path than whatever
// switch findAbilityColorSwitchBlock locates) used to fall straight to flat
// gray DEFAULT_COLOR. Try the ability's own raw `color` field already
// sitting in the captured data first, then STATIC_ABILITY_COLORS (sourced
// from the API), before giving up and guessing gray.
function resolveFallbackColor(abilityId: string, abilityData: unknown): AbilityColor | null {
  const raw = (abilityData as { color?: unknown } | null)?.color;
  if (typeof raw === "string") return toAbilityColor(raw);

  const staticColor = STATIC_ABILITY_COLORS[abilityId];
  if (staticColor) return toAbilityColor(staticColor);

  return null;
}

async function enrichAbilitiesWithColors(): Promise<boolean> {
  if (!captureState.data.abilities) return false;

  const abilities = captureState.data.abilities as Record<string, unknown>;
  if (isAlreadyEnriched(abilities)) return true;

  const map = await loadAbilityColorsFromBundle();
  if (!map) return false;

  const enriched: Record<string, unknown> = {};
  for (const [abilityId, abilityData] of Object.entries(abilities)) {
    const colors = map[abilityId] || resolveFallbackColor(abilityId, abilityData) || DEFAULT_COLOR;
    enriched[abilityId] = {
      ...(abilityData as object),
      color: {
        bg: colors.bg,
        hover: colors.hover,
      },
    };
  }

  captureState.data.abilities = enriched;
  return true;
}

export function startColorPolling(): void {
  if (captureState.colorPollingTimer) return;
  captureState.colorPollAttempts = 0;

  const timer = setInterval(async () => {
    const success = await enrichAbilitiesWithColors();
    if (success || ++captureState.colorPollAttempts > MAX_COLOR_POLL_ATTEMPTS) {
      clearInterval(timer);
      captureState.colorPollingTimer = null;
    }
  }, COLOR_POLL_INTERVAL_MS);

  captureState.colorPollingTimer = timer;
}

export function stopColorPolling(): void {
  if (captureState.colorPollingTimer) {
    clearInterval(captureState.colorPollingTimer);
    captureState.colorPollingTimer = null;
  }
}
