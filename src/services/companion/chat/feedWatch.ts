// src/services/companion/chat/feedWatch.ts
// Veille sur les pets affamés.
//
// Le companion pose une question, il n'agit pas : la proposition qu'il ouvre
// attend une confirmation comme toutes les autres. C'est la seule chose qui
// distingue une alerte d'une automatisation, et c'est pourquoi cette veille
// n'appelle jamais l'exécution directement (cf. `chat/proposals.ts`).
//
// Aucun effet à l'import : la veille ne tourne que si on la démarre.

import { CompanionService } from "..";
import { PetsService } from "../../pets";
import { loadCompanionSettings } from "../state";
import { CompanionChat } from ".";
import { feedBubble, findFeedable, feedSignature, type FeedCandidate } from "./petFeed";
import { forGame } from "./bubbleTags";

/**
 * Filet de sécurité, pas la source principale.
 *
 * L'état des pets nous est poussé : c'est lui qui déclenche la vérification,
 * presque à l'instant où un animal passe sous le seuil. Cet intervalle ne
 * rattrape que ce que le flux ne signale pas.
 */
const POLL_MS = 30_000;

/**
 * Les changements de pets arrivent en rafale — la faim descend en continu.
 * On laisse passer la rafale avant de regarder, plutôt que de relire l'état du
 * jeu à chaque frémissement.
 */
const SETTLE_MS = 1500;

/**
 * Une question déclinée ne revient pas avant ce délai.
 *
 * Sans elle, refuser une proposition la verrait réapparaître au tour suivant,
 * ce qui reviendrait à harceler plutôt qu'à signaler.
 */
const REASK_COOLDOWN_MS = 10 * 60 * 1000;

let timer: number | null = null;
let settleTimer: number | null = null;
let unsubscribers: Array<() => void> = [];
let running = false;
/** Dernière situation proposée, et quand : de quoi ne pas répéter la question. */
let lastOfferedSignature = "";
let lastOfferedAtMs = 0;
/**
 * Question déjà annoncée de vive voix.
 *
 * Distinct de `lastOfferedSignature`, qui dit que la question a été *posée*.
 * Une question posée alors que le companion n'est pas encore en jeu n'a été
 * annoncée à personne, et devra l'être dès qu'il arrive.
 */
let announcedProposalId: string | null = null;

/**
 * Va le dire au joueur, de vive voix, et reste là.
 *
 * Le fil du chat reçoit la question dans tous les cas ; ceci n'est que la
 * version visible en jeu, pour qui ne regarde pas le menu. Sans companion
 * incarné, il n'y a personne pour parler et on s'en tient au fil.
 */
async function announceInPerson(picks: FeedCandidate[]): Promise<void> {
  if (!CompanionService.isRunning()) return;
  try {
    await CompanionService.comeToPlayer();
    // Forcée : le message du fil vient d'être repris en bulle, et l'anti-rafale
    // aurait avalé celle-ci. C'est pourtant elle qui compte, puisqu'elle est
    // écrite pour être lue au-dessus de sa tête.
    const line = forGame(feedBubble(picks));
    await CompanionService.say(line.message, { force: true, tags: line.tags });
  } catch {
    // Une annonce ratée ne doit pas emporter la proposition, qui est l'essentiel.
  } finally {
    // La tâche l'immobilisait sur une case ; l'attention, elle, le fait suivre
    // le joueur jusqu'à la réponse. Repartir au jardin en ayant posé une
    // question donnerait l'impression qu'il s'en désintéresse.
    CompanionService.releaseTask();
    CompanionService.holdAttention();
  }
}

/**
 * Annonce la question en jeu, ou la garde pour plus tard.
 *
 * Au démarrage, la veille tourne avant que le companion soit incarné :
 * `autoStart` part sans être attendu, et trouver un PNJ à emprunter demande que
 * la salle soit chargée. La question arrivait donc dans le fil sans que
 * personne ne vienne la porter, et plus rien ne la reprenait ensuite.
 *
 * On retente donc à chaque tour tant que la question tient. Les changements de
 * faim étant poussés en continu, le rattrapage tombe en général dans les
 * secondes qui suivent son arrivée en jeu.
 */
