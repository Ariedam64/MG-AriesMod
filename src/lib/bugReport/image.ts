// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// Every screenshot, whatever its source (a game frame, a tab capture, a file,
// a paste), goes through `normalizeImage`: drawn on a canvas at most 1920 px
// on its longest side, encoded as WebP (JPEG where the browser cannot), and
// shrunk again until it fits the 600 KB the client aims for. Going through a
// canvas also drops the EXIF block of a photo, location included.

import { BUG_REPORT_LIMITS } from "./limits";

export type ImageSource = Blob | HTMLCanvasElement | ImageBitmap;

export type NormalizedImage = {
  mime: "image/webp" | "image/jpeg";
  /** Without a `data:` prefix. */
  base64: string;
  width: number;
  height: number;
  /** Encoded size. */
  bytes: number;
};

export type NormalizeImageOptions = {
  maxSide?: number;
  targetBytes?: number;
  /** Past this the image is refused rather than sent to a 413. */
  maxBytes?: number;
};

export class ImageNormalizeError extends Error {
  constructor(
    readonly reason: "unreadable" | "too_large",
    message: string,
  ) {
    super(message);
    this.name = "ImageNormalizeError";
  }
}

type Decoded = { image: CanvasImageSource; width: number; height: number; release(): void };

const isBlob = (value: unknown): value is Blob =>
  typeof Blob !== "undefined" && value instanceof Blob;

/** A drawable for any source. A Blob is decoded; a canvas or a bitmap is used as it is. */
export async function decodeImage(source: ImageSource): Promise<Decoded> {
  if (!isBlob(source)) {
    const { width, height } = source;
    if (!width || !height) throw new ImageNormalizeError("unreadable", "The image is empty.");
    return { image: source, width, height, release() {} };
  }
  if (source.type && !source.type.startsWith("image/")) {
    throw new ImageNormalizeError("unreadable", "That file is not an image.");
  }
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(source);
      return { image: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Older engines decode fewer formats this way; the <img> path below tries again.
    }
  }
  return decodeWithImageElement(source);
}

function decodeWithImageElement(blob: Blob): Promise<Decoded> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      if (!img.naturalWidth || !img.naturalHeight) {
        URL.revokeObjectURL(url);
        reject(new ImageNormalizeError("unreadable", "The image is empty."));
        return;
      }
      resolve({ image: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageNormalizeError("unreadable", "This image could not be read."));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      // A tainted canvas throws a SecurityError here.
      resolve(null);
    }
  });
}

/** Learned on the first encode: Safari silently answers PNG when asked for WebP. */
let webpWorks: boolean | null = null;

const WEBP_QUALITY = 0.8;
const JPEG_QUALITY = 0.85;
/** Encodes before giving up. Each one shrinks the image, so a few always land under the target. */
const MAX_ATTEMPTS = 6;

function draw(decoded: Decoded, width: number, height: number, opaque: boolean): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageNormalizeError("unreadable", "This browser cannot draw the image.");
  if (opaque) {
    // JPEG has no transparency: without a fill, clear pixels would turn black.
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(decoded.image, 0, 0, width, height);
  return canvas;
}

async function encode(decoded: Decoded, width: number, height: number): Promise<Blob> {
  if (webpWorks !== false) {
    const blob = await toBlob(draw(decoded, width, height, false), "image/webp", WEBP_QUALITY);
    if (blob && blob.type === "image/webp") {
      webpWorks = true;
      return blob;
    }
    if (blob) webpWorks = false;
  }
  const blob = await toBlob(draw(decoded, width, height, true), "image/jpeg", JPEG_QUALITY);
  if (!blob || blob.type !== "image/jpeg") throw new ImageNormalizeError("unreadable", "This image could not be encoded.");
  return blob;
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** The encoded image as a Blob again, for a preview. */
export function normalizedImageBlob(image: NormalizedImage): Blob {
  const binary = atob(image.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: image.mime });
}

export async function normalizeImage(source: ImageSource, options: NormalizeImageOptions = {}): Promise<NormalizedImage> {
  const maxSide = options.maxSide ?? BUG_REPORT_LIMITS.imageMaxSide;
  const target = options.targetBytes ?? BUG_REPORT_LIMITS.attachmentTargetBytes;
  const hardLimit = options.maxBytes ?? BUG_REPORT_LIMITS.attachmentBytes;

  const decoded = await decodeImage(source);
  try {
    let scale = Math.min(1, maxSide / Math.max(decoded.width, decoded.height));
    let best: { blob: Blob; width: number; height: number } | null = null;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const blob = await encode(decoded, width, height);
      if (!best || blob.size < best.blob.size) best = { blob, width, height };
      if (blob.size <= target) break;
      // Size goes with the pixel count, so shrink each side by the square
      // root of the excess, a little more to land under the target.
      scale *= Math.min(0.9, Math.max(0.5, Math.sqrt(target / blob.size) * 0.92));
    }
    if (!best || best.blob.size > hardLimit) {
      throw new ImageNormalizeError("too_large", "This image is too large, even shrunk.");
    }
    return {
      mime: best.blob.type as NormalizedImage["mime"],
      base64: await blobToBase64(best.blob),
      width: best.width,
      height: best.height,
      bytes: best.blob.size,
    };
  } finally {
    decoded.release();
  }
}
