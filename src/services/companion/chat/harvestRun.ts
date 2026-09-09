// src/services/companion/chat/harvestRun.ts
// Exécution d'un lot de récolte confirmé.
//
// Le companion marche jusqu'à chaque crop avant de le cueillir. C'est purement
// visuel — le serveur accepte la commande d'où qu'on soit — mais c'est ce qui
// donne à voir qu'il travaille plutôt que de vider un jardin depuis un coin de
// la carte.

import { PlayerService } from "../../player";
import { StatsService } from "../../stats";
import { loadCompanionSettings } from "../state";
import { ACTION_DELAY_MS, PROGRESS_EVERY, SETTLE_MS, sleep, type BatchReporter } from "./batch";
import { wearTeam } from "./teamSwap";
import { createWalker } from "./walk";
import { readHarvestRows } from "./gardenRead";
import { rowKey, type HarvestRow } from "./harvest";

/**
 * Rend compte d'un lot en relisant le jardin.
 *
 * `HarvestCrop` part sans accusé de réception : le serveur ne répond rien, et
 * une commande refusée (inventaire plein, crop déjà pris) est indiscernable
 * d'une commande acceptée. Compter les envois reviendrait donc à annoncer un
 * succès qu'on n'a pas constaté. On relit le jardin et on regarde ce qui a
 * réellement disparu.
 *
 * Un crop récolté quitte la liste, ou repart en croissance s'il repousse : dans
 * les deux cas il cesse d'être mûr. Ceux qui le sont restés n'ont pas été pris.
 *
 * On relit le jardin brut, pas le périmètre du Locker : la question est « est-il
 * encore mûr ? », pas « aurais-je encore le droit d'y toucher ? ». Une règle
 * modifiée pendant le lot ferait sinon passer un crop intact pour récolté.
 */
async function report(attempted: HarvestRow[], cancelled: boolean, reporter: BatchReporter): Promise<void> {
  if (attempted.length === 0) {
    reporter.say("report", "Stopped before I picked anything.");
    return;
  }

  await sleep(SETTLE_MS);

  let fresh: HarvestRow[] | null = null;
  try {
    fresh = (await readHarvestRows()).filter((row) => row.ready);
  } catch {
    fresh = null;
  }

  const stopped = cancelled ? " before you stopped me" : "";

  if (!fresh) {
    reporter.say(
      "report",
      `Sent all ${attempted.length}${stopped}, but I could not check they landed.`
    );
    return;
  }

  const targeted = new Set(attempted.map(rowKey));
  const stillRipe = fresh.filter((row) => targeted.has(rowKey(row))).length;
  const picked = attempted.length - stillRipe;

  if (picked > 0) StatsService.incrementGardenStat("totalHarvested", picked);

  if (stillRipe === 0) {
    reporter.say("report", cancelled ? `Stopped there. Got ${picked}.` : `All done, ${picked} picked.`);
    return;
  }
  if (picked === 0) {
    reporter.say(
      "report",
      "None went through. Still ripe, so your bag is probably full."
    );
    return;
  }
  reporter.say("report", `Got ${picked} of ${attempted.length}${stopped}. ${stillRipe} still ripe.`);
}

/** Récolte le lot confirmé, crop par crop. */
export async function executeHarvestBatch(rows: HarvestRow[], reporter: BatchReporter): Promise<void> {
  reporter.say("reply", `On it. Picking ${rows.length} now.`);

  // L'équipe d'abord : certaines capacités agissent à la récolte, et les
  // enfiler après coup ne servirait plus à rien.
  const team = await wearTeam(loadCompanionSettings().harvestTeamId, reporter);
  const walker = await createWalker((message) => reporter.say("system", message));

  const attempted: HarvestRow[] = [];
  for (const row of rows) {
    if (reporter.stopped()) break;

    await walker.toGardenTile(row.tileIndex);
    attempted.push(row);
    await PlayerService.harvestCrop(row.tileIndex, row.slotId);

    const done = attempted.length;
    reporter.progress(done, rows.length);
    if (done % PROGRESS_EVERY === 0 && done < rows.length) {
      reporter.say("system", `${done} of ${rows.length} so far...`);
    }
    await sleep(ACTION_DELAY_MS);
  }

  // Rendu à son mode : sans cela il resterait planté sur le dernier crop.
  walker.release();
  await team.restore();

  await report(attempted, reporter.stopped(), reporter);
}
