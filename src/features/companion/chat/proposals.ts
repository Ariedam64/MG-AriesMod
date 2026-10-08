// src/services/companion/chat/proposals.ts
// Cycle proposition → confirmation. C'est le module qui porte la conformité :
// l'automatisation n'est pas autorisée sur le mod, et tout ce qui l'empêche est ici.
//
// Règle : toute exécution doit être traçable à une décision humaine prise
// quelques secondes plus tôt.
//
// INTERDITS — ne pas contourner en croyant améliorer le confort :
//   1. Pas de « ne plus me demander » ni de « toujours autoriser ».
//   2. Pas de file d'attente ni de planification.
//   3. Pas de bouton « refaire » : chaque exécution repart d'une proposition fraîche.
//   4. Rien ne se déclenche tout seul.
//
// Module PUR : horloge injectée, aucun timer, aucun effet.

/** Au-delà, une confirmation n'est plus une décision mais un déclencheur. */
export const PROPOSAL_TTL_MS = 30_000;

export type Proposal = {
  id: string;
  commandId: string;
  /** Résumé exact montré à l'utilisateur au moment de la proposition. */
  summary: string;
  /** Taille du lot proposé. */
  size: number;
  /** Signature du lot, pour détecter qu'il a changé depuis. */
  signature: string;
  createdAtMs: number;
};

export type ProposalVerdict =
  | { ok: true }
  | { ok: false; reason: "unknown" | "expired" | "empty" | "changed" };

export function isExpired(proposal: Proposal, nowMs: number, ttlMs = PROPOSAL_TTL_MS): boolean {
  return nowMs - proposal.createdAtMs >= ttlMs;
}

/**
 * Décide si une proposition peut être exécutée.
 *
 * `currentSignature` est la signature du lot recalculée à l'instant de la
 * confirmation. Si elle diffère, on refuse : l'utilisateur doit reconfirmer ce
 * qu'il voit réellement. Sinon on récolterait 40 crops sur une confirmation qui
 * en annonçait 12, parce que d'autres ont mûri entre-temps.
 */
export function verdict(
  proposal: Proposal | null,
  currentSignature: string | null,
  nowMs: number,
  ttlMs = PROPOSAL_TTL_MS
): ProposalVerdict {
  if (!proposal) return { ok: false, reason: "unknown" };
  if (isExpired(proposal, nowMs, ttlMs)) return { ok: false, reason: "expired" };
  if (!currentSignature || proposal.size === 0) return { ok: false, reason: "empty" };
  if (currentSignature !== proposal.signature) return { ok: false, reason: "changed" };
  return { ok: true };
}

/** Message affiché quand une confirmation est refusée. */
export function explain(reason: Exclude<ProposalVerdict, { ok: true }>["reason"]): string {
  switch (reason) {
    case "expired":
      return "That went stale while I waited. Let me have another look.";
    case "changed":
      // Vaut pour toutes les commandes : un crop qui mûrit comme un pet qui a
      // été nourri entre-temps.
      return "Things moved while I was waiting. Here is what I see now.";
    case "empty":
      return "There is nothing left to do there.";
    default:
      return "I lost track of that one, sorry. Ask me again.";
  }
}
