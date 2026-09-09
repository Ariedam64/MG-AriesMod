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
import { ACTION_DELAY_MS, PROGRESS_EVERY, SETTLE_MS, sleep, type BatchReporter } from "./batch";
import { wearTeam } from "./teamSwap";
import { createWalker, type Walker } from "./walk";
import { readHatchScope, readInventoryCount, INVENTORY_CAPACITY } from "./hatchRead";
import { summarizeSell, type PetRow } from "./hatch";

/** Le jeu laisse le sac se remplir puis refuse en silence : on relit souvent près du plafond. */
const RECOUNT_EVERY = 5;
const NEAR_CAPACITY = 5;

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
 * Fait éclore les œufs confirmés, un par un.
 *
 * Le compte du sac est relu régulièrement plutôt qu'une fois pour toutes :
 * l'atome ne se met à jour qu'au retour du serveur, et un décompte purement
 * local finirait par dépasser le plafond sans s'en apercevoir. Passé le
 * plafond, on s'arrête et on le dit — la suite se décide avec le joueur.
 */
export async function executeHatchBatch(slots: number[], reporter: BatchReporter): Promise<HatchStop> {
  reporter.say("reply", `On it. Opening ${slots.length} now.`);

  // L'équipe d'abord : certaines capacités jouent sur ce qui sort d'un œuf, et
  // les enfiler après la première éclosion serait déjà trop tard.
  const team = await wearTeam(loadCompanionSettings().hatchTeamId, reporter);
  const walker = await createWalker((message) => reporter.say("system", message));

  const attempted: number[] = [];
  let count = await readInventoryCount();
  let stop: HatchStop = "done";

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

    await walker.toGardenTile(slot);
    await PlayerService.hatchEgg(slot);
    attempted.push(slot);
    count++;

    reporter.progress(attempted.length, slots.length);
    if (attempted.length % PROGRESS_EVERY === 0 && attempted.length < slots.length) {
      reporter.say("system", `${attempted.length} of ${slots.length} open so far...`);
    }
    await sleep(ACTION_DELAY_MS);
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
  reporter.say("reply", `On it. ${summarizeSell(plan.sell)} going.`);

  for (const pet of plan.favourite) {
    if (reporter.stopped()) break;
    try {
      await PlayerService.ensureFavoriteItem(pet.petId, true);
    } catch {
      reporter.say("system", `Could not favourite ${pet.name}, leaving it alone.`);
    }
  }
  if (plan.favourite.length > 0) {
    reporter.say("system", `${plan.favourite.length} kept and favourited.`);
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
  for (const pet of plan.sell) {
    if (reporter.stopped()) break;
    if (nowOnTeam.has(pet.petId)) {
      skipped.push(pet);
      continue;
    }
    try {
      await PlayerService.sellPet(pet.petId);
      attempted.push(pet);
    } catch {
      skipped.push(pet);
    }
    reporter.progress(attempted.length + skipped.length, plan.sell.length);
    await sleep(ACTION_DELAY_MS);
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
