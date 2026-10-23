// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// The public bug report routes. Each mod hands in its own way of sending a
// request (through the userscript manager, fetch, a WebView bridge), always
// with a JSON string as the body: the AFK app's request polyfill turns any
// other body into "[object FormData]".
//
// Sending is two steps, because nginx and Express stop any request at 1 MB:
// the report first, which answers with its id and follow token, then each
// screenshot on its own. A screenshot that fails never loses the report: the
// result lists what did not go through.

import { BUG_REPORT_LIMITS } from "./limits";
import type { NormalizedImage } from "./image";
import { prepareBugReport } from "./prepare";
import type {
  AttachmentKind,
  BugReportAttachmentPayload,
  BugReportComment,
  BugReportPayload,
  CreatedBugReport,
  MyBugReport,
} from "./types";

export type BugReportHttpRequest = {
  method: "GET" | "POST";
  url: string;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
};

/** Any status, with the body as text. Network failures reject instead. */
export type BugReportHttpResponse = { status: number; body: string };

export type BugReportRequest = (request: BugReportHttpRequest) => Promise<BugReportHttpResponse>;

export type BugReportClient = {
  /** The backend's root, e.g. `https://ariesmod-api.ariedam.fr`. */
  baseUrl: string;
  request: BugReportRequest;
  /** The player's API key when the mod has one: the backend then marks the report as verified. */
  getApiKey?: () => string | null | undefined;
  reportTimeoutMs?: number;
  uploadTimeoutMs?: number;
};

export type BugReportError =
  | { kind: "offline" }
  | { kind: "timeout" }
  | { kind: "rate_limited"; retryAfterSec: number | null }
  | { kind: "duplicate"; id: number | null; ref: string | null }
  | { kind: "invalid"; field: string | null }
  | { kind: "too_large" }
  | { kind: "not_found" }
  | { kind: "closed" }
  | { kind: "rejected"; status: number; reason: string | null }
  | { kind: "server"; status: number }
  | { kind: "bad_response" };

export type BugReportAttachment = NormalizedImage & { kind: AttachmentKind };

export type SubmitProgress = { stage: "report" } | { stage: "attachment"; index: number; total: number };

export type SubmitResult =
  | {
      ok: true;
      report: CreatedBugReport;
      attachmentsSent: number;
      attachmentFailures: Array<{ index: number; error: BugReportError }>;
    }
  | { ok: false; error: BugReportError };

const REPORT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 60_000;
/** Our own deadline sits past the transport's, for a transport that never gives up. */
const DEADLINE_GRACE_MS = 5_000;

class DeadlineError extends Error {}

function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DeadlineError("deadline")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function parseJson(text: string): any {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const stringOrNull = (value: unknown) => (typeof value === "string" ? value : null);

/** A failed answer as an error the form can explain. */
export function errorFromResponse(status: number, data: any): BugReportError {
  const reason = stringOrNull(data?.error);
  if (status === 0) return { kind: "offline" };
  if (status === 429) return { kind: "rate_limited", retryAfterSec: numberOrNull(data?.retryAfter) };
  if (status === 409 && reason === "duplicate") return { kind: "duplicate", id: numberOrNull(data?.id), ref: stringOrNull(data?.ref) };
  if (status === 409 && reason === "closed") return { kind: "closed" };
  if (status === 400) return { kind: "invalid", field: stringOrNull(data?.field) };
  if (status === 404) return { kind: "not_found" };
  if (status === 413) return { kind: "too_large" };
  if (status >= 500) return { kind: "server", status };
  return { kind: "rejected", status, reason };
}

type CallResult = { ok: true; status: number; data: any } | { ok: false; error: BugReportError };

async function postJson(client: BugReportClient, path: string, body: unknown, timeoutMs: number): Promise<CallResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  let apiKey: string | null | undefined = null;
  try {
    apiKey = client.getApiKey?.();
  } catch {}
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  let response: BugReportHttpResponse;
  try {
    response = await withDeadline(
      client.request({ method: "POST", url: joinUrl(client.baseUrl, path), headers, body: JSON.stringify(body), timeoutMs }),
      timeoutMs + DEADLINE_GRACE_MS,
    );
  } catch (error) {
    const timedOut = error instanceof DeadlineError || /time(d)?\s?out/i.test(String((error as Error)?.message ?? error));
    return { ok: false, error: timedOut ? { kind: "timeout" } : { kind: "offline" } };
  }
  const data = parseJson(response.body);
  if (response.status >= 200 && response.status < 300) return { ok: true, status: response.status, data };
  return { ok: false, error: errorFromResponse(response.status, data) };
}

