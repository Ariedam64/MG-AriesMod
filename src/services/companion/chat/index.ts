// src/services/companion/chat/index.ts
// Façade du chat du companion : journal, propositions, exécution.
//
// Seul fichier du dossier avec des effets — les autres sont purs. Aucun effet à
// l'import : rien ne tourne tant qu'on n'appelle rien.
//
// Rappel de conformité (cf. proposals.ts) : rien ne s'exécute sans une
// confirmation humaine fraîche, et l'exécution porte sur le lot exact qui a été
// proposé. Pas de file d'attente, pas de « toujours autoriser », pas de refaire.

import { CompanionService } from "..";
import { EmoteType } from "../emoteTypes";
import { MAX_LINE_LENGTH } from "../state";
import { type BatchReporter } from "./batch";
import { compose, forGame, spaced, type BubbleLine } from "./bubbleTags";
import { eggIcon, petRowIcons, seedIcon, variantIcons } from "./bubbleIcons";
import {
  append,
  appendAlertOnce,
  clearProposal,
  emptyLog,
  type ChatAuthor,
  type ChatKind,
  type ChatLog,
} from "./log";
import { type HarvestScope } from "./gardenRead";
import { describeSelection, groupVariants, selectionSignature, type HarvestRow } from "./harvest";
import { executeHarvestBatch } from "./harvestRun";
import { describeFeed, feedBubble, feedQuestion, feedSignature, type FeedCandidate } from "./petFeed";
import { isSettled } from "./feedScope";
import { executeFeedBatch } from "./feedRun";
import { countByItem, plantSignature, summarizePlan, type PlantAssignment } from "./plant";
import { executePlantBatch } from "./plantRun";
import { petSignature, slotSignature, summarizeHatch, summarizeSell, toSell, type KeepRules } from "./hatch";
import { readHatchScope } from "./hatchRead";
import { executeHatchBatch, executeSellBatch, type HatchStop, type SellPlan } from "./hatchRun";
import { afterHatch, hatchProvider, sellProvider, type HatchProvider, type SellProvider } from "./hatchFlow";
import { teamName } from "./teamSwap";
import { loadCompanionSettings } from "../state";
import { explain, isExpired, verdict, type Proposal } from "./proposals";

/** Fenêtre de dédoublonnage des alertes répétées. */
const ALERT_DEDUPE_MS = 60_000;

/** Recalcule le lot au moment de la confirmation, pour détecter qu'il a changé. */
export type ScopeProvider = () => Promise<HarvestScope>;
export type FeedProvider = () => Promise<FeedCandidate[]>;
/** Rejoue le plan dessiné contre le jardin du moment, et n'en garde que le faisable. */
export type PlantProvider = () => Promise<PlantAssignment[]>;

/**
 * Une demande d'action du joueur.
 *
 * `label` est ce qu'il a demandé, pas ce qu'il obtiendra : le décompte n'est
 * connu qu'après lecture de l'état du jeu, et c'est la réponse du companion qui
 * l'annonce.
 *
 * Les deux formes partagent la même machinerie de confirmation — c'est elle qui
 * porte la conformité — et ne diffèrent que par leur exécution.
 */
export type HarvestRequest =
  | { kind: "harvest"; label: string; provider: ScopeProvider }
  | { kind: "feed"; label: string; provider: FeedProvider }
  | { kind: "plant"; label: string; provider: PlantProvider }
  /** `rules` voyage avec la demande : la vente qui suit s'en sert pour trier. */
  | { kind: "hatch"; label: string; provider: HatchProvider; rules: KeepRules };

/** Le périmètre capturé au moment de la proposition. C'est LUI qu'on exécute. */
type Captured =
  | { kind: "harvest"; provider: ScopeProvider; rows: HarvestRow[] }
  | { kind: "feed"; provider: FeedProvider; picks: FeedCandidate[] }
  | { kind: "plant"; provider: PlantProvider; plan: PlantAssignment[] }
  | { kind: "hatch"; provider: HatchProvider; rules: KeepRules; slots: number[] }
  | { kind: "sell"; provider: SellProvider; rules: KeepRules; plan: SellPlan };

