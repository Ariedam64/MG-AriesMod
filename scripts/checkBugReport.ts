// The bug report core (src/lib/bugReport/) and the two places the mod plugs
// into it: the settings whitelist and the list of sent reports.
//
// The core ships to ~900 players and is copied into the other mods, so this
// pins what must never regress: secrets never leave the browser, a report is
// cut to what the backend accepts before it is sent, the console capture
// cannot loop or throw into the code that logged, a failed screenshot never
// loses its report, and the API key is never part of the attached settings.
//
// Run with: npm run check:bugreport

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { check, checkEqual, run } from "./_check";
import {
  addReportComment,
  describeBugReportError,
  listMyReports,
  submitBugReport,
  type BugReportAttachment,
  type BugReportClient,
  type BugReportHttpRequest,
} from "../src/lib/bugReport/client";
import { ImageNormalizeError, normalizeImage, normalizedImageBlob } from "../src/lib/bugReport/image";
import { BUG_REPORT_LIMITS } from "../src/lib/bugReport/limits";
import { RingBuffer, createLogCapture, type LogCaptureTarget } from "../src/lib/bugReport/logCapture";
import { fitContext, prepareBugReport, prepareContext } from "../src/lib/bugReport/prepare";
import { REDACTED, isSecretKey, redactString, redactValue } from "../src/lib/bugReport/redact";
import { addSentReport, parseSentReports, type SentReport } from "../src/lib/bugReport/sentReports";
import { STATUS_LABELS, acceptsComments, statusLabel } from "../src/lib/bugReport/status";
import type { BugReportPayload } from "../src/lib/bugReport/types";
import { compareVersions, isVersionBelow } from "../src/lib/bugReport/version";
import { REPORTED_SETTINGS, readReportedSettings } from "../src/features/bugReport/settingsWhitelist";
import { readSentReports, rememberSentReport } from "../src/features/bugReport/sentStore";

// A browser with storage, for the settings and the sent list. GM storage holds
// the API key, as it does in the mod.
const local = new Map<string, string>();
const gm = new Map<string, unknown>();
const g = globalThis as any;
g.window = g;
g.addEventListener = () => {};
g.document = { addEventListener() {}, visibilityState: "visible" };
g.localStorage = {
  getItem: (key: string) => local.get(key) ?? null,
  setItem: (key: string, value: string) => void local.set(key, value),
  removeItem: (key: string) => void local.delete(key),
};
// Canvases whose encoded size follows their pixel count, and a WebP encoder
// that can be switched off the way Safari's is (it answers PNG instead).
let webpEncoder = true;
g.document.createElement = () => {
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ fillRect() {}, drawImage() {}, fillStyle: "", imageSmoothingQuality: "" }),
    toBlob(cb: (blob: Blob | null) => void, mime: string) {
      const type = mime === "image/webp" && !webpEncoder ? "image/png" : mime;
      const perPixel = type === "image/jpeg" ? 0.6 : 0.5;
      cb(new Blob([new Uint8Array(Math.round(canvas.width * canvas.height * perPixel))], { type }));
    },
  };
  return canvas;
};
g.GM_getValue = (key: string, fallback: unknown) => (gm.has(key) ? gm.get(key) : fallback);
g.GM_setValue = (key: string, value: unknown) => void gm.set(key, value);

const API_KEY = "SECRET-API-KEY-1234567890";
// The blob as a player's browser holds it, with things that must never leave:
// a key-like value inside a section, saved gardens, team data.
gm.set("aries_api_key", API_KEY);
local.set(
  "aries_mod",
  JSON.stringify({
    version: 1,
    misc: { ghostMode: true, apiKey: "LEAKED-FROM-BLOB", ghostDelayMs: 250 },
    pets: { teams: [{ id: "team-1" }], teamSync: false },
    ui: { appearance: { theme: "night", scale: 1.1, accent: null } },
    editor: { savedGardens: { big: "x".repeat(5000) } },
    inventory: { sortKey: "x".repeat(60) },
  }),
);
const TOKEN = "ab".repeat(32);
const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.c2lnbmF0dXJlLWhlcmU";

