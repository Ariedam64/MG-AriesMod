// The portable bug report core, shared by every mod that reports to the
// aries-mod-backend (Arie's Mod, MG-mod, Community Hub, Gemini).
//
// This folder is copied as it is into the other mods. It must stay
// self-contained: nothing imported from outside it, no game global, no
// userscript manager API, no UI. A mod supplies the rest through small
// adapters: a request function (see `BugReportClient`), its storage for the
// sent reports, its own form, and a game frame when it can draw one.
//
// The API it speaks is docs/bug-reports.md in aries-mod-backend.
//
// Files:
//   types.ts         the request and response bodies
//   status.ts        statuses and the labels players see
//   limits.ts        size limits and text clipping
//   redact.ts        secrets hidden before anything is sent
//   prepare.ts       a form's data turned into the exact body to send
//   logCapture.ts    console errors, uncaught errors and breadcrumbs, in memory
//   image.ts         any screenshot shrunk to WebP or JPEG under 600 KB
//   screenCapture.ts one frame of the tab, through the screen capture API
//   client.ts        submit, list my reports, comment, errors in plain words
//   sentReports.ts   the list of reports sent from this browser
//   version.ts       version comparison, for "fixed in vX"

export * from "./client";
export * from "./image";
export * from "./limits";
export * from "./logCapture";
export * from "./prepare";
export * from "./redact";
export * from "./screenCapture";
export * from "./sentReports";
export * from "./status";
export * from "./types";
export * from "./version";