async function announceIfNeeded(picks: FeedCandidate[]): Promise<void> {
  if (picks.length === 0) return;

  const proposal = CompanionChat.getProposal();
  if (proposal?.commandId !== "feed" || proposal.id === announcedProposalId) return;
  if (!CompanionService.isRunning()) return;

  announcedProposalId = proposal.id;
  await announceInPerson(picks);
}

/** Plus rien en attente : il retourne à son mode. */
function releaseIfIdle(): void {
  if (!CompanionChat.getProposal() && CompanionService.isHoldingAttention()) {
    CompanionService.releaseAttention();
  }
}

async function tick(): Promise<void> {
  // Une question périmée bloquerait la veille indéfiniment : on la retire même
  // quand les alertes sont coupées.
  CompanionChat.dropStaleProposal();

  const pending = CompanionChat.getProposal();
  const alertsOn = loadCompanionSettings().feedAlerts;
  // On ne lit l'état du jeu que s'il y a une raison : une question en attente
  // dont il faut vérifier qu'elle a encore un objet, ou des alertes actives.
  if (pending?.commandId !== "feed" && !alertsOn) {
    releaseIfIdle();
    return;
  }

  const picks = await findFeedable().catch(() => []);

  // Le joueur a nourri lui-même, ou changé d'équipe : la question tombe, et le
  // companion repart à ce qu'il faisait sans attendre une réponse sans objet.
  if (pending?.commandId === "feed") {
    const withdrawn = CompanionChat.withdrawFeedIfSettled(new Set(picks.map((pick) => pick.petId)));
    // La situation ayant changé, ces animaux méritent d'être resignalés s'ils
    // redeviennent affamés : le délai anti-harcèlement ne doit pas les couvrir.
    if (withdrawn) lastOfferedSignature = "";
    // Sinon la question tient toujours : s'il n'était pas là pour la porter,
    // c'est le moment de rattraper.
    else await announceIfNeeded(picks);
  }
  releaseIfIdle();

  if (!alertsOn) return;

  if (picks.length === 0) {
    // La situation est réglée : la prochaine fois qu'elle se présente, elle
    // mérite d'être signalée à nouveau.
    lastOfferedSignature = "";
    return;
  }

  const signature = feedSignature(picks);
  const now = Date.now();
  if (signature === lastOfferedSignature && now - lastOfferedAtMs < REASK_COOLDOWN_MS) return;

  // `offerFeed` s'abstient si une question est déjà posée ou si un lot tourne :
  // on ne retient la situation comme « proposée » que si elle l'a été.
  const offered = await CompanionChat.offerFeed(() => findFeedable());
  if (!offered) return;

  lastOfferedSignature = signature;
  lastOfferedAtMs = now;
  await announceIfNeeded(picks);
}

const runTick = () => void tick().catch(() => {});

/** Coalesce une rafale de changements en une seule vérification. */
function scheduleCheck(): void {
  if (!running || settleTimer !== null) return;
  settleTimer = window.setTimeout(() => {
    settleTimer = null;
    runTick();
  }, SETTLE_MS);
}

/**
 * Vérifie maintenant.
 *
 * À appeler quand un réglage change : abaisser le seuil doit se voir tout de
 * suite, pas au prochain battement.
 */
export function checkFeedNow(): void {
  lastOfferedSignature = "";
  runTick();
}

/** Démarre la veille. Idempotent. */
export function startFeedWatch(): void {
  if (running) return;
  running = true;

  timer = window.setInterval(runTick, POLL_MS);

  // La faim descend en continu : c'est le flux d'état des pets qui donne la
  // réactivité, l'intervalle ne fait que rattraper ce qu'il ne signale pas.
  try {
    unsubscribers.push(PetsService.onPetsChange(() => scheduleCheck()));
  } catch {
    // Sans le flux, l'intervalle suffit : plus lent, mais la veille tient.
  }

  // Répondre à une question doit le libérer sans attendre le prochain tour.
  unsubscribers.push(
    CompanionChat.subscribe(() => {
      if (!CompanionChat.getProposal() && CompanionService.isHoldingAttention()) {
        CompanionService.releaseAttention();
      }
    })
  );

  runTick();
}

export function stopFeedWatch(): void {
  running = false;
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
  if (settleTimer !== null) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  for (const stop of unsubscribers) {
    try {
      stop();
    } catch {}
  }
  unsubscribers = [];
}
