// Imported alert sounds stay playable.
//
// A file over 200 KB is re-encoded through MediaRecorder, whose blob type
// carries a codec parameter ("audio/webm;codecs=opus"), so the data URL read
// back from it is "data:audio/webm;codecs=opus;base64,...". The check for "is
// this already a data URL" did not allow a parameter, so the sound was
// wrapped a second time, as "data:audio/mpeg;base64,data:audio/webm;...",
// and saved like that: every compressed import was silent.
//
// Run with: npm run check:alertsounds

import { installFakeDom } from "./_fakeDom";
import { SoundLibrary, toDataUrl } from "../src/features/notifier/audio/library";

installFakeDom();

let failures = 0;
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(ok ? `ok   ${label}` : `FAIL ${label}\n     got      ${actual}\n     expected ${expected}`);
}

const compressed = "data:audio/webm;codecs=opus;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYEC";
const plain = "data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0U";

check("a re-encoded sound's data URL is kept as it is", toDataUrl(compressed), compressed);
check("a plain data URL is kept as it is", toDataUrl(plain), plain);
check("bare base64 becomes an MP3 data URL", toDataUrl("SUQzBAAAAAAAIlRTU0U"), plain);

const library = new SoundLibrary();
library.add("Ding", compressed);
const reloaded = new SoundLibrary();
reloaded.load();
check("a re-encoded sound reads back unchanged after a reload", reloaded.get("Ding"), compressed);
check("the built-in sound stays first", reloaded.names(), ["Default", "Ding"]);

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall alert sound checks passed");