function basePayload(overrides: Partial<BugReportPayload> = {}): BugReportPayload {
  return {
    project: "aries-mod",
    modName: "Arie's Mod",
    modVersion: "4.0.5",
    gameVersion: "1727",
    playerId: "123456789012345678",
    playerName: "Romann",
    contact: null,
    category: "bug",
    title: "Pet team hotkeys do nothing",
    description: "Since this morning pressing 1 does not swap my team.",
    steps: null,
    expected: null,
    actual: null,
    frequency: "always",
    withoutMod: "unknown",
    feature: "Pets",
    includeAccountState: true,
    attachmentsExpected: 0,
    context: {},
    ...overrides,
  };
}

const image = (kind: BugReportAttachment["kind"]): BugReportAttachment => ({
  mime: "image/webp",
  base64: "UklGRgAAAABXRUJQ",
  width: 1280,
  height: 720,
  bytes: 210_000,
  kind,
});

type Reply = { status: number; body?: unknown } | "network" | "timeout";

/** A backend that answers each request with `answer`, and remembers what it got. */
function fakeBackend(answer: (req: BugReportHttpRequest, body: any, n: number) => Reply) {
  const calls: Array<BugReportHttpRequest & { json: any }> = [];
  const client: BugReportClient = {
    baseUrl: "https://api.test/",
    getApiKey: () => API_KEY,
    async request(req) {
      const json = req.body ? JSON.parse(req.body) : null;
      calls.push({ ...req, json });
      const reply = answer(req, json, calls.length);
      if (reply === "network") throw new Error("Network error for test");
      if (reply === "timeout") throw new Error("Timeout for test");
      return { status: reply.status, body: reply.body === undefined ? "" : JSON.stringify(reply.body) };
    },
  };
  return { client, calls };
}

const created = { id: 42, ref: "BR-42", followToken: TOKEN, status: "new" };

