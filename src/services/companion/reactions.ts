// src/services/companion/reactions.ts
// Ce que le companion dit de lui-même, quand quelque chose se passe.
//
// Module PUR : aucun import qui touche au jeu, hasard et horloge injectés. Tout
// ce qui décide QUOI dire et QUAND se vérifie hors navigateur
// (scripts/checkCompanionReactions.ts). Les abonnements qui alimentent ces
// fonctions vivent dans `reactionWatch.ts`.
//
// Trois familles :
//  - les événements (météo qui change, vente, éclosion rare, capacité d'un pet,
//    œuf prêt, item suivi au shop, crop à mutation rare) ;
//  - les paliers de stats (100, 1 000, 10 000...) ;
//  - le temps : salut à l'arrivée, heures passées ensemble, minuit.
//
// Aucune de ces répliques ne pose de question ni n'agit : elles ne font que
// commenter. C'est pourquoi elles n'ont pas à passer par les propositions.

import type { StatsSnapshot } from "../stats";
import { EmoteType } from "./emoteTypes";

/* ------------------------------------------------------------------ */
/*  Forme                                                              */
/* ------------------------------------------------------------------ */

/**
 * `high` attend son tour si le companion est occupé ; `low` n'a de sens que
 * sur le moment et disparaît s'il ne peut pas être dit tout de suite.
 */
export type ReactionPriority = "high" | "low";

export type Reaction = {
  /** `famille:détail`. La famille porte la temporisation. */
  key: string;
  message: string;
  emote: EmoteType | null;
  priority: ReactionPriority;
  /**
   * Départage deux réactions de même clé en attente : la plus lourde reste.
   * « Enfin un Gold après 80 essais » dit plus que « un Gold ! », et les deux
   * arrivent par des sources différentes, dans un ordre qu'on ne maîtrise pas.
   */
  weight?: number;
};