function readCreated(data: any): CreatedBugReport | null {
  const id = numberOrNull(data?.id);
  const followToken = stringOrNull(data?.followToken);
  if (!id || !followToken) return null;
  return { id, ref: stringOrNull(data?.ref) ?? `BR-${id}`, followToken, status: stringOrNull(data?.status) ?? "new" };
}

/** Network trouble is worth one more try; a refusal from the server is not. */
const isTransient = (error: BugReportError) => error.kind === "offline" || error.kind === "timeout" || error.kind === "server";

async function uploadAttachment(
  client: BugReportClient,
  report: CreatedBugReport,
  image: BugReportAttachment,
): Promise<{ ok: true } | { ok: false; error: BugReportError }> {
  if (image.bytes > BUG_REPORT_LIMITS.attachmentBytes) return { ok: false, error: { kind: "too_large" } };
  const body: BugReportAttachmentPayload = {
    followToken: report.followToken,
    mime: image.mime,
    data: image.base64,
    width: image.width,
    height: image.height,
    kind: image.kind,
  };
  const timeoutMs = client.uploadTimeoutMs ?? UPLOAD_TIMEOUT_MS;
  let result = await postJson(client, `bug-reports/${report.id}/attachments`, body, timeoutMs);
  if (!result.ok && isTransient(result.error)) {
    result = await postJson(client, `bug-reports/${report.id}/attachments`, body, timeoutMs);
  }
  return result.ok ? { ok: true } : result;
}

/**
 * Sends a report, then its screenshots one by one. The payload goes through
 * `prepareBugReport` first, so a field the backend would refuse fails here
 * with `invalid` and nothing is sent. `attachmentsExpected` is set from the
 * screenshots given.
 */
export async function submitBugReport(
  client: BugReportClient,
  payload: BugReportPayload,
  attachments: readonly BugReportAttachment[] = [],
  onProgress?: (progress: SubmitProgress) => void,
): Promise<SubmitResult> {
  const images = attachments.slice(0, BUG_REPORT_LIMITS.attachments);
  const prepared = prepareBugReport({ ...payload, attachmentsExpected: images.length });
  if (!prepared.ok) return { ok: false, error: { kind: "invalid", field: prepared.field } };

  const progress = (value: SubmitProgress) => {
    try {
      onProgress?.(value);
    } catch {}
  };
  progress({ stage: "report" });
  const sent = await postJson(client, "bug-reports", prepared.payload, client.reportTimeoutMs ?? REPORT_TIMEOUT_MS);
  if (!sent.ok) return sent;
  const report = readCreated(sent.data);
  if (!report) return { ok: false, error: { kind: "bad_response" } };

  const attachmentFailures: Array<{ index: number; error: BugReportError }> = [];
  for (let index = 0; index < images.length; index++) {
    progress({ stage: "attachment", index, total: images.length });
    const uploaded = await uploadAttachment(client, report, images[index]);
    if (!uploaded.ok) attachmentFailures.push({ index, error: uploaded.error });
  }
  return { ok: true, report, attachmentsSent: images.length - attachmentFailures.length, attachmentFailures };
}

function readComment(raw: any): BugReportComment | null {
  if (!raw || typeof raw.message !== "string") return null;
  return {
    author: raw.author === "admin" ? "admin" : "reporter",
    message: raw.message,
    createdAt: stringOrNull(raw.createdAt) ?? "",
  };
}

