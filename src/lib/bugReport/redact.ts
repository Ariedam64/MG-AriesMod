// Part of the portable bug report core: this folder is copied as it is into
// the other mods (Community Hub, Gemini, MG-mod), so it must stay
// self-contained. No import from outside it, no game or userscript manager
// global, no UI.
//
// Hides anything that looks like a secret before a report leaves the browser.
// The backend runs the same rules again, so an old or modified client cannot
// get a key into the database (and from there into an agent's prompt), but
// the player's key should not travel in the first place.
//
// Two rules, as in the backend's redact.ts:
//   1. an object key whose name looks like a secret has its value replaced by
//      "[redacted]", at any depth;
//   2. inside strings, JWTs, `Bearer xxx` and URL parameters such as
//      `?apiKey=` are masked.

export const REDACTED = "[redacted]";
const TRUNCATED = "[truncated]";
const CIRCULAR = "[circular]";
const MAX_DEPTH = 12;

/** Pieces of key names that mean a secret, matched on the lowercased name without `_`, `-` or spaces. */
const SECRET_KEY_PARTS = [
  "apikey",
  "token",
  "password",
  "passwd",
  "secret",
  "cookie",
  "session",
  "jwt",
  "bearer",
  "authorization",
  "credential",
  "privatekey",
];

const JWT_RE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/g;
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._~+/=-]{6,}/gi;
const URL_SECRET_PARAM_RE = /([?&#](?:api[_-]?key|apikey|token|access_token|auth|key|secret|password)=)[^&#\s"']+/gi;

export function isSecretKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[_\-\s]/g, "");
  if (SECRET_KEY_PARTS.some((part) => k.includes(part))) return true;
  // "auth" alone, authToken, xauth, oauth... but not "author".
  return /auth(?!or)/.test(k);
}

export function redactString(text: string): string {
  return text
    .replace(JWT_RE, "[redacted-jwt]")
    .replace(BEARER_RE, "Bearer [redacted]")
    .replace(URL_SECRET_PARAM_RE, `$1${REDACTED}`);
}

/**
 * A redacted copy of any value, reduced to what JSON can carry: undefined,
 * functions and non-finite numbers become null, a cycle becomes "[circular]"
 * and anything nested deeper than 12 levels "[truncated]".
 */
export function redactValue(value: unknown): unknown {
  return redactAt(value, 0, new Set());
}

function redactAt(value: unknown, depth: number, ancestors: Set<object>): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value !== "object") return null;
  if (ancestors.has(value)) return CIRCULAR;
  if (depth >= MAX_DEPTH) return TRUNCATED;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map((item) => redactAt(item, depth + 1, ancestors));
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      let item: unknown;
      try {
        item = (value as Record<string, unknown>)[key];
      } catch {
        item = null;
      }
      out[key] = isSecretKey(key) ? REDACTED : redactAt(item, depth + 1, ancestors);
    }
    return out;
  } finally {
    ancestors.delete(value);
  }
}