export type RunProgress = { done: number; total: number };

type Listener = () => void;

type State = {
  log: ChatLog;
  proposal: Proposal | null;
  /** Périmètre capturé à la proposition : jamais un recalcul. */
  captured: Captured | null;
  run: RunProgress | null;
  cancelRequested: boolean;
};

let state: State = {
  log: emptyLog(),
  proposal: null,
  captured: null,
  run: null,
  cancelRequested: false,
};

const listeners = new Set<Listener>();
let nextProposalSeq = 1;

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {}
  }
}

/**
 * Écrit dans le fil, et fait parler le companion.
 *
 * `spoken` sert quand la bulle mérite mieux que le texte du fil : elle peut y
 * glisser des icônes du jeu, que le fil ne saurait pas rendre — il afficherait
 * le balisage `<0/>` en toutes lettres. C'est aussi l'occasion d'être plus
 * bref : une bulle tient sur une ligne, un fil non.
 */
type Illustrated = {
  /** La phrase illustrée, la même des deux côtés sauf mention contraire. */
  bubble?: BubbleLine;
  /**
   * Une version pour le fil seulement, quand il a de quoi en dire plus.
   *
   * Le fil a de la place : il peut nommer chaque animal d'une liste et lui
   * coller son sprite, là où la bulle tiendrait mal. Hors de ces cas, les deux
   * disent exactement la même chose — une seule formulation à maintenir.
   */
  thread?: BubbleLine;
  /**
   * Passe outre l'anti-rafale de la bulle.
   *
   * Pour les annonces qu'on tient à faire entendre chacune : un animal qui
   * sort d'un œuf, par exemple, quand les éclosions s'enchaînent plus vite que
   * l'intervalle minimum entre deux bulles.
   */
  force?: boolean;
};

function post(
  from: ChatAuthor,
  kind: ChatKind,
  text: string,
  proposalId?: string,
  extra: Illustrated = {}
): void {
  const shown = extra.thread ?? extra.bubble;
  state = {
    ...state,
    log: append(state.log, {
      from,
      kind,
      text: shown?.message ?? text,
      atMs: Date.now(),
      proposalId,
      icons: shown?.tags ? Object.values(shown.tags) : undefined,
      // Le fil ne sait afficher une icône à sa place que s'il a le balisage.
      positioned: shown !== undefined,
    }),
  };
  // Une bulle porteuse de question passe toujours : elle attend une réponse, et
  // se faire avaler par la note qui la précède la rendrait invisible.
  const insist = extra.force ?? proposalId !== undefined;
  if (from === "companion") {
    speak(extra.bubble ?? { message: text }, insist);
    // Une question s'accompagne d'un air interrogateur — mais seulement une
    // fois qu'il s'est posé. Poser la question et partir en courant vers le
    // joueur, la pose jouée en chemin, ne se verrait pas.
    if (proposalId !== undefined) {
      void CompanionService.emoteWhenStill(EmoteType.Questioning).catch(() => {});
    }
  }
  notify();
}

/**
 * Reprend le message dans la bulle du PNJ.
 *
 * Ce qu'il dit dans le fil, il le dit aussi à voix haute : le menu n'est pas
 * toujours ouvert. Une bulle ne tient qu'une ligne, donc on tronque, et
 * `say` ignore de lui-même ce qui arrive trop vite après la précédente — une
 * rafale de progression ne clignote pas au-dessus de sa tête.
 */
function speak(line: BubbleLine, force = false): void {
  // On ne tronque que le texte nu : couper une phrase balisée en plein `<0/>`
  // laisserait le jeu chercher une balise qui n'existe plus. Les lignes
  // balisées sont écrites courtes à la main, elles n'en ont pas besoin.
  // Ce que le jeu peut dessiner d'abord : retirer une balise raccourcit la
  // phrase, et c'est cette longueur-là qu'il faut mesurer.
  const spoken = forGame(line);
  const message =
    !spoken.tags && spoken.message.length > MAX_LINE_LENGTH
      ? `${spoken.message.slice(0, MAX_LINE_LENGTH - 1).trimEnd()}…`
      : spoken.message;
  void CompanionService.say(message, { tags: spoken.tags, force }).catch(() => {});
}

