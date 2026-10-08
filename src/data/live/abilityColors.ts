import { captureState } from "./state";
import {
  fetchMainBundle,
  fetchQuinoaViewBundle,
  findAllIndices,
  extractBalancedBlock,
} from "./bundleParser";

const MAX_COLOR_POLL_ATTEMPTS = 10;
const COLOR_POLL_INTERVAL_MS = 1000;
/** An ability every colour switch in the game bundle has handled so far. */
const ABILITY_COLOR_ANCHOR = "ProduceScaleBoost";

interface AbilityColor {
  bg: string;
  hover: string;
}

const DEFAULT_COLOR: AbilityColor = {
  bg: "rgba(100, 100, 100, 0.9)",
  hover: "rgba(150, 150, 150, 1)",
};

// Fallback colour per ability id, taken from https://mg-api.ariedam.fr/data/abilities
// on 2026-07-31, for an ability that comes without a colour and that the
// game bundle's colour switch does not cover either. Most values are hex;
// GoldGranter and RainbowGranter are linear-gradient strings, used as they are.
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

/** True once the colours are `{ bg, hover }` pairs, the shape the chips read. */
function isAlreadyEnriched(abilities: Record<string, unknown>): boolean {
  const color = (abilities[ABILITY_COLOR_ANCHOR] as { color?: { bg?: unknown } } | undefined)?.color;
  return typeof color?.bg === "string";
}

// Hex to {bg, hover}; non-hex values (GoldGranter and RainbowGranter's
// linear-gradient strings) are already valid CSS and are used as they are.
function toAbilityColor(raw: string): AbilityColor {
  if (!raw.startsWith("#")) return { bg: raw, hover: raw };
  const bg = hexToRgba(raw, 0.9) ?? raw;
  return { bg, hover: hexToRgba(raw, 1) ?? bg };
}

const colorOf = (abilityData: unknown): unknown => (abilityData as { color?: unknown } | null)?.color;

/**
 * Turns every ability's colour into the `{ bg, hover }` pair the chips read.
 * The live API gives each ability its colour as a hex string. The game
 * bundle's colour switch is only read for abilities that come without one,
 * then STATIC_ABILITY_COLORS, then grey.
 */
async function enrichAbilitiesWithColors(): Promise<boolean> {
  const abilities = captureState.data.abilities as Record<string, unknown> | null;
  if (!abilities) return false;
  if (isAlreadyEnriched(abilities)) return true;

  const needsBundle = Object.values(abilities).some((data) => typeof colorOf(data) !== "string");
  const bundleColors = needsBundle ? await loadAbilityColorsFromBundle() : {};
  if (!bundleColors) return false;

  const enriched: Record<string, unknown> = {};
  for (const [abilityId, abilityData] of Object.entries(abilities)) {
    const raw = colorOf(abilityData);
    const staticColor = STATIC_ABILITY_COLORS[abilityId];
    const color =
      (typeof raw === "string" ? toAbilityColor(raw) : null) ??
      bundleColors[abilityId] ??
      (staticColor ? toAbilityColor(staticColor) : DEFAULT_COLOR);
    enriched[abilityId] = { ...(abilityData as object), color: { bg: color.bg, hover: color.hover } };
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
