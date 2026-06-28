// src/utils/calculators.ts
import { plantCatalog, mutationCatalog } from "../data";

export type ColorMutation = "Gold" | "Rainbow";
export type WeatherMutation = "Wet" | "Chilled" | "Frozen" | "Thunderstruck" | "Thundercharged";
export type TimeMutation = "Dawnlit" | "Dawnbound" | "Amberlit" | "Amberbound";

export type MutationName =
  | ColorMutation
  | WeatherMutation
  | TimeMutation
  | (string & {});

export type InventoryProduce = {
  id: string;
  species: string;
  itemType: "Produce";
  scale: number;
  mutations?: MutationName[];
};

export type GardenPlantSlot = {
  species: string;
  startTime: number;
  endTime: number;
  targetScale: number;
  mutations?: MutationName[];
};

export type GardenPlant = {
  objectType: "plant";
  species: string;
  slots: GardenPlantSlot[];
  plantedAt?: number;
  maturedAt?: number;
};

export type RoundingMode = "round" | "floor" | "ceil" | "none";

export type PricingOptions = {
  getBasePrice?: (species: string) => number | undefined | null;
  scaleTransform?: (species: string, scale: number) => number;
  rounding?: RoundingMode;
  friendPlayers?: number;
};

const key = (s: unknown) => String(s ?? "").trim();
const lowerKey = (s: unknown) => key(s).toLowerCase();

function resolveSpeciesKey(species: string): string | null {
  const wanted = key(species).toLowerCase();
  if (!wanted) return null;
  for (const k of Object.keys(plantCatalog as Record<string, unknown>)) {
    if (k.toLowerCase() === wanted) return k;
  }
  return null;
}

function findAnySellPriceNode(obj: any): number | null {
  if (!obj || typeof obj !== "object") return null;
  if (typeof obj.baseSellPrice === "number" && Number.isFinite(obj.baseSellPrice)) {
    return obj.baseSellPrice;
  }
  for (const k of ["produce", "crop", "item", "items", "data"]) {
    if (obj[k]) {
      const v = findAnySellPriceNode(obj[k]);
      if (v != null) return v;
    }
  }
  try {
    const seen = new Set<any>();
    const stack = [obj];
    while (stack.length) {
      const cur = stack.pop()!;
      if (!cur || typeof cur !== "object" || seen.has(cur)) continue;
      seen.add(cur);
      if (typeof (cur as any).baseSellPrice === "number") {
        const v = (cur as any).baseSellPrice;
        if (Number.isFinite(v)) return v;
      }
      for (const v of Object.values(cur)) if (v && typeof v === "object") stack.push(v);
    }
  } catch {}
  return null;
}

function defaultGetBasePrice(species: string): number | null {
  const spKey = resolveSpeciesKey(species);
  if (!spKey) return null;
  const node: any = (plantCatalog as any)[spKey];
  const cands = [
    node?.produce?.baseSellPrice,
    node?.crop?.baseSellPrice,
    node?.item?.baseSellPrice,
    node?.items?.Produce?.baseSellPrice,
  ].filter((v) => typeof v === "number" && Number.isFinite(v)) as number[];
  if (cands.length) return cands[0];
  return findAnySellPriceNode(node);
}

function applyRounding(v: number, mode: RoundingMode = "round"): number {
  switch (mode) {
    case "floor": return Math.floor(v);
    case "ceil":  return Math.ceil(v);
    case "none":  return v;
    case "round":
    default:      return Math.round(v);
  }
}

function friendBonusMultiplier(playersInRoom?: number): number {
  if (!Number.isFinite(playersInRoom as number)) return 1;
  const n = Math.max(1, Math.min(6, Math.floor(playersInRoom as number)));
  return 1 + (n - 1) * 0.1;
}

const MUTATION_MULTIPLIER_BY_KEY: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  if (!mutationCatalog || typeof mutationCatalog !== "object") return map;
  for (const [rawKey, rawValue] of Object.entries(mutationCatalog as Record<string, any>)) {
    const mult = Number((rawValue as any)?.coinMultiplier);
    if (!Number.isFinite(mult)) continue;
    const name = key((rawValue as any)?.name);
    const lowerName = lowerKey(name);
    const lowerRawKey = lowerKey(rawKey);
    if (lowerName) map[lowerName] = mult;
    if (lowerRawKey) map[lowerRawKey] = mult;
  }
  return map;
})();