/**
 * Retire une question à laquelle il est trop tard pour répondre.
 *
 * Sans ça, une proposition oubliée reste indéfiniment « en cours » : la veille
 * s'abstient de proposer tant qu'une question attend, et le companion cessait
 * donc de signaler les pets affamés après le premier refus non tranché.
 */
function dropStaleProposal(): void {
  const proposal = state.proposal;
  if (!proposal || !isExpired(proposal, Date.now())) return;
  state = { ...state, proposal: null, captured: null, log: clearProposal(state.log, proposal.id) };
  notify();
}

/**
 * La bulle d'une proposition de récolte : la variante dominante, puis le compte.
 *
 * Une seule variante montrée pour tout un lot : c'est celle qu'on verra le plus
 * dans le panier, et une bulle qui les listerait toutes ne tiendrait pas sur sa
 * ligne. Les pastilles de mutation portent leur propre nom, donc la phrase ne
 * les nomme pas.
 */
function harvestBubble(rows: HarvestRow[], sentence: string): BubbleLine {
  const top = groupVariants(rows)[0];
  if (!top) return compose(sentence);

  // La variante dominante ouvre la phrase, puis la phrase entière suit. L'icône
  // montre, le texte nomme : l'un ne remplace pas l'autre.
  return compose(...spaced(variantIcons(top.species, top.mutations)), " ", sentence);
}

/**
 * Lit le lot et pose la question. Ne récolte rien.
 *
 * Séparé de `proposeHarvest` parce qu'on repasse par ici quand une confirmation
 * est refusée (lot périmé ou modifié) : c'est le companion qui redemande, le
 * joueur n'a pas émis une nouvelle commande, donc aucune bulle « you » ne doit
 * réapparaître.
 */
async function proposeHarvestScope(provider: ScopeProvider): Promise<void> {
  let scope: HarvestScope;
  try {
    scope = await provider();
  } catch {
    post("companion", "system", "Could not see your garden just now.");
    return;
  }

  const rows = scope.rows;
  if (rows.length === 0) {
    // Un jardin vide et un jardin entièrement verrouillé se ressemblent de
    // l'extérieur : les distinguer évite de chercher une panne qui n'existe pas.
    post(
      "companion",
      "reply",
      scope.lockedOut > 0
        ? `Your Locker is holding all ${scope.lockedOut}. Nothing I can pick.`
        : "Nothing is ripe right now."
    );
    return;
  }

  const team = loadCompanionSettings().harvestTeamId;
  const proposal = openProposal(
    "harvest",
    describeSelection(rows),
    rows.length,
    withTeam(selectionSignature(rows), team)
  );
  state = { ...state, proposal, captured: { kind: "harvest", provider, rows } };
  const held =
    scope.lockedOut > 0 ? ` I am leaving ${scope.lockedOut} locked one${scope.lockedOut === 1 ? "" : "s"} alone.` : "";
  const sentence = `I can see ${proposal.summary}.${held}${teamPromise(team)} Want me to pick them?`;
  post("companion", "reply", sentence, proposal.id, { bubble: harvestBubble(rows, sentence) });
}

async function proposeFeedScope(provider: FeedProvider): Promise<void> {
  let picks: FeedCandidate[];
  try {
    picks = await provider();
  } catch {
    post("companion", "system", "Could not check on your pets just now.");
    return;
  }

  if (picks.length === 0) {
    post("companion", "reply", "Your pets are fine, or I have nothing they eat.");
    return;
  }

  const proposal = openProposal("feed", describeFeed(picks), picks.length, feedSignature(picks));
  state = { ...state, proposal, captured: { kind: "feed", provider, picks } };

  // Le fil nomme chaque animal ; la bulle, trop étroite pour une liste, compte.
  const listed = feedQuestion(picks);
  post("companion", "reply", listed.message, proposal.id, {
    bubble: feedBubble(picks),
    thread: listed,
  });
}

