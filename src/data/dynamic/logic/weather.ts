// src/data/dynamic/logic/weather.ts

import { captureState } from "../state";
import { WEATHER_IDS, MAX_WEATHER_POLL_ATTEMPTS, WEATHER_POLL_INTERVAL_MS } from "./constants";
import { fetchMainBundle, fetchQuinoaViewBundle, extractBalancedBlock, extractBalancedObjectLiteral } from "./bundleParser";

function buildWeather(data: Record<string, unknown>): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  let found = false;

  for (const id of WEATHER_IDS) {
    const blueprint = data?.[id];
    if (!blueprint || typeof blueprint !== "object") continue;
    const spriteId = (blueprint as Record<string, unknown>).iconSpriteKey || null;
    const { iconSpriteKey: _, ...rest } = blueprint as Record<string, unknown>;
    out[id] = { weatherId: id, spriteId, ...rest };
    found = true;
  }

  if (!out.Sunny) {
    out.Sunny = {
      weatherId: "Sunny",
      name: "Sunny",
      spriteId: "sprite/ui/SunnyIcon",
      type: "primary",
    };
  }

  if (!found) return null;
  const rain = out.Rain as Record<string, unknown> | undefined;
  const mutator = rain?.mutator as Record<string, unknown> | undefined;
  if (rain && mutator?.mutation !== "Wet") return null;

  return out;
}

function extractWeatherObject(text: string, anchorPos: number): string | null {
  const searchStart = Math.max(0, anchorPos - 3000);
  const searchArea = text.substring(searchStart, anchorPos);

  // Match both plain `Rain:{` and computed `[ze.Rain]:{` or `[X.Rain]:{`
  const rainPattern = /(?:Rain:\{|\[[A-Za-z_$][\w$]*\.Rain\]\s*:\s*\{)/;
  const match = searchArea.match(rainPattern);
  if (!match || match.index === undefined) return null;

  const rainStart = searchStart + match.index;

  let objStart = -1;
  for (let i = rainStart - 1; i >= Math.max(0, rainStart - 200); i--) {
    if (text[i] === "{") {
      objStart = i;
      break;
    }
  }

  if (objStart < 0) return null;
  return extractBalancedBlock(text, objStart);
}

// Maps the q sprite registry category names to their atlas path segments.
const Q_CATEGORY_PATH: Record<string, string> = {
  Animation: "animation",
  Decor: "decor",
  Item: "item",
  MutationOverlay: "mutation-overlay",
  Mutation: "mutation",
  Object: "object",
  Pet: "pet",
  Plant: "plant",
  Ui: "ui",
};

function normalizeWeatherLiteral(literal: string): string {
  return literal
    // Computed property keys: [ze.Rain] → "Rain"
    .replace(/\[([A-Za-z_$][\w$]*)\.(Rain|Frost|Dawn|AmberMoon|Thunderstorm)\]/g, '"$2"')
    // groupId enum refs: Id.Hydro → "Hydro", Id.Lunar → "Lunar"
    .replace(/\b[A-Za-z_$][\w$]*\.(Hydro|Lunar)\b/g, '"$1"')
    // q sprite registry refs: q.Ui.RainIcon → "sprite/ui/RainIcon"
    // MutationOverlay must be listed before Mutation to avoid partial match.
    .replace(
      /\bq\.(Animation|Decor|Item|MutationOverlay|Mutation|Object|Pet|Plant|Ui)\.([A-Za-z_$][\w$]*)\b/g,
      (_, cat, name) => `"sprite/${Q_CATEGORY_PATH[cat] ?? cat.toLowerCase()}/${name}"`,
    )
    // Any remaining single-level weather enum refs: ze.Rain → "Rain"
    .replace(/\b[A-Za-z_$][\w$]*\.(Rain|Frost|Dawn|AmberMoon|Thunderstorm)\b/g, '"$1"')
    // Catch-all: any remaining identifier.identifier.identifier that would break eval
    // (e.g. R.Something.Other) → convert to string of the last segment
    .replace(/\b[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*){2,}\b/g, (match) => {
      const last = match.split(".").pop() || match;
      return `"${last}"`;
    });
}

function tryExtractWeatherFromText(bundleText: string): boolean {
  // Try multiple anchor strategies to find the weather object
  const anchors: number[] = [];

  // Strategy 1: find "Amber Moon" (unique to weather) — double-quoted or template literal
  for (const needle of ['name:"Amber Moon"', "name:`Amber Moon`"]) {
    const idx = bundleText.indexOf(needle);
    if (idx >= 0) anchors.push(idx);
  }

  // Strategy 2: find chancePerMinutePerCrop (unique to weather mutator)
  const cpIdx = bundleText.indexOf("chancePerMinutePerCrop");
  if (cpIdx >= 0) anchors.push(cpIdx);

  // Strategy 3: "mutator" as last resort
  const mutIdx = bundleText.indexOf("mutator");
  if (mutIdx >= 0) anchors.push(mutIdx);

  for (const anchor of anchors) {
    const literal =
      extractBalancedObjectLiteral(bundleText, anchor) ??
      extractWeatherObject(bundleText, anchor);
    if (!literal) continue;

    const fixedLiteral = normalizeWeatherLiteral(literal);

    let weatherDex: Record<string, unknown>;
    try {
      weatherDex = Function('"use strict";return(' + fixedLiteral + ")")();
    } catch {
      continue;
    }

    const weatherCatalog = buildWeather(weatherDex);
    if (!weatherCatalog) continue;

    captureState.data.weather = weatherCatalog;
    return true;
  }

  return false;
}

async function loadWeatherFromBundle(): Promise<boolean> {
  if (captureState.data.weather) return true;

  // Fetch both bundles in parallel — weather data may be in either one depending on game version.
  // QuinoaView is a lazily-loaded chunk; it appears in performance entries once rendered.
  const [quinoaText, mainText] = await Promise.all([
    fetchQuinoaViewBundle(),
    fetchMainBundle(),
  ]);

  for (const text of [quinoaText, mainText]) {
    if (text && tryExtractWeatherFromText(text)) return true;
  }

  return false;
}

export function startWeatherPolling(): void {
  if (captureState.weatherPollingTimer) return;
  captureState.weatherPollAttempts = 0;

  const timer = setInterval(async () => {
    const success = await loadWeatherFromBundle();
    if (success || ++captureState.weatherPollAttempts > MAX_WEATHER_POLL_ATTEMPTS) {
      clearInterval(timer);
      captureState.weatherPollingTimer = null;
    }
  }, WEATHER_POLL_INTERVAL_MS);

  captureState.weatherPollingTimer = timer;
}

export function stopWeatherPolling(): void {
  if (captureState.weatherPollingTimer) {
    clearInterval(captureState.weatherPollingTimer);
    captureState.weatherPollingTimer = null;
  }
}
