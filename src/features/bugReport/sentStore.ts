// The reports sent from this browser, under `bugReport.sent`: newest first,
// at most 50, each with the follow token that reads its status back.

import { Emitter, type Unsubscribe } from "../../lib/emitter";
import { addSentReport, parseSentReports, type SentReport } from "../../lib/bugReport/sentReports";
import { readAriesPath, writeAriesPath } from "../../platform/storage";

const SENT_PATH = "bugReport.sent";

const changed = new Emitter<void>();

export function readSentReports(): SentReport[] {
  return parseSentReports(readAriesPath<unknown>(SENT_PATH));
}

export function rememberSentReport(entry: SentReport): void {
  writeAriesPath(SENT_PATH, addSentReport(readSentReports(), entry));
  changed.emit();
}

/** Fires after a report is added, so My reports can fetch its status. */
export function onSentReportsChange(cb: () => void): Unsubscribe {
  return changed.on(cb);
}
