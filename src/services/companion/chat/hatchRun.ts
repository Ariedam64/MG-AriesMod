// src/services/companion/chat/hatchRun.ts
// Exécution d'une couvée confirmée, et de la vente qui la suit parfois.
//
// Deux lots séparés, et c'est délibéré : faire éclore ne se rattrape pas mal,
// vendre ne se rattrape pas du tout. Chacun a donc sa confirmation, et rien ici
// n'enchaîne l'un sur l'autre — c'est la façade qui repose la question entre
// les deux.
//
// Comme partout ailleurs, on ne compte pas les envois : `HatchEgg` et `SellPet`
// partent sans accusé de réception. On relit l'état et on regarde ce qui a
// réellement changé.

import { PlayerService } from "../../player";
import { PetsService } from "../../pets";
import { readCompanionMap } from "../map";
import { loadCompanionSettings } from "../state";
import { PROGRESS_EVERY, SETTLE_MS, pacer, sleep, type BatchReporter } from "./batch";
import { wearTeam } from "./teamSwap";
import { createWalker, type Walker } from "./walk";
import { readHatchScope, readInventoryCount, readPetRows, INVENTORY_CAPACITY } from "./hatchRead";
import { hatchCheer, summarizeSell, type KeepRules, type PetRow } from "./hatch";
import { CompanionService } from "..";
import { compose, spaced } from "./bubbleTags";
import { eggIcon, mutationChips, petRowIcons, petThing } from "./bubbleIcons";

/** Le jeu laisse le sac se remplir puis refuse en silence : on relit souvent près du plafond. */
const RECOUNT_EVERY = 5;
const NEAR_CAPACITY = 5;

/**
 * Ce qu'un tirage exceptionnel s'accorde : la pose tenue, puis le temps d'arrêt.
 *
 * `holdMs` est la durée de l'emote, qui vaut 1,5 s partout ailleurs. `pauseMs`
 * est le temps pendant lequel il ne fait plus rien avant l'œuf suivant, là où
 * la cadence normale se compte en centaines de millisecondes. Les deux
 * comptent : tenir la pose sans
 * suspendre la couvée donnerait un companion qui adore et ouvre en même temps.
 *
 * Le Gold vaut la moitié du Rainbow : il marque le coup sans arrêter la
 * couvée aussi longtemps, et la hiérarchie entre les deux reste lisible.
 */
const CHEER_TIMING: Record<string, { holdMs: number; pauseMs: number }> = {
  Rainbow: { holdMs: 4000, pauseMs: 3000 },
  Gold: { holdMs: 2000, pauseMs: 1500 },
};

/**
 * Ce qu'il dit sur le coup, et ce qu'il dit en s'y remettant.
 *
 * `cheer` se colle derrière l'animal nommé, `resume` tombe après la pause. La
 * reprise est sautée si le joueur a demandé l'arrêt entre-temps : annoncer
 * qu'on s'y remet en s'arrêtant n'aurait aucun sens.
 */
const CHEER_LINES: Record<string, { cheer: string; resume: string }> = {
  Rainbow: { cheer: "I have never seen one of those.", resume: "Right. Where was I." },
  Gold: { cheer: "That one is a beauty.", resume: "Okay, back to it." },
};

/**
 * De quoi reconnaître la boutique d'animaux dans les clés de la map.
 *
 * Ce ne sont pas des noms de bâtiments mais des fragments à chercher dedans :
 * la map reste la seule source, et ses clés changent d'une version à l'autre.
 * « pet » seul ne suffirait pas — la niche en parle aussi — d'où le second
 * groupe, dont un mot au moins doit être présent.
 */
const SELL_BUILDING_WORDS = ["pet"];
const SELL_BUILDING_ALTERNATIVES = ["sell", "shop", "store", "market"];

/** Pourquoi la couvée s'est arrêtée. C'est ce qui décide de la question suivante. */
export type HatchStop = "done" | "full" | "cancelled";

/* -------------------------------- Couvée --------------------------------- */