function mutationMultiplier(name: MutationName): number | null {
  const k = lowerKey(name);
  if (!k) return null;
  const mult = MUTATION_MULTIPLIER_BY_KEY[k];
  return Number.isFinite(mult) ? mult : null;
}

function isColor(m: MutationName): m is ColorMutation {
  return m === "Gold" || m === "Rainbow";
}
function isWeather(m: MutationName): m is WeatherMutation {
  return m === "Wet" || m === "Chilled" || m === "Frozen" || m === "Thunderstruck" || m === "Thundercharged";
}
function isTime(m: MutationName): m is TimeMutation {
  return m === "Dawnlit" || m === "Dawnbound" || m === "Amberlit" || m === "Amberbound";
}

function normalizeMutationName(m: MutationName): MutationName {
  const s = lowerKey(m);
  if (!s) return "" as MutationName;
  if (s === "amberglow" || s === "ambershine" || s === "amberlight") return "Amberlit";
  if (s === "dawn" || s === "dawnlight") return "Dawnlit";
  if (s === "golden") return "Gold";
  if (s === "gold") return "Gold";
  if (s === "rainbow") return "Rainbow";
  if (s === "wet") return "Wet";
  if (s === "chilled") return "Chilled";
  if (s === "frozen") return "Frozen";
  if (s === "thunderstruck" || s === "thunder") return "Thunderstruck";
  if (s === "thunderstruckground" || s === "thunderstruck_ground") return "Thunderstruck";
  if (s === "thundercharged" || s === "thunder charged" || s === "thunder-charged") return "Thundercharged";
  if (s === "dawnlit") return "Dawnlit";
  if (s === "dawnbound") return "Dawnbound";
  if (s === "amberlit") return "Amberlit";
  if (s === "dawncharged" || s === "dawnradiant" || s === "dawn-radiant" || s === "dawn charged") return "Dawnbound";
  if (s === "amberbound" ||  s === "ambercharged" || s === "amberradiant" || s === "amber-radiant" || s === "amber charged") return "Amberbound";

  return m;
}

function computeColorMultiplier(mutations?: MutationName[] | null): number {
  if (!Array.isArray(mutations)) return 1;
  let best = 1;
  for (const raw of mutations) {
    const m = normalizeMutationName(raw);
    if (isColor(m)) {
      const mult = mutationMultiplier(m);
      if (typeof mult === "number" && mult > best) best = mult;
    }
  }
  return best;
}

function pickWeather(mutations?: MutationName[] | null): WeatherMutation | null {
  if (!Array.isArray(mutations)) return null;
  const candidates = new Set<WeatherMutation>();
  let hasWet = false;
  let hasChilled = false;
  for (const raw of mutations) {
    const m = normalizeMutationName(raw);
    if (m === "Wet") { hasWet = true; continue; }
    if (m === "Chilled") { hasChilled = true; continue; }
    if (isWeather(m)) candidates.add(m);
  }
  if (hasWet && hasChilled) {
    candidates.add("Frozen");
  } else if (hasWet) {
    candidates.add("Wet");
  } else if (hasChilled) {
    candidates.add("Chilled");
  }
  if (!candidates.size) return null;
  let pick: WeatherMutation | null = null;
  let best = -Infinity;
  for (const cand of candidates) {
    const mult = mutationMultiplier(cand) ?? 1;
    if (mult > best) {
      best = mult;
      pick = cand;
    }
  }
  return pick;
}

function pickTime(mutations?: MutationName[] | null): TimeMutation | null {
  if (!Array.isArray(mutations)) return null;
  const candidates = new Set<TimeMutation>();
  for (const raw of mutations) {
    const m = normalizeMutationName(raw);
    if (isTime(m)) candidates.add(m);
  }
  if (!candidates.size) return null;
  let pick: TimeMutation | null = null;
  let best = -Infinity;
  for (const cand of candidates) {
    const mult = mutationMultiplier(cand) ?? 1;
    if (mult > best) {
      best = mult;
      pick = cand;
    }
  }
  return pick;
}

