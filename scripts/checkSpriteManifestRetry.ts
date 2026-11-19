// Since build 1973 the game no longer serves assets/manifest.json, so every
// sprite catalog attempt got a 404. With `preferGm`, `request` threw away the
// 404 that GM had received and asked again over fetch, so each manifest request
// left the browser twice, every 2 s, in every tab, for the whole session.
//
// A real HTTP answer received by GM is final: fetch is only a fallback for a
// transport failure (GM missing, network error, timeout, or the status 0
// Tampermonkey reports when @connect blocks the host).
//
// Run with: npm run check:spritemanifest

import { check, checkEqual, run } from "./_check";
import { request } from "../src/platform/http";

type GmOutcome = { status: number } | "network-error";

const calls = { gm: 0, fetch: 0 };

function installTransports(gm: GmOutcome): void {
  calls.gm = 0;
  calls.fetch = 0;
  const g = globalThis as any;
  g.GM_xmlhttpRequest = (details: any) => {
    calls.gm++;
    queueMicrotask(() => {
      if (gm === "network-error") details.onerror?.({});
      else details.onload?.({ status: gm.status, responseText: "", response: null });
    });
  };
  g.fetch = async () => {
    calls.fetch++;
    return { status: 200, ok: true, text: async () => "{}" };
  };
}

const URL_UNDER_TEST = "https://magicgarden.gg/version/2108/assets/manifest.json";

run(async () => {
  installTransports({ status: 404 });
  const notFound = await request({ url: URL_UNDER_TEST, preferGm: true }, "text");
  checkEqual("a 404 received by GM is asked once over GM", calls.gm, 1);
  checkEqual("a 404 received by GM is not asked again over fetch", calls.fetch, 0);
  checkEqual("a 404 received by GM is returned as a 404", notFound.status, 404);
  check("a 404 received by GM is not ok", notFound.ok === false);

  installTransports({ status: 500 });
  const serverError = await request({ url: URL_UNDER_TEST, preferGm: true }, "text");
  checkEqual("a 500 received by GM is not asked again over fetch", calls.fetch, 0);
  checkEqual("a 500 received by GM is returned as a 500", serverError.status, 500);

  installTransports({ status: 200 });
  const found = await request({ url: URL_UNDER_TEST, preferGm: true }, "text");
  checkEqual("a 200 received by GM does not touch fetch", calls.fetch, 0);
  checkEqual("a 200 received by GM is returned as a 200", found.status, 200);

  installTransports("network-error");
  const afterNetworkError = await request({ url: URL_UNDER_TEST, preferGm: true }, "text");
  checkEqual("a GM network error falls back to fetch once", calls.fetch, 1);
  checkEqual("the fetch answer is returned after a GM network error", afterNetworkError.status, 200);

  installTransports({ status: 0 });
  const afterBlocked = await request({ url: URL_UNDER_TEST, preferGm: true }, "text");
  checkEqual("a GM status 0 (blocked by @connect) falls back to fetch once", calls.fetch, 1);
  checkEqual("the fetch answer is returned after a GM status 0", afterBlocked.status, 200);
});
