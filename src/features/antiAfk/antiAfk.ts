// Keeps the player from being flagged as away while the tab sits in the
// background: the page claims to be visible and focused, a silent audio node
// stops the browser from throttling it, and the player pings its own position
// now and then.

export type XY = { x: number; y: number };

/** Events the page would use to notice it lost focus or visibility. */
const SWALLOWED_EVENTS = ["visibilitychange", "blur", "focus", "focusout", "pagehide", "freeze", "resume"];

const HEARTBEAT_MS = 25_000;
const POSITION_PING_MS = 60_000;

const CAPTURE: AddEventListenerOptions = { capture: true };

export function createAntiAfkController(deps: {
  getPosition: () => Promise<XY | undefined>;
  pingPosition: (x: number, y: number) => Promise<unknown>;
}) {
  /* ----- Swallow visibility and focus events ----- */
  const swallowed: Array<{ type: string; target: Document | Window }> = [];
  const swallow = (e: Event) => {
    e.stopImmediatePropagation();
    e.preventDefault?.();
  };
  function swallowAll() {
    for (const type of SWALLOWED_EVENTS) {
      for (const target of [document, window] as const) {
        target.addEventListener(type, swallow, CAPTURE);
        swallowed.push({ type, target });
      }
    }
  }
  function unswallowAll() {
    for (const { type, target } of swallowed.splice(0)) {
      try { target.removeEventListener(type, swallow, CAPTURE); } catch {}
    }
  }

  /* ----- Patch document.hidden, visibilityState and hasFocus ----- */
  const docProto = Object.getPrototypeOf(document);
  const saved = {
    hidden: Object.getOwnPropertyDescriptor(docProto, "hidden"),
    visibilityState: Object.getOwnPropertyDescriptor(docProto, "visibilityState"),
    hasFocus: document.hasFocus ? document.hasFocus.bind(document) : null,
  };
  function patchProps() {
    try { Object.defineProperty(docProto, "hidden", { configurable: true, get: () => false }); } catch {}
    try { Object.defineProperty(docProto, "visibilityState", { configurable: true, get: () => "visible" }); } catch {}
    try { document.hasFocus = () => true; } catch {}
  }
  function restoreProps() {
    try { if (saved.hidden) Object.defineProperty(docProto, "hidden", saved.hidden); } catch {}
    try { if (saved.visibilityState) Object.defineProperty(docProto, "visibilityState", saved.visibilityState); } catch {}
    try { if (saved.hasFocus) document.hasFocus = saved.hasFocus; } catch {}
  }

  /* ----- Silent audio keepalive: a 1 Hz tone at near-zero volume ----- */
  let audioCtx: AudioContext | null = null;
  let osc: OscillatorNode | null = null;
  let gain: GainNode | null = null;
  const resumeIfSuspended = () => {
    if (audioCtx && audioCtx.state !== "running") audioCtx.resume?.().catch(() => {});
  };

  function startAudioKeepAlive() {
    try {
      const AudioContextCtor: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioCtx = new AudioContextCtor({ latencyHint: "interactive" });
      gain = audioCtx.createGain();
      gain.gain.value = 0.00001;
      osc = audioCtx.createOscillator();
      osc.frequency.value = 1;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      document.addEventListener("visibilitychange", resumeIfSuspended, CAPTURE);
      window.addEventListener("focus", resumeIfSuspended, CAPTURE);
    } catch {
      stopAudioKeepAlive();
    }
  }
  function stopAudioKeepAlive() {
    try { osc?.stop(); } catch {}
    try { osc?.disconnect(); gain?.disconnect(); } catch {}
    try { void audioCtx?.close?.(); } catch {}
    document.removeEventListener("visibilitychange", resumeIfSuspended, CAPTURE);
    window.removeEventListener("focus", resumeIfSuspended, CAPTURE);
    osc = null;
    gain = null;
    audioCtx = null;
  }

  /* ----- Heartbeat: a synthetic mousemove on the canvas ----- */
  let heartbeatTimer: number | null = null;
  function startHeartbeat() {
    const target = document.querySelector("canvas") || document.body || document.documentElement;
    heartbeatTimer = window.setInterval(() => {
      try { target.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, clientX: 1, clientY: 1 })); } catch {}
    }, HEARTBEAT_MS);
  }
  function stopHeartbeat() {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  /* ----- Position ping: a move to the cell the player already stands on ----- */
  let pingTimer: number | null = null;
  async function pingPosition() {
    try {
      const current = await deps.getPosition();
      if (!current) return;
      await deps.pingPosition(Math.round(current.x), Math.round(current.y));
    } catch {}
  }
  function startPing() {
    pingTimer = window.setInterval(pingPosition, POSITION_PING_MS);
    void pingPosition();
  }
  function stopPing() {
    if (pingTimer !== null) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  return {
    start() {
      patchProps();
      swallowAll();
      startAudioKeepAlive();
      startHeartbeat();
      startPing();
    },
    stop() {
      stopPing();
      stopHeartbeat();
      stopAudioKeepAlive();
      unswallowAll();
      restoreProps();
    },
  };
}
