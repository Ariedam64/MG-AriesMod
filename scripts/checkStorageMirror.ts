// The settings blob lives in the site's localStorage, which a browser set to
// clear site data on close (or a cleaner extension) wipes on every restart:
// alerts, locker rules, hatch history and stats all went back to defaults.
// Tampermonkey's own storage survives that, so the blob is mirrored there and
// restored from it when localStorage comes back empty.
import { checkEqual, done } from "./_check";
import { readAriesPath, writeAriesPath } from "../src/platform/storage";

type Listener = () => void;
const listeners: Record<string, Listener[]> = {};
const fire = (type: string) => (listeners[type] ?? []).forEach((fn) => fn());

const local = new Map<string, string>();
const gm = new Map<string, unknown>();
const g = globalThis as any;
g.window = g;
g.addEventListener = (type: string, fn: Listener) => (listeners[type] ??= []).push(fn);
g.document = { visibilityState: "visible", addEventListener: g.addEventListener };
g.localStorage = {
  getItem: (k: string) => local.get(k) ?? null,
  setItem: (k: string, v: string) => void local.set(k, String(v)),
  removeItem: (k: string) => void local.delete(k),
};
g.GM_getValue = (k: string, fallback: unknown) => (gm.has(k) ? gm.get(k) : fallback);
g.GM_setValue = (k: string, v: unknown) => void gm.set(k, v);

// A browser restart cleared the site's data; the mirror still holds the blob.
gm.set("aries_mod_mirror", JSON.stringify({ version: 1, locker: { probe: "kept" } }));

checkEqual("settings come back from the mirror when localStorage is empty", readAriesPath("locker.probe"), "kept");
fire("pagehide");
checkEqual(
  "the restored blob is written back to localStorage",
  JSON.parse(local.get("aries_mod") ?? "{}")?.locker?.probe,
  "kept",
);

writeAriesPath("locker.probe", "changed");
fire("pagehide");
checkEqual(
  "a change reaches the mirror by the time the page goes away",
  JSON.parse(String(gm.get("aries_mod_mirror") ?? "{}"))?.locker?.probe,
  "changed",
);

done();
