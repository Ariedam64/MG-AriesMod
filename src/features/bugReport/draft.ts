// The text of a report not sent yet, saved as the player types so closing the
// window or reloading the page does not lose it. Cleared once the report is
// sent. The contact is kept apart and offered again on the next report.

import { debounce } from "../../lib/async";
import { readAriesPath, writeAriesPath } from "../../platform/storage";

const DRAFT_PATH = "bugReport.draft";
const CONTACT_PATH = "bugReport.contact";
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
  writeAriesPath(DRAFT_PATH, draftHasText(draft) ? draft : undefined);
}

export const saveDraftSoon = debounce(writeDraft, SAVE_DELAY_MS);

export function clearDraft(): void {
  saveDraftSoon.cancel();
  writeAriesPath(DRAFT_PATH, undefined);
}

export function rememberContact(contact: string | null): void {
  writeAriesPath(CONTACT_PATH, contact?.trim() || undefined);
}