/** Combien de cases visées ne portent plus d'œuf : la seule preuve d'éclosion. */
async function countHatched(slots: number[]): Promise<number | null> {
  try {
    const still = new Set((await readHatchScope()).readySlots);
    return slots.filter((slot) => !still.has(slot)).length;
  } catch {
    return null;
  }
}

async function reportHatch(attempted: number[], stop: HatchStop, reporter: BatchReporter): Promise<void> {
  if (attempted.length === 0) {
    reporter.say(
      "report",
      stop === "full" ? "Your bag was already full, so I opened none." : "Stopped before I opened any."
    );
    return;
  }

  await sleep(SETTLE_MS);
  const hatched = await countHatched(attempted);

  if (hatched === null) {
    reporter.say("report", `Opened all ${attempted.length}, but I could not check.`);
    return;
  }
  if (hatched === 0) {
    reporter.say("report", "None opened. They are all still there.");
    return;
  }

  const tail =
    stop === "full"
      ? " Your bag is full now."
      : stop === "cancelled"
        ? " Stopped there."
        : "";
  if (hatched === attempted.length) {
    reporter.say("report", `${hatched} hatched.${tail}`);
    return;
  }
  reporter.say("report", `${hatched} of ${attempted.length} hatched.${tail}`);
}

/**
 * Annonce l'animal qui vient de sortir, et le retient pour la suite.
 *
 * On compare les identifiants du sac à ceux d'avant : ce qui est nouveau vient
 * de l'œuf. Une lecture d'atome local par œuf, donc rien sur le réseau.
 *
 * C'est le seul endroit où une bulle compose vraiment : `petThing` reçoit
 * l'objet d'inventaire et passe par le rendu d'animal du jeu, donc un Gold Bee
 * sort doré. Le STR y a sa place parce que c'est le moment où on le regarde.
 */
async function announceHatchling(
  known: Set<string>,
  rules: KeepRules,
  reporter: BatchReporter
): Promise<void> {
  const pets = await readPetRows();
  if (pets.length === 0) return;

  const born = pets.filter((pet) => !known.has(pet.petId));
  for (const pet of born) known.add(pet.petId);
  if (born.length === 0) return;

  // La célébration ne suit pas l'annonce mais les critères : un animal qu'on
  // proposera de vendre juste après ne vaut pas un applaudissement.
  const cheer = hatchCheer(born, rules);
  const mutation = cheer?.mutation ?? null;
  const timing = mutation ? CHEER_TIMING[mutation] : undefined;
  const lines = mutation ? CHEER_LINES[mutation] : undefined;

  // Plusieurs peuvent apparaître entre deux lectures : l'inventaire ne se met à
  // jour qu'au retour du serveur, et les éclosions s'enchaînent vite. Les
  // annoncer tous prendrait plus de temps que la couvée entière, alors on en
  // nomme un et on compte le reste — mais aucun n'est perdu en silence.
  //
  // Celui qu'on nomme est la vedette quand il y en a une : raconter un Rainbow
  // en montrant le sprite du Worm sorti juste avant raterait le moment.
  const star = cheer?.star ?? born[0];
  const others = born.length - 1;
  const tail = others > 0 ? ` And ${others} more.` : "";
  const strength = star.maxStrength === null ? "" : `, ${star.maxStrength} STR`;

  const line = lines
    ? `A ${mutation} ${star.species}${strength}! ${lines.cheer}${tail}`
    : `A ${star.species}${strength}.${tail}`;

  // La mutation fêtée est déjà nommée dans la phrase : sa pastille la
  // répéterait. Les autres restent, elles n'ont pas été dites.
  const shown = mutation
    ? star.mutations.filter((name) => name.toLowerCase() !== mutation.toLowerCase())
    : star.mutations;

  // L'emote part sans être attendue : elle ne doit pas retarder l'annonce.
  if (cheer) void CompanionService.emote(cheer.emote, timing?.holdMs).catch(() => {});

  // Forcée : les éclosions s'enchaînent plus vite que l'intervalle minimum
  // entre deux bulles, et sans ça deux sur trois passaient à la trappe.
  reporter.say("system", line, compose(petThing(star.item, ""), " ", line, ...spaced(mutationChips(shown))), true);

  if (!timing || !lines) return;

  // Il s'arrête pour de bon : tenir la pose sans suspendre la couvée donnerait
  // un companion qui s'extasie et ouvre l'œuf suivant en même temps.
  await sleep(timing.pauseMs);
  // Le Stop est vérifié en tête de boucle, donc juste après cette attente :
  // annoncer qu'on s'y remet alors qu'on s'arrête n'aurait aucun sens.
  if (!reporter.stopped()) reporter.say("system", lines.resume);
}