/**
 * Repose le plan de plantation, réduit à ce qui tient encore debout.
 *
 * Le plan a été dessiné par le joueur ; le fournisseur ne le réinvente pas, il
 * le confronte au jardin du moment. Un plan devenu vide veut dire que tout ce
 * qu'on visait s'est rempli ou que la réserve a fondu : on le dit, plutôt que
 * de poser une question sans objet.
 */
async function proposePlantPlan(provider: PlantProvider): Promise<void> {
  let plan: PlantAssignment[];
  try {
    plan = await provider();
  } catch {
    post("companion", "system", "Could not see your garden just now.");
    return;
  }

  if (plan.length === 0) {
    post("companion", "reply", "Nothing left of that plan. Tiles filled up, or seeds ran out.");
    return;
  }

  const proposal = openProposal("plant", summarizePlan(plan), plan.length, plantSignature(plan));
  state = { ...state, proposal, captured: { kind: "plant", provider, plan } };

  // La sorte la plus posée du plan porte l'icône. Un œuf n'a pas de graine au
  // catalogue, donc `seedIcon` rend `null` et la bulle reste en toutes lettres.
  const most = countByItem(plan)[0];
  const sentence = `That is ${proposal.summary}. Want me to get started?`;
  post("companion", "reply", sentence, proposal.id, {
    bubble: compose(most?.kind === "seed" ? seedIcon(most.id) : null, " ", sentence),
  });
}

/**
 * Repose la couvée : quels œufs sont prêts, maintenant.
 *
 * Les règles de conservation ne servent pas ici — on n'ouvre pas selon des
 * critères, on ouvre ce qui est mûr. Elles voyagent avec la demande parce que
 * c'est la vente d'après qui s'en servira.
 */
async function proposeHatchSlots(provider: HatchProvider, rules: KeepRules): Promise<void> {
  let slots: number[];
  try {
    slots = await provider();
  } catch {
    post("companion", "system", "Could not see your eggs just now.");
    return;
  }

  if (slots.length === 0) {
    post("companion", "reply", "Nothing is ready to hatch right now.");
    return;
  }

  const team = loadCompanionSettings().hatchTeamId;
  const proposal = openProposal("hatch", summarizeHatch(slots), slots.length, withTeam(slotSignature(slots), team));
  state = { ...state, proposal, captured: { kind: "hatch", provider, rules, slots } };

  // La sorte d'œuf n'est connue qu'en relisant le jardin, et une couvée mêlée
  // n'a pas d'icône unique : on ne la met que s'il n'y en a qu'une sorte.
  const kinds = await readHatchScope()
    .then((scope) => scope.eggIds)
    .catch(() => [] as string[]);
  const sentence = `${proposal.summary}.${teamPromise(team)} Want me to open them?`;
  post("companion", "reply", sentence, proposal.id, {
    bubble: compose(kinds.length === 1 ? eggIcon(kinds[0]) : null, " ", sentence),
  });
}

/**
 * Repose la vente : qui partirait, qui serait mis à l'abri d'abord.
 *
 * La bascule d'équipe fait partie de la question quand il y en a une. Elle
 * touche à l'équipe du joueur, donc elle ne peut pas se glisser dans un oui qui
 * ne la mentionnait pas.
 */
async function proposeSellPlan(provider: SellProvider, rules: KeepRules): Promise<void> {
  let plan: SellPlan;
  try {
    plan = await provider();
  } catch {
    post("companion", "system", "Could not go through your bag just now.");
    return;
  }

  if (plan.sell.length === 0) {
    post("companion", "reply", "Nothing in your bag is up for sale.");
    return;
  }

  const signature = withTeam(`${petSignature(plan.sell)}/${petSignature(plan.favourite)}`, plan.teamId);
  const proposal = openProposal("sell", summarizeSell(plan.sell), plan.sell.length, signature);
  state = { ...state, proposal, captured: { kind: "sell", provider, rules, plan } };

  const keeping =
    plan.favourite.length > 0
      ? ` I would favourite the ${plan.favourite.length} you keep first.`
      : "";
  // Les deux espèces les plus vendues portent l'icône. Un rendu composé par
  // animal n'aurait aucun sens ici : c'est un décompte, pas une présentation.
  const sentence = `That would be ${proposal.summary}.${keeping}${teamPromise(plan.teamId)} Should I?`;
  post("companion", "reply", sentence, proposal.id, {
    bubble: compose(...spaced(petRowIcons(plan.sell)), " ", sentence),
  });
}

