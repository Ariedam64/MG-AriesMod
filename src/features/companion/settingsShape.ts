// The shape of the companion's settings, and their repair when read.
//
// Pure, apart from `state.ts`, which touches storage. Repairing a blob read
// from disk is exactly what must be checkable outside the browser: it decides
// what a player whose settings predate a change gets to see.

import { DEFAULT_CUSTOM_LINES, LEGACY_DEFAULT_LINES } from "./dialogueLines";
import { DEFAULT_KEEP_RULES, type KeepRules } from "./chat/hatch";

export type CompanionMode = "follow" | "garden";

const COMPANION_MODES: CompanionMode[] = ["follow", "garden"];

/** A guard: a very long bubble runs off the screen. */
export const MAX_LINE_LENGTH = 160;
const MAX_LINES = 50;

/** The subjects with a settings screen of their own. Planting has none: nothing to set. */
const SETTINGS_GROUPS = ["feed", "harvest", "hatch"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export type CompanionSettings = {
  enabled: boolean;
  /** Following the player, or staying in the garden. */
  mode: CompanionMode;
  /** The borrowed NPC's playerId. `null` picks one automatically at start. */
  npcId: string | null;
  /** Free lines, drawn when nothing contextual is worth saying. */
  lines: string[];
  /** Allows lines drawn from the game's state (harvest, pets, weather). */
  contextualEnabled: boolean;
  /**
   * He comments on his own on what happens: weather, sales, stat milestones,
   * time played. Never asks a question and never acts.
   */
  reactions: boolean;
  /** He points out a hungry pet and offers to feed it. */
  feedAlerts: boolean;
  /** Fullness below which he worries, in percent. */
  feedThresholdPct: number;
  /**
   * Lets him pick a garden crop to feed a pet.
   *
   * Without it he only draws from the bag: a hungry pet while the garden
   * overflows gives no proposal at all.
   */
  feedFromGarden: boolean;
  /**
   * Shows his questions at the top of the screen, with his portrait.
   *
   * The menu thread carries them anyway: this adds no action, only a second
   * place to read the same question and answer it.
   */
  askOnScreen: boolean;
  /** The team to wear while harvesting. `null` leaves the player's team alone. */
  harvestTeamId: string | null;
  /** The team to wear while hatching. `null` leaves the player's team alone. */
  hatchTeamId: string | null;
  /**
   * The team to wear while selling pets. `null` leaves the player's team alone.
   *
   * The game will not sell a pet from the active team: wearing a smaller team
   * during the sale is how the player decides who stays out of reach. The
   * team worn before always comes back after.
   */
  hatchSellTeamId: string | null;
  /**
   * The settings groups the player has already opened.
   *
   * Used to warn once, the first time an action is used, that nothing has
   * been set yet. Opening counts, not changing: leaving things as they are
   * after looking is a choice, and reminding them forever would be nagging.
   */
  reviewedSettings: SettingsGroup[];
  /**
   * What to keep from a hatch.
   *
   * Saved because a sorting rule is set once and serves every hatch. It makes
   * nothing automatic: these rules only shape a question, and no sale goes
   * without a yes to it.
   */
  hatchKeepRules: KeepRules;
};

const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  enabled: false,
  mode: "follow",
  npcId: null,
  lines: [...DEFAULT_CUSTOM_LINES],
  contextualEnabled: true,
  reactions: true,
  feedAlerts: true,
  feedThresholdPct: 10,
  feedFromGarden: true,
  askOnScreen: true,
  harvestTeamId: null,
  hatchTeamId: null,
  hatchSellTeamId: null,
  hatchKeepRules: { ...DEFAULT_KEEP_RULES },
  reviewedSettings: [],
};

/**
 * Cleans a list of lines from the menu or from storage.
 *
 * An empty list is a legitimate choice: the companion then keeps the game's
 * own lines when nothing contextual comes up.
 */
export function sanitizeLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CUSTOM_LINES];
  return raw
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim().slice(0, MAX_LINE_LENGTH))
    .filter((line) => line.length > 0)
    .slice(0, MAX_LINES);
}

/**
 * The lines read from disk.
 *
 * Exactly the four old default lines means the player never chose them (no
 * UI edits them), they were only saved with the rest: they get the current
 * list, or it would never reach them. Any other list, empty included, is kept
 * as it is.
 */
function storedLines(raw: unknown): string[] {
  if (raw === undefined) return [...DEFAULT_CUSTOM_LINES];
  const lines = sanitizeLines(raw);
  const isLegacy =
    lines.length === LEGACY_DEFAULT_LINES.length && lines.every((line, i) => line === LEGACY_DEFAULT_LINES[i]);
  return isLegacy ? [...DEFAULT_CUSTOM_LINES] : lines;
}

/**
 * Repairs keep rules read from storage.
 *
 * An unreadable rule must fall back on "nothing ticked", never on a made-up
 * criterion: these lists decide what survives a sale, and a guessed value
 * would do damage that cannot be undone.
 */
function sanitizeKeepRules(raw: unknown): KeepRules {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_KEEP_RULES };
  const source = raw as Partial<Record<keyof KeepRules, unknown>>;
  const names = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry !== "") : [];

  const strength = Number(source.minMaxStr);
  return {
    species: names(source.species),
    mutations: names(source.mutations),
    abilities: names(source.abilities),
    minMaxStr: Number.isFinite(strength) && strength > 0 ? Math.round(strength) : null,
  };
}

/** An empty or missing team id means "leave my team alone". */
function teamId(raw: unknown): string | null {
  return typeof raw === "string" && raw ? raw : null;
}

/** A threshold out of bounds means nothing: 1% at least, 90% at most. */
function clampThreshold(raw: unknown): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value)) return DEFAULT_COMPANION_SETTINGS.feedThresholdPct;
  return Math.max(1, Math.min(90, value));
}

/**
 * Repairs settings read from disk.
 *
 * Each field falls back on its default rather than a guess: a blob written by
 * an older version has no reason to know the settings added since, and a
 * player who updates must find a consistent companion, not rules they never set.
 */
export function coerceSettings(raw: Partial<CompanionSettings> | undefined | null): CompanionSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COMPANION_SETTINGS };

  return {
    enabled: raw.enabled === true,
    // Movement settings saved by earlier versions are simply ignored: they
    // became constants.
    mode: COMPANION_MODES.includes(raw.mode as CompanionMode) ? (raw.mode as CompanionMode) : DEFAULT_COMPANION_SETTINGS.mode,
    npcId: typeof raw.npcId === "string" && raw.npcId ? raw.npcId : null,
    lines: storedLines(raw.lines),
    contextualEnabled: raw.contextualEnabled !== false,
    reactions: raw.reactions !== false,
    feedAlerts: raw.feedAlerts !== false,
    feedThresholdPct: clampThreshold(raw.feedThresholdPct),
    feedFromGarden: raw.feedFromGarden !== false,
    askOnScreen: raw.askOnScreen !== false,
    harvestTeamId: teamId(raw.harvestTeamId),
    hatchTeamId: teamId(raw.hatchTeamId),
    hatchSellTeamId: teamId(raw.hatchSellTeamId),
    hatchKeepRules: sanitizeKeepRules(raw.hatchKeepRules),
    reviewedSettings: SETTINGS_GROUPS.filter(
      (group) => Array.isArray(raw.reviewedSettings) && raw.reviewedSettings.includes(group),
    ),
  };
}
