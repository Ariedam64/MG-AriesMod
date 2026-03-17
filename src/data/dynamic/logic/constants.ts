// src/data/dynamic/logic/constants.ts

import type { CapturedDataKey } from "../types";

export const SIGNATURE_KEYS: Record<CapturedDataKey, readonly string[]> = {
  items: ["WateringCan", "PlanterPot", "Shovel"],
  decor: ["SmallRock", "MediumRock", "LargeRock", "WoodBench", "StoneBench", "MarbleBench"],
  mutations: ["Gold", "Rainbow", "Wet", "Chilled", "Frozen"],
  eggs: ["CommonEgg", "UncommonEgg", "RareEgg"],
  pets: ["Worm", "Snail", "Bee", "Chicken", "Bunny"],
  abilities: ["ProduceScaleBoost", "DoubleHarvest", "SeedFinderI", "CoinFinderI"],
  plants: ["Carrot", "Strawberry", "Aloe", "Blueberry", "Apple"],
} as const;

export const WEATHER_IDS = ["Rain", "Frost", "Thunderstorm", "Dawn", "AmberMoon"] as const;
export const MAIN_BUNDLE_PATTERN = /main-[^/]+\.js(\?|$)/;
export const QUINOA_VIEW_PATTERN = /QuinoaView-[^/]+\.js(\?|$)/;

export const MAX_SCAN_DEPTH = 6;
export const MAX_SCAN_ATTEMPTS = 150;
export const PULSE_SCAN_INTERVAL_MS = 2000;

export const MAX_WEATHER_POLL_ATTEMPTS = 200;
export const WEATHER_POLL_INTERVAL_MS = 50;

export const MAX_COLOR_POLL_ATTEMPTS = 10;
export const COLOR_POLL_INTERVAL_MS = 1000;
export const ABILITY_COLOR_ANCHOR = "ProduceScaleBoost";
