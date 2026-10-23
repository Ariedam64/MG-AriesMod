// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// The bodies exchanged with the backend. docs/bug-reports.md in
// aries-mod-backend is the reference: a change lands there first, then here.

import type { BugReportStatus } from "./status";

export const BUG_REPORT_PROJECTS = ["aries-mod", "mg-mod", "community-hub", "gemini", "mg-afk-app", "other"] as const;
export type BugReportProject = (typeof BUG_REPORT_PROJECTS)[number];

export const BUG_REPORT_CATEGORIES = ["bug", "crash", "visual", "performance", "feature", "question", "other"] as const;
export type BugReportCategory = (typeof BUG_REPORT_CATEGORIES)[number];

export const BUG_REPORT_FREQUENCIES = ["always", "often", "sometimes", "once", "unknown"] as const;
export type BugReportFrequency = (typeof BUG_REPORT_FREQUENCIES)[number];

/** Does the problem also happen without the mod? */
export const BUG_REPORT_WITHOUT_MOD = ["yes", "no", "unknown"] as const;
export type BugReportWithoutMod = (typeof BUG_REPORT_WITHOUT_MOD)[number];

export const LOG_LEVELS = ["error", "warn", "info", "log"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** `game` is a frame of the game's renderer, `screen` a tab capture, `upload` a file or a paste. */
export const ATTACHMENT_KINDS = ["game", "screen", "upload"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const ATTACHMENT_MIMES = ["image/png", "image/jpeg", "image/webp"] as const;
export type AttachmentMime = (typeof ATTACHMENT_MIMES)[number];

export type LogEntry = {
  /** Epoch milliseconds. */
  t: number;
  level: LogLevel;
  msg: string;
  /** The same line came again this many times in a row. */
  repeat?: number;
};

export type Breadcrumb = { t: number; msg: string; repeat?: number };

export interface BugReportEnvironment {
  surface?: string;
  host?: string;
  userAgent?: string;
  viewport?: string;
  dpr?: number;
  scriptHandler?: string | null;
  language?: string;
  uptimeSec?: number;
  [key: string]: unknown;
}

/** What the mod knows about the session, frozen with the report. Every part is optional. */
export interface BugReportContext {
  environment?: BugReportEnvironment;
  mod?: { latestVersion?: string | null; behind?: boolean; [key: string]: unknown };
  game?: { roomId?: string | null; playersInRoom?: number | null; activeModal?: string | null; [key: string]: unknown };
  /** Setting path to value, from a whitelist of harmless feature flags. */
  settings?: Record<string, unknown>;
  logs?: LogEntry[];
  breadcrumbs?: Breadcrumb[];
  extra?: Record<string, unknown>;
}

/** `POST /bug-reports`. */
export interface BugReportPayload {
  project: BugReportProject;
  modName: string | null;
  modVersion: string | null;
  gameVersion: string | null;
  playerId: string | null;
  playerName: string | null;
  contact: string | null;
  category: BugReportCategory;
  title: string;
  description: string;
  steps: string | null;
  expected: string | null;
  actual: string | null;
  frequency: BugReportFrequency;
  withoutMod: BugReportWithoutMod;
  /** The part of the mod it is about, in the player's words or a menu name. */
  feature: string | null;
  /** Consent for the backend to freeze the account state it already holds. */
  includeAccountState: boolean;
  /** 0 to 3: the triage waits for this many screenshots. */
  attachmentsExpected: number;
  context: BugReportContext;
}

/** `201` answer to `POST /bug-reports`. The follow token is only ever sent this once. */
export interface CreatedBugReport {
  id: number;
  ref: string;
  followToken: string;
  status: BugReportStatus | string;
}

/** `POST /bug-reports/:id/attachments`. */
export interface BugReportAttachmentPayload {
  followToken: string;
  mime: AttachmentMime;
  /** Base64, without a `data:` prefix. */
  data: string;
  width: number;
  height: number;
  kind: AttachmentKind;
}

export interface BugReportComment {
  author: "reporter" | "admin";
  message: string;
  createdAt: string;
}

/** One entry of `POST /bug-reports/mine`. */
export interface MyBugReport {
  id: number;
  ref: string;
  project: string;
  title: string;
  status: BugReportStatus | string;
  statusLabel: string;
  modVersion: string | null;
  fixedInVersion: string | null;
  publicReply: string | null;
  publicReplyAt: string | null;
  createdAt: string;
  updatedAt: string;
  comments: BugReportComment[];
  canComment: boolean;
}
