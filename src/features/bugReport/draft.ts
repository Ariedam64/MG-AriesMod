// The text of a report not sent yet, saved as the player types so closing the
// window or reloading the page does not lose it. Cleared once the report is
// sent. The contact is kept apart and offered again on the next report.
//
// Next to it, the follow token of the report being sent: made on the first
// try and kept until one goes through, so a retry after a timeout, even after
// reopening the window or reloading the page, gets back the report the first
// try created instead of a duplicate refusal that loses its follow-up. The
// token only means something with its draft: a token found without one would
// make the next, different report come back as the earlier one, its text lost.

import { debounce } from "../../lib/async";
import { pendingBugReport, type PendingBugReport } from "../../lib/bugReport/client";
import { readAriesPath, writeAriesPath } from "../../platform/storage";

const DRAFT_PATH = "bugReport.draft";
const CONTACT_PATH = "bugReport.contact";
const PENDING_TOKEN_PATH = "bugReport.pendingToken";
const SAVE_DELAY_MS = 600;

export const DRAFT_FIELDS = [
  "category",
  "title",
  "description",
  "feature",
  "steps",
  "expected",
  "actual",
  "frequency",
  "withoutMod",
  "contact",
] as const;

export type DraftField = (typeof DRAFT_FIELDS)[number];
export type Draft = Partial<Record<DraftField, string>>;

/** The saved draft, keeping only known fields that hold text. */
export function readDraft(): Draft {
  const raw = readAriesPath<Record<string, unknown>>(DRAFT_PATH);
  const draft: Draft = {};
  if (raw && typeof raw === "object") {
    for (const field of DRAFT_FIELDS) {
      const value = raw[field];
      if (typeof value === "string" && value) draft[field] = value;
    }
  }
  if (!draft.contact) {
    const contact = readAriesPath<unknown>(CONTACT_PATH);
    if (typeof contact === "string" && contact) draft.contact = contact;
  }
  return draft;
}

/** True when the draft holds something the player wrote, not just choices left at their default. */
export function draftHasText(draft: Draft): boolean {
  return !!(draft.title?.trim() || draft.description?.trim() || draft.steps?.trim() || draft.expected?.trim() || draft.actual?.trim());
}

function writeDraft(draft: Draft): void {
  const hasText = draftHasText(draft);
  writeAriesPath(DRAFT_PATH, hasText ? draft : undefined);
  // A form emptied by hand is a new report to come: it must not inherit the token.
  if (!hasText) forgetPendingReport();
}

export const saveDraftSoon = debounce(writeDraft, SAVE_DELAY_MS);

/** Forgets the draft and its pending token: on success, or when the player discards it. */
export function clearDraft(): void {
  saveDraftSoon.cancel();
  writeAriesPath(DRAFT_PATH, undefined);
  forgetPendingReport();
}

/**
 * The draft to fill the form with when it opens. With no text to resume, a
 * token left behind (a restored backup or an imported file replaced the
 * draft it went with) is dropped, so the report written next gets its own.
 */
export function openDraft(): Draft {
  const draft = readDraft();
  if (!draftHasText(draft)) forgetPendingReport();
  return draft;
}

/**
 * The report about to be sent, `draft` holding its text: the pending one from
 * an earlier try, or a new one whose token is saved before anything goes out,
 * so a try that never answers still leaves it behind for the retry.
 */
export function pendingReport(draft: Draft): PendingBugReport {
  // Saved now with the token, not 600 ms after the last key press: a page
  // closed while this try is in flight must leave both behind, never the
  // token alone.
  saveDraftSoon.cancel();
  writeDraft(draft);
  const saved = readAriesPath<unknown>(PENDING_TOKEN_PATH);
  const pending = pendingBugReport(saved);
  if (pending.followToken !== saved) writeAriesPath(PENDING_TOKEN_PATH, pending.followToken ?? undefined);
  return pending;
}

function forgetPendingReport(): void {
  if (readAriesPath<unknown>(PENDING_TOKEN_PATH) !== undefined) writeAriesPath(PENDING_TOKEN_PATH, undefined);
}

export function rememberContact(contact: string | null): void {
  writeAriesPath(CONTACT_PATH, contact?.trim() || undefined);
}
