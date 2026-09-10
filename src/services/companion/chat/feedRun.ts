// src/services/companion/chat/feedRun.ts
// Exécute un nourrissage : de l'inventaire, ou en récoltant d'abord.
//
// Le cas « depuis le jardin » repose sur un détail du protocole : c'est le
// *client* qui invente l'identifiant de la produce à naître et l'envoie dans
// `HarvestCrop.cropItemId` (bundle 1125). On le fabrique donc nous-mêmes, on
// récolte avec, et on nourrit avec le même identifiant — sans avoir à deviner
// lequel des crops fraîchement ramassés est le bon.
//
// Le companion fait le trajet : jusqu'au crop s'il doit le cueillir, puis
// jusqu'au pet. C'est du décor, et ça n'empêche jamais l'action.

import { randomClientId } from "../../../core/quinoaCommands";
import { PetsService } from "../../pets";
import { PlayerService, type PetInfo } from "../../player";
import { StatsService } from "../../stats";
import type { XY } from "../movement";
import type { FeedCandidate } from "./petFeed";
import { createWalker, type Walker } from "./walk";
import type { BatchReporter } from "./batch";
import { compose, spaced } from "./bubbleTags";
import { petSpeciesIcon, petThing } from "./bubbleIcons";
import type { BubbleTag } from "./bubbleTags";

/**
 * Une icône par animal, sans doublon d'espèce, deux au plus.
 *
 * Le rendu d'animal du jeu d'abord : c'est le seul qui sache dessiner un pet en
 * bulle. La clé d'atlas ne sert que de repli, pour le fil.
 */
function petIcons(picks: FeedCandidate[]): BubbleTag[] {
  const seen = new Set<string>();
  const icons: BubbleTag[] = [];
  for (const pick of picks) {
    if (seen.has(pick.petSpecies) || icons.length >= 2) continue;
    seen.add(pick.petSpecies);
    const icon = petThing(pick.pet, "") ?? petSpeciesIcon(pick.petSpecies);
    if (icon) icons.push(icon);
  }
  return icons;
}

/** Temps laissé au serveur pour créer la produce avant de la donner. */
const AFTER_HARVEST_MS = 700;
/** Un nourrissage n'est pas instantané côté serveur ; on ne mitraille pas. */
const AFTER_FEED_MS = 400;

export type FeedOutcome = { ok: true } | { ok: false; reason: string };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Où se trouve le pet à l'instant présent.
 *
 * Relu au moment d'y aller plutôt que capturé à la proposition : un pet se
 * promène, et marcher vers l'endroit où il était il y a une minute donnerait
 * exactement l'inverse de l'effet recherché.
 */
async function petPosition(petId: string): Promise<XY | null> {
  try {
    const pets = (await PetsService.getPets()) ?? [];
    const found = pets.find((pet: PetInfo) => String(pet?.slot?.id ?? "") === petId);
    return (found?.position as XY | undefined) ?? null;
  } catch {
    return null;
  }
}

export async function runFeed(candidate: FeedCandidate, walker: Walker): Promise<FeedOutcome> {
  let cropItemId: string;

  if (candidate.source.kind === "inventory") {
    cropItemId = candidate.source.itemId;
  } else {
    await walker.toGardenTile(candidate.source.row.tileIndex);

    // On force l'identifiant pour pouvoir le redonner tout de suite après.
    cropItemId = randomClientId();
    try {
      await PlayerService.harvestCrop(candidate.source.row.tileIndex, candidate.source.row.slotId, cropItemId);
    } catch {
      return { ok: false, reason: "could not pick it" };
    }
    StatsService.incrementGardenStat("totalHarvested", 1);
    await sleep(AFTER_HARVEST_MS);
  }

  await walker.toPosition(await petPosition(candidate.petId));

  try {
    await PlayerService.feedPet(candidate.petId, cropItemId);
  } catch {
    return { ok: false, reason: "the feed did not go through" };
  }
  await sleep(AFTER_FEED_MS);
  return { ok: true };
}

/**
 * Nourrit les pets confirmés, un par un.
 *
 * Le bilan tombe au fur et à mesure plutôt qu'à la fin : sur plusieurs pets,
 * les trajets prennent du temps, et un silence prolongé ressemble à une panne.
 */
export async function executeFeedBatch(picks: FeedCandidate[], reporter: BatchReporter): Promise<void> {
  const who = petIcons(picks);
  const opening = picks.length === 1 ? "On it." : `On it. Feeding ${picks.length} of them.`;
  reporter.say("reply", opening, compose(...spaced(who), " ", opening));

  const walker = await createWalker((message) => reporter.say("system", message));

  // Les candidats eux-mêmes, pas leurs noms : le bilan a besoin de leur espèce
  // pour poser les bonnes icônes.
  const fed: FeedCandidate[] = [];
  const failures: string[] = [];

  for (const pick of picks) {
    if (reporter.stopped()) break;
    const outcome = await runFeed(pick, walker);
    if (outcome.ok) {
      fed.push(pick);
      const fedLine = `${pick.petName} has been fed.`;
      reporter.say("system", fedLine, compose(petThing(pick.pet, "") ?? petSpeciesIcon(pick.petSpecies), " ", fedLine));
    } else {
      failures.push(`${pick.petName} (${outcome.reason})`);
    }
    reporter.progress(fed.length + failures.length, picks.length);
  }

  walker.release();
  const cancelled = reporter.stopped();

  if (fed.length === 0) {
    reporter.say("report", `That did not work: ${failures.join(", ") || "nothing went through"}.`);
    return;
  }
  const tail = failures.length > 0 ? ` I could not manage ${failures.join(", ")}.` : "";
  const fedNames = fed.map((pick) => pick.petName);
  const names =
    fedNames.length === 1 ? fedNames[0] : `${fedNames.slice(0, -1).join(", ")} and ${fedNames[fedNames.length - 1]}`;
  // La bulle compte plutôt qu'elle n'énumère : trois noms tiennent dans le fil,
  // pas au-dessus de sa tête.
  const done = `${cancelled ? "Stopped there. " : ""}Fed ${names}.${tail}`;
  reporter.say("report", done, compose(...spaced(petIcons(fed)), " ", done));
}
