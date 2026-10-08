import { toastSimple } from "../../../ui/toast";

/**
 * Turns an audio file the player picked into a data URL small enough to keep
 * in storage: checks the format and length, and re-encodes it at lower
 * bitrates (Opus through MediaRecorder) when the file is too big.
 */

type EncodeLimits = {
  /** Largest stored sound, in bytes. */
  maxBytes: number;
  maxSeconds: number;
  /** Bitrates (bps) tried in turn when the file has to be re-encoded. */
  bitrates: number[];
  /** Larger files are refused before decoding them. */
  maxInputBytes: number;
};

const SOUND_LIMITS: EncodeLimits = {
  maxBytes: 200 * 1024,
  maxSeconds: 10,
  bitrates: [48000, 32000, 20000, 12000, 8000],
  maxInputBytes: 8 * 1024 * 1024,
};

const ALLOWED_MIMES_BY_EXTENSION = new Map<string, Set<string>>([
  ["mp3", new Set(["audio/mpeg", "audio/mp3"])],
  ["wav", new Set(["audio/wav", "audio/x-wav", "audio/wave"])],
  ["ogg", new Set(["audio/ogg"])],
]);

const ENCODER_MIMES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"];

/** Shows the reason in a toast, then throws it with the technical detail. */
function reject(toast: string, detail: string): never {
  try {
    toastSimple("Audio import", toast, "error").catch(() => {});
  } catch {}
  throw new Error(detail);
}

const seconds = (s: number) => s.toFixed(1).replace(/\.0$/, "");

function checkDuration(buffer: AudioBuffer, maxSeconds: number): void {
  if (buffer.duration <= maxSeconds) return;
  const duration = seconds(buffer.duration);
  const limit = seconds(maxSeconds);
  reject(`File duration is ${duration}s (limit: ${limit}s).`, `Audio duration ${duration}s exceeds limit of ${limit}s.`);
}

function newAudioContext(): AudioContext {
  const Ctx: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
  return new Ctx();
}

async function decode(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer();
  const ctx = newAudioContext();
  try {
    // Safari sometimes needs a copy of the buffer.
    return await new Promise<AudioBuffer>((resolve, fail) => ctx.decodeAudioData(bytes.slice(0), resolve, fail));
  } catch {
    throw new Error("Failed to decode audio file.");
  } finally {
    await ctx.close().catch(() => {});
  }
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, fail) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = fail;
    reader.readAsDataURL(blob);
  });
}

function pickEncoderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const mime of ENCODER_MIMES) {
    try {
      if (MediaRecorder.isTypeSupported?.(mime)) return mime;
    } catch {}
  }
  return null;
}

/** Plays the buffer into a MediaRecorder at the given bitrate. */
async function reencode(buffer: AudioBuffer, mime: string, bitsPerSecond: number): Promise<Blob> {
  const ctx = newAudioContext();
  const dest = ctx.createMediaStreamDestination();
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = 0.9;
  src.connect(gain).connect(dest);

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(dest.stream, { mimeType: mime, bitsPerSecond });
  const recorded = new Promise<Blob>((resolve, fail) => {
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };
    recorder.onerror = (e: any) => fail(e.error || new Error("MediaRecorder error"));
    recorder.onstop = () => {
      try {
        resolve(new Blob(chunks, { type: mime }));
      } catch (err) {
        fail(err);
      }
    };
  });

  recorder.start();
  src.start();
  await new Promise<void>((done) => {
    src.onended = () => done();
  });
  recorder.stop();
  const out = await recorded;
  await ctx.close().catch(() => {});
  return out;
}

/** The file as a data URL within the limits, re-encoded if it has to be. Throws with the reason otherwise. */
export async function encodeSoundFile(file: File, limits: EncodeLimits = SOUND_LIMITS): Promise<string> {
  if (!file || !(file instanceof File)) throw new Error("No file provided.");
  const extension = (file.name?.split(".").pop() || "").toLowerCase();
  const allowedMimes = ALLOWED_MIMES_BY_EXTENSION.get(extension);
  if (!extension || !allowedMimes) {
    reject("Unsupported audio format. Allowed formats: MP3, WAV, OGG.", `Unsupported audio extension: ${extension || "unknown"}`);
  }
  const type = (file.type || "").toLowerCase();
  if (!type || !allowedMimes.has(type)) {
    reject(
      "File extension and MIME type must match (MP3, WAV, OGG only).",
      type ? `MIME type ${type} is not valid for .${extension} files.` : `Missing MIME type for .${extension} files.`,
    );
  }
  const kb = (bytes: number) => Math.round(bytes / 1024);
  if (file.size > limits.maxInputBytes) {
    throw new Error(`Input file too large (${kb(file.size)}KB). Limit is ${kb(limits.maxInputBytes)}KB.`);
  }

  if (file.size <= limits.maxBytes) {
    checkDuration(await decode(file), limits.maxSeconds);
    return readAsDataUrl(file);
  }

  const mime = pickEncoderMime();
  if (!mime) throw new Error("Compression unavailable in this browser; file exceeds 200KB.");
  const buffer = await decode(file);
  checkDuration(buffer, limits.maxSeconds);
  for (const bitrate of limits.bitrates) {
    const blob = await reencode(buffer, mime, bitrate);
    if (blob.size <= limits.maxBytes) return readAsDataUrl(blob);
  }
  reject(
    `Unable to compress under ${kb(limits.maxBytes)}KB. Try a shorter clip.`,
    `Could not compress under ${kb(limits.maxBytes)}KB. Try a shorter clip.`,
  );
}
