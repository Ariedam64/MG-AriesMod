// src/services/companion/chat/plantRun.ts
// Exécution d'un plan de plantation confirmé.
//
// Le companion marche jusqu'à chaque case avant de poser ce qu'elle attend.
// C'est purement visuel — le serveur accepte la commande d'où qu'on soit — mais
// c'est ce qui donne à voir qu'il travaille plutôt que de faire pousser un
// jardin entier depuis un coin de la carte.
//
// Comme `PlantSeed` et `GrowEgg` partent sans accusé de réception, on ne compte
// pas les envois : on relit le jardin et on regarde quelles cases se sont
// remplies.

import { PlayerService } from "../../player";
import { StatsService } from "../../stats";
import { ACTION_DELAY_MS, PROGRESS_EVERY, SETTLE_MS, sleep, type BatchReporter } from "./batch";
import { createWalker } from "./walk";
import { readPlantScope } from "./plantRead";
import { countByItem, listPlantItems, type PlantAssignment } from "./plant";

/** Pose une graine ou un œuf. Une commande par sorte, un seul appelant. */
async function send(assignment: PlantAssignment): Promise<void> {
  if (assignment.kind === "egg") {
    await PlayerService.plantEgg(assignment.tileIndex, assignment.id);
    return;
  }
  await PlayerService.plantSeed(assignment.tileIndex, assignment.id);
}

/**
 * Combien de cases visées se sont réellement remplies.
 *
 * Rend `null` quand on n'a pas pu relire le jardin : annoncer un succès qu'on
 * n'a pas constaté serait pire que d'avouer qu'on ne sait pas.
 */
async function countPlanted(attempted: PlantAssignment[]): Promise<number | null> {
  try {
    const { occupied } = await readPlantScope();
    return attempted.filter((assignment) => occupied.has(assignment.tileIndex)).length;
  } catch {
    return null;
  }
}

/** Rend compte du lot, en relisant le jardin plutôt qu'en comptant les envois. */
async function report(attempted: PlantAssignment[], cancelled: boolean, reporter: BatchReporter): Promise<void> {
  if (attempted.length === 0) {
    reporter.say("report", "Stopped before I planted anything.");
    return;
  }

  await sleep(SETTLE_MS);
  const planted = await countPlanted(attempted);
  const stopped = cancelled ? " before you stopped me" : "";

  if (planted === null) {
    reporter.say(
      "report",
      `Planted all ${attempted.length}${stopped}, but I could not check.`
    );
    return;
  }

  if (planted > 0) StatsService.incrementGardenStat("totalPlanted", planted);

  if (planted === attempted.length) {
    reporter.say("report", cancelled ? `Stopped there. ${planted} are in the ground.` : `All done, ${planted} planted.`);
    return;
  }
  if (planted === 0) {
    reporter.say(
      "report",
      "None took. The tiles are still bare, so the seeds probably ran out."
    );
    return;
  }
  reporter.say("report", `Planted ${planted} of ${attempted.length}${stopped}. The rest would not go in.`);
}

/**
 * Plante le lot confirmé, case par case.
 *
 * On exécute le plan tel qu'il a été proposé : ni recalcul, ni rattrapage. Si
 * le jardin a bougé entre-temps, c'est la vérification de signature, en amont,
 * qui a déjà refusé et reposé la question.
 */
export async function executePlantBatch(plan: PlantAssignment[], reporter: BatchReporter): Promise<void> {
  const what = countByItem(plan);
  reporter.say(
    "reply",
    what.length === 1
      ? `On it. Planting ${plan.length} ${what[0].name} now.`
      : `On it. Planting ${listPlantItems(plan)} now.`
  );

  const walker = await createWalker((message) => reporter.say("system", message));

  const attempted: PlantAssignment[] = [];
  for (const assignment of plan) {
    if (reporter.stopped()) break;

    await walker.toGardenTile(assignment.tileIndex);
    attempted.push(assignment);
    await send(assignment);

    const done = attempted.length;
    reporter.progress(done, plan.length);
    if (done % PROGRESS_EVERY === 0 && done < plan.length) {
      reporter.say("system", `${done} of ${plan.length} in the ground so far...`);
    }
    await sleep(ACTION_DELAY_MS);
  }

  // Rendu à son mode : sans cela il resterait planté sur la dernière case.
  walker.release();

  await report(attempted, reporter.stopped(), reporter);
}
