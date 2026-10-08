// The proposal and confirmation cycle. This module keeps the mod within its
// rules: automation is not allowed, and everything that prevents it is here.
//
// The rule: every run must trace back to a human decision taken a few seconds
// earlier.
//
// FORBIDDEN, do not work around these thinking it improves comfort:
//   1. No "don't ask me again" and no "always allow".
//   2. No queue and no scheduling.
//   3. No "do it again" button: every run starts from a fresh proposal.
//   4. Nothing triggers on its own.
//
// Pure: the clock is passed in, no timer, no effect.

/** Past this, a confirmation is no longer a decision but a trigger. */
export const PROPOSAL_TTL_MS = 30_000;

export type Proposal = {
  id: string;
  commandId: string;
  /** The exact summary shown to the player with the proposal. */
  summary: string;
  /** The proposed batch's size. */
  size: number;
  /** The batch's signature, to notice it changed since. */
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
 * Decides whether a proposal may run.
 *
 * `currentSignature` is the batch's signature worked out again at the moment
 * of confirmation. If it differs, the run is refused: the player must confirm
 * what they really see. Otherwise 40 crops would be harvested on a
 * confirmation that announced 12, because others ripened meanwhile.
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

/** The message shown when a confirmation is refused. */
export function explain(reason: Exclude<ProposalVerdict, { ok: true }>["reason"]): string {
  switch (reason) {
    case "expired":
      return "That went stale while I waited. Let me have another look.";
    case "changed":
      // True for every command: a crop that ripened as much as a pet fed meanwhile.
      return "Things moved while I was waiting. Here is what I see now.";
    case "empty":
      return "There is nothing left to do there.";
    default:
      return "I lost track of that one, sorry. Ask me again.";
  }
}

/**
 * The work team is part of the confirmed scope.
 *
 * Without it in the signature, changing the work team between the question
 * and the answer would have him wear a team the player never saw named. With
 * it, the proposal is refused and asked again.
 */
export function withTeam(signature: string, teamId: string | null): string {
  return `${signature}#team:${teamId ?? ""}`;
}

/**
 * What he says about the team he would wear, if any.
 *
 * A team swap touches what the player built by hand: it cannot slip into a yes
 * to a question that never mentioned it.
 */
export function teamPromise(teamName: string | null): string {
  return teamName ? ` I would wear ${teamName}, then give yours back.` : "";
}
