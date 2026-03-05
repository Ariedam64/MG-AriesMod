// src/data/dynamic/logic/abilityColors.ts

import { captureState } from "../state";
import { ABILITY_COLOR_ANCHOR, MAX_COLOR_POLL_ATTEMPTS, COLOR_POLL_INTERVAL_MS } from "./constants";
import { fetchMainBundle, findAllIndices, extractBalancedBlock } from "./bundleParser";

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

    if (block.includes(ABILITY_COLOR_ANCHOR) && (block.includes('bg:"') || block.includes("bg:'"))) {
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

async function loadAbilityColorsFromBundle(): Promise<Record<string, AbilityColor> | null> {
  const bundleText = await fetchMainBundle();
  if (!bundleText) return null;

  const switchBlock = findAbilityColorSwitchBlock(bundleText);
  if (!switchBlock) return null;

  return parseAbilityColorsFromSwitch(switchBlock);
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
