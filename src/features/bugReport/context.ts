// Everything a report carries that the player does not type: which mod and
// game build, where it runs, who sends it, what the session looked like.
// Each read is bounded in time, so a game that is not fully loaded (the very
// case worth reporting) still lets the report go out with what is known.

import type { BugReportContext, BugReportPayload } from "../../lib/bugReport/types";
import { detectGameVersion, gameVersion } from "../../game/gameVersion";
import { getReadySpriteState, getSpriteState } from "../../game/sprites/context";
import { Atoms } from "../../game/store/atoms";
import { isStoreCaptured } from "../../game/store/jotai";
import { buildPlayerStatePayload, getMyAccountId } from "../../platform/ariesApi/playerStatePayload";
import { diagnostics } from "../../platform/diagnostics";
import { detectEnvironment } from "../../platform/environment";
import { checkModVersion, getLocalVersion, type VersionStatus } from "../../platform/modVersion";
import { BUG_REPORT_PROJECT } from "./project";
import { readReportedSettings } from "./settingsWhitelist";

/** What the player agreed to attach. Technical info always goes. */
export type AttachedData = { logs: boolean; settings: boolean; accountState: boolean };

export type AutoFields = Pick<
  BugReportPayload,
  "project" | "modName" | "modVersion" | "gameVersion" | "playerId" | "playerName" | "includeAccountState" | "context"
>;

const READ_TIMEOUT_MS = 2_500;

/** `promise`, or `fallback` once `ms` have passed or when it fails. */
function within<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

function scriptHandler(): string | null {
  try {
    if (typeof GM_info === "undefined") return null;
    return [GM_info.scriptHandler, GM_info.version].filter(Boolean).join(" ") || null;
  } catch {
    return null;
  }
}

function environment(): BugReportContext["environment"] {
  const env = detectEnvironment();
  return {
    surface: env.surface,
    host: env.host,
    platform: env.platform,
    inIframe: env.isInIframe,
    userAgent: navigator.userAgent,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: typeof screen !== "undefined" ? `${screen.width}x${screen.height}` : null,
    dpr: window.devicePixelRatio || 1,
    scriptHandler: scriptHandler(),
    language: navigator.language,
    uptimeSec: Math.round(performance.now() / 1000),
  };
}

/** The latest release, if the check answers soon enough. Cached after the first call. */
export function latestVersion(): Promise<VersionStatus | null> {
  return within(checkModVersion(), READ_TIMEOUT_MS, null);
}

export async function collectAutoFields(attached: AttachedData): Promise<AutoFields> {
  const [version, playerId, state, activeModal] = await Promise.all([
    latestVersion(),
    within(getMyAccountId(), READ_TIMEOUT_MS, null),
    within(buildPlayerStatePayload(), READ_TIMEOUT_MS, null),
    within(Atoms.ui.activeModal.get(), READ_TIMEOUT_MS, null),
  ]);

  const sprites = getSpriteState();
  const context: BugReportContext = {
    environment: environment(),
    mod: { latestVersion: version?.remote ?? null, behind: version?.behind ?? false },
    game: {
      roomId: state?.room.id ?? null,
      playersInRoom: state?.room.playersCount ?? null,
      activeModal: typeof activeModal === "string" ? activeModal : null,
      // Health signals: a store that was never captured or a renderer the mod
      // never found explains a whole class of "nothing works" reports.
      storeCaptured: isStoreCaptured(),
      rendererReady: !!getReadySpriteState(),
      pixiVersion: sprites.version ?? null,
    },
  };
  if (attached.settings) context.settings = readReportedSettings();
  if (attached.logs) {
    context.logs = diagnostics.logs();
    context.breadcrumbs = diagnostics.breadcrumbs();
  }

  return {
    project: BUG_REPORT_PROJECT.id,
    modName: BUG_REPORT_PROJECT.name,
    modVersion: getLocalVersion() ?? null,
    gameVersion: gameVersion ?? detectGameVersion(),
    playerId,
    playerName: state?.playerName ?? null,
    includeAccountState: attached.accountState,
    context,
  };
}