function pickOne<T>(options: readonly T[], random: () => number): T {
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/* ------------------------------------------------------------------ */
/*  Paliers                                                            */
/* ------------------------------------------------------------------ */

/** 100, 1 000, 10 000... jusqu'au million de milliards. */
const MILESTONES: readonly number[] = Array.from({ length: 14 }, (_, i) => 10 ** (i + 2));

/**
 * Le plus haut palier franchi entre deux valeurs, ou `null`.
 *
 * Le plus haut seulement : une grosse vente peut en sauter deux d'un coup, et
 * les annoncer tous les deux ferait deux bulles pour un seul moment.
 */
export function crossedMilestone(prev: number, next: number): number | null {
  if (!Number.isFinite(prev) || !Number.isFinite(next) || next <= prev) return null;
  let crossed: number | null = null;
  for (const m of MILESTONES) {
    if (prev < m && next >= m) crossed = m;
  }
  return crossed;
}

/** « 1,000 », « 10,000 », puis « 1 million », « 2 billion »... */
export function formatMilestone(n: number): string {
  const units: Array<[number, string]> = [
    [1e15, "quadrillion"],
    [1e12, "trillion"],
    [1e9, "billion"],
    [1e6, "million"],
  ];
  for (const [size, word] of units) {
    if (n >= size) return `${fmt(n / size)} ${word}`;
  }
  return fmt(n);
}

type StatDef = {
  id: string;
  read: (s: StatsSnapshot) => number;
  lines: ReadonlyArray<(n: string) => string>;
};

const sumHatched = (s: StatsSnapshot, key?: "normal" | "gold" | "rainbow"): number => {
  let total = 0;
  for (const counts of Object.values(s?.pets?.hatchedByType ?? {})) {
    if (!counts) continue;
    total += key ? Number(counts[key]) || 0 : (Number(counts.normal) || 0) + (Number(counts.gold) || 0) + (Number(counts.rainbow) || 0);
  }
  return total;
};

const sumAbilityTriggers = (s: StatsSnapshot): number => {
  let total = 0;
  for (const stat of Object.values(s?.abilities ?? {})) total += Number(stat?.triggers) || 0;
  return total;
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const STAT_DEFS: readonly StatDef[] = [
  {
    id: "harvested",
    read: (s) => num(s?.garden?.totalHarvested),
    lines: [
      (n) => `That's ${n} crops harvested! Incredible.`,
      (n) => `${n} harvests! You're a natural.`,
      (n) => `Crop number ${n}! We should celebrate.`,
    ],
  },
  {
    id: "planted",
    read: (s) => num(s?.garden?.totalPlanted),
    lines: [
      (n) => `${n} seeds planted! This garden keeps growing.`,
      (n) => `That's seed number ${n}. Green thumb confirmed.`,
    ],
  },
  {
    id: "watered",
    read: (s) => num(s?.garden?.watercanUsed),
    lines: [(n) => `${n} waterings! You really care about these plants.`],
  },
  {
    id: "cropsSold",
    read: (s) => num(s?.shops?.cropsSoldCount),
    lines: [
      (n) => `${n} crops sold! The shop loves you.`,
      (n) => `That's ${n} crops sold. Business is booming.`,
    ],
  },
  {
    id: "coins",
    read: (s) => num(s?.shops?.cropsSoldValue) + num(s?.shops?.petsSoldValue),
    lines: [
      (n) => `You've earned ${n} coins from sales! So rich.`,
      (n) => `${n} coins earned. Buy me something nice?`,
    ],
  },
  {
    id: "seedsBought",
    read: (s) => num(s?.shops?.seedsBought),
    lines: [(n) => `${n} seeds bought! The shopkeeper knows your name by now.`],
  },
  {
    id: "petsSold",
    read: (s) => num(s?.shops?.petsSoldCount),
    lines: [(n) => `${n} pets sold. Hope they found good homes!`],
  },
  {
    id: "hatched",
    read: (s) => sumHatched(s),
    lines: [
      (n) => `${n} pets hatched! That's a whole zoo.`,
      (n) => `Pet number ${n}! Welcome to the family.`,
    ],
  },
  {
    id: "abilities",
    read: (s) => sumAbilityTriggers(s),
    lines: [
      (n) => `Your pets have used their abilities ${n} times!`,
      (n) => `${n} pet abilities triggered. Hard workers!`,
    ],
  },
];

/**
 * Tout ce qu'un changement de stats mérite de faire dire.
 *
 * Ne réagit qu'à une HAUSSE entre deux instantanés : au démarrage, des stats
 * déjà à 12 000 ne font rien dire, seul le passage de 9 999 à 10 000 compte.
 * Un palier n'est donc annoncé qu'une fois, sans rien avoir à retenir.
 */
export function statReactions(prev: StatsSnapshot, next: StatsSnapshot, random: () => number): Reaction[] {
  const out: Reaction[] = [];

  for (const def of STAT_DEFS) {
    const m = crossedMilestone(def.read(prev), def.read(next));
    if (m === null) continue;
    out.push({
      key: `milestone:${def.id}`,
      message: pickOne(def.lines, random)(formatMilestone(m)),
      emote: m >= 1e6 ? EmoteType.Love : EmoteType.Clapping,
      priority: "high",
    });
  }

  // Éclosions : la plus rare l'emporte, une seule bulle par lot.
  if (sumHatched(next, "rainbow") > sumHatched(prev, "rainbow")) {
    out.push({
      key: "hatch:rainbow",
      message: pickOne(["A RAINBOW pet?! No way!", "Rainbow! I've never seen one up close!", "Look at those colours! A Rainbow pet!"], random),
      emote: EmoteType.Love,
      priority: "high",
    });
  } else if (sumHatched(next, "gold") > sumHatched(prev, "gold")) {
    out.push({
      key: "hatch:gold",
      message: pickOne(["A Gold pet! Look at it shine!", "Gold! That one's a keeper.", "Shiny! A Gold pet!"], random),
      emote: EmoteType.Love,
      priority: "high",
    });
  } else if (sumHatched(next) > sumHatched(prev)) {
    out.push({
      key: "hatch:normal",
      message: pickOne(["Welcome to the family, little one!", "A new friend! Hi there!", "Aww, look at the new pet."], random),
      emote: EmoteType.Clapping,
      priority: "low",
    });
  }

  const earned = num(next?.shops?.cropsSoldValue) - num(prev?.shops?.cropsSoldValue);
  if (earned > 0) {
    const coins = fmt(earned);
    out.push({
      key: "sale:crops",
      message: pickOne(
        [`Ka-ching! +${coins} coins.`, `Sold! ${coins} coins richer.`, `Nice sale, ${coins} coins!`, `${coins} coins in the bank. Love it.`],
        random
      ),
      emote: EmoteType.Clapping,
      priority: "low",
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/*  Événements                                                         */
/* ------------------------------------------------------------------ */

/** Pose associée à chaque météo. Une météo inconnue s'interroge, simplement. */
const WEATHER_EMOTES: Record<string, EmoteType> = {
  Rain: EmoteType.Laughing,
  Frost: EmoteType.Clapping,
  Thunderstorm: EmoteType.Crying,
  Dawn: EmoteType.Love,
  AmberMoon: EmoteType.Questioning,
};

export function weatherEmote(weatherId: string): EmoteType {
  return WEATHER_EMOTES[weatherId] ?? EmoteType.Questioning;
}

/**
 * Réaction à un changement de météo.
 *
 * `startLine` est fourni par l'appelant (`weatherMessage` de `dialogueLines`) :
 * les répliques propres à chaque météo n'ont qu'une source.
 */
export function weatherChangeReaction(
  prevId: string | null,
  nextId: string | null,
  prevName: string,
  startLine: string,
  random: () => number
): Reaction | null {
  if (prevId === nextId) return null;
  if (nextId) {
    return { key: `weather:${nextId}`, message: startLine, emote: weatherEmote(nextId), priority: "high" };
  }
  if (!prevId) return null;
  return {
    key: "weather:end",
    message: pickOne([`The ${prevName} is over. Sunshine's back!`, `And just like that, the ${prevName} is gone.`, `Bye bye, ${prevName}.`], random),
    emote: null,
    priority: "low",
  };
}

export type AbilityEvent = { name?: string; species?: string; abilityName: string };

export function abilityReaction(event: AbilityEvent, random: () => number): Reaction {
  const who = event.name?.trim() || (event.species ? `your ${event.species}` : "your pet");
  const Who = who.charAt(0).toUpperCase() + who.slice(1);
  return {
    key: "ability",
    message: pickOne(
      [`${Who} just used ${event.abilityName}!`, `Go ${who}! ${event.abilityName}!`, `Did you see that? ${Who} used ${event.abilityName}.`],
      random
    ),
    emote: EmoteType.Clapping,
    priority: "low",
  };
}

export function eggsReadyReaction(count: number, random: () => number): Reaction | null {
  if (count <= 0) return null;
  return {
    key: "egg",
    message:
      count === 1
        ? pickOne(["An egg is ready to hatch!", "Ooh, one of your eggs is ready!", "Something's wiggling in that egg. It's ready!"], random)
        : pickOne([`${count} eggs are ready to hatch!`, `${count} eggs ready! Hatching time?`], random),
    emote: EmoteType.Clapping,
    priority: "high",
  };
}

export function shopReaction(names: string[], random: () => number): Reaction | null {
  const list = names.filter((n) => typeof n === "string" && n.trim());
  if (list.length === 0) return null;
  const what = list.length === 1 ? list[0] : list.length === 2 ? `${list[0]} and ${list[1]}` : `${list[0]}, ${list[1]} and more`;
  const isAre = list.length === 1 ? "is" : "are";
  return {
    key: "shop",
    message: pickOne([`${what} ${isAre} in the shop! Go go go!`, `Ooh, ${what} just showed up in the shop!`, `Quick, ${what} ${isAre} in stock!`], random),
    emote: EmoteType.Clapping,
    priority: "high",
  };
}

type ShopSection = { inventory?: unknown; secondsUntilRestock?: unknown };
export type ShopsLike = Partial<Record<"seed" | "egg" | "tool" | "decor", ShopSection>>;

/** Clé d'un item de shop, au format des préférences du notifier (`Seed:Carrot`). */
const SHOP_ID: Record<keyof ShopsLike, [string, string]> = {
  seed: ["Seed", "species"],
  egg: ["Egg", "eggId"],
  tool: ["Tool", "toolId"],
  decor: ["Decor", "decorId"],
};

/**
 * Items suivis présents dans un shop qui vient de se renouveler.
 *
 * Un renouvellement se voit au compte à rebours qui remonte : entre deux
 * restocks il ne fait que descendre. Le premier relevé (`prev === null`) sert
 * de référence et ne dit rien, sinon chaque rechargement annoncerait le stock.
 */
export function restockedFollowed(prev: ShopsLike | null, next: ShopsLike, isFollowed: (id: string) => boolean): string[] {
  if (!prev || !next) return [];
  const out: string[] = [];
  for (const kind of Object.keys(SHOP_ID) as Array<keyof ShopsLike>) {
    const before = Number(prev[kind]?.secondsUntilRestock) || 0;
    const after = Number(next[kind]?.secondsUntilRestock) || 0;
    if (after <= before) continue;
    const inventory = next[kind]?.inventory;
    if (!Array.isArray(inventory)) continue;
    const [prefix, field] = SHOP_ID[kind];
    for (const item of inventory) {
      const key = (item as Record<string, unknown> | null)?.[field];
      const stock = Number((item as Record<string, unknown> | null)?.initialStock);
      if (typeof key !== "string" || !key || !(stock > 0)) continue;
      const id = `${prefix}:${key}`;
      if (isFollowed(id)) out.push(id);
    }
  }
  return out;
}

export type RareCrop = { mutation: string; species: string };

export function rareCropReaction(crops: RareCrop[], random: () => number): Reaction | null {
  if (crops.length === 0) return null;
  const first = crops[0];
  const message =
    crops.length === 1
      ? pickOne([`A ${first.mutation} ${first.species}! Look at that!`, `Whoa, a ${first.mutation} ${first.species} just showed up!`, `${first.mutation}! Your ${first.species} is special.`], random)
      : pickOne([`${crops.length} rare crops just appeared! Look!`, `Whoa, ${crops.length} special crops at once!`], random);
  return { key: "rarecrop", message, emote: EmoteType.Love, priority: "high" };
}

/* ------------------------------------------------------------------ */
/*  Malchance aux éclosions                                            */
/* ------------------------------------------------------------------ */

/**
 * Éclosions d'affilée sans Gold ni Rainbow, par œuf, telles que les compte
 * `hatchTracker` (le compteur observé, sans l'avance réglée à la main).
 */
export type LuckCounters = Record<string, { gold: number; rainbow: number }>;

/** Paliers de malchance. Le Rainbow est bien plus rare : ses paliers aussi. */
const DROUGHT_STEPS: Record<"gold" | "rainbow", readonly number[]> = {
  gold: [25, 50, 100, 200, 400],
  rainbow: [100, 250, 500, 1000, 2000],
};

/** En dessous, un Gold qui tombe n'a rien d'une délivrance. */
const RELIEF_MIN: Record<"gold" | "rainbow", number> = { gold: 25, rainbow: 100 };

const RARITY_LABEL: Record<"gold" | "rainbow", string> = { gold: "Gold", rainbow: "Rainbow" };

/**
 * Ce que la malchance fait dire après une éclosion.
 *
 * Un compteur qui franchit un palier : il compatit. Un compteur qui retombe à
 * zéro après une longue attente : il exulte, et plus fort que la réaction
 * ordinaire au Gold, qu'il remplace (même clé, `weight` supérieur).
 */
export function badLuckReactions(
  prev: LuckCounters,
  next: LuckCounters,
  eggName: (eggId: string) => string,
  random: () => number
): Reaction[] {
  const out: Reaction[] = [];
  for (const [eggId, after] of Object.entries(next ?? {})) {
    const before = prev?.[eggId];
    if (!before || !after) continue;
    const egg = eggName(eggId);

    for (const kind of ["rainbow", "gold"] as const) {
      const was = Number(before[kind]) || 0;
      const now = Number(after[kind]) || 0;
      const label = RARITY_LABEL[kind];

      if (now < was) {
        if (was < RELIEF_MIN[kind]) continue;
        const tries = was + 1;
        out.push({
          key: `hatch:${kind}`,
          message: pickOne(
            [`FINALLY! A ${label} pet after ${tries} tries!`, `${tries} hatches of waiting, and there it is. ${label}!`, `I told you it was coming! ${label}, at last!`],
            random
          ),
          emote: EmoteType.Love,
          priority: "high",
          weight: 1,
        });
        continue;
      }

      let step: number | null = null;
      for (const s of DROUGHT_STEPS[kind]) if (was < s && now >= s) step = s;
      if (step === null) continue;
      out.push({
        key: `badluck:${kind}`,
        message: pickOne(
          [
            `${step} ${egg} hatches without a ${label}... it's coming, I can feel it.`,
            `Still no ${label} after ${step} tries. The game owes you one.`,
            `${step} in a row with no ${label}. Hang in there, boss.`,
          ],
          random
        ),
        emote: EmoteType.Crying,
        priority: "high",
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Crops et œufs : ce qui vient d'apparaître                          */
/* ------------------------------------------------------------------ */

type Slot = { species?: unknown; startTime?: unknown; slotId?: unknown; mutations?: unknown };

/**
 * Crops qui portent une mutation rare qu'ils n'avaient pas au relevé précédent.
 *
 * Un crop est identifié par sa tuile, son sous-slot et sa date de plantation :
 * une replantation au même endroit est un autre crop. `prev === null` est le
 * premier relevé, qui ne sert que de référence.
 */
export function newRareCrops(prev: unknown, next: unknown, rare: ReadonlySet<string>): RareCrop[] {
  if (!prev || typeof prev !== "object" || !next || typeof next !== "object" || rare.size === 0) return [];

  const seen = new Map<string, Set<string>>();
  const index = (tiles: unknown, visit: (id: string, species: string, muts: string[]) => void) => {
    for (const [tileIdx, obj] of Object.entries(tiles as Record<string, unknown>)) {
      const o = obj as { objectType?: unknown; species?: unknown; slots?: unknown } | null;
      if (!o || o.objectType !== "plant" || !Array.isArray(o.slots)) continue;
      o.slots.forEach((raw, i) => {
        const s = raw as Slot | null;
        if (!s) return;
        const muts = Array.isArray(s.mutations) ? s.mutations.filter((m): m is string => typeof m === "string") : [];
        const species = typeof s.species === "string" ? s.species : typeof o.species === "string" ? o.species : "crop";
        visit(`${tileIdx}|${s.slotId ?? i}|${s.startTime ?? ""}`, species, muts);
      });
    }
  };

  index(prev, (id, _species, muts) => seen.set(id, new Set(muts)));

  const out: RareCrop[] = [];
  index(next, (id, species, muts) => {
    const before = seen.get(id) ?? new Set<string>();
    for (const m of muts) {
      if (rare.has(m) && !before.has(m)) out.push({ mutation: m, species });
    }
  });
  return out;
}

/** Œufs mûrs pas encore signalés. Rend leurs clés, que l'appelant retient. */
export function newlyReadyEggs(tiles: unknown, now: number, announced: ReadonlySet<string>): string[] {
  if (!tiles || typeof tiles !== "object") return [];
  const out: string[] = [];
  for (const [tileIdx, obj] of Object.entries(tiles as Record<string, unknown>)) {
    const o = obj as { objectType?: unknown; maturedAt?: unknown; plantedAt?: unknown } | null;
    if (!o || o.objectType !== "egg") continue;
    const matured = Number(o.maturedAt);
    if (!Number.isFinite(matured) || matured <= 0 || matured > now) continue;
    const key = `${tileIdx}|${o.plantedAt ?? ""}`;
    if (!announced.has(key)) out.push(key);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/*  Le temps                                                           */
/* ------------------------------------------------------------------ */

export type DayPart = "night" | "early" | "morning" | "afternoon" | "evening" | "late";

/** Heure LOCALE du joueur (0 à 23) : `Date#getHours` suit déjà son fuseau. */
export function dayPart(hour: number): DayPart {
  if (hour < 5) return "night";
  if (hour < 8) return "early";
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 22) return "evening";
  return "late";
}

/** Répliques mêlées aux phrases libres selon l'heure qu'il est chez le joueur. */
const DAY_PART_LINES: Record<DayPart, readonly string[]> = {
  night: [
    "Shouldn't you be asleep?",
    "The garden's so quiet at night.",
    "Night owl, huh?",
    "I'm not tired. You're tired.",
    "Midnight snacks count as gardening, right?",
  ],
  early: ["Early bird gets the best seeds.", "Morning already? I barely slept.", "Nothing beats an early start."],
  morning: ["Coffee first, crops second.", "Fresh morning, fresh sprouts.", "Morning, boss! Ready for the day?"],
  afternoon: ["Lunch break in the garden? Good call.", "Nice afternoon for it.", "Afternoon sun, happy plants."],
  evening: ["Evening already? Time flies in here.", "Love the evening light on the garden.", "One more harvest before dinner?"],
  late: ["It's getting late, boss.", "Late night gardening session?", "Don't stay up too late, okay?"],
};

export function dayPartLines(hour: number): readonly string[] {
  return DAY_PART_LINES[dayPart(hour)];
}

/* ------------------------------------------------------------------ */
/*  Le calendrier                                                      */
/* ------------------------------------------------------------------ */

export type Holiday = "newyear" | "valentine" | "aprilfools" | "halloween" | "christmas" | "newyearseve";

/** Fête du jour, à la date LOCALE du joueur. Pâques bouge chaque année : absente. */
export function holidayOf(date: Date): Holiday | null {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (m === 1 && d === 1) return "newyear";
  if (m === 2 && d === 14) return "valentine";
  if (m === 4 && d === 1) return "aprilfools";
  if (m === 10 && d === 31) return "halloween";
  if (m === 12 && (d === 24 || d === 25)) return "christmas";
  if (m === 12 && d === 31) return "newyearseve";
  return null;
}

const HOLIDAY_LINES: Record<Holiday, readonly string[]> = {
  newyear: ["Happy New Year! New year, new crops.", "First harvest of the year, let's make it count!"],
  valentine: ["Happy Valentine's Day! I got you a sprout.", "Roses are red, crops are green, best gardener I've ever seen."],
  aprilfools: ["Did you know crops can talk? April fools!", "I planted a joke. It hasn't grown yet."],
  halloween: ["Happy Halloween! Any spooky crops tonight?", "Boo! Did I scare you?"],
  christmas: ["Merry Christmas! Hope Santa brings you rare seeds.", "Best present ever: a full garden."],
  newyearseve: ["Last day of the year! Let's end it with a big harvest.", "Any resolutions? Mine is more gardening."],
};

/** Salut d'arrivée un jour de fête, et annonce à minuit quand elle commence. */
const HOLIDAY_GREETINGS: Record<Holiday, readonly string[]> = {
  newyear: ["Happy New Year, boss!", "Happy New Year! Here's to a great harvest."],
  valentine: ["Happy Valentine's Day!", "Aww, spending Valentine's Day with me?"],
  aprilfools: ["Welcome back! Your garden turned into a desert. April fools!", "Happy April Fools! Don't trust anything I say today."],
  halloween: ["Happy Halloween! Trick or treat?", "Spooky season is here! Happy Halloween!"],
  christmas: ["Merry Christmas!", "Merry Christmas, boss! Thanks for visiting me."],
  newyearseve: ["Last day of the year! Glad you're here.", "Happy New Year's Eve!"],
};

const WEEKEND_LINES: readonly string[] = ["Weekend gardening, the best kind.", "No work today? Perfect."];
const SUNDAY_LINES: readonly string[] = ["Lazy Sunday in the garden."];

/**
 * Répliques d'heure et de calendrier, mêlées aux phrases libres quand on lui
 * parle : le moment de la journée, le week-end, la fête du jour.
 */
export function timeLines(date: Date): string[] {
  const out = [...dayPartLines(date.getHours())];
  const day = date.getDay();
  if (day === 0 || day === 6) out.push(...WEEKEND_LINES);
  if (day === 0) out.push(...SUNDAY_LINES);
  const holiday = holidayOf(date);
  if (holiday) out.push(...HOLIDAY_LINES[holiday]);
  return out;
}

/** Pose des répliques d'heure et de calendrier, pour que `lineEmote` les connaisse aussi. */
export const TIME_LINE_EMOTES: Record<string, EmoteType> = {
  "Shouldn't you be asleep?": EmoteType.Questioning,
  "Night owl, huh?": EmoteType.Laughing,
  "I'm not tired. You're tired.": EmoteType.Laughing,
  "Midnight snacks count as gardening, right?": EmoteType.Questioning,
  "Early bird gets the best seeds.": EmoteType.Clapping,
  "Morning already? I barely slept.": EmoteType.Crying,
  "Morning, boss! Ready for the day?": EmoteType.Questioning,
  "Lunch break in the garden? Good call.": EmoteType.Clapping,
  "Love the evening light on the garden.": EmoteType.Love,
  "One more harvest before dinner?": EmoteType.Questioning,
  "Late night gardening session?": EmoteType.Questioning,
  "Weekend gardening, the best kind.": EmoteType.Love,
  "No work today? Perfect.": EmoteType.Clapping,
  "Lazy Sunday in the garden.": EmoteType.Love,
  "Happy New Year! New year, new crops.": EmoteType.Clapping,
  "First harvest of the year, let's make it count!": EmoteType.Clapping,
  "Happy Valentine's Day! I got you a sprout.": EmoteType.Love,
  "Roses are red, crops are green, best gardener I've ever seen.": EmoteType.Love,
  "Did you know crops can talk? April fools!": EmoteType.Laughing,
  "I planted a joke. It hasn't grown yet.": EmoteType.Laughing,
  "Happy Halloween! Any spooky crops tonight?": EmoteType.Questioning,
  "Boo! Did I scare you?": EmoteType.Laughing,
  "Merry Christmas! Hope Santa brings you rare seeds.": EmoteType.Love,
  "Best present ever: a full garden.": EmoteType.Love,
  "Last day of the year! Let's end it with a big harvest.": EmoteType.Clapping,
  "Any resolutions? Mine is more gardening.": EmoteType.Questioning,
};

/* ------------------------------------------------------------------ */
/*  Session et anniversaire                                            */
/* ------------------------------------------------------------------ */

/** Absence au-delà de laquelle on considère qu'une nouvelle session commence. */
export const SESSION_GAP_MS = 20 * 60_000;

export type StoredSession = {
  startedAt: number;
  lastSeenAt: number;
  announcedHours: number;
  /** Première rencontre : l'origine des anniversaires. Survit aux sessions. */
  firstMetAt: number;
  /** Dernier anniversaire fêté, en jours, pour ne pas le fêter deux fois. */
  celebratedDays: number;
};

export type SessionResume = {
  session: StoredSession;
  /** `null` : même session (un rechargement), rien à dire. */
  greeting: { first: boolean; awayMs: number } | null;
};

/**
 * Reprend ou ouvre une session.
 *
 * Un rechargement de page ou une coupure brève ne remet pas le compteur à
 * zéro : « ça fait 2 h » doit rester vrai après un F5. Au-delà de
 * `SESSION_GAP_MS` sans signe de vie, c'est un retour, et il mérite un salut.
 *
 * La date de rencontre, elle, ne se remet jamais à zéro. Une session écrite
 * avant qu'elle existe n'en a pas : on la date d'aujourd'hui, faute de mieux.
 */
export function resumeSession(stored: unknown, now: number): SessionResume {
  const s = stored as Partial<StoredSession> | null | undefined;
  const lastSeenAt = Number(s?.lastSeenAt);
  const startedAt = Number(s?.startedAt);
  const valid = Number.isFinite(lastSeenAt) && lastSeenAt > 0 && Number.isFinite(startedAt) && startedAt > 0 && startedAt <= now;

  const storedMet = Number(s?.firstMetAt);
  const firstMetAt = Number.isFinite(storedMet) && storedMet > 0 && storedMet <= now ? storedMet : now;
  const celebratedDays = Math.max(0, Math.floor(Number(s?.celebratedDays) || 0));

  if (valid && now - lastSeenAt < SESSION_GAP_MS) {
    const announcedHours = Math.max(0, Math.floor(Number(s?.announcedHours) || 0));
    return { session: { startedAt, lastSeenAt: now, announcedHours, firstMetAt, celebratedDays }, greeting: null };
  }
  return {
    session: { startedAt: now, lastSeenAt: now, announcedHours: 0, firstMetAt, celebratedDays },
    greeting: { first: !valid, awayMs: valid ? now - lastSeenAt : 0 },
  };
}

const DAY_MS = 24 * 3_600_000;

/**
 * Salut d'arrivée.
 *
 * Une longue absence prime sur tout, puis la fête du jour, puis le moment de
 * la journée : « Merry Christmas » vaut mieux que « Good morning » un 25
 * décembre, mais « où étais-tu passé ? » reste plus juste après une semaine.
 */
export function greetingReaction(
  greeting: { first: boolean; awayMs: number },
  hour: number,
  random: () => number,
  holiday: Holiday | null = null
): Reaction {
  let lines: readonly string[];
  if (greeting.first) {
    lines = ["Hi there! I'll be sticking around.", "Nice to meet you! Let's grow something great."];
  } else if (greeting.awayMs >= 3 * DAY_MS) {
    lines = ["Where have you been? I missed you!", "You're back! It's been ages.", "Finally! I was starting to talk to the plants."];
  } else if (holiday) {
    lines = HOLIDAY_GREETINGS[holiday];
  } else if (greeting.awayMs >= DAY_MS) {
    lines = ["Welcome back! The garden missed you.", "Hey, you're back! Good to see you."];
  } else {
    const byPart: Record<DayPart, readonly string[]> = {
      night: ["Hey, night owl! Couldn't sleep?", "Gardening at this hour? I like your style."],
      early: ["Up with the sun, I see!", "Good morning! You're up early."],
      morning: ["Good morning! Let's grow something.", "Morning! Ready when you are."],
      afternoon: ["Good afternoon! Ready to garden?", "Hey! Perfect timing, the plants were asking for you."],
      evening: ["Good evening! Glad you're here.", "Evening! Let's make it a good one."],
      late: ["Evening, boss. Late session tonight?", "Hey! Quick one before bed?"],
    };
    lines = byPart[dayPart(hour)];
  }
  return { key: "session:greeting", message: pickOne(lines, random), emote: EmoteType.Love, priority: "high" };
}

/** Jours fêtés : une semaine, un mois, cent jours, puis chaque année. */
function anniversarySteps(days: number): number[] {
  const steps = [7, 30, 100];
  for (let year = 1; year * 365 <= days; year++) steps.push(year * 365);
  return steps;
}

/**
 * L'anniversaire à fêter, s'il y en a un de neuf.
 *
 * Le plus récent seulement : un joueur absent trois mois ne se voit pas
 * souhaiter la semaine, le mois et les cent jours d'un coup.
 */
export function anniversaryReaction(
  firstMetAt: number,
  now: number,
  celebratedDays: number,
  random: () => number
): { reaction: Reaction | null; celebratedDays: number } {
  const days = Math.floor((now - firstMetAt) / DAY_MS);
  let due: number | null = null;
  for (const step of anniversarySteps(days)) if (step <= days && step > celebratedDays) due = step;
  if (due === null) return { reaction: null, celebratedDays };

  let lines: readonly string[];
  if (due === 7) lines = ["One week together already! Thanks for having me.", "A whole week of gardening together!"];
  else if (due === 30) lines = ["We've been gardening together for a whole month!", "One month together! Time flies."];
  else if (due === 100) lines = ["100 days together! That's a lot of crops.", "Day 100! Best garden buddy ever."];
  else {
    const years = due / 365;
    lines =
      years === 1
        ? ["Happy anniversary! One year together!", "One year already! Thanks for keeping me around."]
        : [`Happy anniversary! ${years} years together!`, `${years} years of gardening together. Wow.`];
  }
  return {
    reaction: { key: "anniversary", message: pickOne(lines, random), emote: EmoteType.Love, priority: "high" },
    celebratedDays: due,
  };
}

/** Heures pleines passées depuis le début de la session. */
export function sessionHours(session: StoredSession, now: number): number {
  return Math.max(0, Math.floor((now - session.startedAt) / 3_600_000));
}

export function sessionHourReaction(hours: number, random: () => number): Reaction | null {
  if (hours < 1) return null;
  let lines: readonly string[];
  let emote: EmoteType = EmoteType.Clapping;
  if (hours === 1) {
    lines = ["We've been at it for an hour already.", "One hour in! Time flies when you're gardening."];
  } else if (hours === 2) {
    lines = ["Two hours in! Look at this place.", "Two hours already? Where did the time go?"];
  } else if (hours < 6) {
    lines = [`${hours} hours straight. Maybe stretch your legs?`, `${hours} hours! Don't forget to drink some water.`, `${hours} hours already. You're dedicated!`];
    emote = EmoteType.Questioning;
  } else {
    lines = [`${hours} hours?! Are you okay?`, `${hours} hours. I think the plants need a break. And you too.`];
    emote = EmoteType.Crying;
  }
  return { key: `session:hours`, message: pickOne(lines, random), emote, priority: "high" };
}

/**
 * Passage de minuit, et lever du soleil après une longue nuit.
 *
 * Un minuit qui ouvre une fête (le 1er janvier, le 31 octobre...) la souhaite
 * plutôt que de s'étonner de l'heure.
 */
export function clockReaction(
  prevHour: number,
  hour: number,
  sessionMs: number,
  random: () => number,
  holiday: Holiday | null = null
): Reaction | null {
  if (prevHour === hour) return null;
  if (hour === 0) {
    if (holiday) {
      return { key: "clock:holiday", message: pickOne(HOLIDAY_GREETINGS[holiday], random), emote: EmoteType.Love, priority: "high" };
    }
    return {
      key: "clock:midnight",
      message: pickOne(["It's midnight! Still going?", "Midnight already. The garden never sleeps, huh?"], random),
      emote: EmoteType.Questioning,
      priority: "high",
    };
  }
  if (hour === 6 && sessionMs >= 3 * 3_600_000) {
    return {
      key: "clock:sunrise",
      message: pickOne(["The sun's coming up. Did we just pull an all-nighter?", "Is that... sunrise? We've been up all night!"], random),
      emote: EmoteType.Laughing,
      priority: "high",
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  File d'attente                                                     */
/* ------------------------------------------------------------------ */

/** Écart minimum entre deux réactions : il commente, il ne commente pas tout. */
export const REACTION_GAP_MS = 15_000;

/** Durée pendant laquelle une réaction peut encore être dite. */
export const REACTION_TTL_MS: Record<ReactionPriority, number> = {
  high: 3 * 60_000,
  low: 10_000,
};

/** Temporisation par famille, après qu'une réplique de la famille a été dite. */
export const FAMILY_COOLDOWN_MS: Record<string, number> = {
  ability: 5 * 60_000,
  sale: 60_000,
  hatch: 60_000,
  egg: 5 * 60_000,
  shop: 30_000,
  rarecrop: 30_000,
};

type Queued = Reaction & { at: number };

export type GateState = {
  lastSpokeAt: number;
  mutedUntil: Record<string, number>;
  queue: Queued[];
};

export function initialGateState(): GateState {
  return { lastSpokeAt: 0, mutedUntil: {}, queue: [] };
}

const familyOf = (key: string) => key.split(":")[0];

/**
 * Propose une réaction. Une famille temporisée l'ignore ; une réaction de
 * même clé déjà en attente est remplacée, la plus récente dit mieux les choses.
 */
export function offerReaction(state: GateState, reaction: Reaction, now: number): GateState {
  if (now < (state.mutedUntil[familyOf(reaction.key)] ?? 0)) return state;
  const existing = state.queue.find((q) => q.key === reaction.key);
  if (existing && (existing.weight ?? 0) > (reaction.weight ?? 0)) return state;
  const queue = state.queue.filter((q) => q.key !== reaction.key);
  queue.push({ ...reaction, at: now });
  return { ...state, queue };
}

/**
 * Prend la prochaine réaction à dire, s'il y en a une et que le moment s'y
 * prête. Les `high` passent avant les `low`, puis la plus ancienne d'abord.
 */
export function takeReaction(state: GateState, now: number, busy: boolean): { reaction: Reaction | null; state: GateState } {
  const queue = state.queue.filter((q) => now - q.at <= REACTION_TTL_MS[q.priority]);
  const kept = { ...state, queue };
  if (busy || queue.length === 0 || now - state.lastSpokeAt < REACTION_GAP_MS) return { reaction: null, state: kept };

  const chosen = queue.find((q) => q.priority === "high") ?? queue[0];
  const family = familyOf(chosen.key);
  const { at: _at, ...reaction } = chosen;
  return {
    reaction,
    state: {
      lastSpokeAt: now,
      mutedUntil: { ...state.mutedUntil, [family]: now + (FAMILY_COOLDOWN_MS[family] ?? 0) },
      // Le reste de la famille qui vient de parler se tait aussi.
      queue: queue.filter((q) => q !== chosen && (FAMILY_COOLDOWN_MS[family] ? familyOf(q.key) !== family : true)),
    },
  };
}