function combineWeatherMultipliers(multipliers: number[]): number {
  if (!multipliers.length) return 1;
  const sum = multipliers.reduce((acc, value) => acc + value, 0);
  return sum - multipliers.length + 1;
}

function computeWeatherTimeMultiplier(
  weather: WeatherMutation | null,
  time: TimeMutation | null
): number {
  if (!weather && !time) return 1;
  const multipliers: number[] = [];
  if (weather) {
    const mult = mutationMultiplier(weather);
    if (typeof mult === "number") multipliers.push(mult);
  }
  if (time) {
    const mult = mutationMultiplier(time);
    if (typeof mult === "number") multipliers.push(mult);
  }
  if (!multipliers.length) return 1;
  return combineWeatherMultipliers(multipliers);
}

export function mutationsMultiplier(mutations?: MutationName[] | null): number {
  const color = computeColorMultiplier(mutations);
  const weather = pickWeather(mutations);
  const time = pickTime(mutations);
  const wt = computeWeatherTimeMultiplier(weather, time);
  return color * wt;
}

export function estimateProduceValue(
  species: string,
  scale: number,
  mutations?: MutationName[] | null,
  opts?: PricingOptions
): number {
  const getBase = opts?.getBasePrice ?? defaultGetBasePrice;
  const sXform = opts?.scaleTransform ?? ((_: string, s: number) => s);
  const round = opts?.rounding ?? "round";
  const base = getBase(species);
  if (!(Number.isFinite(base as number) && (base as number) > 0)) return 0;
  const sc = Number(scale);
  if (!Number.isFinite(sc) || sc <= 0) return 0;
  const effScale = sXform(species, sc);
  if (!Number.isFinite(effScale) || effScale <= 0) return 0;
  const mutMult = mutationsMultiplier(mutations);
  const friendsMult = friendBonusMultiplier(opts?.friendPlayers);
  const pre = (base as number) * effScale * mutMult * friendsMult;
  const out = Math.max(0, applyRounding(pre, round));
  return out;
}

export function valueFromInventoryProduce(
  item: InventoryProduce,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!item || item.itemType !== "Produce") return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  return estimateProduceValue(item.species, item.scale, item.mutations, merged);
}

export function valueFromGardenSlot(
  slot: GardenPlantSlot,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!slot) return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  return estimateProduceValue(slot.species, slot.targetScale, slot.mutations, merged);
}

export function valueFromGardenPlant(
  plant: GardenPlant,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!plant || plant.objectType !== "plant" || !Array.isArray(plant.slots)) return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  let sum = 0;
  for (const s of plant.slots) sum += valueFromGardenSlot(s, merged);
  return sum;
}

export function sumInventoryValue(
  items: Array<InventoryProduce | any>,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!Array.isArray(items)) return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  let sum = 0;
  for (const it of items) {
    if (it?.itemType === "Produce") {
      sum += valueFromInventoryProduce(it as InventoryProduce, merged);
    }
  }
  return sum;
}

export function sumGardenValue(
  garden: Record<string, GardenPlant | any>,
  opts?: PricingOptions,
  playersInRoom?: number
): number {
  if (!garden || typeof garden !== "object") return 0;
  const merged: PricingOptions | undefined = playersInRoom == null ? opts : { ...opts, friendPlayers: playersInRoom };
  let sum = 0;
  for (const k of Object.keys(garden)) {
    const p = garden[k];
    if (p?.objectType === "plant") {
      sum += valueFromGardenPlant(p as GardenPlant, merged);
    }
  }
  return sum;
}

export const DefaultPricing: PricingOptions = Object.freeze({
  getBasePrice: defaultGetBasePrice,
  rounding: "round",
});

export function debugProbe(
  species: string,
  scale: number,
  muts?: MutationName[],
  playersInRoom?: number
) {
  const base = defaultGetBasePrice(species) ?? 0;
  const effScale = scale;
  const mutMult = mutationsMultiplier(muts);
  const friendsMult = friendBonusMultiplier(playersInRoom);
  const rawCoins = base * effScale * mutMult * friendsMult;
  return {
    species,
    basePrice: base,
    effScale,
    mutationMult: mutMult,
    friendsMult,
    rawCoins,
    coins: applyRounding(rawCoins),
  };
}
