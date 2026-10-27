// The fake DOM, plus the KeyboardEvent the hotkey layer builds its synthetic
// keys with. Import it before anything else: `inGameHotkeys` hooks the window
// as its module loads, so the fake window has to be there first.
import { installFakeDom } from "./_fakeDom";

class FakeKeyboardEvent {
  type: string;
  constructor(type: string, init: Record<string, unknown> = {}) {
    Object.assign(this, init);
    this.type = type;
  }
}

installFakeDom();
(globalThis as any).KeyboardEvent = FakeKeyboardEvent;