/**
 * Fait éclore les œufs confirmés, un par un.
 *
 * Le compte du sac est relu régulièrement plutôt qu'une fois pour toutes :
 * l'atome ne se met à jour qu'au retour du serveur, et un décompte purement
 * local finirait par dépasser le plafond sans s'en apercevoir. Passé le
 * plafond, on s'arrête et on le dit — la suite se décide avec le joueur.
 */
export async function executeHatchBatch(slots: number[], reporter: BatchReporter): Promise<HatchStop> {
  const kinds = (await readHatchScope().catch(() => null))?.eggIds ?? [];
  const opening = `On it. Opening ${slots.length} now.`;
  reporter.say("reply", opening, compose(kinds.length === 1 ? eggIcon(kinds[0]) : null, " ", opening));

  const settings = loadCompanionSettings();
  // L'équipe d'abord : certaines capacités jouent sur ce qui sort d'un œuf, et
  // les enfiler après la première éclosion serait déjà trop tard.
  const team = await wearTeam(settings.hatchTeamId, reporter);
  const walker = await createWalker((message) => reporter.say("system", message));

  const attempted: number[] = [];
  let count = await readInventoryCount();
  let stop: HatchStop = "done";
  // Les animaux déjà là avant la couvée : tout ce qui apparaît ensuite vient
  // d'un œuf qu'on vient d'ouvrir.
  const known = new Set((await readPetRows()).map((pet) => pet.petId));
  const pace = pacer();

  for (const slot of slots) {
    if (reporter.stopped()) {
      stop = "cancelled";
      break;
    }
    if (attempted.length % RECOUNT_EVERY === 0 || count >= INVENTORY_CAPACITY - NEAR_CAPACITY) {
      count = await readInventoryCount();
    }
    if (count >= INVENTORY_CAPACITY) {
      stop = "full";
      break;
    }

    // Le trajet compte comme de l'attente : voir `pacer`.
    await walker.toGardenTile(slot);
    await pace.wait();
    await PlayerService.hatchEgg(slot);
    pace.mark();
    attempted.push(slot);
    count++;

    reporter.progress(attempted.length, slots.length);
    // L'annonce relit le sac, donc elle prend du temps elle aussi : le
    // `pacer` en tient compte au tour suivant.
    await announceHatchling(known, settings.hatchKeepRules, reporter);
    if (attempted.length % PROGRESS_EVERY === 0 && attempted.length < slots.length) {
      reporter.say("system", `${attempted.length} of ${slots.length} open so far...`);
    }
  }

  walker.release();
  await team.restore();
  await reportHatch(attempted, stop, reporter);
  return stop;
}

/* --------------------------------- Vente --------------------------------- */

export type SellPlan = {
  /** À protéger avant de vendre : ils correspondent sans être encore favoris. */
  favourite: PetRow[];
  sell: PetRow[];
  /** Équipe à porter le temps de la vente. `null` = on ne touche pas à l'équipe. */
  teamId: string | null;
};

/**
 * Emmène le companion devant la boutique d'animaux.
 *
 * Purement visuel, comme tous ses trajets : le serveur accepte la vente d'où
 * qu'on soit. Mais vendre trente animaux depuis le fond du jardin ne ressemble
 * à rien, et c'est là que le joueur irait lui-même.
 *
 * Un bâtiment introuvable ne bloque jamais la vente. On le dit une fois dans la
 * console, avec la liste des clés que la map expose : c'est ce qu'il faut pour
 * corriger les mots-clés si le jeu renomme ses lieux.
 */