run(async () => {
  // ---------- The core stays copyable ----------
  {
    const dir = join("src", "lib", "bugReport");
    for (const name of readdirSync(dir).filter((file) => file.endsWith(".ts"))) {
      const source = readFileSync(join(dir, name), "utf8");
      const outside = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]).filter((spec) => !spec.startsWith("./"));
      check(`core ${name} imports only from its own folder`, outside.length === 0, outside.join(", "));
      const globals = source.match(/\b(GM_\w+|GM\.\w+|unsafeWindow|pageWindow)\b/g) ?? [];
      check(`core ${name} uses no userscript or page global`, globals.length === 0, globals.join(", "));
    }
  }

  // ---------- Redaction ----------
  {
    const out = redactValue({
      a: {
        apiKey: "x",
        api_key: "y",
        nested: [{ session_id: 1, author: "me", Authorization: "Bearer abcdefghijkl", "X-Auth": "z" }],
      },
      password: "p",
      note: `token is ${JWT} ok`,
      url: "https://x.test/cb?apiKey=abc123&room=AB",
      header: "Authorization: Bearer abcdefghijklmnop",
      sortKey: "name",
      skip: undefined,
      fn: () => 1,
    }) as any;
    checkEqual("a nested apiKey is redacted", out.a.apiKey, REDACTED);
    checkEqual("api_key is redacted", out.a.api_key, REDACTED);
    checkEqual("a key inside an array element is redacted", out.a.nested[0].session_id, REDACTED);
    checkEqual("Authorization is redacted", out.a.nested[0].Authorization, REDACTED);
    checkEqual("X-Auth is redacted", out.a.nested[0]["X-Auth"], REDACTED);
    checkEqual("author is not a secret", out.a.nested[0].author, "me");
    checkEqual("password is redacted", out.password, REDACTED);
    check("a JWT inside a string is masked", !out.note.includes("eyJ") && out.note.includes("[redacted-jwt]"), out.note);
    check("an apiKey URL parameter is masked", out.url === "https://x.test/cb?apiKey=[redacted]&room=AB", out.url);
    check("a Bearer value in a string is masked", out.header === "Authorization: Bearer [redacted]", out.header);
    checkEqual("sortKey is not a secret", out.sortKey, "name");
    checkEqual("undefined becomes null", out.skip, null);
    checkEqual("a function becomes null", out.fn, null);
    for (const key of ["token", "accessToken", "cookie", "jwt", "bearer", "secret", "passwd", "credentials", "oauth"]) {
      check(`"${key}" counts as a secret`, isSecretKey(key));
    }
    const cyclic: any = { name: "loop" };
    cyclic.self = cyclic;
    checkEqual("a cycle does not loop", (redactValue(cyclic) as any).self, "[circular]");
    checkEqual("redactString leaves plain text alone", redactString("nothing to hide here"), "nothing to hide here");
    const context = prepareContext({ logs: [{ t: 1, level: "error", msg: `Bearer ${TOKEN} failed` }], extra: { token: "t" } });
    check("log lines are redacted too", !JSON.stringify(context).includes(TOKEN), JSON.stringify(context));
  }

  // ---------- Limits and truncation ----------
  {
    const short = prepareBugReport(basePayload({ title: "  ab " }));
    checkEqual("a two-letter title is refused before sending", short.ok ? null : short.field, "title");
    const tooLong = prepareBugReport(basePayload({ title: "x".repeat(141) }));
    checkEqual("a 141-character title is refused", tooLong.ok ? null : tooLong.field, "title");
    const brief = prepareBugReport(basePayload({ description: " too short " }));
    checkEqual("a description under 10 characters is refused", brief.ok ? null : brief.field, "description");

    const ok = prepareBugReport(
      basePayload({
        title: "Pet   hotkeys \n broken",
        steps: "s".repeat(2500),
        contact: "c".repeat(150),
        feature: "  ",
        category: "nonsense" as any,
        frequency: undefined as any,
        attachmentsExpected: 7,
        context: { logs: Array.from({ length: 250 }, (_, i) => ({ t: i, level: "error", msg: "m".repeat(600) })) },
      }),
    );
    check("a valid report is accepted", ok.ok);
    if (ok.ok) {
      const p = ok.payload;
      checkEqual("the title's whitespace is collapsed", p.title, "Pet hotkeys broken");
      checkEqual("steps are cut to 2000", p.steps?.length, BUG_REPORT_LIMITS.steps);
      checkEqual("the contact is cut to 100", p.contact?.length, BUG_REPORT_LIMITS.contact);
      checkEqual("a blank feature becomes null", p.feature, null);
      checkEqual("an unknown category falls back on other", p.category, "other");
      checkEqual("a missing frequency is unknown", p.frequency, "unknown");
      checkEqual("attachmentsExpected is capped at 3", p.attachmentsExpected, 3);
      checkEqual("logs keep the newest 200", p.context.logs?.length, 200);
      checkEqual("the oldest kept log is entry 50", p.context.logs?.[0].t, 50);
      checkEqual("a log line is cut to 500 characters", p.context.logs?.[0].msg.length, 500);
    }

    const big = fitContext({
      environment: { surface: "web", host: "magicgarden.gg" },
      settings: { huge: "x".repeat(400_000) },
      logs: [{ t: 1, level: "error", msg: "m" }],
    });
    check("an oversized context is brought under 300 000 characters", JSON.stringify(big).length <= BUG_REPORT_LIMITS.contextChars);
    checkEqual("the environment survives the shrinking", big.environment?.host, "magicgarden.gg");
    check("the settings went first", big.settings === undefined);
  }

  // ---------- Ring buffer and console capture ----------
  {
    const ring = new RingBuffer<number>(200);
    for (let i = 0; i < 250; i++) ring.push(i);
    checkEqual("the ring buffer holds at most 200", ring.size, 200);
    checkEqual("and keeps the newest", ring.toArray()[0], 50);

    const listeners = new Map<string, (event: any) => void>();
    let warns = 0;
    const brokenError = () => {
      throw new Error("this console is broken");
    };
    const fakeConsole: { error: (...args: any[]) => void; warn: (...args: any[]) => void } = {
      error: brokenError,
      warn: () => void warns++,
    };
    const target: LogCaptureTarget = {
      console: fakeConsole,
      addEventListener: (type, fn) => void listeners.set(type, fn),
      removeEventListener: (type) => void listeners.delete(type),
    };
    const capture = createLogCapture({ maxLogs: 200 });
    const undo = capture.install(target);
    capture.install(target);

    let threw = false;
    try {
      fakeConsole.error("first", new Error("boom"));
    } catch {
      threw = true;
    }
    check("a console.error that throws does not throw through the capture", !threw);
    checkEqual("and the line is still recorded", capture.logs().length, 1);
    check("an Error argument reads as its name and message", capture.logs()[0].msg.includes("Error: boom"), capture.logs()[0].msg);

    // A getter that logs while the capture reads it: recorded once, no loop.
    const tricky = {
      get value() {
        fakeConsole.error("logged from inside a getter");
        return 1;
      },
    };
    fakeConsole.error("tricky", tricky);
    checkEqual("logging from inside the capture is not recorded again", capture.logs().length, 2);

    fakeConsole.warn("careful");
    checkEqual("installing twice wraps the console once", warns, 1);
    checkEqual("a warning is recorded as warn", capture.logs()[2].level, "warn");

    for (let i = 0; i < 300; i++) fakeConsole.warn(`line ${i}`);
    checkEqual("the capture keeps at most 200 lines", capture.logs().length, 200);
    fakeConsole.warn("same");
    fakeConsole.warn("same");
    fakeConsole.warn("same");
    const last = capture.logs().at(-1);
    check("a line repeated in a row is folded with a count", last?.msg === "same" && last.repeat === 3, JSON.stringify(last));

    fakeConsole.warn("y".repeat(10_000));
    check("a long line is cut to 500 characters", (capture.logs().at(-1)?.msg.length ?? 0) <= 500);

    listeners.get("error")?.({ error: new Error("uncaught one") });
    check("an uncaught error is recorded", capture.logs().at(-1)?.msg.includes("uncaught one") === true);
    listeners.get("unhandledrejection")?.({ reason: "nope" });
    checkEqual("a rejected promise is recorded", capture.logs().at(-1)?.msg, "Unhandled rejection: nope");

    capture.breadcrumb("opened Pets");
    capture.breadcrumb("opened Pets");
    checkEqual("breadcrumbs fold repeats too", capture.breadcrumbs(), [{ t: capture.breadcrumbs()[0].t, msg: "opened Pets", repeat: 2 }]);

    undo();
    check("uninstalling puts the original console back", fakeConsole.error === brokenError);
    check("and stops listening to errors", !listeners.has("error"));
  }

  // ---------- Two-step submit ----------
  {
    const backend = fakeBackend((req, _body, n) => {
      if (n === 1) return { status: 201, body: created };
      if (n === 2) return { status: 201, body: { id: 7 } };
      return { status: 500, body: { error: "DB error" } };
    });
    const steps: string[] = [];
    const result = await submitBugReport(backend.client, basePayload(), [image("game"), image("upload")], (p) =>
      steps.push(p.stage === "report" ? "report" : `shot ${p.index + 1}/${p.total}`),
    );
    check("the report goes through", result.ok);
    if (result.ok) {
      checkEqual("its ref comes back", result.report.ref, "BR-42");
      checkEqual("one screenshot made it", result.attachmentsSent, 1);
      checkEqual("the failed one is listed with its error", result.attachmentFailures.map((f) => [f.index, f.error.kind]), [[1, "server"]]);
    }
    checkEqual("the report is posted first", backend.calls[0].url, "https://api.test/bug-reports");
    checkEqual("it announces its screenshots", backend.calls[0].json.attachmentsExpected, 2);
    checkEqual("the API key signs the request", backend.calls[0].headers.Authorization, `Bearer ${API_KEY}`);
    checkEqual("the body is JSON", backend.calls[0].headers["Content-Type"], "application/json");
    checkEqual("each screenshot goes to the report's attachments", backend.calls[1].url, "https://api.test/bug-reports/42/attachments");
    checkEqual("with the follow token", backend.calls[1].json.followToken, TOKEN);
    checkEqual("and its kind", [backend.calls[1].json.kind, backend.calls[2].json.kind], ["game", "upload"]);
    checkEqual("a server error is retried once, then given up", backend.calls.length, 4);
    checkEqual("progress is reported step by step", steps, ["report", "shot 1/2", "shot 2/2"]);
  }
  {
    const backend = fakeBackend(() => ({ status: 429, body: { error: "rate_limited", retryAfter: 1800 } }));
    const result = await submitBugReport(backend.client, basePayload(), [image("game")]);
    const error = result.ok ? null : result.error;
    checkEqual("429 maps to rate_limited with its wait", error, { kind: "rate_limited", retryAfterSec: 1800 });
    check("and reads as a wait in minutes", !!error && describeBugReportError(error).includes("30 minutes"));
    checkEqual("no screenshot is sent for a refused report", backend.calls.length, 1);
  }
  {
    const backend = fakeBackend(() => ({ status: 409, body: { error: "duplicate", id: 40, ref: "BR-40" } }));
    const result = await submitBugReport(backend.client, basePayload());
    const error = result.ok ? null : result.error;
    checkEqual("409 maps to duplicate with the first report", error, { kind: "duplicate", id: 40, ref: "BR-40" });
    check("and names it", !!error && describeBugReportError(error).includes("BR-40"));
  }
  {
    const offline = await submitBugReport(fakeBackend(() => "network").client, basePayload());
    checkEqual("no answer at all maps to offline", offline.ok ? null : offline.error.kind, "offline");
    const slow = await submitBugReport(fakeBackend(() => "timeout").client, basePayload());
    checkEqual("a transport timeout maps to timeout", slow.ok ? null : slow.error.kind, "timeout");
    const garbled = await submitBugReport(fakeBackend(() => ({ status: 201, body: { nope: true } })).client, basePayload());
    checkEqual("a 201 without an id is a bad response", garbled.ok ? null : garbled.error.kind, "bad_response");
  }
  {
    const backend = fakeBackend(() => ({ status: 201, body: created }));
    const result = await submitBugReport(backend.client, basePayload({ title: "x" }), [image("game")]);
    checkEqual("an invalid report fails before any request", result.ok ? null : result.error, { kind: "invalid", field: "title" });
    checkEqual("nothing was sent", backend.calls.length, 0);
  }
  {
    const backend = fakeBackend((_req, body) => ({
      status: 200,
      body: {
        reports: [
          {
            id: 42, ref: "BR-42", project: "aries-mod", title: "t", status: "fixed", statusLabel: "Fixed",
            modVersion: "4.0.5", fixedInVersion: "4.0.6", publicReply: "Thanks", publicReplyAt: null,
            createdAt: "2026-10-23T12:00:00Z", updatedAt: "2026-10-24T10:00:00Z",
            comments: [{ author: "admin", message: "Thanks", createdAt: "x" }, { nope: 1 }], canComment: true,
          },
          { title: "no id" },
        ],
        asked: body.reports.length,
      },
    }));
    const followed = Array.from({ length: 60 }, (_, i) => ({ id: i + 1, followToken: TOKEN }));
    const mine = await listMyReports(backend.client, followed);
    checkEqual("at most 50 follow tokens are sent", backend.calls[0].json.reports.length, 50);
    checkEqual("POST /bug-reports/mine", backend.calls[0].url, "https://api.test/bug-reports/mine");
    checkEqual("entries without an id are dropped", mine.ok ? mine.reports.length : -1, 1);
    checkEqual("broken comments are dropped", mine.ok ? mine.reports[0].comments.length : -1, 1);

    const closed = await addReportComment(fakeBackend(() => ({ status: 409, body: { error: "closed", status: "closed" } })).client, { id: 42, followToken: TOKEN }, "More info");
    checkEqual("a comment on a closed report maps to closed", closed.ok ? null : closed.error.kind, "closed");
    const empty = await addReportComment(fakeBackend(() => ({ status: 201, body: { ok: true } })).client, { id: 42, followToken: TOKEN }, "   ");
    checkEqual("an empty comment is refused before sending", empty.ok ? null : empty.error.kind, "invalid");
  }

  // ---------- Image normalization ----------
  {
    const frame = { width: 3840, height: 2160 } as HTMLCanvasElement;
    const webp = await normalizeImage(frame);
    checkEqual("a frame is encoded as WebP", webp.mime, "image/webp");
    check("its longest side is at most 1920", Math.max(webp.width, webp.height) <= BUG_REPORT_LIMITS.imageMaxSide, `${webp.width}x${webp.height}`);
    check("a 1920 frame over 600 KB is shrunk until it fits", webp.width < 1920 && webp.bytes <= BUG_REPORT_LIMITS.attachmentTargetBytes, `${webp.width}x${webp.height}, ${webp.bytes} B`);
    checkEqual("the proportions are kept", Math.round((webp.width / webp.height) * 100), Math.round((16 / 9) * 100));
    checkEqual("the base64 decodes to the encoded bytes", normalizedImageBlob(webp).size, webp.bytes);

    webpEncoder = false;
    const jpeg = await normalizeImage({ width: 800, height: 600 } as HTMLCanvasElement);
    checkEqual("where WebP comes back as PNG, JPEG is used", jpeg.mime, "image/jpeg");
    checkEqual("a small image is not resized", [jpeg.width, jpeg.height], [800, 600]);

    let reason: string | null = null;
    try {
      await normalizeImage(frame, { targetBytes: 10, maxBytes: 20 });
    } catch (error) {
      reason = error instanceof ImageNormalizeError ? error.reason : String(error);
    }
    checkEqual("an image that cannot get under the hard limit is refused", reason, "too_large");
    reason = null;
    try {
      await normalizeImage(new Blob(["not an image"], { type: "text/plain" }));
    } catch (error) {
      reason = error instanceof ImageNormalizeError ? error.reason : String(error);
    }
    checkEqual("a file that is not an image is refused", reason, "unreadable");
  }

  // ---------- Sent reports ----------
  {
    const entry = (id: number, title = `report ${id}`): SentReport => ({ id, ref: `BR-${id}`, followToken: TOKEN, title, createdAt: "2026-10-23T12:00:00.000Z" });
    let list: SentReport[] = [];
    for (let id = 1; id <= 60; id++) list = addSentReport(list, entry(id));
    checkEqual("the sent list keeps 50", list.length, 50);
    checkEqual("newest first", [list[0].id, list[49].id], [60, 11]);
    list = addSentReport(list, entry(30, "again"));
    checkEqual("a report added again moves to the top once", [list.length, list[0].title, list.filter((e) => e.id === 30).length], [50, "again", 1]);
    checkEqual("garbage in storage reads as an empty list", parseSentReports({ not: "a list" }), []);
    checkEqual(
      "entries without a valid token are dropped",
      parseSentReports([entry(1), { id: 2, followToken: "not hex!" }, { id: "x", followToken: TOKEN }]).map((e) => e.id),
      [1],
    );

    for (let id = 1; id <= 55; id++) rememberSentReport(entry(id));
    const stored = readSentReports();
    checkEqual("bugReport.sent is capped at 50 in storage", stored.length, 50);
    checkEqual("with the latest first", stored[0].id, 55);
  }

  // ---------- Settings whitelist ----------
  {
    for (const path of REPORTED_SETTINGS) {
      check(`whitelisted ${path} names no secret`, !path.split(".").some(isSecretKey));
    }
    const settings = readReportedSettings();
    checkEqual("switches the player set are read", [settings["misc.ghostMode"], settings["pets.teamSync"], settings["ui.appearance.theme"]], [true, false, "night"]);
    check("only whitelisted paths come out", Object.keys(settings).every((key) => REPORTED_SETTINGS.includes(key)), Object.keys(settings).join(", "));
    const dump = JSON.stringify(settings);
    check("the API key never comes out", !dump.includes(API_KEY) && !dump.includes("LEAKED"), dump);
    check("saved data never comes out", !dump.includes("savedGardens") && !dump.includes("team-1"), dump);
    check("a long string is not taken for a switch", !("inventory.sortKey" in settings));
  }

  // ---------- Statuses and versions ----------
  {
    checkEqual("needs_info reads as the contract says", STATUS_LABELS.needs_info, "Need more info");
    checkEqual("the closing statuses all read Closed", ["wont_fix", "not_a_bug", "spam", "closed"].map((s) => statusLabel(s)), ["Closed", "Closed", "Closed", "Closed"]);
    checkEqual("an unknown status uses the server's label", statusLabel("on_hold", "On hold"), "On hold");
    check("a closed report takes no comment", !acceptsComments("closed") && !acceptsComments("duplicate"));
    check("a report waiting for info takes one", acceptsComments("needs_info"));
    check("4.0.10 is newer than 4.0.9", compareVersions("4.0.10", "4.0.9") > 0);
    check("4.0.5 is below a fix in 4.0.6", isVersionBelow("4.0.5", "4.0.6"));
    check("4.0.6 already has it", !isVersionBelow("4.0.6", "v4.0.6"));
    check("an unknown local version claims nothing", !isVersionBelow(undefined, "4.0.6"));
  }
});