/**
 * Le pont entre un lot en cours et le fil de conversation.
 *
 * Le déroulé de chaque commande vit dans son propre `*Run.ts`. Ce qui reste
 * ici, c'est la tenue de l'état — l'annulation et la progression affichée —
 * parce que c'est la façade qui en répond.
 */
function reporter(): BatchReporter {
  return {
    say: (kind, text, spoken, force) => post("companion", kind, text, undefined, { bubble: spoken, force }),
    stopped: () => state.cancelRequested,
    progress: (done, total) => {
      state = { ...state, run: { done, total } };
      notify();
    },
  };
}

/**
 * Rend la main après un lot, quelle qu'en soit l'issue.
 *
 * Le `notify` final n'est pas optionnel : le dernier message d'un lot part
 * pendant qu'il tourne encore, donc la barre se redessine une dernière fois
 * avec le lot toujours en cours. Sans ce réveil, elle resterait sur « Working
 * on it » jusqu'à ce qu'autre chose la réveille — et si rien ne suit, jamais.
 */
async function runBatch(run: (reporter: BatchReporter) => Promise<void>): Promise<boolean> {
  let stopped = false;
  try {
    await run(reporter());
  } finally {
    // Relevé AVANT la remise à plat : c'est la seule fenêtre où l'appelant peut
    // encore savoir que le joueur a dit stop, et ça décide s'il a le droit
    // d'enchaîner sur une question suivante.
    stopped = state.cancelRequested;
    state = { ...state, run: null, cancelRequested: false };
    notify();
  }
  return stopped;
}

/**
 * Ce qu'il fait au sortir d'une couvée : il regarde, il dit, il demande.
 *
 * Il ne vend pas. Il ne rouvre pas. Il constate et pose la question suivante —
 * poser une question n'est pas agir, et c'est la seule façon d'enchaîner sans
 * devenir un automate.
 */
async function afterHatchBatch(rules: KeepRules, stop: HatchStop): Promise<void> {
  if (stop === "cancelled") return;

  const scope = await readHatchScope().catch(() => null);
  if (!scope) return;

  const sellable = toSell(scope.pets, rules);
  const note = afterHatch(stop, scope, rules, sellable);
  if (note) post("companion", "system", note);
  if (sellable.length === 0) return;

  await proposeSellPlan(sellProvider(rules), rules);
}

/** Après une vente, il propose de reprendre la couvée. Il ne la reprend pas. */
async function afterSellBatch(rules: KeepRules): Promise<void> {
  const provider = hatchProvider();
  const slots = await provider().catch(() => [] as number[]);
  if (slots.length === 0) return;

  post("companion", "system", "There is room again.");
  await proposeHatchSlots(provider, rules);
}

/**
 * Ce que le companion dit de l'équipe qu'il va porter, s'il y en a une.
 *
 * Une bascule d'équipe touche à ce que le joueur a monté à la main : elle ne
 * peut pas se glisser dans un oui qui ne la mentionnait pas.
 */
function teamPromise(teamId: string | null): string {
  const name = teamName(teamId);
  return name ? ` I would wear ${name}, then give yours back.` : "";
}

/**
 * L'équipe fait partie du périmètre confirmé.
 *
 * La coller à la signature n'est pas un détail : sans elle, changer d'équipe de
 * travail entre la question et la réponse ferait porter au companion une équipe
 * que le joueur n'a pas vue passer. Là, la proposition est refusée et reposée.
 */
function withTeam(signature: string, teamId: string | null): string {
  return `${signature}#team:${teamId ?? ""}`;
}