async function goToSellShop(walker: Walker, reporter: BatchReporter): Promise<void> {
  if (!walker.walking) return;

  const map = await readCompanionMap();
  if (!map) return;

  const shop = map.findBuilding(SELL_BUILDING_WORDS, SELL_BUILDING_ALTERNATIVES);
  if (!shop) {
    console.warn("[companion] no pet shop found on the map, selling from here. Buildings:", map.buildingNames);
    return;
  }

  reporter.say("system", "Heading to the pet shop.");
  const arrived = await walker.toBuilding(shop);
  if (!arrived) reporter.say("system", "Could not get there, selling from here.");
}

export async function executeSellBatch(plan: SellPlan, reporter: BatchReporter): Promise<void> {
  const opening = `On it. ${summarizeSell(plan.sell)} going.`;
  reporter.say("reply", opening, compose(...spaced(petRowIcons(plan.sell)), " ", opening));

  for (const pet of plan.favourite) {
    if (reporter.stopped()) break;
    try {
      await PlayerService.ensureFavoriteItem(pet.petId, true);
    } catch {
      reporter.say("system", `Could not favourite ${pet.name}, leaving it alone.`);
    }
  }
  if (plan.favourite.length > 0) {
    // Le premier gardé porte la bulle, composé et avec son STR : c'est celui
    // qu'on veut voir. Les autres se comptent.
    const best = plan.favourite[0];
    const strength = best.maxStrength === null ? "" : ` ${best.maxStrength} STR,`;
    const others = plan.favourite.length - 1;
    reporter.say(
      "system",
      `${plan.favourite.length} kept and favourited.`,
      compose(
        petThing(best.item, ""),
        `${strength} keeping that one${others > 0 ? ` and ${others} more` : ""}.`
      )
    );
  }

  // Le trajet d'abord, la bascule d'équipe ensuite : porter l'équipe de vente
  // le temps de traverser la carte n'aurait aucun intérêt, et le message sur
  // l'équipe tombe ainsi juste avant la vente qu'il concerne.
  const walker = await createWalker((message) => reporter.say("system", message));
  await goToSellShop(walker, reporter);

  const team = await wearTeam(plan.teamId, reporter);

  let nowOnTeam = new Set<string>();
  try {
    nowOnTeam = new Set(await PetsService.getActivePetIds());
  } catch {
    nowOnTeam = new Set();
  }

  const attempted: PetRow[] = [];
  const skipped: PetRow[] = [];
  const sellPace = pacer();
  for (const pet of plan.sell) {
    if (reporter.stopped()) break;
    if (nowOnTeam.has(pet.petId)) {
      skipped.push(pet);
      continue;
    }
    // Aucun trajet entre deux ventes : ici l'écart se paie en entier.
    await sellPace.wait();
    try {
      await PlayerService.sellPet(pet.petId);
      attempted.push(pet);
    } catch {
      skipped.push(pet);
    }
    sellPace.mark();
    reporter.progress(attempted.length + skipped.length, plan.sell.length);
  }

  await team.restore();
  // Rendu à son mode : sans cela il resterait planté devant la boutique.
  walker.release();
  await reportSell(attempted, skipped, reporter);
}

/** Rend compte en relisant le sac : un animal vendu en disparaît. */
async function reportSell(attempted: PetRow[], skipped: PetRow[], reporter: BatchReporter): Promise<void> {
  if (attempted.length === 0) {
    reporter.say("report", skipped.length > 0 ? "None of them went through." : "Nothing sold.");
    return;
  }

  await sleep(SETTLE_MS);

  let sold: number | null = null;
  try {
    const left = new Set((await readHatchScope()).pets.map((pet) => pet.petId));
    sold = attempted.filter((pet) => !left.has(pet.petId)).length;
  } catch {
    sold = null;
  }

  const tail = skipped.length > 0 ? ` I left ${skipped.length} alone.` : "";
  if (sold === null) {
    reporter.say("report", `Sent all ${attempted.length}, but I could not check.${tail}`);
    return;
  }
  if (sold === 0) {
    reporter.say("report", `None of them sold. They are all still in your bag.${tail}`);
    return;
  }
  reporter.say("report", `${sold} sold.${tail}`);
}
