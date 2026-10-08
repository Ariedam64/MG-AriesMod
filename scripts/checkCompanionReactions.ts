// Vérifie ce que le companion dit de lui-même, et quand.
//
// Tout est pur (src/services/companion/reactions.ts) : les abonnements au jeu
// vivent à part, dans reactionWatch.ts, et ne décident de rien.

import {
  FAMILY_COOLDOWN_MS,
  REACTION_GAP_MS,
  REACTION_TTL_MS,
  SESSION_GAP_MS,
  abilityReaction,
  anniversaryReaction,
  badLuckReactions,
  clockReaction,
  holidayOf,
  timeLines,
  crossedMilestone,
  dayPart,
  dayPartLines,
  eggsReadyReaction,
  formatMilestone,
  greetingReaction,
  initialGateState,
  newRareCrops,
  newlyReadyEggs,
  offerReaction,
  restockedFollowed,
  resumeSession,
  sessionHourReaction,
  sessionHours,
  shopReaction,
  statReactions,
  takeReaction,
  weatherChangeReaction,
  type Reaction,
} from "../src/features/companion/reactions";
import { DEFAULT_CUSTOM_LINES, POKE_WINDOW_MS, lineEmote, pokeLine } from "../src/features/companion/dialogueLines";
import {
  EmoteType,
  NPC_TALKING_MS,
  companionEmoteEntry,
  cutTalking,
  emoteStartDelay,
  mergeEmoteSource,
} from "../src/features/companion/emoteTypes";
import type { StatsSnapshot } from "../src/features/stats/stats";

