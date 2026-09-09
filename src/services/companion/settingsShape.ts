// src/services/companion/settingsShape.ts
// La forme des réglages du companion, et leur réparation à la lecture.
//
// Module PUR, séparé de `state.ts` parce que celui-ci touche au stockage et,
// par ses imports, au pont d'état du jeu. Or la réparation d'un blob venu du
// disque est justement ce qu'on veut pouvoir vérifier hors navigateur : c'est
// elle qui décide de ce que voit un joueur dont la config date d'avant.

import { DEFAULT_CUSTOM_LINES } from "./dialogue";
import { DEFAULT_KEEP_RULES, type KeepRules } from "./chat/hatch";

export type CompanionMode = "follow" | "garden";

/**
 * Les comportements possibles.
 *
 * Ici plutôt que dans `anchors.ts` : c'est une donnée de réglage, et
 * `anchors.ts` s'abonne au pont d'état dès l'import, ce qui rendrait la
 * réparation d'un blob invérifiable hors navigateur.
 */
export const COMPANION_MODES: CompanionMode[] = ["follow", "garden"];

/** Garde-fou : une bulle très longue déborde de l'écran. */
export const MAX_LINE_LENGTH = 160;
export const MAX_LINES = 50;

/** Les sujets qui ont leur écran de réglages. Le plant n'en a pas : il n'a rien à régler. */
export const SETTINGS_GROUPS = ["feed", "harvest", "hatch"] as const;
export type SettingsGroup = (typeof SETTINGS_GROUPS)[number];

export type CompanionSettings = {
  enabled: boolean;
  /** Comportement : te suivre, ou rester au jardin. */
  mode: CompanionMode;
  /** playerId du NPC détourné. `null` = choix automatique au démarrage. */
  npcId: string | null;
  /** Répliques perso, tirées quand rien de contextuel n'est à signaler. */
  lines: string[];
  /** Autorise les répliques tirées de l'état du jeu (récolte, pets, météo). */
  contextualEnabled: boolean;
  /** Le companion signale un pet affamé et propose de le nourrir. */
  feedAlerts: boolean;
  /** Satiété en dessous de laquelle il s'en inquiète, en pourcent. */
  feedThresholdPct: number;
  /**
   * L'autorise à cueillir un crop du jardin pour nourrir un pet.
   *
   * Sans ça il ne puise que dans l'inventaire : un pet affamé alors que le
   * jardin déborde ne donnera lieu à aucune proposition.
   */
  feedFromGarden: boolean;
  /**
   * Équipe à porter le temps d'une vente d'animaux. `null` = ne pas y toucher.
   *
   * Le jeu refuse de vendre un animal de l'équipe active : porter une équipe
   * réduite le temps de la vente est la façon dont le joueur décide qui reste
   * hors d'atteinte. L'équipe portée avant est toujours remise après.
   */
  /** Équipe à porter le temps d'une récolte. `null` = ne pas y toucher. */
  harvestTeamId: string | null;
  /** Équipe à porter le temps d'une couvée. `null` = ne pas y toucher. */
  hatchTeamId: string | null;
  hatchSellTeamId: string | null;
  /**
   * Groupes de réglages que le joueur a déjà ouverts.
   *
   * Sert à l'avertir une fois, à la première utilisation d'une action, que
   * rien n'a encore été réglé. On note l'ouverture et non la modification :
   * ne rien changer après avoir regardé est un choix, et le lui rappeler
   * indéfiniment reviendrait à le harceler.
   */
  reviewedSettings: SettingsGroup[];
  /**
   * Ce qu'il faut garder d'une couvée.
   *
   * Persisté parce qu'un critère de tri se règle une fois et resservira à
   * chaque couvée. Ça ne rend rien automatique : ces règles ne décident que du
   * contenu d'une question, et aucune vente ne part sans un oui qui la vise.
   */
  hatchKeepRules: KeepRules;
};

export const DEFAULT_COMPANION_SETTINGS: CompanionSettings = {
  enabled: false,
  mode: "follow",
  npcId: null,
  lines: [...DEFAULT_CUSTOM_LINES],
  contextualEnabled: true,
  feedAlerts: true,
  feedThresholdPct: 10,
  feedFromGarden: true,
  harvestTeamId: null,
  hatchTeamId: null,
  hatchSellTeamId: null,
  hatchKeepRules: { ...DEFAULT_KEEP_RULES },
  reviewedSettings: [],
};

/** Nettoie une liste de répliques venue de l'UI ou du stockage. */
export function sanitizeLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_CUSTOM_LINES];
  return raw
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.trim().slice(0, MAX_LINE_LENGTH))
    .filter((line) => line.length > 0)
    .slice(0, MAX_LINES);
  // Une liste vide est un choix légitime : le companion garde alors les
  // répliques d'origine du jeu quand rien de contextuel ne se présente.
}

/**
 * Répare des règles de conservation venues du stockage.
 *
 * Une règle illisible doit retomber sur « rien de coché », jamais sur un
 * critère inventé : ces listes décident de ce qui survit à une vente, et une
 * valeur devinée y ferait des dégâts qu'on ne rattrape pas.
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

/** Un identifiant d'équipe vide ou absent vaut « ne touche pas à mon équipe ». */
function teamId(raw: unknown): string | null {
  return typeof raw === "string" && raw ? raw : null;
}

/** Un seuil hors bornes ne veut rien dire : 1 % au moins, 90 % au plus. */
function clampThreshold(raw: unknown): number {
  const value = Math.round(Number(raw));
  if (!Number.isFinite(value)) return DEFAULT_COMPANION_SETTINGS.feedThresholdPct;
  return Math.max(1, Math.min(90, value));
}

/**
 * Répare une config venue du disque.
 *
 * Chaque champ retombe sur son défaut plutôt que sur une valeur devinée : un
 * blob écrit par une version antérieure du mod n'a aucune raison de connaître
 * les réglages ajoutés depuis, et un joueur qui met à jour doit retrouver un
 * companion cohérent, pas des critères qu'il n'a jamais posés.
 */
export function coerceSettings(raw: Partial<CompanionSettings> | undefined | null): CompanionSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_COMPANION_SETTINGS };

  return {
    enabled: raw.enabled === true,
    // Les réglages de déplacement persistés par les versions précédentes sont
    // simplement ignorés : ils sont devenus des constantes.
    mode: COMPANION_MODES.includes(raw.mode as CompanionMode)
      ? (raw.mode as CompanionMode)
      : DEFAULT_COMPANION_SETTINGS.mode,
    npcId: typeof raw.npcId === "string" && raw.npcId ? raw.npcId : null,
    lines: raw.lines === undefined ? [...DEFAULT_CUSTOM_LINES] : sanitizeLines(raw.lines),
    contextualEnabled: raw.contextualEnabled !== false,
    feedAlerts: raw.feedAlerts !== false,
    feedThresholdPct: clampThreshold(raw.feedThresholdPct),
    feedFromGarden: raw.feedFromGarden !== false,
    harvestTeamId: teamId(raw.harvestTeamId),
    hatchTeamId: teamId(raw.hatchTeamId),
    hatchSellTeamId: teamId(raw.hatchSellTeamId),
    hatchKeepRules: sanitizeKeepRules(raw.hatchKeepRules),
    reviewedSettings: SETTINGS_GROUPS.filter(
      (group) => Array.isArray(raw.reviewedSettings) && raw.reviewedSettings.includes(group)
    ),
  };
}
