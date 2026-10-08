// Opening the debug menu's WebSocket tab only watches the sockets.
//
// Its capture called `setQWS` on every socket it tracked and added them to the
// mod's socket list. `setQWS` keeps the first socket it is given, so opening
// the tab before the game's own socket had been recognised could make the mod
// send its commands down whatever other socket the page had open.

class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  url: string;
  constructor(url: string) {
    this.url = url;
  }
  addEventListener(): void {}
  send(): void {}
}

const g = globalThis as any;
g.window = g;
g.WebSocket = FakeSocket;

let failed = 0;
const check = (label: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}: ${String(got)}${ok ? "" : ` (expected ${String(want)})`}`);
};

(async () => {
  const ws = await import("../src/game/ws/sockets");
  const capture = await import("../src/features/debug/wsCapture");

  // A socket the page opened that is not the game's room socket.
  const other = new FakeSocket("wss://example.invalid/analytics") as unknown as WebSocket;
  ws.sockets.push(other);

  capture.installWSHookIfNeeded();
  check("the capture tracks the socket that was already open", capture.getWSInfos().length, 1);
  check("it does not pick that socket as the game's", ws.quinoaWS, null);

  const later = new (g.WebSocket as typeof WebSocket)("wss://example.invalid/later");
  check("the capture tracks a socket opened after it", capture.getWSInfos().length, 2);
  check("it does not pick that one either", ws.quinoaWS, null);
  check("and does not add it to the mod's socket list", ws.sockets.includes(later), false);

  if (failed) {
    console.log(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall debug socket capture checks passed");
})();
