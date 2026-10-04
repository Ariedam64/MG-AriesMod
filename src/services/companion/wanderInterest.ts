// src/services/companion/wanderInterest.ts
// Ce qui mérite qu'il aille y jeter un œil quand il flâne.
//
// Module PUR : ni store, ni catalogue, ni horloge. Les noms affichés, les
// mutations rares et la position des tuiles sont fournis par l'appelant
// (`wanderWatch.ts`), le hasard est injecté. Tout se vérifie hors navigateur
// (scripts/checkCompanionWander.ts).
//
// Le principe : une flânerie sur deux environ, s'il y a quelque chose
// d'intéressant à portée, il va se poster à côté plutôt que sur une case tirée
// au hasard. Une fois arrivé il pose, et ne dit quelque chose que de loin en
// loin : un companion qui commente chaque crop devient vite du bruit.

import { EmoteType } from "./emoteTypes";
import type { WanderArea, XY } from "./movement";

export type InterestKind = "rare" | "ripe" | "almostRipe" | "eggReady" | "eggSoon";

export type WanderInterest = {
  /** Case marchable où il se poste, à côté de l'objet. */
  tile: XY;
  /** L'objet lui-même : un crop, un œuf. */
  target: XY;
  /** Sa clé dans `tileObjects`, pour vérifier à l'arrivée qu'il est toujours là. */
  dirtTileIdx: number;
  kind: InterestKind;
  /** Ce qu'il regarde, déjà en clair : « Gold Carrot », « Common Egg ». */
  label: string;
  emote: EmoteType;
  /** Ce qu'il en dirait. Rarement dit : c'est `shouldComment` qui tranche. */
  line: string;
};

export type WanderInterestInput = {
  /** `garden.tileObjects` du jeu, indexé par case de terre. */
  tileObjects: unknown;
  /** Position sur la carte d'une case de terre (clé de `tileObjects`). */
  tileXY: (dirtTileIdx: number) => XY | null;
  now: number;
  area: WanderArea;
  random: () => number;
  /** Mutations tirées au hasard (celles qui ont une `baseChance`). */
  rareMutations: ReadonlySet<string>;
  cropName: (species: string) => string;
  mutationName: (mutation: string) => string;
  eggName: (eggId: string) => string;
  /** Part des flâneries qui vont vers un centre d'intérêt. Défaut : `INTEREST_CHANCE`. */
  chance?: number;
};

/** Une flânerie sur deux environ a un but, quand il y en a un. */
export const INTEREST_CHANCE = 0.5;

/** En deçà, un crop ou un œuf est « presque prêt ». */
export const ALMOST_READY_MS = 2 * 60_000;

/** Au-delà de cette part de pousse, un crop long est lui aussi presque prêt. */
const ALMOST_READY_GROWTH = 0.9;

/**
 * Poids de chaque sorte dans le tirage.
 *
 * On tire d'abord la sorte, puis l'objet : sans ça, un jardin plein de crops
 * mûrs noierait le seul Gold sous vingt carottes ordinaires.
 */
const KIND_WEIGHT: Record<InterestKind, number> = {
  rare: 5,
  eggReady: 3,
  ripe: 2,
  almostRipe: 2,
  eggSoon: 2,
};

/** Pose jouée à l'arrivée. */
export const KIND_EMOTE: Record<InterestKind, EmoteType> = {
  rare: EmoteType.Love,
  ripe: EmoteType.Clapping,
  eggReady: EmoteType.Clapping,
  almostRipe: EmoteType.Questioning,
  eggSoon: EmoteType.Questioning,
};

/** Ordre de préférence quand une même plante coche plusieurs cases. */
const KIND_RANK: Record<InterestKind, number> = {
  rare: 4,
  eggReady: 3,
  ripe: 2,
  almostRipe: 1,
  eggSoon: 0,
};

function pickOne<T>(options: readonly T[], random: () => number): T {
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

/** Les horodatages du jeu arrivent en secondes ou en millisecondes selon le champ. */
function normalizeTs(value: unknown): number | null {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw < 100_000_000_000 ? raw * 1000 : raw;
}

/** « a Gold Carrot », « an Amber Apple » : les noms viennent du catalogue. */
const withArticle = (label: string) => `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;

const LINES: Record<InterestKind, ReadonlyArray<(label: string) => string>> = {
  rare: [
    (l) => `Ooh, ${withArticle(l)}.`,
    (l) => `Look at this ${l}!`,
    (l) => `${withArticle(l).replace(/^a/, "A")}. Pretty, isn't it?`,
    (l) => `I could stare at this ${l} all day.`,
  ],
  ripe: [
    (l) => `This ${l} looks ready.`,
    (l) => `Mm, this ${l} is ripe.`,
    () => `This one's ready to pick.`,
  ],
  almostRipe: [
    () => `This one's almost ready.`,
    (l) => `Just a little longer, ${l}.`,
    (l) => `Almost there, little ${l}.`,
  ],
  eggReady: [
    () => `This egg is ready to hatch!`,
    (l) => `Something's wiggling in this ${l}.`,
    () => `I think this one wants out.`,
  ],
  eggSoon: [
    (l) => `This ${l} is about to hatch.`,
    () => `Any minute now...`,
    () => `I can hear something in there.`,
  ],
};