function openProposal(commandId: string, summary: string, size: number, signature: string): Proposal {
  return { id: `p${nextProposalSeq++}`, commandId, summary, size, signature, createdAtMs: Date.now() };
}

/** Recalcule la signature du périmètre courant, quelle que soit la commande. */
async function currentSignature(captured: Captured): Promise<string | null> {
  try {
    const settings = loadCompanionSettings();
    if (captured.kind === "harvest") {
      return withTeam(selectionSignature((await captured.provider()).rows), settings.harvestTeamId);
    }
    if (captured.kind === "plant") return plantSignature(await captured.provider());
    if (captured.kind === "hatch") return withTeam(slotSignature(await captured.provider()), settings.hatchTeamId);
    if (captured.kind === "sell") {
      const plan = await captured.provider();
      return withTeam(`${petSignature(plan.sell)}/${petSignature(plan.favourite)}`, plan.teamId);
    }
    return feedSignature(await captured.provider());
  } catch {
    return null;
  }
}

/** Repose la question, sans rejouer la bulle du joueur. */
async function reproposeSame(captured: Captured): Promise<void> {
  if (captured.kind === "harvest") await proposeHarvestScope(captured.provider);
  else if (captured.kind === "plant") await proposePlantPlan(captured.provider);
  else if (captured.kind === "hatch") await proposeHatchSlots(captured.provider, captured.rules);
  else if (captured.kind === "sell") await proposeSellPlan(captured.provider, captured.rules);
  else await proposeFeedScope(captured.provider);
}

/** Ce que le joueur répond quand il accepte, selon ce qu'on lui a proposé. */
const ACCEPTANCE: Record<Captured["kind"], string> = {
  harvest: "Yes, go ahead",
  feed: "Yes, feed them",
  plant: "Yes, plant them",
  hatch: "Yes, open them",
  // Une vente ne se rattrape pas : la réponse le nomme.
  sell: "Yes, sell them",
};

/** Taille du lot capturé, quelle que soit la commande. */
function capturedSize(captured: Captured): number {
  if (captured.kind === "harvest") return captured.rows.length;
  if (captured.kind === "plant") return captured.plan.length;
  if (captured.kind === "hatch") return captured.slots.length;
  if (captured.kind === "sell") return captured.plan.sell.length;
  return captured.picks.length;
}

