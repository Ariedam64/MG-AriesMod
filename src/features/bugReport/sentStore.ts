// The reports sent from this browser: newest first, at most 50, each with the
// follow token that reads its status back and answers in the player's name.
//
// Kept under their own key, outside the `aries_mod` blob: Settings > Data
// exports and backs up the blob, and a token in a shared settings file would
// let anyone read the replies and post as the player, while importing someone
// else's file would swap their list for ours. Earlier builds of this form kept
// the list in the blob under `bugReport.sent`; it is moved out when read.

import { Emitter, type Unsubscribe } from "../../lib/emitter";
import { addSentReport, parseSentReports, type SentReport } from "../../lib/bugReport/sentReports";
import { readAriesPath, readLocalJson, writeAriesPath, writeLocalJson } from "../../platform/storage";

const SENT_KEY = "aries_bug_reports_sent";
const LEGACY_SENT_PATH = "bugReport.sent";

const changed = new Emitter<void>();

/** Moves a list left in the blob by an earlier build to its own key, merged with what is there. */
function moveLegacyList(): void {
  const legacy = readAriesPath<unknown>(LEGACY_SENT_PATH);
  if (legacy === undefined) return;
  const merged = parseSentReports([...parseSentReports(readLocalJson(SENT_KEY)), ...parseSentReports(legacy)]);
  // Left in the blob if the key could not be written: a lost token is lost for good.
  if (writeLocalJson(SENT_KEY, merged)) writeAriesPath(LEGACY_SENT_PATH, undefined);
}

export function readSentReports(): SentReport[] {
  moveLegacyList();
  return parseSentReports(readLocalJson(SENT_KEY));
}

export function rememberSentReport(entry: SentReport): void {
  writeLocalJson(SENT_KEY, addSentReport(readSentReports(), entry));
  changed.emit();
}

/** Fires after a report is added, so My reports can fetch its status. */
export function onSentReportsChange(cb: () => void): Unsubscribe {
  return changed.on(cb);
}
