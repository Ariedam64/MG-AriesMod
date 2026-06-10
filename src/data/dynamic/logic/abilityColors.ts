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

async function enrichAbilitiesWithColors(): Promise<boolean> {
  if (!captureState.data.abilities) return false;

  const abilities = captureState.data.abilities as Record<string, unknown>;
  if (isAlreadyEnriched(abilities)) return true;

  const map = await loadAbilityColorsFromBundle();
  if (!map) return false;

  const enriched: Record<string, unknown> = {};
  for (const [abilityId, abilityData] of Object.entries(abilities)) {
    const colors = map[abilityId] || DEFAULT_COLOR;
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
