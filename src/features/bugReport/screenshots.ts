// The report's screenshots, at most three: the game frame taken when the form
// opens, a tab capture, and images added from a file or pasted. Every one is
// shrunk by the core's normalizer before it shows here, so what the player
// sees is exactly what gets sent.

import { BUG_REPORT_LIMITS } from "../../lib/bugReport/limits";
import { ImageNormalizeError, normalizeImage, normalizedImageBlob, type ImageSource, type NormalizedImage } from "../../lib/bugReport/image";
import { canCaptureScreen, captureScreenFrame } from "../../lib/bugReport/screenCapture";
import type { BugReportAttachment } from "../../lib/bugReport/client";
import type { AttachmentKind } from "../../lib/bugReport/types";
import { grabGameFrame } from "../../game/pixi/frameGrab";
import { isDiscordSurface } from "../../platform/environment";
import { button } from "../../ui/kit/button";
import { h } from "../../ui/kit/dom";
import { openModal } from "../../ui/kit/modal";

type Shot = {
  id: number;
  kind: AttachmentKind;
  image: NormalizedImage;
  url: string;
  /** Taken by the form itself, so it may be retaken when it goes stale. */
  auto: boolean;
  takenAt: number;
};

export type ScreenshotStrip = {
  root: HTMLElement;
  attachments(): BugReportAttachment[];
  /** What the preview shows in place of the image bytes. */
  summary(): Array<{ kind: AttachmentKind; mime: string; width: number; height: number; bytes: number }>;
  /** Images still being prepared. The report waits for them. */
  pending(): number;
  /** Takes the game frame the form opens with. Silent when the game cannot be read. */
  takeAutoGameShot(): void;
  /** Retakes that frame when the window comes back after a while, unless the player removed it. */
  refreshAutoGameShot(): void;
  handlePaste(event: ClipboardEvent): void;
  clear(): void;
};

const MAX = BUG_REPORT_LIMITS.attachments;
const STALE_AFTER_MS = 20_000;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,image/bmp";
const KIND_LABELS: Record<AttachmentKind, string> = { game: "Game view", screen: "Screen capture", upload: "Image" };

const isTextField = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  return !!node && (node.isContentEditable || /^(input|textarea)$/i.test(node.tagName ?? ""));
};

function imageFiles(list: FileList | DataTransferItemList | null | undefined): File[] {
  if (!list) return [];
  const out: File[] = [];
  for (const item of Array.from(list as ArrayLike<File | DataTransferItem>)) {
    const file = "getAsFile" in item ? (item.kind === "file" ? item.getAsFile() : null) : item;
    if (file && file.type.startsWith("image/")) out.push(file);
  }
  return out;
}

