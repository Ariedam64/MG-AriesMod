// The mod starts at document-start, when the page may have a <head> but no
// <body> yet. Anything mounted into the body at boot has to wait for it,
// otherwise it throws (the shop bell) or quietly gives up for the session
// (the one-time notices).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { check, checkEqual, done } from "./_check";
import { whenBodyReady } from "../src/lib/dom";

type Listener = () => void;

/** A document as it looks at document-start: a head, no body, still parsing. */
function installEarlyDocument() {
  const listeners: Record<string, Listener[]> = {};
  const doc = {
    head: {},
    body: null as object | null,
    readyState: "loading",
    addEventListener(type: string, fn: Listener) {
      (listeners[type] ??= []).push(fn);
    },
  };
  (globalThis as any).document = doc;
  return {
    doc,
    parseBody() {
      doc.body = {};
      doc.readyState = "interactive";
      for (const fn of listeners.DOMContentLoaded ?? []) fn();
    },
  };
}

// whenBodyReady waits for the body, not for the head.
{
  const page = installEarlyDocument();
  let calls = 0;
  whenBodyReady(() => calls++);
  checkEqual("waits while there is a head but no body", calls, 0);
  page.parseBody();
  checkEqual("runs once the body is parsed", calls, 1);
  let later = 0;
  whenBodyReady(() => later++);
  checkEqual("runs at once when the body is already there", later, 1);
}

// A guard on document.head says nothing about document.body. The shop bell
// was mounted behind one and threw on document.body.appendChild.
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : path.endsWith(".ts") ? [path] : [];
  });
}

for (const file of walk("src")) {
  const rel = file.replace(/\\/g, "/");
  const source = readFileSync(file, "utf8");
  const headGuards = source.match(/if \(document\.head\)/g) ?? [];
  check(`${rel} does not wait for the head to use the body`, headGuards.length === 0, `${headGuards.length} "if (document.head)"`);
}

// The one-time notices return early when there is no body, so main has to
// call them once the body exists or they never show.
{
  const main = readFileSync(join("src", "main.ts"), "utf8");
  const start = main.indexOf("whenBodyReady(() => {");
  const block = start >= 0 ? main.slice(start, main.indexOf("\n  });", start)) : "";
  for (const notice of ["showAutoRecoDisabledNoticeOnce", "showRoomPrivacyNoticeOnce", "showChangelogNoticeOnce"]) {
    check(`main shows ${notice} once the body exists`, block.includes(`${notice}()`));
  }
}

done();