export const CompanionChat = {
  getLog(): ChatLog {
    return state.log;
  },

  /** Retire une question à laquelle il est trop tard pour répondre. */
  dropStaleProposal(): void {
    dropStaleProposal();
  },

  /**
   * Retire la question de nourrissage quand elle n'a plus d'objet.
   *
   * Le joueur a nourri les animaux lui-même, ou changé d'équipe : la question
   * ne veut plus rien dire. La laisser en attente ferait patienter le companion
   * auprès du joueur pour une réponse sans conséquence.
   *
   * On ne se retire que si PLUS AUCUN des animaux proposés n'est concerné :
   * tant qu'il en reste un, la question garde du sens, et c'est la
   * vérification de périmètre à la confirmation qui protège du reste.
   */
  withdrawFeedIfSettled(stillFeedable: Set<string>): boolean {
    const proposal = state.proposal;
    const captured = state.captured;
    if (!proposal || captured?.kind !== "feed") return false;
    if (!isSettled(captured.picks, stillFeedable)) return false;

    state = { ...state, proposal: null, captured: null, log: clearProposal(state.log, proposal.id) };
    post("companion", "system", "Never mind, your pets are sorted.");
    return true;
  },

  getProposal(): Proposal | null {
    return state.proposal;
  },

  getRun(): RunProgress | null {
    return state.run;
  },

  isRunning(): boolean {
    return state.run !== null;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Alerte poussée par une source ; ignorée si identique et récente. */
  alert(text: string): void {
    state = {
      ...state,
      log: appendAlertOnce(state.log, { from: "companion", kind: "alert", text, atMs: Date.now() }, ALERT_DEDUPE_MS),
    };
    notify();
  },

  /**
   * Demande émise par le joueur. N'exécute rien : pose la question.
   *
   * `request.provider` sera rappelé à la confirmation pour vérifier que le
   * périmètre n'a pas changé entre-temps.
   */
  async proposeHarvest(request: HarvestRequest): Promise<void> {
    post("you", "command", request.label);
    if (state.run) {
      post("companion", "system", "Hold on, still on the last batch.");
      return;
    }
    if (request.kind === "harvest") await proposeHarvestScope(request.provider);
    else if (request.kind === "plant") await proposePlantPlan(request.provider);
    else if (request.kind === "hatch") await proposeHatchSlots(request.provider, request.rules);
    else await proposeFeedScope(request.provider);
  },

  /**
   * Proposition venue du companion lui-même, sans demande du joueur.
   *
   * Poser une question n'est pas agir : rien ne part tant que la confirmation
   * n'a pas été donnée. On s'abstient si une question attend déjà une réponse
   * ou si un lot tourne — se couper la parole ferait perdre la précédente.
   */
  async offerFeed(provider: FeedProvider): Promise<boolean> {
    dropStaleProposal();
    if (state.run || state.proposal) return false;
    await proposeFeedScope(provider);
    return state.proposal !== null;
  },

  /** Confirme et exécute. C'est le seul chemin qui déclenche une action. */
  async confirm(proposalId: string): Promise<void> {
    const proposal = state.proposal;
    const captured = state.captured;
    if (!proposal || proposal.id !== proposalId || !captured) {
      post("companion", "system", explain("unknown"));
      return;
    }

    // Une décision est une prise de parole : elle a sa place dans le fil, du
    // côté du joueur, sinon la conversation n'a plus qu'un seul interlocuteur.
    post("you", "command", ACCEPTANCE[captured.kind]);

    const signature = await currentSignature(captured);
    if (signature === null) {
      post("companion", "system", "Could not check again, so I am not touching anything.");
      return;
    }

    const decision = verdict(proposal, signature, Date.now());
    if (!decision.ok) {
      // Le périmètre a bougé ou la proposition a vieilli : on redemande, on
      // n'exécute pas.
      state = { ...state, proposal: null, captured: null, log: clearProposal(state.log, proposalId) };
      post("companion", "system", explain(decision.reason));
      if (decision.reason === "changed" || decision.reason === "expired") await reproposeSame(captured);
      return;
    }

    // On exécute le périmètre CAPTURÉ à la proposition, pas celui qu'on vient de
    // relire : c'est ce que l'utilisateur a vu et confirmé.
    state = {
      ...state,
      proposal: null,
      captured: null,
      run: { done: 0, total: capturedSize(captured) },
      cancelRequested: false,
      log: clearProposal(state.log, proposalId),
    };

    if (captured.kind === "harvest") {
      await runBatch((r) => executeHarvestBatch(captured.rows, r));
    } else if (captured.kind === "plant") {
      await runBatch((r) => executePlantBatch(captured.plan, r));
    } else if (captured.kind === "hatch") {
      let stop: HatchStop = "done";
      await runBatch(async (r) => {
        stop = await executeHatchBatch(captured.slots, r);
      });
      await afterHatchBatch(captured.rules, stop);
    } else if (captured.kind === "sell") {
      const stopped = await runBatch((r) => executeSellBatch(captured.plan, r));
      // Arrêter une vente puis se faire aussitôt relancer sur la couvée, c'est
      // pénible. La couvée sait déjà s'abstenir dans ce cas, la vente non.
      if (!stopped) await afterSellBatch(captured.rules);
    } else {
      await runBatch((r) => executeFeedBatch(captured.picks, r));
    }
  },

  /** Écarte la proposition en cours sans rien exécuter. */
  decline(proposalId: string): void {
    if (state.proposal?.id !== proposalId) return;
    state = { ...state, proposal: null, captured: null, log: clearProposal(state.log, proposalId) };
    post("you", "command", "Not now");
    post("companion", "system", "Alright, leaving them be.");
  },

  /** Interrompt un lot en cours. */
  cancelRun(): void {
    if (!state.run) return;
    state = { ...state, cancelRequested: true };
    notify();
  },
};

export type CompanionChatType = typeof CompanionChat;