export function buildScreenshotStrip(): ScreenshotStrip {
  let nextId = 0;
  let shots: Shot[] = [];
  let pendingCount = 0;
  /** The player removed the automatic frame: it stays gone. */
  let autoDismissed = false;

  const grid = h("div", "qws-bug-shots");
  const message = h("p", "qws-bug-hint");
  const counter = h("span", "qws-bug-hint");

  const fileInput = h("input");
  fileInput.type = "file";
  fileInput.accept = ACCEPT;
  fileInput.multiple = true;
  fileInput.hidden = true;

  const room = () => MAX - shots.length - pendingCount;
  const windowOf = () => grid.closest<HTMLElement>(".qws-win");

  const addButton = button("Add image", { size: "sm", onClick: () => fileInput.click() });
  const gameButton = button("Add game view", { size: "sm", variant: "ghost", onClick: () => void addGameShot(false) });
  const screenButton = button("Capture screen", {
    size: "sm",
    variant: "ghost",
    title: "Takes a picture of this tab, game menus included. Your browser asks first.",
    lockWhilePending: true,
    onClick: () => captureScreen(),
  });
  // Inside the Discord activity the capture API is blocked, and would show Discord itself anyway.
  const screenAvailable = canCaptureScreen() && !isDiscordSurface();

  const bar = h("div", "qws-bug-shot-bar");
  bar.append(addButton, gameButton);
  if (screenAvailable) bar.append(screenButton);
  bar.append(counter);

  const root = h("div", "qws-bug-stack");
  root.append(grid, bar, message, fileInput);

  const say = (text: string) => (message.textContent = text);

  function render(): void {
    const tiles: HTMLElement[] = shots.map(tile);
    for (let i = 0; i < pendingCount; i++) {
      const placeholder = h("div", "qws-bug-shot is-pending");
      placeholder.appendChild(h("span", "qws-bug-shot__label", "Preparing..."));
      tiles.push(placeholder);
    }
    grid.replaceChildren(...tiles);
    const full = room() <= 0;
    addButton.setEnabled(!full);
    screenButton.setEnabled(!full);
    gameButton.hidden = shots.some((shot) => shot.kind === "game");
    gameButton.setEnabled(!full);
    counter.textContent = shots.length
      ? `${shots.length} of ${MAX}.${full ? "" : " You can also paste an image with Ctrl+V."}`
      : "Paste an image with Ctrl+V, or add one.";
  }

  function tile(shot: Shot): HTMLElement {
    const el = h("div", "qws-bug-shot");
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.title = "Click to see it full size";
    const img = h("img", "qws-bug-shot__img");
    img.src = shot.url;
    img.alt = KIND_LABELS[shot.kind];
    const label = h("span", "qws-bug-shot__label", `${KIND_LABELS[shot.kind]}, ${Math.max(1, Math.round(shot.image.bytes / 1024))} KB`);
    const remove = button("✕", { size: "xs", title: "Remove this screenshot", onClick: () => removeShot(shot.id) });
    remove.classList.add("qws-bug-shot__remove");
    remove.addEventListener("click", (event) => event.stopPropagation());
    el.append(img, label, remove);
    const open = () => showFull(shot);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (event) => {
      // Keys on the remove button are the button's own.
      if (event.target !== el) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    return el;
  }

  function showFull(shot: Shot): void {
    const host = windowOf();
    if (!host) return;
    const modal = openModal({ host, title: KIND_LABELS[shot.kind], widthPx: 900, maxHeightPx: 720 });
    const img = h("img", "qws-bug-shot-full");
    img.src = shot.url;
    img.alt = KIND_LABELS[shot.kind];
    modal.body.append(
      img,
      h("p", "qws-bug-hint", `${shot.image.width} x ${shot.image.height}, ${Math.round(shot.image.bytes / 1024)} KB. Check that nothing private shows before you send it.`),
    );
    const remove = () => {
      removeShot(shot.id);
      modal.close();
    };
    modal.footer.append(
      button("Remove", { variant: "ghost", onClick: remove }),
      button("Close", { variant: "primary", onClick: () => modal.close() }),
    );
  }

  function removeShot(id: number): void {
    const shot = shots.find((entry) => entry.id === id);
    if (!shot) return;
    if (shot.auto) autoDismissed = true;
    URL.revokeObjectURL(shot.url);
    shots = shots.filter((entry) => entry.id !== id);
    render();
  }

  function store(kind: AttachmentKind, image: NormalizedImage, auto: boolean, replaceId?: number): void {
    const index = replaceId === undefined ? -1 : shots.findIndex((entry) => entry.id === replaceId);
    // The shot being retaken was removed meanwhile: the new frame goes nowhere.
    if (replaceId !== undefined && index < 0) return;
    if (index < 0 && room() <= 0) return;
    const shot: Shot = { id: ++nextId, kind, image, url: URL.createObjectURL(normalizedImageBlob(image)), auto, takenAt: Date.now() };
    if (index >= 0) {
      URL.revokeObjectURL(shots[index].url);
      shots = [...shots.slice(0, index), shot, ...shots.slice(index + 1)];
    } else {
      shots = [...shots, shot];
    }
  }

  /** Normalizes `source` and adds it, with a placeholder meanwhile. */
  async function addSource(source: ImageSource, kind: AttachmentKind, auto = false, replaceId?: number): Promise<boolean> {
    if (replaceId === undefined && room() <= 0) {
      if (!auto) say(`At most ${MAX} screenshots per report.`);
      return false;
    }
    if (replaceId === undefined) pendingCount++;
    render();
    try {
      const image = await normalizeImage(source);
      if (replaceId === undefined) pendingCount--;
      store(kind, image, auto, replaceId);
      say("");
      return true;
    } catch (error) {
      if (replaceId === undefined) pendingCount--;
      if (!auto) say(error instanceof ImageNormalizeError ? error.message : "This image could not be read.");
      return false;
    } finally {
      render();
    }
  }

  async function addGameShot(auto: boolean, replaceId?: number): Promise<void> {
    const frame = grabGameFrame();
    if (!frame) {
      if (!auto) say("The game view cannot be captured right now.");
      return;
    }
    await addSource(frame, "game", auto, replaceId);
  }

  async function addFiles(files: File[]): Promise<void> {
    const fits = Math.max(0, room());
    for (const file of files.slice(0, fits)) await addSource(file, "upload");
    // Said last, or the next image ready would clear it.
    if (files.length > fits) say(`Only ${MAX} screenshots fit in a report, so ${files.length - fits} ${files.length - fits > 1 ? "were" : "was"} left out.`);
  }

  async function captureScreen(): Promise<void> {
    if (room() <= 0) return;
    const win = windowOf();
    try {
      // Straight from the click: the browser only allows the prompt then.
      const frame = await captureScreenFrame({
        beforeFrame: () => {
          if (win) win.style.visibility = "hidden";
        },
        afterFrame: () => {
          if (win) win.style.visibility = "";
        },
      });
      await addSource(frame, "screen");
    } catch (error) {
      const name = (error as { name?: string })?.name;
      say(name === "NotAllowedError" ? "Screen capture was cancelled." : "Screen capture is not available in this browser.");
    }
  }

  fileInput.addEventListener("change", () => {
    const files = imageFiles(fileInput.files);
    fileInput.value = "";
    void addFiles(files);
  });
  root.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  root.addEventListener("drop", (event) => {
    const files = imageFiles(event.dataTransfer?.files);
    if (!files.length) return;
    event.preventDefault();
    void addFiles(files);
  });

  render();

  return {
    root,
    attachments: () => shots.map((shot) => ({ ...shot.image, kind: shot.kind })),
    summary: () =>
      shots.map(({ kind, image }) => ({ kind, mime: image.mime, width: image.width, height: image.height, bytes: image.bytes })),
    pending: () => pendingCount,
    takeAutoGameShot() {
      autoDismissed = false;
      // After the window has painted: the grab renders a frame, which should
      // not hold up the window opening.
      setTimeout(() => void addGameShot(true), 0);
    },
    refreshAutoGameShot() {
      const auto = shots.find((shot) => shot.auto);
      if (autoDismissed || pendingCount) return;
      if (!auto) {
        if (!shots.some((shot) => shot.kind === "game")) void addGameShot(true);
        return;
      }
      if (Date.now() - auto.takenAt >= STALE_AFTER_MS) void addGameShot(true, auto.id);
    },
    handlePaste(event) {
      const files = imageFiles(event.clipboardData?.items ?? event.clipboardData?.files);
      if (!files.length) return;
      // Text pasted into a field stays text; an image alone is taken from anywhere in the form.
      if (isTextField(event.target) && event.clipboardData?.types.includes("text/plain")) return;
      event.preventDefault();
      void addFiles(files.slice(0, 1));
    },
    clear() {
      for (const shot of shots) URL.revokeObjectURL(shot.url);
      shots = [];
      autoDismissed = false;
      say("");
      render();
    },
  };
}