export function interestLine(kind: InterestKind, label: string, random: () => number): string {
  return pickOne(LINES[kind], random)(label);
}

type Found = { dirtIdx: number; kind: InterestKind; label: string };

/** Ce qu'il faut pour repérer les centres d'intérêt, sans le hasard du choix. */
export type InterestSource = Omit<WanderInterestInput, "chance" | "random">;

/** Ce qu'une plante a de plus intéressant, ou `null`. */
function plantInterest(
  plant: Record<string, unknown>,
  dirtIdx: number,
  input: InterestSource
): Found | null {
  const slots = Array.isArray(plant.slots) ? plant.slots : [];
  let best: Found | null = null;
  const consider = (found: Found) => {
    if (!best || KIND_RANK[found.kind] > KIND_RANK[best.kind]) best = found;
  };

  for (const raw of slots) {
    const slot = raw as Record<string, unknown> | null;
    if (!slot || typeof slot !== "object") continue;
    const speciesId =
      typeof slot.species === "string" && slot.species
        ? slot.species
        : typeof plant.species === "string" && plant.species
          ? plant.species
          : null;
    if (!speciesId) continue;
    const crop = input.cropName(speciesId);

    const mutations = Array.isArray(slot.mutations)
      ? slot.mutations.filter((m): m is string => typeof m === "string")
      : [];
    const rare = mutations.find((m) => input.rareMutations.has(m));
    if (rare) {
      consider({ dirtIdx, kind: "rare", label: `${input.mutationName(rare)} ${crop}` });
      continue;
    }

    // Un crop préservé est mûr pour toujours : le joueur l'a figé exprès, il
    // n'y a rien à y remarquer (cf. `ripeCropCount`).
    if (slot.preserved === true) continue;
    const end = normalizeTs(slot.endTime);
    if (end === null) continue;
    if (end <= input.now) {
      consider({ dirtIdx, kind: "ripe", label: crop });
      continue;
    }
    const start = normalizeTs(slot.startTime);
    const growth = start !== null && end > start ? (input.now - start) / (end - start) : 0;
    if (end - input.now <= ALMOST_READY_MS || growth >= ALMOST_READY_GROWTH) {
      consider({ dirtIdx, kind: "almostRipe", label: crop });
    }
  }
  return best;
}

function eggInterest(egg: Record<string, unknown>, dirtIdx: number, input: InterestSource): Found | null {
  const matured = normalizeTs(egg.maturedAt);
  if (matured === null) return null;
  const eggId = typeof egg.eggId === "string" && egg.eggId ? egg.eggId : null;
  const label = eggId ? input.eggName(eggId) : "egg";
  if (matured <= input.now) return { dirtIdx, kind: "eggReady", label };
  if (matured - input.now <= ALMOST_READY_MS) return { dirtIdx, kind: "eggSoon", label };
  return null;
}

/** Cases voisines (orthogonales d'abord) où il peut se poster, dans l'ordre. */
const NEIGHBOURS: ReadonlyArray<[number, number]> = [
  [0, 1],
  [1, 0],
  [-1, 0],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
];

/**
 * Cases où se poster pour regarder un objet : les voisines que la flânerie
 * accepte, orthogonales de préférence. Il ne se plante jamais SUR le crop, ça
 * le cacherait.
 */
export function standingTiles(target: XY, area: WanderArea): XY[] {
  const orthogonal: XY[] = [];
  const diagonal: XY[] = [];
  NEIGHBOURS.forEach(([dx, dy], i) => {
    const x = target.x + dx;
    const y = target.y + dy;
    if (!area.isWalkable(x, y)) return;
    (i < 4 ? orthogonal : diagonal).push({ x, y });
  });
  return orthogonal.length > 0 ? orthogonal : diagonal;
}

