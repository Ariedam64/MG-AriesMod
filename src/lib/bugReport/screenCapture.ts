// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// One frame of the browser tab through the screen capture API: the only way
// to get the page's HTML overlays (the game's own menus) along with the
// canvas. The browser asks the player every time, and it needs a click: call
// it straight from a click handler, before any other await.

type DisplayMediaOptions = DisplayMediaStreamOptions & {
  preferCurrentTab?: boolean;
  selfBrowserSurface?: "include" | "exclude";
  surfaceSwitching?: "include" | "exclude";
  monitorTypeSurfaces?: "include" | "exclude";
};

export function canCaptureScreen(): boolean {
  try {
    return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getDisplayMedia === "function";
  } catch {
    return false;
  }
}

export type ScreenCaptureHooks = {
  /** Runs once the player allowed the capture, before the frame is taken: hide the form here. */
  beforeFrame?: () => void | Promise<void>;
  /** Runs once the frame is taken or the capture failed: show the form again. */
  afterFrame?: () => void;
};

const nextAnimationFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/** Waits for the video to show a frame newer than now, or 250 ms where the browser cannot say. */
function nextVideoFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const withCallback = video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    const fallback = setTimeout(resolve, 250);
    withCallback.requestVideoFrameCallback?.(() => {
      clearTimeout(fallback);
      resolve();
    });
  });
}

/**
 * Asks to capture this tab and returns one frame of it on a canvas. Rejects
 * when the player declines (a `NotAllowedError`) or the browser cannot.
 */
export async function captureScreenFrame(hooks: ScreenCaptureHooks = {}): Promise<HTMLCanvasElement> {
  const options: DisplayMediaOptions = {
    video: { displaySurface: "browser", frameRate: 5 } as MediaTrackConstraints,
    audio: false,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
    surfaceSwitching: "exclude",
    monitorTypeSurfaces: "exclude",
  };
  const stream = await navigator.mediaDevices.getDisplayMedia(options);
  const video = document.createElement("video");
  try {
    await hooks.beforeFrame?.();
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    // Two painted frames for the hidden form to leave the page, two video
    // frames for that to reach the stream.
    await nextAnimationFrame();
    await nextAnimationFrame();
    await nextVideoFrame(video);
    await nextVideoFrame(video);
    if (!video.videoWidth || !video.videoHeight) throw new Error("The capture gave an empty frame.");
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw the capture.");
    ctx.drawImage(video, 0, 0);
    return canvas;
  } finally {
    for (const track of stream.getTracks()) track.stop();
    video.srcObject = null;
    try {
      hooks.afterFrame?.();
    } catch {}
  }
}