function readMyReport(raw: any): MyBugReport | null {
  const id = numberOrNull(raw?.id);
  if (!id) return null;
  const comments = Array.isArray(raw.comments) ? raw.comments.map(readComment).filter(Boolean) as BugReportComment[] : [];
  return {
    id,
    ref: stringOrNull(raw.ref) ?? `BR-${id}`,
    project: stringOrNull(raw.project) ?? "",
    title: stringOrNull(raw.title) ?? "",
    status: stringOrNull(raw.status) ?? "new",
    statusLabel: stringOrNull(raw.statusLabel) ?? "",
    modVersion: stringOrNull(raw.modVersion),
    fixedInVersion: stringOrNull(raw.fixedInVersion),
    publicReply: stringOrNull(raw.publicReply),
    publicReplyAt: stringOrNull(raw.publicReplyAt),
    createdAt: stringOrNull(raw.createdAt) ?? "",
    updatedAt: stringOrNull(raw.updatedAt) ?? "",
    comments,
    canComment: raw.canComment === true,
  };
}

export type FollowedReport = { id: number; followToken: string };

/**
 * The status of reports sent from here, by follow token (at most 50), plus,
 * with an API key, the player's verified reports. A pair the backend does not
 * recognise is simply missing from the answer.
 */
export async function listMyReports(
  client: BugReportClient,
  reports: readonly FollowedReport[],
): Promise<{ ok: true; reports: MyBugReport[] } | { ok: false; error: BugReportError }> {
  const body = {
    reports: reports.slice(0, BUG_REPORT_LIMITS.mineReports).map(({ id, followToken }) => ({ id, followToken })),
  };
  const result = await postJson(client, "bug-reports/mine", body, client.reportTimeoutMs ?? REPORT_TIMEOUT_MS);
  if (!result.ok) return result;
  const list = Array.isArray(result.data?.reports) ? result.data.reports : null;
  if (!list) return { ok: false, error: { kind: "bad_response" } };
  return { ok: true, reports: list.map(readMyReport).filter(Boolean) as MyBugReport[] };
}

/** Adds the player's comment to a report. A report that is closed refuses it (`closed`). */
export async function addReportComment(
  client: BugReportClient,
  report: FollowedReport,
  message: string,
): Promise<{ ok: true } | { ok: false; error: BugReportError }> {
  const text = message.trim();
  if (!text || text.length > BUG_REPORT_LIMITS.commentMessage) return { ok: false, error: { kind: "invalid", field: "message" } };
  const result = await postJson(
    client,
    `bug-reports/${report.id}/comments`,
    { followToken: report.followToken, message: text },
    client.reportTimeoutMs ?? REPORT_TIMEOUT_MS,
  );
  return result.ok ? { ok: true } : result;
}

/** "a minute", "12 minutes", "about 2 hours". */
export function formatWait(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 60) return "a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours <= 1 ? "about an hour" : `about ${hours} hours`;
}

const FIELD_HINTS: Record<string, string> = {
  title: "The title needs between 3 and 140 characters.",
  description: "Please describe what happened in at least 10 characters.",
  message: "A reply needs between 1 and 2000 characters.",
};

/** A sentence for the player about what went wrong. */
export function describeBugReportError(error: BugReportError): string {
  switch (error.kind) {
    case "offline":
      return "Could not reach the server. Check your connection and try again.";
    case "timeout":
      return "The server took too long to answer. Please try again in a moment.";
    case "rate_limited":
      return `You have sent several reports in a short time. Please try again in ${formatWait(error.retryAfterSec)}.`;
    case "duplicate":
      return error.ref
        ? `You already sent this report a few minutes ago, as ${error.ref}. No need to send it twice.`
        : "You already sent this report a few minutes ago. No need to send it twice.";
    case "invalid":
      return (error.field && FIELD_HINTS[error.field]) || `The server did not accept the ${error.field ?? "report"} field.`;
    case "too_large":
      return "The report is too large to send. Try removing a screenshot.";
    case "not_found":
      return "This report could not be found on the server.";
    case "closed":
      return "This report is closed, so it no longer takes replies.";
    case "server":
      return `The server ran into a problem (error ${error.status}). Please try again in a few minutes.`;
    case "rejected":
      return `The server refused the request (error ${error.status}${error.reason ? `, ${error.reason}` : ""}).`;
    case "bad_response":
      return "The server gave an answer the mod did not understand.";
  }
}