/** Un centre d'intérêt avant le choix de la case et de la réplique. */
export type InterestCandidate = {
  target: XY;
  dirtTileIdx: number;
  kind: InterestKind;
  label: string;
  /** Cases d'où le regarder, jamais vide. */
  spots: XY[];
};

/**
 * Tout ce qui, dans le jardin, vaut une visite et se trouve à portée.
 *
 * « À portée » : il existe une case voisine de l'objet que la flânerie
 * accepte. L'objet lui-même peut déborder d'une case de la zone.
 */
export function listInterests(input: InterestSource): InterestCandidate[] {
  const tiles = input.tileObjects;
  if (!tiles || typeof tiles !== "object") return [];
  const { area } = input;
  const out: InterestCandidate[] = [];

  for (const [key, raw] of Object.entries(tiles as Record<string, unknown>)) {
    const obj = raw as Record<string, unknown> | null;
    if (!obj || typeof obj !== "object") continue;
    const dirtIdx = Number(key);
    if (!Number.isInteger(dirtIdx) || dirtIdx < 0) continue;

    const found =
      obj.objectType === "plant"
        ? plantInterest(obj, dirtIdx, input)
        : obj.objectType === "egg"
          ? eggInterest(obj, dirtIdx, input)
          : null;
    if (!found) continue;

    const target = input.tileXY(dirtIdx);
    if (!target) continue;
    // Tri grossier avant de chercher une case : hors du rayon + 1, aucune
    // voisine ne peut être acceptée.
    if (Math.max(Math.abs(target.x - area.center.x), Math.abs(target.y - area.center.y)) > area.radius + 1) continue;

    const spots = standingTiles(target, area);
    if (spots.length === 0) continue;
    out.push({ target: { ...target }, dirtTileIdx: dirtIdx, kind: found.kind, label: found.label, spots });
  }
  return out;
}

/**
 * Le centre d'intérêt de cette flânerie, ou `null` pour une balade au hasard.
 *
 * Le tirage de `chance` passe en premier : la moitié des flâneries ne lisent
 * même pas le jardin.
 */
export function pickWanderInterest(input: WanderInterestInput): WanderInterest | null {
  const chance = input.chance ?? INTEREST_CHANCE;
  if (!(input.random() < chance)) return null;

  const all = listInterests(input);
  if (all.length === 0) return null;

  const kinds = [...new Set(all.map((i) => i.kind))];
  const total = kinds.reduce((sum, k) => sum + KIND_WEIGHT[k], 0);
  let roll = input.random() * total;
  let kind = kinds[kinds.length - 1];
  for (const k of kinds) {
    roll -= KIND_WEIGHT[k];
    if (roll < 0) {
      kind = k;
      break;
    }
  }
  const chosen = pickOne(
    all.filter((i) => i.kind === kind),
    input.random
  );
  return {
    tile: { ...pickOne(chosen.spots, input.random) },
    target: chosen.target,
    dirtTileIdx: chosen.dirtTileIdx,
    kind: chosen.kind,
    label: chosen.label,
    emote: KIND_EMOTE[chosen.kind],
    line: interestLine(chosen.kind, chosen.label, input.random),
  };
}

/* ------------------------------------------------------------------ */
/*  Parler, ou se contenter de poser                                   */
/* ------------------------------------------------------------------ */

/** Une arrivée sur quatre environ s'accompagne d'une réplique. */
export const COMMENT_CHANCE = 0.25;
/** Au plus une réplique de flânerie toutes les trois minutes. */
export const COMMENT_COOLDOWN_MS = 3 * 60_000;
/** Au-delà, la bulle s'afficherait hors de l'écran du joueur. */
export const COMMENT_MAX_DISTANCE = 8;

export type CommentInput = {
  now: number;
  /** Dernière réplique de flânerie. `0` : jamais. */
  lastCommentAt: number;
  /** Distance au joueur en tuiles, `null` si inconnue. */
  distanceToPlayer: number | null;
  /** Une tâche, une question, une série d'actions en cours. */
  busy: boolean;
  random: () => number;
};

/**
 * Dit-il quelque chose en arrivant ?
 *
 * Le tirage passe en dernier : on ne consomme pas de hasard pour une réplique
 * que les autres conditions interdisent déjà.
 */
export function shouldComment(input: CommentInput): boolean {
  if (input.busy) return false;
  if (input.distanceToPlayer === null || input.distanceToPlayer > COMMENT_MAX_DISTANCE) return false;
  if (input.lastCommentAt > 0 && input.now - input.lastCommentAt < COMMENT_COOLDOWN_MS) return false;
  return input.random() < COMMENT_CHANCE;
}