let fails = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = String(got) === String(want);
  if (!ok) fails++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : `\n        got=${got}  want=${want}`}`);
};
const r0 = () => 0;

function stats(patch: {
  harvested?: number;
  planted?: number;
  soldValue?: number;
  soldCount?: number;
  hatched?: { normal?: number; gold?: number; rainbow?: number };
  abilities?: number;
}): StatsSnapshot {
  return {
    createdAt: 0,
    garden: { totalPlanted: patch.planted ?? 0, totalHarvested: patch.harvested ?? 0, totalDestroyed: 0, watercanUsed: 0, waterTimeSavedMs: 0 },
    shops: {
      seedsBought: 0,
      decorBought: 0,
      eggsBought: 0,
      toolsBought: 0,
      cropsSoldCount: patch.soldCount ?? 0,
      cropsSoldValue: patch.soldValue ?? 0,
      petsSoldCount: 0,
      petsSoldValue: 0,
    },
    pets: { hatchedByType: { Bunny: { normal: 0, gold: 0, rainbow: 0, ...(patch.hatched ?? {}) } } },
    abilities: { CoinFinder: { triggers: patch.abilities ?? 0, totalValue: 0 } },
    weather: {},
  };
}

console.log("--- paliers ---");
check("99 -> 100 franchit 100", crossedMilestone(99, 100), 100);
check("100 -> 101 ne franchit rien", crossedMilestone(100, 101), "null");
check("un saut de deux paliers annonce le plus haut", crossedMilestone(900, 12_000), 10_000);
check("une baisse ne franchit rien", crossedMilestone(1_000, 10), "null");
check("les paliers suivent 100, 1k, 10k, 100k", [100, 1_000, 10_000, 100_000].map((m) => crossedMilestone(m - 1, m)).join(","), "100,1000,10000,100000");
check("1 000 s'écrit avec séparateur", formatMilestone(1_000), "1,000");
check("le million s'écrit en toutes lettres", formatMilestone(1_000_000), "1 million");
check("le milliard aussi", formatMilestone(1e9), "1 billion");
{
  const got = statReactions(stats({ harvested: 999 }), stats({ harvested: 1_000 }), r0);
  check("1 000e récolte : une réaction", got.length, 1);
  check("et elle mentionne le palier", got[0]?.message.includes("1,000"), true);
  check("et attend son tour si besoin", got[0]?.priority, "high");
  check("au démarrage, des stats déjà hautes ne disent rien", statReactions(stats({ harvested: 5_000 }), stats({ harvested: 5_000 }), r0).length, 0);
  const abilities = statReactions(stats({ abilities: 99 }), stats({ abilities: 100 }), r0);
  check("les capacités des pets ont leurs paliers", abilities.some((r) => r.key === "milestone:abilities"), true);
}

console.log("\n--- événements tirés des stats ---");
{
  const sale = statReactions(stats({ soldValue: 500 }), stats({ soldValue: 2_000 }), r0);
  check("une vente fait réagir", sale.some((r) => r.key === "sale:crops"), true);
  check("avec le montant gagné", sale.find((r) => r.key === "sale:crops")?.message.includes("1,500"), true);
  check("et elle ne vaut que sur le moment", sale.find((r) => r.key === "sale:crops")?.priority, "low");
  const rainbow = statReactions(stats({ hatched: { rainbow: 0, gold: 0 } }), stats({ hatched: { rainbow: 1, gold: 1 } }), r0);
  check("un rainbow l'emporte sur un gold du même lot", rainbow.filter((r) => r.key.startsWith("hatch:")).map((r) => r.key).join(), "hatch:rainbow");
  check("avec la pose Love", rainbow.find((r) => r.key === "hatch:rainbow")?.emote, EmoteType.Love);
}

console.log("\n--- météo ---");
{
  check("la météo déjà en cours n'est pas une nouvelle", weatherChangeReaction("Rain", "Rain", "Rain", "x", r0), "null");
  const start = weatherChangeReaction(null, "Thunderstorm", "", "Whoa!", r0);
  check("une météo qui commence reprend la réplique fournie", start?.message, "Whoa!");
  check("l'orage fait peur", start?.emote, EmoteType.Crying);
  const end = weatherChangeReaction("Frost", null, "Snow", "", r0);
  check("la fin d'une météo utilise son nom affiché", end?.message.includes("Snow"), true);
  check("et jamais l'ID brut", end?.message.includes("Frost"), false);
}

console.log("\n--- capacités, œufs, shop, crops rares ---");
{
  check("une capacité nomme le pet", abilityReaction({ name: "Fluffy", abilityName: "Coin Finder" }, r0).message, "Fluffy just used Coin Finder!");
  check("sans nom, l'espèce", abilityReaction({ species: "Bunny", abilityName: "Coin Finder" }, r0).message, "Your Bunny just used Coin Finder!");
  check("aucun œuf, rien à dire", eggsReadyReaction(0, r0), "null");
  check("plusieurs œufs sont comptés", eggsReadyReaction(3, r0)?.message.includes("3"), true);

  const garden = { "4": { objectType: "egg", plantedAt: 1, maturedAt: 50 }, "5": { objectType: "egg", plantedAt: 2, maturedAt: 500 } };
  check("seul l'œuf mûr est prêt", newlyReadyEggs(garden, 100, new Set()).join(), "4|1");
  check("un œuf déjà annoncé ne revient pas", newlyReadyEggs(garden, 100, new Set(["4|1"])).length, 0);

  check("un item seul", shopReaction(["Starweaver"], r0)?.message, "Starweaver is in the shop! Go go go!");
  check("trois items et plus", shopReaction(["A", "B", "C"], r0)?.message.includes("A, B and more"), true);

  const followed = (id: string) => id === "Seed:Starweaver";
  const before = { seed: { secondsUntilRestock: 10, inventory: [{ species: "Starweaver", initialStock: 1 }] } };
  const restock = { seed: { secondsUntilRestock: 300, inventory: [{ species: "Starweaver", initialStock: 1 }, { species: "Carrot", initialStock: 5 }] } };
  const ticking = { seed: { secondsUntilRestock: 9, inventory: before.seed.inventory } };
  check("un restock avec un item suivi le signale", restockedFollowed(before, restock, followed).join(), "Seed:Starweaver");
  check("pas de restock, pas d'annonce", restockedFollowed(before, ticking, followed).length, 0);
  check("le premier relevé ne dit rien", restockedFollowed(null, restock, followed).length, 0);
  const soldOut = { seed: { secondsUntilRestock: 300, inventory: [{ species: "Starweaver", initialStock: 0 }] } };
  check("un item suivi sans stock ne compte pas", restockedFollowed(before, soldOut, followed).length, 0);

  const rare = new Set(["Gold", "Rainbow"]);
  const g1 = { "0": { objectType: "plant", species: "Carrot", slots: [{ startTime: 1, mutations: [] }] } };
  const g2 = { "0": { objectType: "plant", species: "Carrot", slots: [{ startTime: 1, mutations: ["Gold", "Wet"] }, { startTime: 9, mutations: ["Rainbow"] }] } };
  const found = newRareCrops(g1, g2, rare);
  check("une mutation rare nouvelle est repérée", found.map((c) => c.mutation).join(), "Gold,Rainbow");
  check("une mutation de météo ne compte pas", found.some((c) => c.mutation === "Wet"), false);
  check("déjà là au relevé précédent, rien de neuf", newRareCrops(g2, g2, rare).length, 0);
  check("premier relevé : référence seulement", newRareCrops(null, g2, rare).length, 0);
}

console.log("\n--- session et heure locale ---");
{
  const now = 1_000_000_000_000;
  const first = resumeSession(undefined, now);
  check("premier lancement : salut de bienvenue", first.greeting?.first, true);
  const reload = resumeSession({ startedAt: now - 2 * 3_600_000, lastSeenAt: now - 60_000, announcedHours: 2 }, now);
  check("un rechargement garde la session", reload.session.startedAt, now - 2 * 3_600_000);
  check("et ne salue pas", reload.greeting, "null");
  check("et se souvient des heures annoncées", reload.session.announcedHours, 2);
  const back = resumeSession({ startedAt: now - 10 * 3_600_000, lastSeenAt: now - SESSION_GAP_MS - 1, announcedHours: 3 }, now);
  check("après une vraie absence, nouvelle session", back.session.startedAt, now);
  check("et on salue", back.greeting?.first, false);
  check("les heures repartent de zéro", back.session.announcedHours, 0);
  check("un blob abîmé vaut un premier lancement", resumeSession({ startedAt: "x" }, now).greeting?.first, true);

  check("2 h 30 font 2 heures pleines", sessionHours({ startedAt: now - 2.5 * 3_600_000, lastSeenAt: now, announcedHours: 0 }, now), 2);
  check("moins d'une heure, rien", sessionHourReaction(0, r0), "null");
  check("deux heures", sessionHourReaction(2, r0)?.message.toLowerCase().includes("two hours"), true);
  check("à partir de 3 h il suggère une pause", sessionHourReaction(4, r0)?.message.includes("4 hours"), true);

  check("3 h du matin, c'est la nuit", dayPart(3), "night");
  check("9 h, le matin", dayPart(9), "morning");
  check("23 h, tard", dayPart(23), "late");
  check("les répliques de nuit parlent de dormir", dayPartLines(2).some((l) => /asleep|night/i.test(l)), true);
  check("salut du matin", greetingReaction({ first: false, awayMs: 3_600_000 }, 9, r0).message.includes("morning"), true);
  check("long retour : il t'a attendu", greetingReaction({ first: false, awayMs: 5 * 86_400_000 }, 9, r0).message.includes("missed"), true);

  check("minuit se remarque", clockReaction(23, 0, 0, r0)?.key, "clock:midnight");
  check("6 h après une nuit blanche", clockReaction(5, 6, 4 * 3_600_000, r0)?.key, "clock:sunrise");
  check("6 h au réveil, rien à dire", clockReaction(5, 6, 600_000, r0), "null");
  check("même heure, rien", clockReaction(14, 14, 0, r0), "null");
}

console.log("\n--- emotes des phrases ---");
{
  check("une blague fait rire", lineEmote("I'm not lazy, I'm supervising."), EmoteType.Laughing);
  check("une question interroge", lineEmote("Is it snack time yet?"), EmoteType.Questioning);
  check("une phrase inconnue n'a pas de pose", lineEmote("Custom line from the player"), "null");
  const withEmote = DEFAULT_CUSTOM_LINES.filter((l) => lineEmote(l) !== null).length;
  check("la plupart des phrases par défaut ont une pose", withEmote >= DEFAULT_CUSTOM_LINES.length / 2, true);
  check("les répliques d'heure en ont aussi", lineEmote("Night owl, huh?"), EmoteType.Laughing);
}

console.log("\n--- file d'attente ---");
{
  const high = (key: string, message = key): Reaction => ({ key, message, emote: null, priority: "high" });
  const low = (key: string, message = key): Reaction => ({ key, message, emote: null, priority: "low" });
  const t = 1_000_000;

  let g = offerReaction(initialGateState(), low("sale:crops"), t);
  g = offerReaction(g, high("milestone:harvested"), t);
  let r = takeReaction(g, t, false);
  check("une réaction importante passe en premier", r.reaction?.key, "milestone:harvested");
  r = takeReaction(r.state, t + 1_000, false);
  check("deux réactions trop proches : la seconde attend", r.reaction, "null");
  r = takeReaction(r.state, t + REACTION_GAP_MS + 1, false);
  check("une réaction low trop vieille se perd", r.reaction, "null");

  g = offerReaction(initialGateState(), high("milestone:planted"), t);
  r = takeReaction(g, t, true);
  check("occupé : rien ne sort", r.reaction, "null");
  r = takeReaction(r.state, t + 60_000, false);
  check("une réaction importante attend qu'il soit libre", r.reaction?.key, "milestone:planted");
  g = offerReaction(initialGateState(), high("egg"), t);
  r = takeReaction(g, t + REACTION_TTL_MS.high + 1, false);
  check("même importante, elle finit par expirer", r.reaction, "null");

  g = offerReaction(initialGateState(), low("ability"), t);
  r = takeReaction(g, t, false);
  g = offerReaction(r.state, low("ability"), t + REACTION_GAP_MS + 1);
  check("une famille qui vient de parler se tait", g.queue.length, 0);
  g = offerReaction(r.state, low("ability"), t + FAMILY_COOLDOWN_MS.ability + 1);
  check("et reparle après sa temporisation", g.queue.length, 1);

  g = offerReaction(initialGateState(), high("shop", "old"), t);
  g = offerReaction(g, high("shop", "new"), t + 1);
  check("une même réaction en attente est remplacée par la plus récente", g.queue.map((q) => q.message).join(), "new");
}

console.log("\n--- malchance aux éclosions ---");
{
  const name = (id: string) => (id === "MythicalEgg" ? "Mythical Egg" : id);
  const drought = badLuckReactions({ MythicalEgg: { gold: 24, rainbow: 24 } }, { MythicalEgg: { gold: 25, rainbow: 25 } }, name, r0);
  check("25 sans Gold : il compatit", drought.map((r) => r.key).join(), "badluck:gold");
  check("en nommant l'œuf", drought[0]?.message.includes("Mythical Egg"), true);
  check("avec Crying", drought[0]?.emote, EmoteType.Crying);
  check("25 sans Rainbow, c'est normal : rien", drought.some((r) => r.key === "badluck:rainbow"), false);
  check(
    "100 sans Rainbow : là oui",
    badLuckReactions({ E: { gold: 0, rainbow: 99 } }, { E: { gold: 0, rainbow: 100 } }, name, r0).map((r) => r.key).join(),
    "badluck:rainbow"
  );
  check("entre deux paliers, rien", badLuckReactions({ E: { gold: 30, rainbow: 0 } }, { E: { gold: 31, rainbow: 0 } }, name, r0).length, 0);

  const relief = badLuckReactions({ E: { gold: 79, rainbow: 0 } }, { E: { gold: 0, rainbow: 1 } }, name, r0);
  check("un Gold après 80 essais : FINALLY", relief[0]?.message.includes("FINALLY") && relief[0]?.message.includes("80"), true);
  check("sous la même clé que la réaction ordinaire", relief[0]?.key, "hatch:gold");
  check("mais plus lourde", relief[0]?.weight, 1);
  check("un Gold après 3 essais n'a rien d'une délivrance", badLuckReactions({ E: { gold: 3, rainbow: 0 } }, { E: { gold: 0, rainbow: 0 } }, name, r0).length, 0);
  check("un œuf jamais vu avant sert de référence", badLuckReactions({}, { E: { gold: 25, rainbow: 0 } }, name, r0).length, 0);

  // La délivrance l'emporte sur « un Gold ! », quel que soit l'ordre d'arrivée.
  const plain: Reaction = { key: "hatch:gold", message: "plain", emote: null, priority: "high" };
  const t = 5_000_000;
  let g = offerReaction(initialGateState(), relief[0], t);
  g = offerReaction(g, plain, t + 1);
  check("la réaction ordinaire n'écrase pas la délivrance", g.queue[0]?.message.includes("FINALLY"), true);
  g = offerReaction(offerReaction(initialGateState(), plain, t), relief[0], t + 1);
  check("et la délivrance remplace l'ordinaire", g.queue.length === 1 && g.queue[0].message.includes("FINALLY"), true);
}

console.log("\n--- calendrier ---");
{
  // Mois de 0 à 11 dans le constructeur de Date, à l'heure locale.
  check("le 31 octobre, Halloween", holidayOf(new Date(2026, 9, 31, 15)), "halloween");
  check("le 25 décembre, Noël", holidayOf(new Date(2026, 11, 25, 9)), "christmas");
  check("le 1er janvier, Nouvel An", holidayOf(new Date(2027, 0, 1, 0)), "newyear");
  check("un jour ordinaire, rien", holidayOf(new Date(2026, 8, 28, 12)), "null");

  const saturday = new Date(2026, 9, 3, 15); // samedi 3 octobre 2026
  const tuesday = new Date(2026, 8, 29, 15);
  check("le week-end a ses répliques", timeLines(saturday).includes("Weekend gardening, the best kind."), true);
  check("pas en semaine", timeLines(tuesday).includes("Weekend gardening, the best kind."), false);
  check("Halloween ajoute les siennes", timeLines(new Date(2026, 9, 31, 15)).some((l) => l.includes("Halloween")), true);
  check("les répliques de fête ont une pose", lineEmote("Boo! Did I scare you?"), EmoteType.Laughing);

  check("un salut un jour de fête", greetingReaction({ first: false, awayMs: 3_600_000 }, 9, r0, "christmas").message, "Merry Christmas!");
  check("une longue absence prime sur la fête", greetingReaction({ first: false, awayMs: 5 * 86_400_000 }, 9, r0, "christmas").message.includes("missed"), true);
  check("minuit du Nouvel An souhaite la nouvelle année", clockReaction(23, 0, 0, r0, "newyear")?.message.includes("New Year"), true);
}

console.log("\n--- anniversaire ---");
{
  const day = 86_400_000;
  const met = 1_700_000_000_000;
  check("six jours, rien", anniversaryReaction(met, met + 6 * day, 0, r0).reaction, "null");
  const week = anniversaryReaction(met, met + 7 * day, 0, r0);
  check("une semaine, on fête", week.reaction?.message.includes("week"), true);
  check("et on le note", week.celebratedDays, 7);
  check("pas deux fois", anniversaryReaction(met, met + 8 * day, 7, r0).reaction, "null");
  const month = anniversaryReaction(met, met + 45 * day, 7, r0);
  check("absent jusqu'au 45e jour : on fête le mois, pas la semaine en plus", month.celebratedDays, 30);
  check("un an", anniversaryReaction(met, met + 365 * day, 100, r0).reaction?.message.includes("One year"), true);
  check("deux ans", anniversaryReaction(met, met + 731 * day, 365, r0).reaction?.message.includes("2 years"), true);

  const now = met + 10 * day;
  const legacy = resumeSession({ startedAt: now - 3_600_000, lastSeenAt: now - 60_000, announcedHours: 1 }, now);
  check("une session d'avant l'anniversaire date la rencontre d'aujourd'hui", legacy.session.firstMetAt, now);
  const kept = resumeSession({ startedAt: now - 3_600_000, lastSeenAt: now - SESSION_GAP_MS - 1, announcedHours: 1, firstMetAt: met, celebratedDays: 7 }, now);
  check("une nouvelle session garde la date de rencontre", kept.session.firstMetAt, met);
  check("et les anniversaires déjà fêtés", kept.session.celebratedDays, 7);
}

console.log("\n--- clics en boucle ---");
{
  const t = 1_000_000;
  const clicks = (n: number, gap = 500) => Array.from({ length: n }, (_, i) => t - (n - 1 - i) * gap);
  check("4 clics, rien de spécial", pokeLine(clicks(4), t, r0), "null");
  const five = pokeLine(clicks(5), t, r0);
  check("5 clics en 10 s, il remarque", five?.message, "Okay okay, I'm listening!");
  check("amusé", five?.emote, EmoteType.Laughing);
  check("8 clics, intrigué", pokeLine(clicks(8), t, r0)?.emote, EmoteType.Questioning);
  check("12 clics, vexé", pokeLine(clicks(12), t, r0)?.emote, EmoteType.Angered);
  check("5 clics étalés sur une minute, rien", pokeLine(clicks(5, 15_000), t, r0), "null");
  check("la fenêtre est de 10 s", POKE_WINDOW_MS, 10_000);
}

console.log("\n--- une pose ne part pas sous l'animation Talking ---");
{
  // Bundle 1299 : chaque bulle de PNJ allume Talking pendant 3 s, et Talking
  // masque l'emote (le tutoriel du jeu coupe Talking pour en jouer une). Une
  // pose lancée juste après une bulle se jouait donc entièrement cachée.
  const spoke = 10_000;
  check("Talking dure 3 s, comme dans le jeu", NPC_TALKING_MS, 3000);
  check("juste après une bulle, la pose attend la fin de Talking", emoteStartDelay(spoke, spoke + 100) >= NPC_TALKING_MS - 100, true);
  check("à mi-parcours, elle attend le reste", emoteStartDelay(spoke, spoke + 2000) >= 1000, true);
  check("Talking fini, elle part tout de suite", emoteStartDelay(spoke, spoke + NPC_TALKING_MS + 1000), 0);
  check("s'il n'a jamais parlé, elle part tout de suite", emoteStartDelay(null, spoke), 0);
  // Quand on peut couper Talking nous-mêmes, la pose remplace la parole au lieu
  // de la suivre : pas de bouche qui bouge avant les points d'interrogation.
  check("Talking coupable : la pose part tout de suite", emoteStartDelay(spoke, spoke + 100, true), 0);
}

console.log("\n--- couper Talking sur l'avatar du companion ---");
{
  // Formes tirées du bundle 1299 : le système `avatar` tient `views` (une Map
  // playerId -> vue) et `stopNpcTalking(id, vue)`, qui annule le compte à
  // rebours de 3 s et éteint Talking.
  const calls: string[] = [];
  const view = { setTalking: (on: boolean) => calls.push(`view:${on}`) };
  const system = {
    views: new Map([["NPC_Reina", view]]),
    stopNpcTalking: (id: string, v: unknown) => calls.push(`stop:${id}:${v === view}`),
  };
  check("le companion trouvé, Talking est coupé", cutTalking(system, "NPC_Reina"), true);
  check("par la méthode du jeu, qui annule aussi son minuteur", calls.join(), "stop:NPC_Reina:true");

  calls.length = 0;
  const noStop = { views: new Map([["NPC_Reina", view]]) };
  check("sans stopNpcTalking, on éteint la vue directement", cutTalking(noStop, "NPC_Reina") && calls.join() === "view:false", true);
  check("PNJ absent des vues : rien de coupé", cutTalking(system, "NPC_Other"), false);
  check("système introuvable : rien de coupé", cutTalking(null, "NPC_Reina"), false);
  check("système d'une autre forme : rien de coupé", cutTalking({ views: {} }, "NPC_Reina"), false);
}

console.log("\n--- les emotes passent par la source que le jeu lit ---");
{
  // Recopie de la fonction du jeu (bundle 1299, chunk emoteAtoms) qui tire des
  // entrées du chat les emotes à afficher. `playerEmoteTypesAtom`, que le mod
  // écrivait, n'existe plus : ce calcul est la seule porte d'entrée.
  const gameEmoteTypes = (entries: any[], now: number, durationMs: number) => {
    const types: Record<string, number> = {};
    const seen = new Set<string>();
    for (let i = entries.length - 1; i >= 0; --i) {
      const c = entries[i];
      if (c?.kind !== "emote" || seen.has(c.playerId)) continue;
      seen.add(c.playerId);
      const end = c.lastTimestampMs + durationMs;
      if (!(c.emoteType === EmoteType.Idle || end <= now)) types[c.playerId] = c.emoteType;
    }
    return types;
  };
  const now = 1_000_000;
  const real = {
    entries: [
      { kind: "message", playerId: "p1", message: "hi" },
      { kind: "emote", playerId: "p2", emoteType: EmoteType.Clapping, lastTimestampMs: now - 200 },
    ],
    displayDurationMs: 1500,
  };

  const posing = mergeEmoteSource(real, { entries: [companionEmoteEntry("NPC_Reina", EmoteType.Laughing, now)] });
  const types = gameEmoteTypes(posing.entries, now, posing.displayDurationMs);
  check("le jeu voit la pose du companion", types.NPC_Reina, EmoteType.Laughing);
  check("sans toucher à celle d'un vrai joueur", types.p2, EmoteType.Clapping);
  check("la durée d'affichage du jeu est gardée", posing.displayDurationMs, 1500);
  // Datée dans le futur : l'horloge du jeu est calée sur le serveur, la nôtre
  // non. C'est nous qui retirons l'entrée à la fin de la pose.
  check("une horloge en avance de 5 s ne l'efface pas", gameEmoteTypes(posing.entries, now + 5_000, 1500).NPC_Reina, EmoteType.Laughing);

  const resting = mergeEmoteSource(real, { entries: [] });
  check("au repos, rien pour le companion", gameEmoteTypes(resting.entries, now, 1500).NPC_Reina, "undefined");
  check("et les entrées du jeu passent intactes", resting.entries.length, 2);
  check("une source illisible ne casse rien", mergeEmoteSource(null, { entries: [] }).entries.length, 0);
}

console.log("\n--- aucune réplique n'a de tiret cadratin ---");
{
  const samples: string[] = [];
  for (const v of [0, 0.5, 0.99]) {
    const rv = () => v;
    samples.push(
      ...statReactions(stats({ harvested: 99, soldValue: 0, hatched: {} }), stats({ harvested: 100, soldValue: 10, hatched: { gold: 1 } }), rv).map((r) => r.message),
      greetingReaction({ first: true, awayMs: 0 }, 3, rv).message,
      sessionHourReaction(7, rv)?.message ?? "",
      ...dayPartLines(3)
    );
  }
  check("pas de tiret cadratin", samples.some((s) => s.includes("—")), false);
}

console.log(fails === 0 ? "\nAll checks passed." : `\n${fails} check(s) failed.`);
process.exit(fails === 0 ? 0 : 1);
